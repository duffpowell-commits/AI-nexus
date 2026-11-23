export const providers = {
  gpt: { name: 'GPT', vendor: 'OpenAI' },
  claude: { name: 'Claude', vendor: 'Anthropic' },
  grok: { name: 'Grok', vendor: 'xAI' },
  gemini: { name: 'Gemini', vendor: 'Google' },
} as const

export type ProviderId = keyof typeof providers
export const providerIds = Object.keys(providers) as ProviderId[]
export const maxPromptLength = 4000
export type WorkflowStatus = 'planned' | 'running' | 'waiting for approval' | 'succeeded' | 'failed' | 'cancelled'

export interface PromptRequest {
  prompt: string
  providers: ProviderId[]
  consent?: boolean
}

export interface ProviderReply {
  provider: ProviderId
  mode: 'mock' | 'live'
  text: string
}

export interface PromptResponse {
  replies: ProviderReply[]
}

function isProvider(value: unknown): value is ProviderId {
  return typeof value === 'string' && Object.hasOwn(providers, value)
}

export function parsePrompt(input: unknown): PromptRequest | null {
  if (!input || typeof input !== 'object') return null
  const { prompt, providers: selected, consent } = input as Record<string, unknown>
  if (typeof prompt !== 'string' || prompt.length > maxPromptLength || !prompt.trim()) return null
  if (!Array.isArray(selected) || !selected.length || selected.length > providerIds.length ||
      !selected.every(isProvider) || new Set(selected).size !== selected.length) return null
  if (selected.length > 1 && consent !== true) return null
  return { prompt: prompt.trim(), providers: selected }
}

export type ChatView = ProviderId | 'compare'
export interface Project { id: string; name: string }
export interface SessionInfo { username: string; gptMode: ProviderReply['mode']; modes: Record<ProviderId, ProviderReply['mode']> }
export interface ChatReply extends ProviderReply {
  id: string
  model: string
  status: 'complete' | 'error' | 'cancelled'
}
export interface ChatTurn { id: string; prompt: string; replies: ChatReply[] }
type Attribution = Pick<ChatReply, 'id' | 'provider' | 'model' | 'mode'>
export type ChatEvent = Attribution & (
  | { type: 'start'; turnId: string }
  | { type: 'delta'; text: string }
  | { type: 'complete' }
  | { type: 'error'; message: string; status: 'error' | 'cancelled' }
)

export interface UsageRecord {
  id: string
  provider: ProviderId
  model: string
  mode: ProviderReply['mode']
  status: ChatReply['status'] | 'reserved'
  inputTokens: number | null
  outputTokens: number | null
  estimatedMicros: number
  timestamp: number
}
export interface UsageSummary {
  requests: UsageRecord[]
  estimatedMicros: number
  budgetMicros: number | null
}
