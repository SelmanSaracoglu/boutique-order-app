import type { PoolClient } from 'pg'
import type { UserRole } from '../auth/user.js'
import {
  sanitizeLogText,
} from '../logging/structuredLogger.js'
import {
  encodeAuditReadCursor,
  type AuditReadQuery,
} from './auditReadQuery.js'

const MAX_ACTION_LENGTH = 64
const MAX_USERNAME_LENGTH = 64
const MAX_TARGET_ID_LENGTH = 256

export type AuditEventCategory =
  | 'PRODUCT'
  | 'SECURITY'
  | 'ERROR'
  | 'SYSTEM'

export type AuditEventOutcome =
  | 'SUCCESS'
  | 'FAILURE'
  | 'REJECTED'

export type AuditEventSeverity =
  | 'INFO'
  | 'WARN'
  | 'ERROR'
  | 'CRITICAL'

export type AuditEventActorType =
  | 'USER'
  | 'ANONYMOUS'
  | 'SYSTEM'

export type AuditTargetResourceType =
  | 'ORDER'
  | 'AUTHENTICATION'
  | 'SESSION'
  | 'REQUEST'
  | 'APPLICATION'
  | 'AUDIT_LOG'

export type AuditEventSummary = {
  id: string
  occurredAt: string
  category: AuditEventCategory
  action: string
  outcome: AuditEventOutcome
  severity: AuditEventSeverity
  actor: {
    type: AuditEventActorType
    username: string | null
    role: UserRole | null
  }
  target: {
    resourceType: AuditTargetResourceType
    resourceId: string
  }
  requestId: string | null
}

export type AuditEventPage = {
  items: AuditEventSummary[]
  nextCursor: string | null
}

type AuditEventRow = {
  id: string
  occurred_at: Date
  category: AuditEventCategory
  action: string
  outcome: AuditEventOutcome
  severity: AuditEventSeverity
  actor_type: AuditEventActorType
  actor_username: string | null
  actor_role: UserRole | null
  target_resource_type:
    AuditTargetResourceType
  target_resource_id: string
  request_id: string | null
}

function sanitizeRequiredText(
  value: string,
  maxLength: number,
): string {
  const sanitizedValue = sanitizeLogText(
    value,
    maxLength,
  )

  if (!sanitizedValue) {
    throw new Error(
      'Audit read returned invalid required text',
    )
  }

  return sanitizedValue
}

function readAuditEventId(
  value: string,
): string {
  const id = String(value)

  if (!/^[1-9]\d*$/.test(id)) {
    throw new Error(
      'Audit read returned an invalid event ID',
    )
  }

  return id
}

function readOccurredAt(
  value: Date,
): string {
  if (
    !(value instanceof Date) ||
    Number.isNaN(value.getTime())
  ) {
    throw new Error(
      'Audit read returned an invalid timestamp',
    )
  }

  return value.toISOString()
}

function buildActorSummary(
  row: AuditEventRow,
): AuditEventSummary['actor'] {
  if (row.actor_type !== 'USER') {
    return {
      type: row.actor_type,
      username: null,
      role: null,
    }
  }

  if (
    row.actor_username === null ||
    row.actor_role === null
  ) {
    throw new Error(
      'Audit read returned an invalid user actor',
    )
  }

  return {
    type: 'USER',
    username: sanitizeRequiredText(
      row.actor_username,
      MAX_USERNAME_LENGTH,
    ),
    role: row.actor_role,
  }
}

function mapAuditEventRow(
  row: AuditEventRow,
): AuditEventSummary {
  return {
    id: readAuditEventId(row.id),
    occurredAt: readOccurredAt(
      row.occurred_at,
    ),
    category: row.category,
    action: sanitizeRequiredText(
      row.action,
      MAX_ACTION_LENGTH,
    ),
    outcome: row.outcome,
    severity: row.severity,
    actor: buildActorSummary(row),
    target: {
      resourceType:
        row.target_resource_type,
      resourceId: sanitizeRequiredText(
        row.target_resource_id,
        MAX_TARGET_ID_LENGTH,
      ),
    },
    requestId: row.request_id,
  }
}

export async function listAuditEvents(
  client: PoolClient,
  query: AuditReadQuery,
): Promise<AuditEventPage> {
  const hasCursor = query.cursor !== null

  const cursorClause = hasCursor
    ? `
      WHERE
        (occurred_at, id) <
        ($1::timestamptz, $2::bigint)
    `
    : ''

  const limitPlaceholder = hasCursor
    ? '$3'
    : '$1'

  const parameters = hasCursor
    ? [
        query.cursor?.occurredAt,
        query.cursor?.id,
        query.limit + 1,
      ]
    : [query.limit + 1]

  const result = await client.query(
    `
      SELECT
        id,
        occurred_at,
        category,
        action,
        outcome,
        severity,
        actor_type,
        actor_username,
        actor_role,
        target_resource_type,
        target_resource_id,
        request_id
      FROM audit_events
      ${cursorClause}
      ORDER BY
        occurred_at DESC,
        id DESC
      LIMIT ${limitPlaceholder}
    `,
    parameters,
  )

  const rows =
    result.rows as AuditEventRow[]

  const hasNextPage =
    rows.length > query.limit

  const pageRows = rows.slice(
    0,
    query.limit,
  )

  const items = pageRows.map(
    mapAuditEventRow,
  )

  if (!hasNextPage) {
    return {
      items,
      nextCursor: null,
    }
  }

  const lastItem = items.at(-1)

  if (!lastItem) {
    throw new Error(
      'Audit read could not build the next cursor',
    )
  }

  return {
    items,
    nextCursor: encodeAuditReadCursor({
      occurredAt: lastItem.occurredAt,
      id: lastItem.id,
    }),
  }
}