import { useCallback, useEffect, useState } from 'react'
import { providers, type UsageSummary } from '@nexus/contracts'
import { api } from './api'

const dollars = new Intl.NumberFormat(undefined, {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6,
})
const dates = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const cost = (micros: number) => dollars.format(micros / 1_000_000)

export function Usage() {
  const [usage, setUsage] = useState<UsageSummary>()
  const [error, setError] = useState('')
  const load = useCallback(async (signal?: AbortSignal) => {
    setError('')
    try { setUsage(await api<UsageSummary>('/usage', undefined, signal)) }
    catch { if (!signal?.aborted) setError('Could not load usage.') }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return (
    <section className="conversation" aria-labelledby="usage-title">
      <h2 id="usage-title">Usage</h2>
      {error && <p role="alert">{error}</p>}
      {!usage && !error && <p role="status">Loading usage…</p>}
      <button type="button" className="secondary" onClick={() => void load()}>Refresh usage</button>
      {usage && <>
        <p>Estimated usage including reservations {cost(usage.estimatedMicros)}</p>
        {usage.budgetMicros !== null && <p>Lifetime budget {cost(usage.budgetMicros)}</p>}
        <h3>Recent requests</h3>
        {usage.requests.length === 0 && <p>No requests recorded yet.</p>}
        <ul className="usage-list">
          {usage.requests.map((record) => (
            <li className="reply" key={record.id}>
              <strong>{providers[record.provider].name}</strong> · {record.model} · {record.mode}
              <p>{record.status} · {cost(record.estimatedMicros)}</p>
              <p>Input {record.inputTokens ?? 'unavailable'} · Output {record.outputTokens ?? 'unavailable'}</p>
              <time dateTime={new Date(record.timestamp).toISOString()}>{dates.format(record.timestamp)}</time>
              <details><summary>Request ID</summary><code>{record.id}</code></details>
            </li>
          ))}
        </ul>
      </>}
    </section>
  )
}
