import { randomBytes, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { compare, hash } from 'bcryptjs'
import type { RequestHandler } from 'express'
import session from 'express-session'
import { addProject } from './database.js'

declare module 'express-session' {
  interface SessionData { user?: { id: string; username: string } }
}

export const sessionLifetime = 8 * 60 * 60 * 1000
const bcryptRounds = 12
const usernamePattern = /^[a-z0-9][a-z0-9_-]{2,39}$/
const dummyHash = hash(randomBytes(32).toString('hex'), bcryptRounds)

function validPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 12 && Buffer.byteLength(password) <= 72
}

export async function addUser(db: DatabaseSync, username: string, password: string) {
  if (!usernamePattern.test(username) || !validPassword(password)) {
    throw new Error('Use a 3–40 character lowercase username and a password of at least 12 characters and at most 72 bytes.')
  }
  const passwordHash = await hash(password, bcryptRounds)
  const id = randomUUID()
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('INSERT INTO users VALUES (?, ?, ?)').run(id, username, passwordHash)
    addProject(db, id, 'Personal')
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export async function authenticate(db: DatabaseSync, username: unknown, password: unknown) {
  if (typeof username !== 'string' || !usernamePattern.test(username) || !validPassword(password)) return undefined
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
    { id: string; username: string; password_hash: string } | undefined
  const valid = await compare(password, row?.password_hash ?? await dummyHash)
  return row && valid ? { id: row.id, username: row.username } : undefined
}

class SqliteSessionStore extends session.Store {
  constructor(private readonly db: DatabaseSync) { super() }

  override get(id: string, callback: (error: unknown, data?: session.SessionData | null) => void) {
    let data: session.SessionData | null
    try {
      const row = this.db.prepare('SELECT data FROM sessions WHERE id = ? AND expires > ?').get(id, Date.now())
      data = row ? JSON.parse(String(row.data)) : null
    } catch (error) { callback(error); return }
    callback(null, data)
  }

  override set(id: string, data: session.SessionData, callback?: (error?: unknown) => void) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now())
      const expiry = data.cookie.expires ? new Date(data.cookie.expires).getTime() : Date.now() + sessionLifetime
      this.db.prepare('INSERT OR REPLACE INTO sessions VALUES (?, ?, ?)').run(id, expiry, JSON.stringify(data))
    } catch (error) { callback?.(error); return }
    callback?.()
  }

  override destroy(id: string, callback?: (error?: unknown) => void) {
    try { this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id) }
    catch (error) { callback?.(error); return }
    callback?.()
  }
}

export function sessions(db: DatabaseSync, secret: string, secure: boolean) {
  const name = secure ? '__Host-nexus' : 'nexus.sid'
  const cookie = { httpOnly: true, secure, sameSite: 'strict' as const, path: '/' }
  const middleware = session({
    name, secret, store: new SqliteSessionStore(db), cookie: { ...cookie, maxAge: sessionLifetime },
    saveUninitialized: false, resave: false,
  })
  return { name, cookie, middleware }
}

export function csrf(allowedOrigins?: readonly string[]): RequestHandler {
  return (request, response, next) => {
    const origin = request.get('origin')
    const validOrigin = origin && (allowedOrigins
      ? allowedOrigins.includes(origin)
      : origin === `${request.protocol}://${request.get('host')}` && request.hostname === '127.0.0.1')
    if (request.method === 'POST' && (!validOrigin || request.get('x-nexus-request') !== '1')) {
      response.status(403).json({ error: 'Request origin was rejected.' })
      return
    }
    next()
  }
}
