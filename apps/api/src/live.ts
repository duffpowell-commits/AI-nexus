import { setTimeout } from 'node:timers/promises'
import { adapters, type ProviderAdapter, type StreamInput } from './providers.js'

export const liveModels = {
  claude: ['claude-haiku-4-5-20251001'],
  grok: ['grok-4.3'],
  gemini: ['gemini-3.5-flash-lite'],
} as const

export type ExternalProvider = keyof typeof liveModels
const prices = {
  claude: { input: 1, output: 5 },
  grok: { input: 1.25, output: 2.5 },
  gemini: { input: 0.3, output: 2.5 },
}

async function* events(response: Response) {
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new Error('Invalid upstream stream.')
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let frame: string[] = []
  let frameLength = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += value
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        if (line.startsWith('data:')) {
          frameLength += line.length
          if (frameLength > 128_000) throw new Error('Upstream event exceeded the size limit.')
          frame.push(line.slice(5).trimStart())
        }
        else if (!line && frame.length) {
          const data = frame.join('\n')
          frame = []
          frameLength = 0
          if (data === '[DONE]') return
          yield JSON.parse(data)
        }
        newline = buffer.indexOf('\n')
      }
      if (buffer.length + frameLength > 128_000) {
        throw new Error('Upstream event exceeded the size limit.')
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

function payload(provider: ExternalProvider, model: string, key: string, { prompt, history }: StreamInput): { url: string; headers: Record<string, string>; body: object } {
  const messages = [...history, { role: 'user', content: prompt }]
  if (provider === 'claude') return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: { model, messages, max_tokens: 512, stream: true },
  }
  if (provider === 'gemini') return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    headers: { 'x-goog-api-key': key },
    body: {
      contents: messages.map(({ role, content }) => ({
        role: role === 'assistant' ? 'model' : 'user', parts: [{ text: content }],
      })),
      generationConfig: { maxOutputTokens: 512, thinkingConfig: { thinkingLevel: 'MINIMAL' } },
    },
  }
  return {
    url: 'https://api.x.ai/v1/responses',
    headers: { Authorization: `Bearer ${key}` },
    body: { model, input: messages, max_output_tokens: 512, reasoning: { effort: 'none' }, stream: true, store: false },
  }
}

export function externalAdapter<Id extends ExternalProvider>(id: Id, key: string, model: string,
  transport: typeof fetch = fetch,
): ProviderAdapter<Id> {
  if (!(liveModels[id] as readonly string[]).includes(model)) throw new Error('Model is outside the allowlist.')
  return {
    ...(adapters[id] as ProviderAdapter<Id>),
    capabilities: { streaming: true, usageEstimates: true },
    async listModels() { return [model] },
    streaming: {
      mode: 'live', model, rates: prices[id],
      async *stream(input) {
        const { url, headers, body } = payload(id, model, key, input)
        const request = () => transport(url, {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify(body), signal: input.signal, redirect: 'error',
        })
        let response = await request()
        if (response.status === 429) {
          await response.body?.cancel()
          await setTimeout(350, undefined, { signal: input.signal })
          if (input.reserveRetry && !input.reserveRetry()) throw new Error('Provider request cap reached.')
          response = await request()
        }
        if (!response.ok) {
          await response.body?.cancel()
          throw new Error('Provider request failed.')
        }
        let finished = false
        let inputTokens: number | undefined
        let outputTokens: number | undefined
        for await (const event of events(response)) {
          let text: unknown
          if (event.error || event.type === 'error') throw new Error('Provider stream failed.')
          if (id === 'claude') {
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') text = event.delta.text
            inputTokens = event.message?.usage?.input_tokens ?? inputTokens
            outputTokens = event.usage?.output_tokens ?? outputTokens
            finished ||= event.type === 'message_stop'
          } else if (id === 'gemini') {
            const candidate = event.candidates?.[0]
            for (const part of candidate?.content?.parts ?? []) {
              if (typeof part.text === 'string' && !part.thought) yield part.text
            }
            inputTokens = event.usageMetadata?.promptTokenCount ?? inputTokens
            if (event.usageMetadata?.candidatesTokenCount !== undefined || event.usageMetadata?.thoughtsTokenCount !== undefined) {
              outputTokens = (event.usageMetadata.candidatesTokenCount ?? 0) + (event.usageMetadata.thoughtsTokenCount ?? 0)
            }
            finished ||= ['STOP', 'MAX_TOKENS'].includes(candidate?.finishReason)
          } else {
            if (event.type === 'response.output_text.delta') text = event.delta
            if (event.type === 'response.completed' || (event.type === 'response.incomplete' &&
                event.response?.incomplete_details?.reason === 'max_output_tokens')) finished = true
            inputTokens = event.response?.usage?.input_tokens ?? inputTokens
            outputTokens = event.response?.usage?.output_tokens ?? outputTokens
          }
          if (inputTokens !== undefined && outputTokens !== undefined) input.usage?.(inputTokens, outputTokens)
          if (typeof text === 'string' && text) yield text
        }
        if (!finished) throw new Error('Provider stream ended early.')
      },
    },
  }
}
