import { once } from 'node:events'
import type { Server } from 'node:http'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { createApp } from '../apps/api/src/app.js'
import { parsePrompt } from '../packages/contracts/src/index.js'

let server: Server
let base: string

beforeAll(async () => {
  server = createApp().listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected TCP address')
  base = `http://127.0.0.1:${address.port}`
})
afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
})

test('trims valid prompts and rejects invalid provider selections and unapproved comparisons', () => {
  expect(parsePrompt({ prompt: ' hello ', providers: ['gpt'] })).toEqual({
    prompt: 'hello', providers: ['gpt'],
  })
  for (const providers of [[], ['gpt', 'gpt'], ['invalid'], ['gpt', 'grok']]) {
    expect(parsePrompt({ prompt: 'hello', providers })).toBeNull()
  }
  for (const prompt of ['', ' '.repeat(5), 'x'.repeat(4001), null]) {
    expect(parsePrompt({ prompt, providers: ['gpt'] })).toBeNull()
  }
})

test('runs all four selected mock adapters with attribution', async () => {
  const response = await fetch(base + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Compare this', providers: ['gpt', 'claude', 'grok', 'gemini'], consent: true }),
  })
  expect(response.status).toBe(200)
  const { replies } = await response.json()
  expect(replies.map((reply: { provider: string }) => reply.provider)).toEqual(['gpt', 'claude', 'grok', 'gemini'])
  expect(replies.every((reply: { mode: string; text: string }) => reply.mode === 'mock' && reply.text.includes('Compare this'))).toBe(true)
})

test('rejects malformed and oversized bodies', async () => {
  for (const [body, status] of [['{', 400], ['x'.repeat(40_000), 413]] as const) {
    const response = await fetch(base + '/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    })
    expect(response.status).toBe(status)
    expect(await response.json()).toHaveProperty('error')
  }
})
