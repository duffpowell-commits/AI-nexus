import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { providerIds, providers, type ChatView, type Project, type SessionInfo } from '@nexus/contracts'
import { api, ApiError } from './api'
import { Conversation } from './Conversation'
import { SignIn } from './SignIn'

const themes = { obsidian: 'Obsidian', parchment: 'Parchment' } as const
type Theme = keyof typeof themes
type View = ChatView | 'settings'

function readTheme(): Theme {
  try {
    return localStorage.getItem('nexus-theme') === 'parchment' ? 'parchment' : 'obsidian'
  } catch {
    return 'obsidian'
  }
}

function Dashboard({ session, theme, onTheme, onLogout }: {
  session: SessionInfo; theme: Theme; onTheme: (theme: Theme) => void; onLogout: () => void
}) {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [view, setView] = useState<View>('gpt')
  const [newProject, setNewProject] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const project = projects.find((item) => item.id === projectId)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const items = await api<Project[]>('/projects', undefined, signal)
      setProjects(items)
      setProjectId(items[0]?.id ?? '')
    } catch (error) {
      if (!signal?.aborted) setError(error instanceof Error ? error.message : 'Could not load projects.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !newProject.trim()) return
    setBusy(true)
    setError('')
    try {
      const item = await api<Project>('/projects', { name: newProject })
      setProjects((previous) => [...previous, item])
      setProjectId(item.id)
      setNewProject('')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create a project.')
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    try { await api('/logout', {}); onLogout() }
    catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) setError('Could not sign out. Try again.')
    }
  }

  return (
    <div className="app" data-theme={theme}>
      <a href="#workspace" className="skip">Skip to workspace</a>
      <header className="top">
        <a className="brand" href="/" aria-label="Nexus home"><span aria-hidden="true">N</span> NEXUS</a>
        <span className="mode">{session.gptMode === 'live' ? 'GPT live' : 'Mock mode'}</span>
        <div className="avatar" title="Owner avatar placeholder" aria-label="Owner avatar placeholder" role="img">DP</div>
      </header>
      <div className="layout">
        <aside>
          <div className="project-select">
            <label htmlFor="project">Project</label>
            <select id="project" value={projectId} disabled={loading || !projects.length} onChange={(event) => setProjectId(event.target.value)}>
              {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <form className="new-project" onSubmit={createProject}>
            <label htmlFor="new-project">New project</label>
            <input id="new-project" value={newProject} onChange={(event) => setNewProject(event.target.value)} maxLength={80} />
            <button type="submit" className="secondary" disabled={busy || loading || !newProject.trim()}>Add project</button>
          </form>
          <nav aria-label="Workspace views">
            {providerIds.map((id) => (
              <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>
                <span className="provider-mark" data-provider={id} aria-hidden="true">{providers[id].name[0]}</span>
                {providers[id].name}
              </button>
            ))}
            <button aria-current={view === 'compare' ? 'page' : undefined} onClick={() => setView('compare')}>Compare</button>
            <button aria-current={view === 'settings' ? 'page' : undefined} onClick={() => setView('settings')}>Settings</button>
          </nav>
        </aside>
        <main id="workspace" tabIndex={-1}>
          <div className="project-header">
            <h1>{project?.name ?? 'Workspace'}</h1>
            <span className="mascot" role="img" aria-label="Hydra artwork placeholder">Hydra artwork placeholder</span>
          </div>
          {loading && <p role="status">Loading projects…</p>}
          {error && <p role="alert">{error}</p>}
          {error && !loading && !projects.length && <button type="button" onClick={() => void load()}>Retry loading projects</button>}
          {view === 'settings' && (
            <section className="conversation" aria-labelledby="settings-title">
              <h2 id="settings-title">Settings</h2>
              <label htmlFor="theme">Theme</label>
              <select id="theme" value={theme} onChange={(event) => {
                const next = event.target.value === 'parchment' ? 'parchment' : 'obsidian'
                onTheme(next)
              }}>
                {Object.entries(themes).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              <p>Signed in as {session.username}.</p>
              <button type="button" className="secondary" onClick={() => void logout()}>Sign out</button>
            </section>
          )}
          {view !== 'settings' && project && (
            <Conversation key={`${project.id}:${view}`} view={view} projectId={project.id} gptMode={session.gptMode} />
          )}
        </main>
      </div>
    </div>
  )
}


export function App() {
  const [session, setSession] = useState<SessionInfo | null | undefined>(undefined)
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const expire = () => setSession(null)
    window.addEventListener('nexus-session-expired', expire)
    void api<SessionInfo>('/session', undefined, controller.signal).then(setSession).catch((failure: unknown) => {
      if (controller.signal.aborted) return
      setSession(null)
      if (!(failure instanceof ApiError && failure.status === 401)) setError('Could not check your session.')
    })
    return () => {
      controller.abort()
      window.removeEventListener('nexus-session-expired', expire)
    }
  }, [])

  function changeTheme(next: Theme) {
    setTheme(next)
    try { localStorage.setItem('nexus-theme', next) } catch { /* Apply the theme for this session. */ }
  }

  if (session) return <Dashboard session={session} theme={theme} onTheme={changeTheme} onLogout={() => setSession(null)} />
  return (
    <div className="app" data-theme={theme}>
      <main className="auth-shell">
        {error && <p role="alert">{error}</p>}
        {session === undefined ? <p role="status">Checking your session…</p> :
          <SignIn onSignIn={(value) => { setError(''); setSession(value) }} />}
      </main>
    </div>
  )
}
