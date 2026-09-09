import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { MemoryStore, SunshineV4Service } from './core.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')
const store = new MemoryStore()
const service = new SunshineV4Service(store)

function actor(req) {
  return {
    id: req.headers['x-demo-actor'] || 'demo-user',
    role: req.headers['x-demo-role'] || 'ADMIN'
  }
}

async function body(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload, null, 2))
}

function route(method, pathname, target) {
  return method === target[0] && pathname === target[1]
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const a = actor(req)

    if (route(req.method, url.pathname, ['GET', '/'])) {
      const html = await readFile(join(publicDir, 'index.html'))
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(html)
    }
    if (route(req.method, url.pathname, ['GET', '/api/state'])) return json(res, 200, service.snapshot(a))
    if (route(req.method, url.pathname, ['GET', '/api/audit'])) return json(res, 200, service.audit(a))
    if (route(req.method, url.pathname, ['POST', '/api/people'])) return json(res, 201, service.createPerson(a, await body(req)))
    if (route(req.method, url.pathname, ['POST', '/api/contracts'])) return json(res, 201, service.createContract(a, await body(req)))
    if (route(req.method, url.pathname, ['POST', '/api/payments'])) return json(res, 201, service.createPayment(a, await body(req)))
    if (route(req.method, url.pathname, ['POST', '/api/allocations'])) return json(res, 201, service.allocatePayment(a, await body(req)))
    if (route(req.method, url.pathname, ['POST', '/api/promises'])) return json(res, 201, service.createPaymentPromise(a, await body(req)))
    if (route(req.method, url.pathname, ['POST', '/api/collection-tasks'])) return json(res, 201, service.createCollectionTask(a, await body(req)))
    if (route(req.method, url.pathname, ['POST', '/api/commission-rules'])) return json(res, 201, service.createCommissionRule(a, await body(req)))
    if (route(req.method, url.pathname, ['POST', '/api/reset'])) {
      store.reset()
      return json(res, 200, { ok: true })
    }
    return json(res, 404, { error: 'not found' })
  } catch (error) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400
    return json(res, status, { error: error.message, code: error.code ?? 'BAD_REQUEST' })
  }
})

const port = Number(process.env.PORT || 4174)
server.listen(port, '127.0.0.1', () => {
  console.log(`Sunshine V4 isolated demo: http://127.0.0.1:${port}`)
  console.log('Sem conexão com Supabase, Asaas, Reportei ou produção.')
})
