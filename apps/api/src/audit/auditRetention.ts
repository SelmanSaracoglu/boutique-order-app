import type { PoolClient } from 'pg'

export interface AuditRetentionResult {
  cutoff: Date
  deletedCount: number
  purgedAt: Date
}

interface CutoffRow {
  cutoff: Date
}

export async function purgeExpiredAuditEvents(
  client: PoolClient,
  purgedAt: Date = new Date(),
): Promise<AuditRetentionResult> {
  if (Number.isNaN(purgedAt.getTime())) {
    throw new Error('Retention purge timestamp is invalid.')
  }

  await client.query('BEGIN')

  try {
    const cutoffResult = await client.query<CutoffRow>(
      `
        SELECT
          $1::timestamptz - INTERVAL '12 months' AS cutoff
      `,
      [purgedAt],
    )

    const cutoff = cutoffResult.rows[0]?.cutoff

    if (!(cutoff instanceof Date)) {
      throw new Error('Retention cutoff could not be calculated.')
    }

    const deleteResult = await client.query(
      `
        DELETE FROM audit_events
        WHERE occurred_at < $1::timestamptz
      `,
      [cutoff],
    )

    const deletedCount = deleteResult.rowCount ?? 0

    await client.query(
      `
        INSERT INTO audit_events (
          schema_version,
          occurred_at,
          category,
          action,
          outcome,
          severity,
          actor_type,
          target_resource_type,
          target_resource_id,
          context
        )
        VALUES (
          1,
          $1,
          'SYSTEM',
          'AUDIT_RETENTION_PURGED',
          'SUCCESS',
          'INFO',
          'SYSTEM',
          'AUDIT_LOG',
          'audit-events',
          $2::jsonb
        )
      `,
      [
        purgedAt,
        JSON.stringify({
          cutoff: cutoff.toISOString(),
          deletedCount,
          purgedAt: purgedAt.toISOString(),
        }),
      ],
    )

    await client.query('COMMIT')

    return {
      cutoff,
      deletedCount,
      purgedAt,
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Preserve the original retention failure.
    }

    throw error
  }
}