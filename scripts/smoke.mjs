import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout } from 'node:timers/promises'

const port = process.env.NEXUS_SMOKE_PORT ?? '31987'
const base = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['apps/api/dist/main.js'], {
  env: { ...process.env, NEXUS_HOST: '127.0.0.1', NEXUS_PORT: port },
  stdio: ['ignore', 'pipe', 'inherit'],
})
const exit = once(child, 'exit')
let started = false
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk)
  if (String(chunk).includes('Nexus mock server listening')) started = true
})
const request = (path, options = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(3000) })

try {
  for (let attempt = 0; attempt < 50 && !started && child.exitCode === null; attempt++) await setTimeout(100)
  assert.ok(started, 'Built Nexus server should start')
  assert.deepEqual(await (await request('/api/health')).json(), { status: 'ok', mode: 'mock' })
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

  const chat = await request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Smoke test', providers: ['gpt'] }),
  })
  assert.equal(chat.status, 200)
  assert.equal(chat.headers.get('cache-control'), 'no-store')
  const { replies } = await chat.json()
  assert.equal(replies.length, 1)
  assert.equal(replies[0].provider, 'gpt')
  assert.equal(replies[0].mode, 'mock')
  console.log('Production startup, frontend assets, PWA assets, and mock chat passed.')
} finally {
  child.kill()
  await exit
}
