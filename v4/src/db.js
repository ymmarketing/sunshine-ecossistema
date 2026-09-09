import pg from 'pg'

const { Pool } = pg

export function assertIsolatedRuntime() {
  const env = String(process.env.V4_ENVIRONMENT ?? '').toLowerCase()
  if (!['local', 'ci', 'preview', 'homolog'].includes(env)) {
    throw new Error('V4_ENVIRONMENT deve ser local, ci, preview ou homolog')
  }
  if (process.env.V4_ISOLATED_DEMO !== '1') throw new Error('V4_ISOLATED_DEMO=1 obrigatório neste estágio')
  const url = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL
  if (!url) throw new Error('DATABASE_URL/TEST_DATABASE_URL ausente')
  const blocked = ['dhpsvwkytcqasmtaeayv', 'sunshine.ymnegocios.com.br', 'sunshine-ecossistema.vercel.app']
  if (blocked.some(token => url.includes(token))) throw new Error('conexão com produção bloqueada pelo guard da V4')
  return url
}

export function createPool(connectionString = assertIsolatedRuntime()) {
  return new Pool({ connectionString, max: Number(process.env.PG_POOL_MAX || 10), idleTimeoutMillis: 10_000 })
}

export async function withActor(pool, userId, fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('set local role v4_app')
    await client.query("select set_config('app.user_id',$1,true)", [userId])
    const value = await fn(client)
    await client.query('commit')
    return value
  } catch (error) {
    try { await client.query('rollback') } catch {}
    throw error
  } finally {
    client.release()
  }
}

export async function ownerTransaction(pool, fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const value = await fn(client)
    await client.query('commit')
    return value
  } catch (error) {
    try { await client.query('rollback') } catch {}
    throw error
  } finally {
    client.release()
  }
}
