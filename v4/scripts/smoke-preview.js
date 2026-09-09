const base = String(process.env.PREVIEW_URL || '').replace(/\/$/, '')
if (!base) throw new Error('PREVIEW_URL obrigatório')

const blocked = [
  'sunshine.ymnegocios.com.br',
  'sunshine-ecossistema.vercel.app',
  'dhpsvwkytcqasmtaeayv'
]
if (blocked.some(token => base.includes(token))) {
  throw new Error('smoke preview recusou referência de produção/V3')
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options)
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${JSON.stringify(body)}`)
  }
  return body
}

const health = await request('/api/health')
if (!health.ok || health.isolated !== true) throw new Error('health não confirmou ambiente isolado')
if (!['preview', 'homolog', 'ci', 'local'].includes(String(health.environment))) {
  throw new Error(`ambiente inesperado no health: ${health.environment}`)
}

const username = process.env.V4_SMOKE_USERNAME || 'admin-demo'
const password = process.env.V4_SMOKE_PASSWORD || 'sunshine-v4-admin'
const login = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username, password })
})
if (!login.token) throw new Error('login de homologação não retornou token')

const headers = { authorization: `Bearer ${login.token}` }
const me = await request('/api/me', { headers })
if (!me.user?.permissions?.includes('dashboard.read')) throw new Error('identidade de smoke sem dashboard.read')

const state = await request('/api/state', { headers })
if (!state || typeof state !== 'object') throw new Error('state inválido')

const html = await request('/')
if (!String(html).includes('Sunshine')) throw new Error('interface mobile não foi servida')

console.log(JSON.stringify({
  ok: true,
  base,
  environment: health.environment,
  database: health.database,
  migrations: health.migrations,
  user: me.user.username,
  permissions: me.user.permissions.length
}, null, 2))
