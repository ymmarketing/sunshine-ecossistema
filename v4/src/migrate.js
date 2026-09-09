import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPool } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', 'migrations')

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

export async function runMigrations(pool, { gitSha = process.env.GITHUB_SHA || null } = {}) {
  const client = await pool.connect()
  try {
    await client.query('create schema if not exists sunshine_v4')
    await client.query(`create table if not exists sunshine_v4._migration_ledger (
      migration_name text primary key,
      checksum_sha256 text not null,
      applied_at timestamptz not null default now(),
      execution_ms integer not null,
      git_sha text
    )`)

    const files = (await readdir(migrationsDir)).filter(name => /^\d{3}_.+\.sql$/.test(name)).sort()
    const result = []
    for (const name of files) {
      const sql = await readFile(join(migrationsDir, name), 'utf8')
      const checksum = sha256(sql)
      const prior = await client.query('select checksum_sha256 from sunshine_v4._migration_ledger where migration_name=$1', [name])
      if (prior.rowCount) {
        if (prior.rows[0].checksum_sha256 !== checksum) throw new Error(`migration checksum drift: ${name}`)
        result.push({ name, checksum, status: 'already_applied' })
        continue
      }
      const started = Date.now()
      await client.query('begin')
      try {
        await client.query(sql)
        const elapsed = Date.now() - started
        await client.query(`insert into sunshine_v4._migration_ledger(migration_name,checksum_sha256,execution_ms,git_sha)
          values($1,$2,$3,$4)`, [name, checksum, elapsed, gitSha])
        await client.query('commit')
        result.push({ name, checksum, status: 'applied', executionMs: elapsed })
      } catch (error) {
        await client.query('rollback')
        throw error
      }
    }
    return result
  } finally {
    client.release()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool()
  try {
    const result = await runMigrations(pool)
    console.log(JSON.stringify({ ok: true, migrations: result }, null, 2))
  } finally {
    await pool.end()
  }
}
