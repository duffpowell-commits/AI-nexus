export const providers = {
  gpt: { name: 'GPT', vendor: 'OpenAI' },
  claude: { name: 'Claude', vendor: 'Anthropic' },
  grok: { name: 'Grok', vendor: 'xAI' },
  gemini: { name: 'Gemini', vendor: 'Google' },
} as const

export type ProviderId = keyof typeof providers
export const providerIds = Object.keys(providers) as ProviderId[]
export const maxPromptLength = 4000
export type WorkflowStatus = 'planned' | 'running' | 'waiting for approval' | 'succeeded' | 'failed'

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
