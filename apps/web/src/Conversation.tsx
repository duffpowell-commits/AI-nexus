import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  maxPromptLength, providerIds, providers, type ChatTurn, type ChatView,
  type ProviderId, type SessionInfo, type WorkflowStatus,
} from '@nexus/contracts'
import { api, streamChat } from './api'

export function Conversation({ view, projectId, gptMode }: {
  view: ChatView; projectId: string; gptMode: SessionInfo['gptMode']
}) {
  const headingId = useId()
  const promptId = useId()
  const compare = view === 'compare'
  const [selected, setSelected] = useState<ProviderId[]>(['gpt', 'claude'])
  const [consent, setConsent] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [pending, setPending] = useState<ChatTurn>()
  const [status, setStatus] = useState<WorkflowStatus>('planned')
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const request = useRef<AbortController | null>(null)
  const path = `/projects/${projectId}/conversations/${view}`
  const running = status === 'running'

  const load = useCallback(async (before?: string) => {
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    try {
      const page = await api<ChatTurn[]>(path + (before ? `?before=${before}` : ''), undefined, controller.signal)
      setTurns((previous) => before ? [...page, ...previous] : page)
      setMore(page.length === 30)
      setReady(true)
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load the conversation.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [path])

  useEffect(() => {
    void load()
    return () => request.current?.abort()
  }, [load])

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (running || loading || !ready || !prompt.trim() || (compare && (selected.length < 2 || !consent))) return
    const controller = new AbortController()
    request.current = controller
    const turn: ChatTurn = { id: 'pending', prompt: prompt.trim(), replies: [] }
    const selection = compare ? selected : [view]
    const open = new Set<string>()
    let failure = ''
    let cancelled = false
    setPending(turn)
    setError('')
    setStatus('running')
    setConsent(false)

    try {
      await streamChat(path, { prompt, providers: selection, consent }, controller.signal, (event) => {
        const { id, provider, model, mode } = event
        if (event.type === 'start') {
          open.add(id)
          turn.id = event.turnId
          turn.replies.push({ id, provider, model, mode, text: '', status: 'error' })
        } else {
          const reply = turn.replies.find((item) => item.id === id)
          if (!reply) return
          if (event.type === 'delta') reply.text += event.text
          else {
            open.delete(id)
            reply.status = event.type === 'complete' ? 'complete' : event.status
            if (event.type === 'error') {
              failure = event.message
              cancelled ||= event.status === 'cancelled'
            }
          }
        }
        setPending({ ...turn })
      })
      if (failure) setError(failure)
      else if (open.size || turn.replies.length !== selection.length) throw new Error('The stream ended early. Try again.')
      else setPrompt('')
      setStatus(cancelled ? 'cancelled' : failure ? 'failed' : 'succeeded')
    } catch (error) {
      if (controller.signal.aborted) return
      setError(error instanceof Error ? error.message : 'Could not finish the reply. Try again.')
      setStatus('failed')
    } finally {
      if (!controller.signal.aborted) {
        if (turn.id !== 'pending') setTurns((previous) => [...previous, turn])
        setPending(undefined)
      }
    }
  }

  async function stop() {
    if (pending?.id === 'pending') {
      request.current?.abort()
      setPending(undefined)
      setStatus('cancelled')
      return
    }
    try { await api(path + '/stop', {}) }
    catch { setError('Could not stop the reply. Try again.') }
  }

  return (
    <section className="conversation" aria-labelledby={headingId}>
      <header className="conversation-heading">
        <div>
          <h2 id={headingId}>{compare ? 'Collaboration workspace' : `Chat with ${providers[view].name}`}</h2>
          <p>{compare ? 'Send the same prompt to the selected providers and compare their replies.' : `${providers[view].vendor} · ${view === 'gpt' && gptMode === 'live' ? 'Live GPT' : 'Mock adapter'}`}</p>
        </div>
        <span className="status" data-status={status} role="status">
          {compare && selected.length >= 2 && !consent && status === 'planned' ? 'waiting for approval' : status}
        </span>
      </header>
      <div className="transcript" role="log" aria-live={running ? 'off' : 'polite'} aria-label="Conversation">
        {loading && <p role="status">Loading history…</p>}
        {more && <button type="button" disabled={loading || running} onClick={() => void load(turns[0].id)}>Load earlier messages</button>}
        {ready && turns.length === 0 && !pending && <p className="empty">Enter a prompt to start.</p>}
        {[...turns, ...(pending ? [pending] : [])].map((turn) => (
          <article className="turn" key={turn.id}>
            <div className="prompt"><strong>You</strong><p>{turn.prompt}</p></div>
            <div className="replies">
              {turn.replies.map((reply) => (
                <div className="reply" key={reply.id}>
                  <strong>{providers[reply.provider].name}</strong>{' '}
                  <small>{reply.mode === 'mock' ? 'Mock reply' : `Live · ${reply.model}`}</small>
                  <p>{reply.text}</p>
                  {turn !== pending && reply.status !== 'complete' &&
                    <small>{reply.status === 'cancelled' ? 'Stopped' : 'Incomplete reply'}</small>}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
      <form onSubmit={send}>
        {compare && <fieldset disabled={running}>
          <legend>Providers</legend>
          <div className="choices">
            {providerIds.map((id) => (
              <label key={id}>
                <input type="checkbox" checked={selected.includes(id)} onChange={(event) => {
                  setSelected(event.target.checked ? [...selected, id] : selected.filter((item) => item !== id))
                  setConsent(false)
                  setStatus('planned')
                }} />
                {providers[id].name} ({id === 'gpt' && gptMode === 'live' ? 'Live' : 'Mock'})
              </label>
            ))}
          </div>
          <label className="consent">
            <input type="checkbox" checked={consent} disabled={selected.length < 2}
              onChange={(event) => { setConsent(event.target.checked); setStatus('planned') }} />
            Send this prompt to the selected providers
          </label>
          {selected.length < 2 && <p>Select at least two providers to compare.</p>}
        </fieldset>}
        <label htmlFor={promptId}>Prompt</label>
        <textarea id={promptId} rows={3} value={prompt} maxLength={maxPromptLength} disabled={running}
          placeholder="Write a message…" required onChange={(event) => {
            setError('')
            setPrompt(event.target.value)
            setConsent(false)
            setStatus('planned')
          }} />
        {error && <p role="alert">{error}</p>}
        {!ready && !loading && <button type="button" onClick={() => void load()}>Retry loading history</button>}
        {running && <button type="button" className="secondary" onClick={() => void stop()}>Stop generation</button>}
        <button type="submit" className="primary" disabled={running || loading || !ready || !prompt.trim() || (compare && (selected.length < 2 || !consent))}>
          {running ? 'Sending…' : compare ? 'Compare replies' : status === 'failed' || status === 'cancelled' ? 'Retry prompt' : 'Send prompt'}
        </button>
      </form>
    </section>
  )
}
