import OpenAI from 'openai'
import type { OpenAiModel } from './config.js'
import { adapters, type ProviderAdapter } from './providers.js'

export function openAiAdapter(apiKey: string, model: OpenAiModel, transport?: typeof fetch): ProviderAdapter<'gpt'> {
  const client = new OpenAI({ apiKey, baseURL: 'https://api.openai.com/v1', maxRetries: 0, timeout: 30_000, logLevel: 'off', fetch: transport })
  return {
    ...adapters.gpt,
    capabilities: { streaming: true, usageEstimates: false },
    async listModels() { return [model] },
    streaming: {
      mode: 'live',
      model,
      async *stream({ prompt, history, signal }) {
        const stream = await client.chat.completions.create({
          model,
          messages: [...history, { role: 'user', content: prompt }],
          max_completion_tokens: 512,
          store: false,
          stream: true,
        }, { signal })
        let finished = false
        for await (const chunk of stream) {
          const choice = chunk.choices[0]
          if (choice?.delta.content) yield choice.delta.content
          if (choice?.finish_reason === 'stop' || choice?.finish_reason === 'length') finished = true
        }
        if (!finished) throw new Error('Provider did not complete the reply.')
      },
    },
  }
}
