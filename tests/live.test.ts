import { expect, test } from 'vitest'
import { externalAdapter, liveModels } from '../apps/api/src/live.js'
import { readConfig } from '../apps/api/src/config.js'

const cases = [
  ['claude', 'api.anthropic.com', 'x-api-key', [
    { type: 'message_start', message: { usage: { input_tokens: 9 } } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Claude fixture' } },
    { type: 'message_delta', usage: { output_tokens: 4 } },
    { type: 'message_stop' },
  ], 'Claude fixture'],
  ['grok', 'api.x.ai', 'Authorization', [
    { type: 'response.reasoning_text.delta', delta: 'private reasoning' },
    { type: 'response.output_text.delta', delta: 'Grok fixture' },
    { type: 'response.completed', response: { usage: { input_tokens: 9, output_tokens: 4 } } },
  ], 'Grok fixture'],
  ['gemini', 'generativelanguage.googleapis.com', 'x-goog-api-key', [
    { candidates: [{ content: { parts: [{ text: 'Gemini fixture' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 3, thoughtsTokenCount: 1 } },
  ], 'Gemini fixture'],
] as const

test.each(cases)('%s streams attributed text and usage through an isolated transport', async (id, host, header, frames, text) => {
  let calls = 0
  const signal = AbortSignal.timeout(3000)
  const transport: typeof fetch = async (url, options) => {
    expect(new URL(String(url)).hostname).toBe(host)
    expect(new Headers(options?.headers).get(header)).toBe(id === 'grok' ? 'Bearer fixture-key' : 'fixture-key')
    expect(options?.signal).toBe(signal)
    const body = JSON.parse(String(options?.body))
    expect(JSON.stringify(body)).toContain('test prompt')
    if (id === 'gemini') {
      expect(body.generationConfig).toEqual({ maxOutputTokens: 512, thinkingConfig: { thinkingLevel: 'MINIMAL' } })
    } else if (id === 'grok') {
      expect(new URL(String(url)).pathname).toBe('/v1/responses')
      expect(body).toMatchObject({ max_output_tokens: 512, store: false, reasoning: { effort: 'none' } })
    } else {
      expect(body).toMatchObject({ max_tokens: 512, stream: true })
    }
    expect(String(url)).not.toContain('fixture-key')
    if (++calls === 1) return new Response(null, { status: 429 })
    return new Response(frames.map((frame) => `data: ${JSON.stringify(frame)}\r\n\r\n`).join(''), {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  const adapter = externalAdapter(id, 'fixture-key', liveModels[id][0], transport)
  const chunks: string[] = []
  const usage: number[][] = []
  for await (const chunk of adapter.streaming!.stream({
    prompt: 'test prompt', history: [], signal, usage: (input, output) => usage.push([input, output]),
  })) chunks.push(chunk)
  expect(chunks.join('')).toBe(text)
  expect(usage.at(-1)).toEqual([9, 4])
  expect(calls).toBe(2)
})

test('missing keys leave providers unconfigured and live configuration fails closed', () => {
  expect(readConfig({}).external).toEqual({})
  expect(() => readConfig({ GEMINI_API_KEY: 'fixture' })).toThrow(/owner/)
  expect(() => readConfig({ GEMINI_API_KEY: 'fixture', NEXUS_LIVE_OWNER: 'owner', NEXUS_LIVE_REQUEST_CAP: '2' }))
    .toThrow(/NEXUS_LIVE_BUDGET_MICROS/)
  expect(() => readConfig({ ANTHROPIC_API_KEY: '' })).toThrow(/nonempty/)
  expect(() => readConfig({ NEXUS_GROK_MODEL: 'unlisted' })).toThrow(/allowlist/)
})

test('does not retry a rejected upstream request when the cap is exhausted', async () => {
  let attempts = 0
  const transport: typeof fetch = async () => {
    attempts++
    return new Response(null, { status: 429 })
  }
  const stream = externalAdapter('claude', 'fixture-key', liveModels.claude[0], transport).streaming!
  const reply = stream.stream({ prompt: 'fixture', history: [], signal: AbortSignal.timeout(3000), reserveRetry: () => false })
  await expect(reply[Symbol.asyncIterator]().next()).rejects.toThrow('Provider request cap reached.')
  expect(attempts).toBe(1)
})
