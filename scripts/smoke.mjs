import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'

const port = process.env.NEXUS_SMOKE_PORT ?? '31987'
const base = `http://127.0.0.1:${port}`
const work = await mkdtemp(join(tmpdir(), 'nexus-smoke-'))
const username = 'smoke-user'
const password = randomBytes(24).toString('hex')
const env = { NEXUS_DB_PATH: join(work, 'smoke.sqlite'), NEXUS_ORIGIN: base, NEXUS_PORT: port }

let server
let serverExit
try {
  const provision = spawn(process.execPath, ['apps/api/dist/provision.js', username], {
    env, stdio: ['pipe', 'inherit', 'inherit'],
  })
  provision.stdin.end(password)
  const [provisionCode] = await once(provision, 'exit')
  assert.equal(provisionCode, 0)
  server = spawn(process.execPath, ['apps/api/dist/main.js'], { env, stdio: ['ignore', 'pipe', 'inherit'] })
  serverExit = once(server, 'exit')
  let started = false
  server.stdout.on('data', (chunk) => {
    process.stdout.write(chunk)
    if (String(chunk).includes('Nexus listening')) started = true
  })
  for (let attempt = 0; attempt < 50 && !started && server.exitCode === null; attempt++) await setTimeout(100)
  assert.ok(started, 'Built Nexus server should start')

  const request = (path, options = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(5000) })
  assert.deepEqual(await (await request('/api/health')).json(), { status: 'ok', mode: 'mock' })
  assert.equal((await request('/api/projects')).status, 401)
  const home = await request('/')
  assert.equal(home.status, 200)
  const html = await home.text()
  assert.match(html, /<title>Nexus<\/title>/)
  const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1]
  assert.ok(asset)
  assert.equal((await request(asset)).status, 200)

  const manifest = await (await request('/manifest.webmanifest')).json()
  assert.equal(manifest.display, 'standalone')
  for (const icon of manifest.icons) {
    assert.match((await request(icon.src)).headers.get('content-type'), /image\/png/)
  }
  assert.equal((await request('/sw.js')).status, 200)
  assert.match(await (await request('/offline.html')).text(), /Nexus is offline/)

  const headers = { 'Content-Type': 'application/json', 'X-Nexus-Request': '1', Origin: base }
  const login = await request('/api/session', { method: 'POST', headers, body: JSON.stringify({ username, password }) })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie').split(';')[0]
  assert.deepEqual(await login.json(), {
    username, gptMode: 'mock', modes: { gpt: 'mock', claude: 'mock', grok: 'mock', gemini: 'mock' },
  })
  const projects = await request('/api/projects', { headers: { Cookie: cookie } })
  assert.equal(projects.status, 200)
  const [project] = await projects.json()
  const conversation = `/api/projects/${project.id}/conversations/gpt`
  const chat = await request(conversation + '/stream', {
    method: 'POST',
    headers: { ...headers, Cookie: cookie },
    body: JSON.stringify({ prompt: 'Smoke test', providers: ['gpt'] }),
  })
  assert.equal(chat.status, 200)
  assert.equal(chat.headers.get('cache-control'), 'no-store, no-transform')
  assert.match(await chat.text(), /"type":"complete"/)
  const history = await request(conversation, { headers: { Cookie: cookie } })
  const [turn] = await history.json()
  assert.equal(turn.prompt, 'Smoke test')
  assert.equal(turn.replies[0].mode, 'mock')
  const usage = await (await request('/api/usage', { headers: { Cookie: cookie } })).json()
  assert.equal(usage.requests[0].id, turn.replies[0].id)
  assert.equal(usage.requests[0].estimatedMicros, 0)
  console.log('Production startup, sign-in, persistent mock streaming, and PWA assets passed.')
} finally {
  server?.kill()
  await serverExit
  await rm(work, { recursive: true, force: true })
}
