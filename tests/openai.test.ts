import { randomBytes } from 'node:crypto'
import { expect, test } from 'vitest'
import { openAiAdapter } from '../apps/api/src/openai.js'

test('uses the official GPT streaming transport with bounded, non-stored completions', async () => {
  const fakeCredential = randomBytes(32).toString('hex')
  const transport: typeof fetch = async (url, init) => {
    expect(String(url)).toBe('https://api.openai.com/v1/chat/completions')
    expect(new Headers(init?.headers).get('authorization')?.endsWith(fakeCredential)).toBe(true)
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'gpt-4.1-mini', stream: true, store: false, max_completion_tokens: 512,
      messages: [{ role: 'user', content: 'previous' }, { role: 'assistant', content: 'reply' }, { role: 'user', content: 'new' }],
    })
    return new Response([
      'data: {"choices":[{"delta":{"content":"first "},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"second"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ].join(''), { headers: { 'Content-Type': 'text/event-stream' } })
  }
  const adapter = openAiAdapter(fakeCredential, 'gpt-4.1-mini', transport)
  const chunks = []
  for await (const chunk of adapter.streaming!.stream({
    prompt: 'new', signal: new AbortController().signal,
    history: [{ role: 'user', content: 'previous' }, { role: 'assistant', content: 'reply' }],
  })) chunks.push(chunk)
  expect(chunks).toEqual(['first ', 'second'])
})
