import { useId, useState, type FormEvent } from 'react'
import {
  maxPromptLength, providerIds, providers, type ProviderId,
  type PromptRequest, type PromptResponse, type WorkflowStatus,
} from '@nexus/contracts'

const projects = [
  { id: 'personal', name: 'Personal', note: 'A workspace for questions and early ideas.' },
  { id: 'nexus', name: 'Nexus prototype', note: 'Explore ideas for the Nexus app.' },
] as const

const themes = { obsidian: 'Obsidian', parchment: 'Parchment' } as const
type Theme = keyof typeof themes
type View = ProviderId | 'compare' | 'settings'
type Turn = PromptResponse & { prompt: string }

function readTheme(): Theme {
  try {
    return localStorage.getItem('nexus-theme') === 'parchment' ? 'parchment' : 'obsidian'
  } catch {
    return 'obsidian'
  }
}

async function requestReplies(input: PromptRequest): Promise<PromptResponse> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error('Nexus could not get a reply. Try again.')
  return response.json()
}

function Conversation({ view }: { view: ProviderId | 'compare' }) {
  const headingId = useId()
  const promptId = useId()
  const compare = view === 'compare'
  const [selected, setSelected] = useState<ProviderId[]>(['gpt', 'claude'])
  const [consent, setConsent] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [status, setStatus] = useState<WorkflowStatus>('planned')
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const running = status === 'running'

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (running || !prompt.trim() || (compare && (selected.length < 2 || !consent))) return
    setPending(prompt.trim())
    setError('')
    setStatus('running')
    try {
      const result = await requestReplies({ prompt, providers: compare ? selected : [view], consent })
      setTurns((previous) => [...previous, { prompt: prompt.trim(), ...result }])
      setPrompt('')
      setConsent(false)
      setStatus('succeeded')
    } catch {
      setError('Nexus could not get a reply. Check your connection and try again.')
      setStatus('failed')
    } finally {
      setPending('')
    }
  }

  return (
    <section className="conversation" aria-labelledby={headingId}>
      <header className="conversation-heading">
        <div>
          <h2 id={headingId}>{compare ? 'Collaboration workspace' : `Chat with ${providers[view].name}`}</h2>
          <p>{compare ? 'Compare independent mock replies to the same prompt.' : `${providers[view].vendor} · ${providers[view].name} mock adapter`}</p>
        </div>
        <span className="status" data-status={status} role="status">
          {compare && selected.length >= 2 && !consent && status === 'planned' ? 'waiting for approval' : status}
        </span>
      </header>
      <div className="transcript" role="log" aria-label="Conversation">
        {turns.length === 0 && !pending && <p className="empty">Enter a prompt to start.</p>}
        {turns.map((turn, index) => (
          <article className="turn" key={index}>
            <div className="prompt"><strong>You</strong><p>{turn.prompt}</p></div>
            <div className="replies">
              {turn.replies.map((reply) => (
                <div className="reply" key={reply.provider}>
                  <strong>{providers[reply.provider].name}</strong> <small>{reply.mode === 'mock' ? 'Mock reply' : 'Live reply'}</small>
                  <p>{reply.text}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
        {pending && <div className="prompt"><strong>You</strong><p>{pending}</p></div>}
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
                {providers[id].name}
              </label>
            ))}
          </div>
          <label className="consent">
            <input type="checkbox" checked={consent} disabled={selected.length < 2}
              onChange={(event) => { setConsent(event.target.checked); setStatus('planned') }} />
            Send this prompt to the selected mock adapters
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
        <button type="submit" className="primary" disabled={running || !prompt.trim() || (compare && (selected.length < 2 || !consent))}>
          {running ? 'Sending…' : compare ? 'Compare replies' : 'Send prompt'}
        </button>
      </form>
    </section>
  )
}

export function App() {
  const [projectId, setProjectId] = useState<string>(projects[0].id)
  const [view, setView] = useState<View>('gpt')
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [visited, setVisited] = useState<string[]>([`${projects[0].id}:gpt`])
  const project = projects.find((item) => item.id === projectId) ?? projects[0]
  const activeKey = `${project.id}:${view}`

  function open(nextProject: string, nextView: View) {
    setProjectId(nextProject)
    setView(nextView)
    const key = `${nextProject}:${nextView}`
    if (nextView !== 'settings') setVisited((previous) => previous.includes(key) ? previous : [...previous, key])
  }

  return (
    <div className="app" data-theme={theme}>
      <a href="#workspace" className="skip">Skip to workspace</a>
      <header className="top">
        <a className="brand" href="/" aria-label="Nexus home"><span aria-hidden="true">N</span> NEXUS</a>
        <span className="mode">Mock mode</span>
        <div className="avatar" title="Owner avatar placeholder" aria-label="Owner avatar placeholder" role="img">DP</div>
      </header>
      <div className="layout">
        <aside>
          <div className="project-select">
            <label htmlFor="project">Project</label>
            <select id="project" value={projectId} onChange={(event) => open(event.target.value, view)}>
              {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <nav aria-label="Workspace views">
            {providerIds.map((id) => (
              <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => open(projectId, id)}>
                <span className="provider-mark" data-provider={id} aria-hidden="true">{providers[id].name[0]}</span>
                {providers[id].name}
              </button>
            ))}
            <button aria-current={view === 'compare' ? 'page' : undefined} onClick={() => open(projectId, 'compare')}>Compare</button>
            <button aria-current={view === 'settings' ? 'page' : undefined} onClick={() => open(projectId, 'settings')}>Settings</button>
          </nav>
        </aside>
        <main id="workspace" tabIndex={-1}>
          <div className="project-header">
            <div><h1>{project.name}</h1><p>{project.note}</p></div>
            <span className="mascot" role="img" aria-label="Hydra artwork placeholder">Hydra artwork placeholder</span>
          </div>
          {view === 'settings' && (
            <section className="conversation" aria-labelledby="settings-title">
              <h2 id="settings-title">Settings</h2>
              <label htmlFor="theme">Theme</label>
              <select id="theme" value={theme} onChange={(event) => {
                const next = event.target.value === 'parchment' ? 'parchment' : 'obsidian'
                setTheme(next)
                try { localStorage.setItem('nexus-theme', next) } catch { /* Apply the theme for this session. */ }
              }}>
                {Object.entries(themes).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              <p>Replies are simulated. Conversation history is held in this tab until you reload or close it.</p>
            </section>
          )}
          {projects.flatMap((item) => [...providerIds, 'compare' as const].map((tab) => {
            const key = `${item.id}:${tab}`
            return visited.includes(key) && (
              <div key={key} hidden={key !== activeKey}>
                <Conversation view={tab} />
              </div>
            )
          }))}
        </main>
      </div>
    </div>
  )
}
