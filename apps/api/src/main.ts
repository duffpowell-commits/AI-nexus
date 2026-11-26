import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { readConfig } from './config.js'
import { openDatabase } from './database.js'
import { externalAdapter } from './live.js'
import { openAiAdapter } from './openai.js'

const config = readConfig()
const db = openDatabase(config.dbPath)
const webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url))
const { live } = config
if (config.cap && !db.prepare('SELECT 1 FROM users WHERE username = ?').get(config.owner!)) {
  throw new Error('Provision the configured live owner before starting Nexus.')
}
const external = config.external
const app = createApp({
  providers: {
    ...(external.claude && { claude: externalAdapter('claude', external.claude.key, external.claude.model) }),
    ...(external.grok && { grok: externalAdapter('grok', external.grok.key, external.grok.model) }),
    ...(external.gemini && { gemini: externalAdapter('gemini', external.gemini.key, external.gemini.model) }),
  },
  db, webRoot, secure: config.secure, allowedOrigins: config.allowedOrigins, sessionSecret: config.sessionSecret,
  gpt: live && openAiAdapter(live.apiKey, live.model), liveOwner: config.owner, liveCap: config.cap, budgetMicros: config.budgetMicros, chatLimit: config.chatLimit,
})
const server = app.listen(config.port, '127.0.0.1', () => console.log(`Nexus listening on 127.0.0.1:${config.port}`))
server.requestTimeout = 15_000
server.headersTimeout = 10_000
