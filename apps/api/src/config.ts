import { randomBytes } from 'node:crypto'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { liveModels, type ExternalProvider } from './live.js'

export const openAiModels = ['gpt-4.1-mini', 'gpt-4.1-nano'] as const
export type OpenAiModel = typeof openAiModels[number]

export function databasePath(env = process.env) {
  const path = env.NEXUS_DB_PATH || '.nexus/nexus.sqlite'
  if (path === ':memory:') return path
  const root = resolve(import.meta.dirname, '../../..')
  const result = resolve(root, path)
  for (const served of ['apps/web', 'packages/contracts/dist']) {
    const relativePath = relative(resolve(root, served), result)
    if (!relativePath || (!isAbsolute(relativePath) && relativePath !== '..' && !relativePath.startsWith('..' + sep))) {
      throw new Error('NEXUS_DB_PATH must be outside frontend directories.')
    }
  }
  return result
}

function integer(value: string, name: string, min: number, max: number) {
  const parsed = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`)
  }
  return parsed
}

export function readConfig(env = process.env) {
  const port = integer(env.NEXUS_PORT ?? '3000', 'NEXUS_PORT', 1, 65535)
  const production = env.NODE_ENV === 'production'
  const originValue = env.NEXUS_ORIGIN ?? `http://127.0.0.1:${port}`
  const origin = URL.parse(originValue)
  if (!origin || origin.origin !== originValue || (origin.protocol !== 'https:' &&
      (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(origin.hostname)))) {
    throw new Error('NEXUS_ORIGIN must be an HTTPS origin or a loopback HTTP origin, without a path.')
  }
  const secure = origin.protocol === 'https:'
  const secret = env.NEXUS_SESSION_SECRET
  if (secret !== undefined && Buffer.byteLength(secret) < 32) throw new Error('NEXUS_SESSION_SECRET must be at least 32 bytes.')
  if ((production || secure) && (!secure || !env.NEXUS_DB_PATH || env.NEXUS_DB_PATH === ':memory:' ||
      !secret)) {
    throw new Error('HTTPS mode requires an HTTPS origin, persistent database path and session secret of at least 32 bytes.')
  }

  const external = {} as Partial<Record<ExternalProvider, { key: string; model: string }>>
  for (const [id, variable] of [['claude', 'ANTHROPIC_API_KEY'], ['grok', 'XAI_API_KEY'], ['gemini', 'GEMINI_API_KEY']] as const) {
    const key = env[variable]
    const allowed: readonly string[] = liveModels[id]
    const model = env[`NEXUS_${id.toUpperCase()}_MODEL`] ?? allowed[0]
    if (!allowed.includes(model)) throw new Error(`The ${id} model is outside the allowlist.`)
    if (key !== undefined) {
      if (!key.trim()) throw new Error(`${variable} must be nonempty when set.`)
      external[id] = { key, model }
    }
  }
  const apiKey = env.OPENAI_API_KEY
  const owner = env.NEXUS_LIVE_OWNER
  const model = env.NEXUS_OPENAI_MODEL ?? 'gpt-4.1-mini'
  if (!openAiModels.some((allowed) => allowed === model)) throw new Error('NEXUS_OPENAI_MODEL is outside the model allowlist.')
  if (apiKey !== undefined && !apiKey.trim()) throw new Error('OPENAI_API_KEY must be nonempty when set.')
  const liveEnabled = Boolean(apiKey || Object.keys(external).length)
  if (liveEnabled && (!owner || !/^[a-z0-9][a-z0-9_-]{2,39}$/.test(owner) ||
      !env.NEXUS_LIVE_REQUEST_CAP || databasePath(env) === ':memory:')) {
    throw new Error('Live providers require an owner username, persistent database and explicit request cap.')
  }
  const cap = liveEnabled ? integer(env.NEXUS_LIVE_REQUEST_CAP!, 'NEXUS_LIVE_REQUEST_CAP', 1, 1000) : 0

  const budgetMicros = liveEnabled
    ? integer(env.NEXUS_LIVE_BUDGET_MICROS ?? '', 'NEXUS_LIVE_BUDGET_MICROS', 1, 1_000_000_000)
    : undefined
  return {
    external, owner, cap, budgetMicros,
    chatLimit: integer(env.NEXUS_CHAT_REQUESTS_PER_MINUTE ?? '20', 'NEXUS_CHAT_REQUESTS_PER_MINUTE', 1, 120),
    port, dbPath: databasePath(env), secure,
    allowedOrigins: secure ? [origin.origin] : [origin.origin, 'http://127.0.0.1:5173'],
    sessionSecret: secret || randomBytes(48).toString('hex'),
    live: apiKey && owner ? { apiKey, model: model as OpenAiModel } : undefined,
  }
}
