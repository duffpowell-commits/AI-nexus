import { useState, type FormEvent } from 'react'
import type { SessionInfo } from '@nexus/contracts'
import { api } from './api'

export function SignIn({ onSignIn }: { onSignIn: (session: SessionInfo) => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      onSignIn(await api('/session', { username: fields.get('username'), password: fields.get('password') }))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not sign in. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="conversation sign-in" aria-labelledby="sign-in-heading">
      <h1 id="sign-in-heading">Sign in to Nexus</h1>
      <form method="post" onSubmit={submit}>
        <label htmlFor="username">Username</label>
        <input id="username" name="username" autoComplete="username" required maxLength={40} autoCapitalize="none" />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={72} />
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </section>
  )
}
