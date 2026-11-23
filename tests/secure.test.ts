import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { createApp } from '../apps/api/src/app.js'
import { openDatabase } from '../apps/api/src/database.js'
import { adapters, type StreamingProvider } from '../apps/api/src/providers.js'
import { readConfig } from '../apps/api/src/config.js'
import { addUser } from '../apps/api/src/auth.js'

const userPassword = 'a long test passphrase'
const cleanup: (() => void | Promise<void>)[] = []

async function fixture(path = ':memory:', options: Parameters<typeof createApp>[0] = {}) {
  const db = openDatabase(path)
  cleanup.push(() => db.close())
  if (!db.prepare('SELECT 1 FROM users').get()) {
    await addUser(db, 'alice', userPassword)
    await addUser(db, 'bob', userPassword)
  }
  const server = createApp({ ...options, db }).listen(0, '127.0.0.1')
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())))
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected TCP address')
  const url = `http://127.0.0.1:${address.port}`
  function request(path: string, body?: unknown, cookie?: string, origin = url, signal?: AbortSignal) {
    return fetch(url + '/api' + path, {
      signal,
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(options.secure && { 'X-Forwarded-Proto': 'https' }), ...(cookie && { Cookie: cookie }), ...(body !== undefined && {
        Origin: origin, 'X-Nexus-Request': '1', 'Content-Type': 'application/json',
      }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }
  async function signIn(username: string) {
    const response = await request('/session', { username, password: userPassword }, undefined, options.allowedOrigins?.[0])
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly; (?:Secure; )?SameSite=Strict/)
    if (options.secure) expect(response.headers.get('set-cookie')).toMatch(/^__Host-nexus=.*; Secure;/)
    return response.headers.get('set-cookie')!.split(';')[0]
  }
  return { request, signIn, db, url }
}

afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!()
})

test('requires a session and rejects cross-origin writes and revoked cookies', async () => {
  const { request, signIn } = await fixture()
  expect((await request('/projects')).status).toBe(401)
  expect((await request('/chat', { prompt: 'test', providers: ['gpt'] })).status).toBe(401)
  expect((await request('/session', { username: 'alice', password: 'incorrect' })).status).toBe(401)
  const alice = await signIn('alice')
  expect((await request('/projects', { name: 'private' }, alice, 'https://other.example')).status).toBe(403)
  expect((await request('/logout', {}, alice)).status).toBe(204)
  expect((await request('/projects', undefined, alice)).status).toBe(401)
})

test('isolates projects and transcripts and persists completed SSE turns across restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-test-'))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, 'data.sqlite')
  const sessionSecret = randomBytes(32).toString('hex')
  const { request, signIn } = await fixture(path, { sessionSecret })
  const alice = await signIn('alice')
  const bob = await signIn('bob')
  const project = await (await request('/projects', { name: 'Private' }, alice)).json()
  const history = `/projects/${project.id}/conversations/gpt`
  expect((await request(history, undefined, bob)).status).toBe(404)
  expect((await request(history + '/stream', { prompt: 'hello', providers: ['gpt'] }, bob)).status).toBe(404)
  const response = await request(history + '/stream', { prompt: 'hello', providers: ['gpt'] }, alice)
  expect(response.headers.get('content-type')).toContain('text/event-stream')
  const events = await response.text()
  for (const event of ['start', 'delta', 'complete']) expect(events).toContain(`"type":"${event}"`)
  await cleanup.pop()!()
  await cleanup.pop()!()
  const restarted = await fixture(path, { sessionSecret })
  const stored = await (await restarted.request(history, undefined, alice)).json()
  expect(stored[0]).toMatchObject({ prompt: 'hello', replies: [{ provider: 'gpt', mode: 'mock', status: 'complete' }] })
})

test('expires sessions and requires an HTTPS origin before production startup', async () => {
  expect(() => readConfig({ NODE_ENV: 'production' })).toThrow(/HTTPS/)
  expect(() => readConfig({ NEXUS_DB_PATH: 'apps/web/dist/workspace.sqlite' })).toThrow(/outside frontend/)
  expect(() => readConfig({ NEXUS_OPENAI_MODEL: 'unapproved' })).toThrow(/allowlist/)
  expect(() => readConfig({ OPENAI_API_KEY: 'fixture-only' })).toThrow(/owner/)
  const { request, signIn, db, url } = await fixture(':memory:', { secure: true, allowedOrigins: ['https://nexus.example'] })
  const alice = await signIn('alice')
  expect((await request('/session', undefined, alice)).status).toBe(200)
  expect((await fetch(url + '/api/logout', { method: 'POST', headers: { Origin: 'https://nexus.example', Cookie: alice } })).status).toBe(403)
  db.prepare('UPDATE sessions SET expires = 0').run()
  expect((await request('/session', undefined, alice)).status).toBe(401)
})

test('requires comparison approval, limits stream body size, and shares per-user throttles across chat routes', async () => {
  const { request, signIn } = await fixture(':memory:', { chatLimit: 3 })
  const cookie = await signIn('alice')
  const [project] = await (await request('/projects', undefined, cookie)).json()
  const path = `/projects/${project.id}/conversations/compare/stream`
  const body = { prompt: 'compare', providers: ['gpt', 'claude'] }
  expect((await request(path, body, cookie)).status).toBe(400)
  expect((await request(path, { ...body, prompt: 'x'.repeat(40_000) }, cookie)).status).toBe(413)
  const ok = await request(path, { ...body, consent: true }, cookie)
  expect(await ok.text()).toContain('"provider":"claude"')
  expect((await request('/chat', { prompt: 'test', providers: ['gpt'] }, cookie)).status).toBe(429)
  expect((await request('/chat', { prompt: 'test', providers: ['gpt'] }, await signIn('bob'))).status).toBe(200)
})

function firstProject(request: Awaited<ReturnType<typeof fixture>>['request'], cookie: string) {
  return request('/projects', undefined, cookie).then(async (response) => {
    const [project] = await response.json()
    return `/projects/${project.id}/conversations/gpt`
  })
}

test.each(['stop', 'disconnect'])('cancels the upstream stream and preserves partial text on %s', async (method) => {
  let settle!: () => void
  const aborted = new Promise<void>((resolve) => { settle = resolve })
  const streaming: StreamingProvider = {
    model: 'deterministic', mode: 'mock',
    async *stream({ signal }) {
      yield 'partial text'
      await new Promise<void>((_resolve, reject) => {
        if (signal.aborted) reject(signal.reason)
        else signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }).finally(settle)
    },
  }
  const { request, signIn } = await fixture(':memory:', { gpt: { ...adapters.gpt, streaming } })
  const cookie = await signIn('alice')
  const path = await firstProject(request, cookie)
  const controller = new AbortController()
  const stream = await request(path + '/stream', { prompt: 'test', providers: ['gpt'] }, cookie, undefined, controller.signal)
  const reader = stream.body!.getReader()
  let events = ''
  while (!events.includes('partial text')) {
    const result = await reader.read()
    if (result.done) throw new Error('Stream closed before emitting text')
    events += new TextDecoder().decode(result.value)
  }
  expect((await request(path + '/stream', { prompt: 'second', providers: ['gpt'] }, cookie)).status).toBe(409)
  expect((await request(path + '/stop', {}, await signIn('bob'))).status).toBe(404)
  if (method === 'stop') {
    expect((await request(path + '/stop', {}, cookie)).status).toBe(204)
    const terminal = await reader.read()
    expect(new TextDecoder().decode(terminal.value)).toContain('"status":"cancelled"')
    await reader.cancel()
  } else controller.abort()
  await aborted
  const history = await (await request(path, undefined, cookie)).json()
  expect(history[0].replies[0]).toMatchObject({ text: 'partial text', status: 'cancelled' })
})

test('redacts upstream failure, reserves the live budget and never grants access to another user', async () => {
  let calls = 0
  const internalMarker = 'internal-fixture-provider-detail'
  const streaming: StreamingProvider = {
    model: 'deterministic-live-test', mode: 'live',
    async *stream() {
      calls++
      yield 'beginning'
      throw new Error(internalMarker)
    },
  }
  const { request, signIn, db } = await fixture(':memory:', {
    gpt: { ...adapters.gpt, streaming }, liveOwner: 'alice', liveCap: 1,
  })
  const alice = await signIn('alice')
  const bob = await signIn('bob')
  const prompt = { prompt: 'test', providers: ['gpt'] }
  const path = (await firstProject(request, alice)) + '/stream'
  const response = await request(path, prompt, alice)
  const events = await response.text()
  expect(events).toContain('"type":"error"')
  expect(events).toContain('"mode":"live"')
  expect(events).not.toContain(internalMarker)
  expect(db.prepare('SELECT used FROM live_budget').get()?.used).toBe(1)
  expect((await request(path, prompt, alice)).status).toBe(429)
  const bobEvents = await (await request((await firstProject(request, bob)) + '/stream', prompt, bob)).text()
  expect(bobEvents).toContain('"mode":"mock"')
  expect(calls).toBe(1)
})
