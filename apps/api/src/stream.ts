import type { DatabaseSync } from 'node:sqlite'
import type { Response } from 'express'
import type { ChatEvent, ChatReply, ChatTurn } from '@nexus/contracts'
import { finishReply, reserveLiveRequests } from './database.js'
import type { StreamInput, StreamingProvider } from './providers.js'

export function modelHistory(turns: ChatTurn[], provider: ChatReply['provider']): StreamInput['history'] {
  const history: { role: 'user' | 'assistant'; content: string }[] = []
  let bytes = 0
  for (const turn of [...turns].reverse()) {
    const reply = turn.replies.find((item) => item.provider === provider && item.mode === 'live' && item.status === 'complete')
    if (!reply) continue
    bytes += Buffer.byteLength(turn.prompt) + Buffer.byteLength(reply.text)
    if (bytes > 12_000) break
    history.unshift({ role: 'user', content: turn.prompt }, { role: 'assistant', content: reply.text })
  }
  return history
}

export function reserveCost(adapter: StreamingProvider, prompt: string, history: StreamInput['history']) {
  if (!adapter.rates) return 0
  // UTF-8 byte count plus a margin for API message framing and special tokens.
  const input = history.reduce((bytes, message) => bytes + Buffer.byteLength(message.content), Buffer.byteLength(prompt)) + 1024
  return Math.ceil(input * adapter.rates.input + 512 * adapter.rates.output)
}

export async function runStream({ db, response, controller, turnId, prompt, history, selections, budgetMicros, liveCap }: {
  db: DatabaseSync
  response: Response
  controller: AbortController
  turnId: string
  prompt: string
  history: StreamInput['history']
  selections: { provider: ChatReply['provider']; adapter: StreamingProvider; id: string; controller: AbortController }[]
  budgetMicros?: number
  liveCap: number
}) {
  const disconnect = () => controller.abort()
  response.once('close', disconnect)
  const deadline = AbortSignal.timeout(30_000)
  response.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no', 'Cache-Control': 'no-store, no-transform' })
  response.flushHeaders()
  function emit(event: ChatEvent) {
    if (!response.destroyed && !response.writableEnded) response.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  try {
    const results = await Promise.allSettled(selections.map(async ({ provider, adapter, id, controller: replyController }) => {
      const signal = AbortSignal.any([controller.signal, replyController.signal, deadline])
      const attribution = { provider, id, model: adapter.model, mode: adapter.mode }
      emit({ ...attribution, type: 'start', turnId })
      let text = ''
      let deltas = 0
      let status: ChatReply['status'] = 'complete'
      let tokens: { input: number; output: number } | undefined
      try {
        signal.throwIfAborted()
        for await (const chunk of adapter.stream({
          prompt, history, signal,
          reserveRetry: () => !signal.aborted && adapter.mode === 'live' && reserveLiveRequests(db, liveCap, 1),
          usage(input, output) {
            if ([input, output].every((count) => Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000)) {
              tokens = { input, output }
            }
          },
        })) {
          signal.throwIfAborted()
          if (text.length + chunk.length > 16_384 || ++deltas > 2048) throw new Error('Reply limit reached.')
          text += chunk
          emit({ ...attribution, type: 'delta', text: chunk })
        }
        signal.throwIfAborted()
        if (!text) throw new Error('Empty reply.')
      } catch {
        status = controller.signal.aborted || replyController.signal.aborted ? 'cancelled' : 'error'
      }
      const cost = status === 'complete' && tokens && adapter.rates
        ? Math.ceil(tokens.input * adapter.rates.input + tokens.output * adapter.rates.output)
        : undefined
      finishReply(db, turnId, { ...attribution, text, status }, tokens, cost, budgetMicros !== undefined)
      if (status === 'complete') emit({ ...attribution, type: 'complete' })
      else emit({ ...attribution, type: 'error', status, message: status === 'cancelled' ? 'Generation stopped.' :
        deadline.aborted ? 'The reply timed out. Try again.' : 'The provider could not finish the reply. Try again.' })
    }))
    for (const result of results) if (result.status === 'rejected') throw result.reason
  } finally {
    response.off('close', disconnect)
    response.end()
  }
}
