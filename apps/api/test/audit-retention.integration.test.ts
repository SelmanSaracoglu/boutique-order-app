import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { purgeExpiredAuditEvents } from '../src/audit/auditRetention.js'
import { pool } from '../src/db.js'

const PURGED_AT = new Date('2026-09-12T12:00:00.000Z')
const CUTOFF = new Date('2025-09-12T12:00:00.000Z')

interface AuditEventRow {
  action: string
  actor_type: string
  target_resource_id: string
  occurred_at: Date
  context: Record<string, unknown>
}

async function seedAuditEvent(
  targetResourceId: string,
  occurredAt: Date,
): Promise<void> {
  await pool.query(
    `
      INSERT INTO audit_events (
        schema_version,
        occurred_at,
        category,
        action,
        outcome,
        severity,
        actor_type,
        actor_user_id,
        actor_username,
        actor_role,
        target_resource_type,
        target_resource_id,
        context
      )
      VALUES (
        1,
        $1,
        'PRODUCT',
        'ORDER_CREATED',
        'SUCCESS',
        'INFO',
        'USER',
        1,
        'admin',
        'ADMIN',
        'ORDER',
        $2,
        '{}'::jsonb
      )
    `,
    [occurredAt, targetResourceId],
  )
}

async function seedRetentionBoundaryEvents(): Promise<void> {
  await seedAuditEvent(
    'older-than-cutoff',
    new Date('2025-09-12T11:59:59.999Z'),
  )
  await seedAuditEvent('exactly-at-cutoff', CUTOFF)
  await seedAuditEvent(
    'newer-than-cutoff',
    new Date('2025-09-12T12:00:00.001Z'),
  )
}

async function runAsRetentionRole() {
  const client = await pool.connect()
  let roleWasSet = false

  try {
    await client.query('SET ROLE boutique_audit_retention')
    roleWasSet = true

    return await purgeExpiredAuditEvents(client, PURGED_AT)
  } finally {
    if (roleWasSet) {
      await client.query('RESET ROLE')
    }

    client.release()
  }
}

describe('audit retention', () => {
  beforeEach(async () => {
    await pool.query(`
      ALTER TABLE audit_events
      DROP CONSTRAINT IF EXISTS audit_retention_event_failure_test
    `)
    await pool.query('TRUNCATE TABLE audit_events RESTART IDENTITY')
  })

  afterEach(async () => {
    await pool.query(`
      ALTER TABLE audit_events
      DROP CONSTRAINT IF EXISTS audit_retention_event_failure_test
    `)
  })

  afterAll(async () => {
    await pool.end()
  })

  it('deletes only events older than twelve months and records the purge', async () => {
    await seedRetentionBoundaryEvents()

    const result = await runAsRetentionRole()

    expect(result).toEqual({
      cutoff: CUTOFF,
      deletedCount: 1,
      purgedAt: PURGED_AT,
    })

    const storedEvents = await pool.query<AuditEventRow>(
      `
        SELECT
          action,
          actor_type,
          target_resource_id,
          occurred_at,
          context
        FROM audit_events
        ORDER BY occurred_at ASC, id ASC
      `,
    )

    expect(
      storedEvents.rows.map((event) => event.target_resource_id),
    ).toEqual([
      'exactly-at-cutoff',
      'newer-than-cutoff',
      'audit-events',
    ])

    const purgeEvent = storedEvents.rows.find(
      (event) => event.action === 'AUDIT_RETENTION_PURGED',
    )

    expect(purgeEvent).toMatchObject({
      actor_type: 'SYSTEM',
      target_resource_id: 'audit-events',
      occurred_at: PURGED_AT,
      context: {
        cutoff: CUTOFF.toISOString(),
        deletedCount: 1,
        purgedAt: PURGED_AT.toISOString(),
      },
    })
  })

  it('rolls back deletions when the purge event cannot be recorded', async () => {
    await seedRetentionBoundaryEvents()

    await pool.query(`
      ALTER TABLE audit_events
      ADD CONSTRAINT audit_retention_event_failure_test
      CHECK (action <> 'AUDIT_RETENTION_PURGED')
    `)

    await expect(runAsRetentionRole()).rejects.toMatchObject({
      code: '23514',
    })

    const storedEvents = await pool.query<{
      event_count: number
      purge_count: number
    }>(
      `
        SELECT
          count(*)::integer AS event_count,
          count(*) FILTER (
            WHERE action = 'AUDIT_RETENTION_PURGED'
          )::integer AS purge_count
        FROM audit_events
      `,
    )

    expect(storedEvents.rows[0]).toEqual({
      event_count: 3,
      purge_count: 0,
    })
  })
})