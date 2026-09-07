import 'dotenv/config'
import { app } from './app.js'
import { pool } from './db.js'
import { ensureAuditLoggingStarted } from './audit/auditRepository.js'

const port = Number(process.env.PORT ?? 3001)

async function startServer(): Promise<void> {
  const client = await pool.connect()

  try {
    await ensureAuditLoggingStarted(client)
  } finally {
    client.release()
  }

  app.listen(port, () => {
    console.log(`API listening on port ${port}`)
  })
}

try {
  await startServer()
} catch (error) {
  console.error('Unable to start API', error)
  await pool.end()
  process.exitCode = 1
}