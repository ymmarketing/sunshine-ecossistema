import { createPool } from './db.js'
import { runMigrations } from './migrate.js'
import { PostgresRepository } from './repository.js'
import { createHttpServer } from './app.js'
import { seedDemo } from './seed.js'

const pool = createPool()
await runMigrations(pool)
await seedDemo(pool, { businessData: process.env.SEED_BUSINESS_DEMO === '1' })
const repository = new PostgresRepository(pool)
const server = createHttpServer(repository)
const port = Number(process.env.PORT || 4174)

server.listen(port, '0.0.0.0', () => {
  console.log(`Sunshine V4 isolated persistent server listening on :${port}`)
  console.log(`Environment: ${process.env.V4_ENVIRONMENT}; isolated demo only.`)
})

async function shutdown(signal) {
  console.log(`${signal}: encerrando ambiente isolado`)
  await new Promise(resolve => server.close(resolve))
  await pool.end()
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
