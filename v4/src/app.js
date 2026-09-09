import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loginDemo, verifyDemoToken, publicDemoUsers } from './auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

const routePermissions = Object.freeze({
  'GET /api/state': 'dashboard.read',
  'GET /api/audit': 'audit.read',
  'POST /api/people': 'person.create',
  'POST /api/contracts': 'contract.create',
  'POST /api/payments': 'payment.create',
  'POST /api/allocations': 'allocation.create',
  'POST /api/promises': 'promise.create',
  'POST /api/collection-tasks': 'collection.create',
  'POST /api/commission-rules': 'commission.rule.create'
})

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(payload))
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1024 * 1024) throw Object.assign(new Error('payload too large'), { code: 'PAYLOAD_TOO_LARGE' })
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw Object.assign(new Error('JSON inválido'), { code: 'BAD_JSON' }) }
}

function bearer(req) {
  const raw = String(req.headers.authorization || '')
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : null
}

function statusFor(error) {
  if (['UNAUTHORIZED', 'AUTH_DISABLED'].includes(error.code)) return 401
  if (error.code === 'FORBIDDEN' || error.code === '42501') return 403
  if (error.code === 'NOT_FOUND') return 404
  if (error.code === 'PAYLOAD_TOO_LARGE') return 413
  if (error.code === '23505') return 409
  if (error.code === '23514') return 422
  return 400
}

function contentType(file) {
  const ext = extname(file)
  if (ext === '.js') return 'text/javascript; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.svg') return 'image/svg+xml'
  return 'text/html; charset=utf-8'
}

async function serveStatic(pathname, res) {
  const file = pathname === '/' ? 'index.html' : pathname.slice(1)
  if (!['index.html', 'app.js', 'styles.css'].includes(file)) return false
  const content = await readFile(join(publicDir, file))
  res.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' })
  res.end(content)
  return true
}

export function createHttpServer(repository) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`)
      const key = `${req.method} ${url.pathname}`

      if (req.method === 'GET' && ['/','/app.js','/styles.css'].includes(url.pathname)) {
        if (await serveStatic(url.pathname, res)) return
      }

      if (key === 'GET /health' || key === 'GET /api/health') {
        const health = await repository.health()
        return json(res, 200, { ok: true, environment: process.env.V4_ENVIRONMENT, isolated: true, ...health })
      }

      if (key === 'GET /api/demo-users') return json(res, 200, { users: publicDemoUsers() })

      if (key === 'POST /api/auth/login') {
        const input = await readBody(req)
        const auth = loginDemo(input.username, input.password)
        const identity = await repository.identity(auth.user.id)
        if (!identity) throw Object.assign(new Error('identidade demo não provisionada'), { code: 'FORBIDDEN' })
        return json(res, 200, { token: auth.token, user: { ...auth.user, roles: identity.roles, permissions: identity.permissions } })
      }

      const token = bearer(req)
      if (!token) throw Object.assign(new Error('autenticação obrigatória'), { code: 'UNAUTHORIZED' })
      const actor = verifyDemoToken(token)
      const identity = await repository.identity(actor.id)
      if (!identity) throw Object.assign(new Error('identidade não autorizada'), { code: 'FORBIDDEN' })

      if (key === 'GET /api/me') return json(res, 200, { user: { ...actor, roles: identity.roles, permissions: identity.permissions } })

      const permission = routePermissions[key]
      if (permission) await repository.assertPermission(actor.id, permission)

      if (key === 'GET /api/state') return json(res, 200, await repository.state(actor.id))
      if (key === 'GET /api/audit') return json(res, 200, await repository.audit(actor.id))
      if (key === 'POST /api/people') return json(res, 201, await repository.createPerson(actor.id, await readBody(req)))
      if (key === 'POST /api/contracts') return json(res, 201, await repository.createContract(actor.id, await readBody(req)))
      if (key === 'POST /api/payments') return json(res, 201, await repository.createPayment(actor.id, await readBody(req)))
      if (key === 'POST /api/allocations') return json(res, 201, await repository.allocatePayment(actor.id, await readBody(req)))
      if (key === 'POST /api/promises') return json(res, 201, await repository.createPromise(actor.id, await readBody(req)))
      if (key === 'POST /api/collection-tasks') return json(res, 201, await repository.createCollectionTask(actor.id, await readBody(req)))
      if (key === 'POST /api/commission-rules') return json(res, 201, await repository.createCommissionRule(actor.id, await readBody(req)))

      return json(res, 404, { error: 'not found', code: 'NOT_FOUND' })
    } catch (error) {
      return json(res, statusFor(error), { error: error.message, code: error.code || error.sqlState || 'BAD_REQUEST' })
    }
  })
}
