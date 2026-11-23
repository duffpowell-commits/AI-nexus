import { randomBytes } from 'node:crypto'
import { isAbsolute, relative, resolve, sep } from 'node:path'

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

  const apiKey = env.OPENAI_API_KEY
  const owner = env.NEXUS_LIVE_OWNER
  const model = env.NEXUS_OPENAI_MODEL ?? 'gpt-4.1-mini'
  if (!openAiModels.some((allowed) => allowed === model)) throw new Error('NEXUS_OPENAI_MODEL is outside the model allowlist.')
  if (apiKey && (!apiKey.trim() || !owner || !/^[a-z0-9][a-z0-9_-]{2,39}$/.test(owner) ||
      !env.NEXUS_LIVE_REQUEST_CAP || databasePath(env) === ':memory:')) {
    throw new Error('Live GPT requires an owner username, persistent database and explicit request cap.')
  }
  const cap = apiKey ? integer(env.NEXUS_LIVE_REQUEST_CAP!, 'NEXUS_LIVE_REQUEST_CAP', 1, 1000) : 0

  return {
    port, dbPath: databasePath(env), secure,
    allowedOrigins: secure ? [origin.origin] : [origin.origin, 'http://127.0.0.1:5173'],
    sessionSecret: secret || randomBytes(48).toString('hex'),
    live: apiKey && owner ? { apiKey, owner, model: model as OpenAiModel, cap } : undefined,
  }
}
