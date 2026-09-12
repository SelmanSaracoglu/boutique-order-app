import 'dotenv/config'
import { Pool } from 'pg'
import { purgeExpiredAuditEvents } from '../audit/auditRetention.js'

const connectionString =
  process.env.AUDIT_RETENTION_DATABASE_URL

if (!connectionString) {
  throw new Error(
    'AUDIT_RETENTION_DATABASE_URL is required',
  )
}

const retentionPool = new Pool({ connectionString })

try {
  const client = await retentionPool.connect()

  try {
    const result = await purgeExpiredAuditEvents(client)

    console.log(
      JSON.stringify({
        action: 'AUDIT_RETENTION_PURGED',
        cutoff: result.cutoff.toISOString(),
        deletedCount: result.deletedCount,
        purgedAt: result.purgedAt.toISOString(),
      }),
    )
  } finally {
    client.release()
  }
} catch {
  console.error('Unable to purge expired audit events.')
  process.exitCode = 1
} finally {
  await retentionPool.end()
}