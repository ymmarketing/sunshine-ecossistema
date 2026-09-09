import { createHmac, timingSafeEqual } from 'node:crypto'

export const DEMO_USERS = Object.freeze([
  { id: '10000000-0000-4000-8000-000000000001', username: 'admin-demo', password: 'sunshine-v4-admin', displayName: 'Admin Demo', role: 'ADMIN' },
  { id: '10000000-0000-4000-8000-000000000002', username: 'finance-demo', password: 'sunshine-v4-finance', displayName: 'Financeiro Demo', role: 'FINANCE' },
  { id: '10000000-0000-4000-8000-000000000003', username: 'operacao-demo', password: 'sunshine-v4-operacao', displayName: 'Operação Demo', role: 'OPERATOR' },
  { id: '10000000-0000-4000-8000-000000000004', username: 'viewer-demo', password: 'sunshine-v4-viewer', displayName: 'Leitura Demo', role: 'VIEWER' }
])

function isolatedSecret() {
  if (process.env.V4_ISOLATED_DEMO !== '1') throw Object.assign(new Error('isolated demo auth disabled'), { code: 'AUTH_DISABLED' })
  const secret = process.env.V4_DEMO_AUTH_SECRET
  if (!secret || secret.length < 16) throw Object.assign(new Error('V4_DEMO_AUTH_SECRET ausente ou fraco'), { code: 'AUTH_CONFIG' })
  return secret
}

function equalText(a, b) {
  const aa = Buffer.from(String(a ?? ''))
  const bb = Buffer.from(String(b ?? ''))
  if (aa.length !== bb.length) return false
  return timingSafeEqual(aa, bb)
}

function sign(payload) {
  return createHmac('sha256', isolatedSecret()).update(payload).digest('base64url')
}

export function issueDemoToken(user, { ttlSeconds = 8 * 60 * 60 } = {}) {
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    usr: user.username,
    env: 'sunshine-v4-isolated',
    iat: now,
    exp: now + ttlSeconds
  })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function verifyDemoToken(token) {
  const [payload, signature, extra] = String(token ?? '').split('.')
  if (!payload || !signature || extra) throw Object.assign(new Error('token inválido'), { code: 'UNAUTHORIZED' })
  const expected = sign(payload)
  if (!equalText(signature, expected)) throw Object.assign(new Error('token inválido'), { code: 'UNAUTHORIZED' })
  let data
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) } catch { throw Object.assign(new Error('token inválido'), { code: 'UNAUTHORIZED' }) }
  if (data.env !== 'sunshine-v4-isolated' || !data.sub || !data.exp || data.exp < Math.floor(Date.now() / 1000)) {
    throw Object.assign(new Error('token expirado ou inválido'), { code: 'UNAUTHORIZED' })
  }
  const user = DEMO_USERS.find(x => x.id === data.sub && x.username === data.usr)
  if (!user) throw Object.assign(new Error('usuário demo inválido'), { code: 'UNAUTHORIZED' })
  return { ...user, password: undefined }
}

export function loginDemo(username, password) {
  isolatedSecret()
  const user = DEMO_USERS.find(x => x.username === String(username ?? '').trim())
  if (!user || !equalText(password, user.password)) throw Object.assign(new Error('credenciais inválidas'), { code: 'UNAUTHORIZED' })
  return { user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role }, token: issueDemoToken(user) }
}

export function publicDemoUsers() {
  return DEMO_USERS.map(({ password, ...user }) => user)
}
