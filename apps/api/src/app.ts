import { randomBytes, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import express, { type ErrorRequestHandler, type RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import { parsePrompt, providerIds, type ChatView, type PromptResponse, type SessionInfo, type ProviderId } from '@nexus/contracts'
import { authenticate, csrf, sessions } from './auth.js'
import { addProject, findConversation, loadUsage, loadTurns, openDatabase, startTurn } from './database.js'
import { adapters, streamAdapter, type ProviderAdapter, type ProviderRegistry } from './providers.js'
import { modelHistory, reserveCost, runStream } from './stream.js'

// Express uses the four-argument signature to register error handlers.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
  if (response.headersSent) {
    response.end()
    return
  }
  const errors: Record<string, [number, string]> = {
    'entity.parse.failed': [400, 'Malformed JSON.'],
    'entity.too.large': [413, 'Request body is too large.'],
    'charset.unsupported': [415, 'Unsupported JSON charset.'],
    'encoding.unsupported': [415, 'Unsupported content encoding.'],
  }
  const [status, message] = Object.hasOwn(errors, error?.type) ? errors[error.type] : [500, 'Request failed.']
  response.status(status).json({ error: message })
}

const requireUser: RequestHandler = (request, response, next) => {
  if (!request.session.user) { response.status(401).json({ error: 'Sign in to continue.' }); return }
  next()
}

const requireJson: RequestHandler = (request, response, next) => {
  if (!request.is('application/json')) { response.status(415).json({ error: 'Use application/json.' }); return }
  next()
}

const json = express.json({ limit: '32kb', inflate: false })
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/

interface AppOptions {
  db?: DatabaseSync
  webRoot?: string
  sessionSecret?: string
  secure?: boolean
  allowedOrigins?: readonly string[]
  gpt?: ProviderAdapter<'gpt'>
  providers?: Partial<ProviderRegistry>
  budgetMicros?: number
  liveOwner?: string
  liveCap?: number
  chatLimit?: number
}

export function createApp({
  db = openDatabase(':memory:'), webRoot, sessionSecret = randomBytes(48).toString('hex'),
  secure = false, allowedOrigins, gpt = adapters.gpt, liveOwner, liveCap = 0, chatLimit = 20, providers = {}, budgetMicros,
}: AppOptions = {}) {
  const app = express()
  app.disable('x-powered-by')
  if (secure) app.set('trust proxy', 'loopback')
  app.use((_request, response, next) => {
    response.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
    })
    if (secure) response.set('Strict-Transport-Security', 'max-age=31536000')
    next()
  })
  const active = new Map<string, { controller: AbortController; project: string; view: ChatView; replies: Map<string, AbortController> }>()
  const loginLimit = rateLimit({
    windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    skipSuccessfulRequests: true, message: { error: 'Too many sign-in attempts. Try again later.' },
  })
  const requests = rateLimit({
    windowMs: 60_000, limit: chatLimit, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (request) => request.session.user!.id,
    message: { error: 'Too many chat requests. Try again in a minute.' },
  })
  const { name, cookie, middleware } = sessions(db, sessionSecret, secure)
  const registry = { ...adapters, gpt, ...providers }
  function providerFor(id: ProviderId, username: string) {
    const adapter = registry[id]
    return streamAdapter(username === liveOwner || adapter.streaming?.mode !== 'live' ? adapter : adapters[id])
  }
  function sessionInfo(username: string): SessionInfo {
    const modes = Object.fromEntries(providerIds.map((id) => [id, providerFor(id, username).mode])) as SessionInfo['modes']
    return { username, gptMode: modes.gpt, modes }
  }
  app.use('/api', (_request, response, next) => { response.set('Cache-Control', 'no-store'); next() })
  app.get('/api/health', (_request, response) => response.json({ status: 'ok', mode: streamAdapter(gpt).mode }))
  app.use('/api', (request, response, next) => {
    if (secure && !request.secure) { response.status(403).json({ error: 'HTTPS is required.' }); return }
    next()
  })
  app.use('/api', csrf(allowedOrigins), middleware)
  app.post('/api/session', loginLimit, requireJson, json, async (request, response) => {
    const user = await authenticate(db, request.body?.username, request.body?.password)
    if (!user) { response.status(401).json({ error: 'Invalid username or password.' }); return }
    await new Promise<void>((resolve, reject) => request.session.regenerate((error) => error ? reject(error) : resolve()))
    request.session.user = user
    await new Promise<void>((resolve, reject) => request.session.save((error) => error ? reject(error) : resolve()))
    response.json(sessionInfo(user.username))
  })
  app.use('/api', requireUser)
  app.get('/api/session', (request, response) => response.json(sessionInfo(request.session.user!.username)))
  app.post('/api/logout', requireJson, json, (request, response, next) => {
    active.get(request.session.user!.id)?.controller.abort()
    request.session.destroy((error) => {
      if (error) { next(error); return }
      response.clearCookie(name, cookie).status(204).end()
    })
  })
  app.get('/api/usage', (request, response) => {
    const user = request.session.user!
    response.json({ ...loadUsage(db, user.id), budgetMicros: user.username === liveOwner ? budgetMicros ?? null : null })
  })
  app.get('/api/projects', (request, response) => {
    response.json(db.prepare('SELECT id, name FROM projects WHERE user_id = ? ORDER BY rowid').all(request.session.user!.id))
  })
  app.post('/api/projects', requireJson, json, (request, response) => {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : ''
    if (!name || name.length > 80) { response.status(400).json({ error: 'Enter a project name up to 80 characters.' }); return }
    const project = addProject(db, request.session.user!.id, name)
    if (!project) { response.status(409).json({ error: 'Project limit reached.' }); return }
    response.status(201).json(project)
  })
  app.post('/api/chat', requests, requireJson, json, async (request, response) => {
    const input = parsePrompt(request.body)
    if (!input) {
      response.status(400).json({ error: 'Enter a valid prompt and provider selection. Multiple providers require consent.' })
      return
    }
    response.json({
      replies: await Promise.all(input.providers.map((id) => adapters[id].sendMessage(input.prompt))),
    } satisfies PromptResponse)
  })

  const projectConversation = express.Router({ mergeParams: true })
  projectConversation.use((request, response, next) => {
    const { project, view } = request.params
    if (typeof project !== 'string' || !uuid.test(project) || (view !== 'compare' && !providerIds.some((id) => id === view)) ||
        !db.prepare('SELECT 1 FROM projects WHERE id = ? AND user_id = ?').get(project, request.session.user!.id)) {
      response.status(404).json({ error: 'Conversation not found.' })
      return
    }
    response.locals.conversation = { project, view }
    next()
  })
  projectConversation.get('/', (request, response) => {
    const { project, view } = response.locals.conversation as { project: string; view: ChatView }
    const conversation = findConversation(db, request.session.user!.id, project, view)
    const before = request.query.before
    if (before !== undefined && (typeof before !== 'string' || !uuid.test(before))) {
      response.status(400).json({ error: 'Invalid history cursor.' })
      return
    }
    response.json(conversation ? loadTurns(db, conversation, before) : [])
  })
  projectConversation.post('/stop', requireJson, json, (request, response) => {
    const { project, view } = response.locals.conversation
    const generation = active.get(request.session.user!.id)
    const replyId = request.body?.replyId
    if (replyId !== undefined && (typeof replyId !== 'string' || !uuid.test(replyId))) {
      response.status(400).json({ error: 'Invalid reply identifier.' })
      return
    }
    if (generation && generation.project === project && generation.view === view) {
      if (replyId) generation.replies.get(replyId)?.abort()
      else generation.controller.abort()
    }
    response.status(204).end()
  })
  projectConversation.post('/stream', requests, requireJson, json, async (request, response) => {
    const { project, view } = response.locals.conversation as { project: string; view: ChatView }
    const user = request.session.user!
    const input = parsePrompt(request.body)
    if (!input || (view === 'compare' ? input.providers.length < 2 : input.providers.length !== 1 || input.providers[0] !== view)) {
      response.status(400).json({ error: 'Enter a valid prompt for this conversation. Comparison requires consent.' })
      return
    }
    if (active.has(user.id)) { response.status(409).json({ error: 'A reply is already streaming.' }); return }
    const selections = input.providers.map((provider) => ({
      provider, adapter: providerFor(provider, user.username), id: randomUUID(), controller: new AbortController(),
    }))
    const live = selections.some(({ adapter }) => adapter.mode === 'live')
    const conversation = findConversation(db, user.id, project, view)
    const history = live && view !== 'compare' && conversation ? modelHistory(loadTurns(db, conversation, undefined, 10), view) : []
    if (response.destroyed) return
    if (live && (budgetMicros === undefined || selections.some(({ adapter }) => adapter.mode === 'live' && !adapter.rates))) {
      response.status(503).json({ error: 'Live provider budgets are unavailable.' })
      return
    }
    const reservations = selections.map(({ provider, id, adapter }) => ({
      id, provider, model: adapter.model, mode: adapter.mode,
      estimatedMicros: reserveCost(adapter, input.prompt, history),
    }))
    const turn = startTurn(db, user.id, project, view, input.prompt, live ? liveCap : undefined, reservations, budgetMicros)
    if (turn.error === 'budget') { response.status(429).json({ error: 'Live provider budget exhausted.' }); return }
    if (turn.error === 'missing') { response.status(404).json({ error: 'Conversation not found.' }); return }
    if (turn.error === 'full') { response.status(409).json({ error: 'Conversation limit reached. Start a new project to continue.' }); return }
    const controller = new AbortController()
    active.set(user.id, { controller, project, view, replies: new Map(selections.map((item) => [item.id, item.controller])) })
    try {
      await runStream({ db, response, controller, turnId: turn.id, prompt: input.prompt, history, selections, budgetMicros, liveCap })
    } finally {
      active.delete(user.id)
    }
  })
  app.use('/api/projects/:project/conversations/:view', projectConversation)
  app.use('/api', (_request, response) => response.status(404).json({ error: 'Unknown API route.' }))
  if (webRoot) app.use(express.static(webRoot))
  app.use(handleError)
  return app
}
