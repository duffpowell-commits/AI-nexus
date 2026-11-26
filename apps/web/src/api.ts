import type { ChatEvent, PromptRequest } from '@nexus/contracts'

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

async function request(path: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch('/api' + path, {
    signal,
    cache: 'no-store',
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json', 'X-Nexus-Request': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    if (response.status === 401 && !(path === '/session' && body !== undefined)) {
      window.dispatchEvent(new Event('nexus-session-expired'))
    }
    const result = await response.json().catch(() => undefined)
    throw new ApiError(result?.error ?? 'Nexus could not finish the request. Try again.', response.status)
  }
  return response
}

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const deadline = AbortSignal.timeout(12_000)
  const response = await request(path, body, signal ? AbortSignal.any([signal, deadline]) : deadline)
  return response.status === 204 ? undefined as T : response.json()
}

export async function streamChat(path: string, input: PromptRequest, signal: AbortSignal, receive: (event: ChatEvent) => void) {
  const response = await request(path + '/stream', input, AbortSignal.any([signal, AbortSignal.timeout(40_000)]))
  if (!response.body || !response.headers.get('content-type')?.startsWith('text/event-stream')) {
    throw new Error('Nexus did not send a reply stream.')
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  try {
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += value
      let boundary
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        if (frame.startsWith('data: ')) receive(JSON.parse(frame.slice(6)) as ChatEvent)
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
