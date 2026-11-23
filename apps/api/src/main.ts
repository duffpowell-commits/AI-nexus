import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { readConfig } from './config.js'
import { openDatabase } from './database.js'
import { openAiAdapter } from './openai.js'

const config = readConfig()
const db = openDatabase(config.dbPath)
const webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url))
const { live } = config
if (live && !db.prepare('SELECT 1 FROM users WHERE username = ?').get(live.owner)) {
  throw new Error('Provision the configured live owner before starting Nexus.')
}
const app = createApp({
  db, webRoot, secure: config.secure, allowedOrigins: config.allowedOrigins, sessionSecret: config.sessionSecret,
  gpt: live && openAiAdapter(live.apiKey, live.model), liveOwner: live?.owner, liveCap: live?.cap,
})
const server = app.listen(config.port, '127.0.0.1', () => console.log(`Nexus listening on 127.0.0.1:${config.port}`))
server.requestTimeout = 15_000
server.headersTimeout = 10_000
