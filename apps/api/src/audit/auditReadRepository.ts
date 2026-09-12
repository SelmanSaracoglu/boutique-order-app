import type { PoolClient } from 'pg'
import {
  PERMISSIONS,
  type Permission,
} from '../auth/permissions.js'
import type { UserRole } from '../auth/user.js'
import {
  sanitizeLogText,
} from '../logging/structuredLogger.js'
import {
  ORDER_STATUSES,
  type OrderStatus,
} from '../orderLifecycle.js'
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type PaymentMethod,
  type PaymentStatus,
} from '../payments/payment.js'
import {
  encodeAuditReadCursor,
  type AuditReadQuery,
} from './auditReadQuery.js'

const MAX_ACTION_LENGTH = 64
const MAX_USERNAME_LENGTH = 64
const MAX_TARGET_ID_LENGTH = 256
const MAX_OPERATION_LENGTH = 64
const MAX_METHOD_LENGTH = 16
const MAX_ROUTE_LENGTH = 256
const MAX_CODE_LENGTH = 64
const MAX_ATTEMPTED_USERNAME_LENGTH = 64
const MAX_POSTGRES_INTEGER =
  2_147_483_647

const ORDER_SOURCES = [
  'instagram',
  'whatsapp',
] as const

type OrderSource =
  (typeof ORDER_SOURCES)[number]

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

export type AuditEventHttpDetail = {
  method: string
  route: string
  status: number
}

export type AuditEventStateTransition = {
  previousOrderStatus:
    OrderStatus | null
  newOrderStatus: OrderStatus | null
  previousPaymentStatus:
    PaymentStatus | null
  newPaymentStatus:
    PaymentStatus | null
}

export type AuditEventAttributes = {
  orderSource: OrderSource | null
  itemCount: number | null
  paymentMethod: PaymentMethod | null
  permission: Permission | null
  attemptedUsername: string | null
}

export type AuditEventDetail = {
  operation: string | null
  http: AuditEventHttpDetail | null
  reasonCode: string | null
  errorCode: string | null
  stateTransition:
    AuditEventStateTransition | null
  attributes: AuditEventAttributes | null
}

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
  detail: AuditEventDetail
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
  operation: string | null
  http_method: string | null
  http_route: string | null
  http_status: number | null
  reason_code: string | null
  error_code: string | null
  previous_order_status: string | null
  new_order_status: string | null
  previous_payment_status: string | null
  new_payment_status: string | null
  detail_order_source: string | null
  detail_item_count: string | null
  detail_payment_method: string | null
  detail_permission: string | null
  detail_attempted_username:
    string | null
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

function sanitizeOptionalText(
  value: string | null,
  maxLength: number,
): string | null {
  if (value === null) {
    return null
  }

  return (
    sanitizeLogText(
      value,
      maxLength,
    ) || null
  )
}

function readOptionalAllowedValue< Value extends string, >(
  value: string | null,
  allowedValues: readonly Value[],
): Value | null {
  if (
    value === null ||
    !allowedValues.includes(
      value as Value,
    )
  ) {
    return null
  }

  return value as Value
}

function readOptionalPositiveInteger(
  value: string | null,
): number | null {
  if (
    value === null ||
    !/^[1-9]\d*$/.test(value)
  ) {
    return null
  }

  const parsedValue = Number(value)

  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue > MAX_POSTGRES_INTEGER
  ) {
    return null
  }

  return parsedValue
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

function buildHttpDetail(
  row: AuditEventRow,
): AuditEventHttpDetail | null {
  const method = sanitizeOptionalText(
    row.http_method,
    MAX_METHOD_LENGTH,
  )

  const route = sanitizeOptionalText(
    row.http_route,
    MAX_ROUTE_LENGTH,
  )

  const status = row.http_status

  if (
    method === null &&
    route === null &&
    status === null
  ) {
    return null
  }

  if (
    method === null ||
    route === null ||
    status === null ||
    !Number.isInteger(status) ||
    status < 100 ||
    status > 599
  ) {
    throw new Error(
      'Audit read returned invalid HTTP detail',
    )
  }

  return {
    method,
    route,
    status,
  }
}

function buildStateTransition(
  row: AuditEventRow,
): AuditEventStateTransition | null {
  const stateTransition = {
    previousOrderStatus:
      readOptionalAllowedValue(
        row.previous_order_status,
        ORDER_STATUSES,
      ),
    newOrderStatus:
      readOptionalAllowedValue(
        row.new_order_status,
        ORDER_STATUSES,
      ),
    previousPaymentStatus:
      readOptionalAllowedValue(
        row.previous_payment_status,
        PAYMENT_STATUSES,
      ),
    newPaymentStatus:
      readOptionalAllowedValue(
        row.new_payment_status,
        PAYMENT_STATUSES,
      ),
  }

  if (
    Object.values(
      stateTransition,
    ).every((value) => value === null)
  ) {
    return null
  }

  return stateTransition
}

function buildEventAttributes(
  row: AuditEventRow,
): AuditEventAttributes | null {
  const attributes:
    AuditEventAttributes = {
      orderSource: null,
      itemCount: null,
      paymentMethod: null,
      permission: null,
      attemptedUsername: null,
    }

  switch (row.action) {
    case 'ORDER_CREATED':
      attributes.orderSource =
        readOptionalAllowedValue(
          row.detail_order_source,
          ORDER_SOURCES,
        )

      attributes.itemCount =
        readOptionalPositiveInteger(
          row.detail_item_count,
        )
      break

    case 'PAYMENT_REPORTED':
    case 'PAYMENT_CONFIRMED':
      attributes.paymentMethod =
        readOptionalAllowedValue(
          row.detail_payment_method,
          PAYMENT_METHODS,
        )
      break

    case 'AUTHORIZATION_DENIED':
      attributes.permission =
        readOptionalAllowedValue(
          row.detail_permission,
          PERMISSIONS,
        )
      break

    case 'AUTH_LOGIN_FAILED':
    case 'AUTH_LOGIN_RATE_LIMITED':
      attributes.attemptedUsername =
        sanitizeOptionalText(
          row.detail_attempted_username,
          MAX_ATTEMPTED_USERNAME_LENGTH,
        )
      break
  }

  if (
    Object.values(attributes).every(
      (value) => value === null,
    )
  ) {
    return null
  }

  return attributes
}

function buildAuditEventDetail(
  row: AuditEventRow,
): AuditEventDetail {
  return {
    operation: sanitizeOptionalText(
      row.operation,
      MAX_OPERATION_LENGTH,
    ),
    http: buildHttpDetail(row),
    reasonCode: sanitizeOptionalText(
      row.reason_code,
      MAX_CODE_LENGTH,
    ),
    errorCode: sanitizeOptionalText(
      row.error_code,
      MAX_CODE_LENGTH,
    ),
    stateTransition:
      buildStateTransition(row),
    attributes:
      buildEventAttributes(row),
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
    detail: buildAuditEventDetail(row),
  }
}

export async function listAuditEvents(
  client: PoolClient,
  query: AuditReadQuery,
): Promise<AuditEventPage> {
  const conditions: string[] = []
  const parameters: unknown[] = []

  const addParameter = (
    value: unknown,
  ): string => {
    parameters.push(value)

    return `$${parameters.length}`
  }

  if (query.filters.category !== null) {
    const placeholder = addParameter(
      query.filters.category,
    )

    conditions.push(
      `category = ${placeholder}`,
    )
  }

  if (query.filters.outcome !== null) {
    const placeholder = addParameter(
      query.filters.outcome,
    )

    conditions.push(
      `outcome = ${placeholder}`,
    )
  }

  if (query.filters.from !== null) {
    const placeholder = addParameter(
      query.filters.from,
    )

    conditions.push(
      `occurred_at >= ${placeholder}::timestamptz`,
    )
  }

  if (query.filters.to !== null) {
    const placeholder = addParameter(
      query.filters.to,
    )

    conditions.push(
      `occurred_at <= ${placeholder}::timestamptz`,
    )
  }

  if (query.filters.username !== null) {
    const placeholder = addParameter(
      query.filters.username,
    )

    conditions.push(
      `actor_username = ${placeholder}`,
    )
  }

  if (query.filters.orderId !== null) {
    const placeholder = addParameter(
      query.filters.orderId,
    )

    conditions.push(`
      (
        target_resource_type = 'ORDER'
        AND target_resource_id = ${placeholder}
      )
    `)
  }

  if (query.filters.requestId !== null) {
    const placeholder = addParameter(
      query.filters.requestId,
    )

    conditions.push(
      `request_id = ${placeholder}::uuid`,
    )
  }

  if (query.cursor !== null) {
    const occurredAtPlaceholder =
      addParameter(
        query.cursor.occurredAt,
      )

    const idPlaceholder = addParameter(
      query.cursor.id,
    )

    conditions.push(`
      (occurred_at, id) <
      (
        ${occurredAtPlaceholder}::timestamptz,
        ${idPlaceholder}::bigint
      )
    `)
  }

  const whereClause =
    conditions.length === 0
      ? ''
      : `
        WHERE
          ${conditions.join('\n          AND ')}
      `

  const limitPlaceholder = addParameter(
    query.limit + 1,
  )

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
        request_id,
        operation,
        http_method,
        http_route,
        http_status,
        reason_code,
        error_code,
        previous_order_status,
        new_order_status,
        previous_payment_status,
        new_payment_status,
        CASE
          WHEN jsonb_typeof(
            context -> 'orderSource'
          ) = 'string'
          THEN context ->> 'orderSource'
          ELSE NULL
        END AS detail_order_source,
        CASE
          WHEN jsonb_typeof(
            context -> 'itemCount'
          ) = 'number'
          THEN context ->> 'itemCount'
          ELSE NULL
        END AS detail_item_count,
        CASE
          WHEN jsonb_typeof(
            context -> 'paymentMethod'
          ) = 'string'
          THEN context ->> 'paymentMethod'
          ELSE NULL
        END AS detail_payment_method,
        CASE
          WHEN jsonb_typeof(
            context -> 'permission'
          ) = 'string'
          THEN context ->> 'permission'
          ELSE NULL
        END AS detail_permission,
        CASE
          WHEN jsonb_typeof(
            context -> 'attemptedUsername'
          ) = 'string'
          THEN context ->> 'attemptedUsername'
          ELSE NULL
        END AS detail_attempted_username
      FROM audit_events
      ${whereClause}
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