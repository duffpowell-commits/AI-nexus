import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Response } from 'express'
import type { ChatEvent, ChatReply, ChatTurn } from '@nexus/contracts'
import { saveReply } from './database.js'
import type { StreamInput, StreamingProvider } from './providers.js'

export function modelHistory(turns: ChatTurn[]): StreamInput['history'] {
  const history: { role: 'user' | 'assistant'; content: string }[] = []
  let bytes = 0
  for (const turn of [...turns].reverse()) {
    const reply = turn.replies.find((item) => item.provider === 'gpt' && item.mode === 'live' && item.status === 'complete')
    if (!reply) continue
    bytes += Buffer.byteLength(turn.prompt) + Buffer.byteLength(reply.text)
    if (bytes > 12_000) break
    history.unshift({ role: 'user', content: turn.prompt }, { role: 'assistant', content: reply.text })
  }
  return history
}

export async function runStream({ db, response, controller, turnId, prompt, history, selections }: {
  db: DatabaseSync
  response: Response
  controller: AbortController
  turnId: string
  prompt: string
  history: StreamInput['history']
  selections: { provider: ChatReply['provider']; adapter: StreamingProvider }[]
}) {
  const disconnect = () => controller.abort()
  response.once('close', disconnect)
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)])
  response.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no', 'Cache-Control': 'no-store, no-transform' })
  response.flushHeaders()
  function emit(event: ChatEvent) {
    if (!response.destroyed && !response.writableEnded) response.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  try {
    for (const { provider, adapter } of selections) {
      if (signal.aborted) break
      const attribution = { provider, id: randomUUID(), model: adapter.model, mode: adapter.mode }
      emit({ ...attribution, type: 'start', turnId })
      let text = ''
      let status: ChatReply['status'] = 'complete'
      try {
        for await (const chunk of adapter.stream({ prompt, history, signal })) {
          signal.throwIfAborted()
          if (text.length + chunk.length > 16_384) throw new Error('Reply limit reached.')
          text += chunk
          emit({ ...attribution, type: 'delta', text: chunk })
        }
        signal.throwIfAborted()
        if (!text) throw new Error('Empty reply.')
      } catch {
        status = controller.signal.aborted ? 'cancelled' : 'error'
      }
      saveReply(db, turnId, { ...attribution, text, status })
      if (status === 'complete') emit({ ...attribution, type: 'complete' })
      else emit({ ...attribution, type: 'error', status, message: status === 'cancelled' ? 'Generation stopped.' :
        signal.aborted ? 'The reply timed out. Try again.' : 'The provider could not finish the reply. Try again.' })
    }
  } finally {
    response.off('close', disconnect)
    response.end()
  }
}
