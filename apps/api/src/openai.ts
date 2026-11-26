import OpenAI from 'openai'
import { setTimeout } from 'node:timers/promises'
import type { OpenAiModel } from './config.js'
import { adapters, type ProviderAdapter } from './providers.js'

export function openAiAdapter(apiKey: string, model: OpenAiModel, transport?: typeof fetch): ProviderAdapter<'gpt'> {
  const client = new OpenAI({ apiKey, baseURL: 'https://api.openai.com/v1', maxRetries: 0, timeout: 30_000, logLevel: 'off', fetch: transport })
  return {
    ...adapters.gpt,
    capabilities: { streaming: true, usageEstimates: true },
    async listModels() { return [model] },
    streaming: {
      mode: 'live',
      model,
      rates: model === 'gpt-4.1-mini' ? { input: 0.4, output: 1.6 } : { input: 0.1, output: 0.4 },
      async *stream({ prompt, history, signal, usage, reserveRetry }) {
        const request = () => client.chat.completions.create({
          model,
          messages: [...history, { role: 'user', content: prompt }],
          max_completion_tokens: 512,
          store: false,
          stream: true,
          stream_options: { include_usage: true },
        }, { signal })
        const stream = await request().catch(async (error: unknown) => {
          if (!(error instanceof OpenAI.RateLimitError)) throw error
          await setTimeout(350, undefined, { signal })
          if (reserveRetry && !reserveRetry()) throw new Error('Provider request cap reached.')
          return request()
        })
        let finished = false
        for await (const chunk of stream) {
          if (chunk.usage) usage?.(chunk.usage.prompt_tokens, chunk.usage.completion_tokens)
          const choice = chunk.choices[0]
          if (choice?.delta.content) yield choice.delta.content
          if (choice?.finish_reason === 'stop' || choice?.finish_reason === 'length') finished = true
        }
        if (!finished) throw new Error('Provider did not complete the reply.')
      },
    },
  }
}
