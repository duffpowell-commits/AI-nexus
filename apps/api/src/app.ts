import express, { type ErrorRequestHandler } from 'express'
import { parsePrompt, type PromptResponse } from '@nexus/contracts'
import { adapters } from './providers.js'

const handleError: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error)
    return
  }
  const errors: Record<string, [number, string]> = {
    'entity.parse.failed': [400, 'Malformed JSON.'],
    'entity.too.large': [413, 'Request body is too large.'],
    'charset.unsupported': [415, 'Unsupported JSON charset.'],
    'encoding.unsupported': [415, 'Unsupported content encoding.'],
  }
  const [status, message] = Object.hasOwn(errors, error.type) ? errors[error.type] : [500, 'Request failed.']
  response.status(status).json({ error: message })
}

export function createApp(webRoot?: string) {
  const app = express()
  app.disable('x-powered-by')
  app.use('/api', (_request, response, next) => {
    response.set('Cache-Control', 'no-store')
    next()
  })
  app.get('/api/health', (_request, response) => response.json({ status: 'ok', mode: 'mock' }))

  app.post('/api/chat', express.json({ limit: '32kb', inflate: false }), async (request, response) => {
    if (!request.is('application/json')) {
      response.status(415).json({ error: 'Use application/json.' })
      return
    }
    const input = parsePrompt(request.body)
    if (!input) {
      response.status(400).json({ error: 'Enter a valid prompt and provider selection. Multiple providers require consent.' })
      return
    }
    response.json({
      replies: await Promise.all(input.providers.map((id) => adapters[id].sendMessage(input.prompt))),
    } satisfies PromptResponse)
  })
  app.use('/api', (_request, response) => response.status(404).json({ error: 'Unknown API route.' }))
  if (webRoot) app.use(express.static(webRoot))
  app.use(handleError)
  return app
}
