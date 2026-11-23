import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'

const rawPort = process.env.NEXUS_PORT ?? '3000'
const port = Number(rawPort)
if (!/^\d+$/.test(rawPort) || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new Error('NEXUS_PORT must be an integer between 1 and 65535.')
}

const host = process.env.NEXUS_HOST ?? '127.0.0.1'
const webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url))
createApp(webRoot).listen(port, host, () => console.log(`Nexus mock server listening on ${host}:${port}`))
