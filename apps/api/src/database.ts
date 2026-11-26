import { mkdirSync, openSync, closeSync, chmodSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import type { ChatReply, ChatTurn, ChatView, Project, UsageRecord } from '@nexus/contracts'

const migrations = [
  `CREATE TABLE users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL
  ) STRICT;
  CREATE TABLE sessions (id TEXT PRIMARY KEY, expires INTEGER NOT NULL, data TEXT NOT NULL) STRICT;
  CREATE INDEX sessions_expiry ON sessions(expires);
  CREATE TABLE projects (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL
  ) STRICT;
  CREATE INDEX projects_owner ON projects(user_id);
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), view TEXT NOT NULL,
    UNIQUE(project_id, view)
  ) STRICT;
  CREATE TABLE turns (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), prompt TEXT NOT NULL
  ) STRICT;
  CREATE INDEX turns_conversation ON turns(conversation_id);
  CREATE TABLE replies (
    id TEXT PRIMARY KEY, turn_id TEXT NOT NULL REFERENCES turns(id), provider TEXT NOT NULL,
    model TEXT NOT NULL, mode TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL
  ) STRICT;
  CREATE INDEX replies_turn ON replies(turn_id);
  CREATE TABLE live_budget (id INTEGER PRIMARY KEY CHECK(id = 1), used INTEGER NOT NULL) STRICT;
  INSERT INTO live_budget VALUES (1, 0);`,
  `CREATE TABLE usage (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), turn_id TEXT NOT NULL REFERENCES turns(id),
    provider TEXT NOT NULL, model TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL,
    input_tokens INTEGER, output_tokens INTEGER, estimated_micros INTEGER NOT NULL, timestamp INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX usage_owner ON usage(user_id, timestamp);
  CREATE TABLE spend_budget (id INTEGER PRIMARY KEY CHECK(id = 1), used INTEGER NOT NULL) STRICT;
  INSERT INTO spend_budget VALUES (1, 0);`,
]

export function openDatabase(path: string) {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    closeSync(openSync(path, 'a', 0o600))
    chmodSync(path, 0o600)
  }
  const db = new DatabaseSync(path)
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;')
  // Hold the writer lock while reading and advancing the schema version.
  db.exec('BEGIN IMMEDIATE')
  try {
    const version = Number(db.prepare('PRAGMA user_version').get()?.user_version)
    if (version > migrations.length) throw new Error('The database schema is newer than this server.')
    for (const [index, migration] of migrations.entries()) {
      if (index >= version) db.exec(migration)
    }
    db.exec(`PRAGMA user_version = ${migrations.length}; COMMIT`)
  } catch (error) {
    db.exec('ROLLBACK')
    db.close()
    throw error
  }
  db.exec('PRAGMA journal_mode = WAL;')
  return db
}

export function addProject(db: DatabaseSync, userId: string, name: string): Project | null {
  const id = randomUUID()
  const result = db.prepare(`INSERT INTO projects
    SELECT ?, ?, ? WHERE (SELECT count(*) FROM projects WHERE user_id = ?) < 30`).run(id, userId, name, userId)
  return result.changes ? { id, name } : null
}

export function findConversation(db: DatabaseSync, userId: string, projectId: string, view: ChatView) {
  return db.prepare(`SELECT c.id FROM conversations c JOIN projects p ON p.id = c.project_id
    WHERE p.user_id = ? AND p.id = ? AND c.view = ?`).get(userId, projectId, view)?.id as string | undefined
}

export function reserveLiveRequests(db: DatabaseSync, cap: number, count: number) {
  return Boolean(db.prepare('UPDATE live_budget SET used = used + ? WHERE id = 1 AND used <= ? - ?')
    .run(count, cap, count).changes)
}

export function startTurn(db: DatabaseSync, userId: string, projectId: string, view: ChatView, prompt: string, liveCap?: number,
  reservations: Pick<UsageRecord, 'id' | 'provider' | 'model' | 'mode' | 'estimatedMicros'>[] = [],
  budgetMicros?: number,
) {
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(`INSERT INTO conversations (id, project_id, view)
      SELECT ?, id, ? FROM projects WHERE id = ? AND user_id = ?
      ON CONFLICT(project_id, view) DO NOTHING`).run(randomUUID(), view, projectId, userId)
    const conversation = findConversation(db, userId, projectId, view)
    if (!conversation) {
      db.exec('ROLLBACK')
      return { error: 'missing' } as const
    }
    const id = randomUUID()
    const result = db.prepare(`INSERT INTO turns SELECT ?, ?, ?
      WHERE (SELECT count(*) FROM turns WHERE conversation_id = ?) < 1000`).run(id, conversation, prompt, conversation)
    if (!result.changes) {
      db.exec('ROLLBACK')
      return { error: 'full' } as const
    }
    const liveCount = reservations.filter(({ mode }) => mode === 'live').length
    if (liveCap !== undefined && !reserveLiveRequests(db, liveCap, liveCount)) {
      db.exec('ROLLBACK')
      return { error: 'budget' } as const
    }
    const total = reservations.reduce((sum, record) => sum + record.estimatedMicros, 0)
    if (budgetMicros !== undefined && total && !db.prepare(
      'UPDATE spend_budget SET used = used + ? WHERE id = 1 AND used <= ? - ?',
    ).run(total, budgetMicros, total).changes) {
      db.exec('ROLLBACK')
      return { error: 'budget' } as const
    }
    const insert = db.prepare("INSERT INTO usage VALUES (?, ?, ?, ?, ?, ?, 'reserved', NULL, NULL, ?, ?)")
    for (const record of reservations) {
      insert.run(record.id, userId, id, record.provider, record.model, record.mode, record.estimatedMicros, Date.now())
    }
    db.exec('COMMIT')
    return { id } as const
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function loadTurns(db: DatabaseSync, conversation: string, before?: string, limit = 30): ChatTurn[] {
  const boundary = before ? db.prepare('SELECT rowid FROM turns WHERE conversation_id = ? AND id = ?')
    .get(conversation, before)?.rowid : Number.MAX_SAFE_INTEGER
  if (boundary == null) return []
  const turns = db.prepare('SELECT id, prompt FROM turns WHERE conversation_id = ? AND rowid < ? ORDER BY rowid DESC LIMIT ?')
    .all(conversation, boundary, limit) as unknown as Pick<ChatTurn, 'id' | 'prompt'>[]
  const replies = db.prepare('SELECT id, provider, model, mode, text, status FROM replies WHERE turn_id = ? ORDER BY rowid')
  return turns.reverse().map((turn) => ({ ...turn, replies: replies.all(turn.id) as unknown as ChatReply[] }))
}

export function saveReply(db: DatabaseSync, turn: string, reply: ChatReply) {
  db.prepare('INSERT INTO replies VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(reply.id, turn, reply.provider, reply.model, reply.mode, reply.text, reply.status)
}

export function finishReply(db: DatabaseSync, turnId: string, reply: ChatReply, tokens: { input: number; output: number } | undefined,
  estimatedMicros: number | undefined, reconcile: boolean,
) {
  db.exec('BEGIN IMMEDIATE')
  try {
    saveReply(db, turnId, reply)
    const reserved = db.prepare('SELECT estimated_micros FROM usage WHERE id = ?').get(reply.id)
    db.prepare(`UPDATE usage SET status = ?, input_tokens = ?, output_tokens = ?,
      estimated_micros = COALESCE(?, estimated_micros) WHERE id = ?`)
      .run(reply.status, tokens?.input ?? null, tokens?.output ?? null, estimatedMicros ?? null, reply.id)
    if (reconcile && reserved && estimatedMicros !== undefined) {
      db.prepare('UPDATE spend_budget SET used = used + ? WHERE id = 1')
        .run(estimatedMicros - Number(reserved.estimated_micros))
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function loadUsage(db: DatabaseSync, userId: string) {
  const requests = db.prepare(`SELECT id, provider, model, mode, status, input_tokens AS inputTokens,
    output_tokens AS outputTokens, estimated_micros AS estimatedMicros, timestamp
    FROM usage WHERE user_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT 50`).all(userId)
  const estimatedMicros = Number(db.prepare('SELECT COALESCE(SUM(estimated_micros), 0) AS total FROM usage WHERE user_id = ?')
    .get(userId)?.total)
  return { requests, estimatedMicros }
}
