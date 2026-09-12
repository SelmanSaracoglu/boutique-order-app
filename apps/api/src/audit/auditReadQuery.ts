import { Buffer } from 'node:buffer'
import { z } from 'zod'
import {
  usernameSchema,
} from '../auth/user.js'

const DEFAULT_PAGE_LIMIT = 25
const MAX_PAGE_LIMIT = 100
const MAX_CURSOR_LENGTH = 512
const POSTGRES_BIGINT_MAX =
  9_223_372_036_854_775_807n
const POSTGRES_INTEGER_MAX =
  2_147_483_647n

export const AUDIT_READ_CATEGORIES = [
  'PRODUCT',
  'SECURITY',
  'ERROR',
] as const

export type AuditReadCategory =
  (typeof AUDIT_READ_CATEGORIES)[number]

export const AUDIT_READ_OUTCOMES = [
  'SUCCESS',
  'FAILURE',
  'REJECTED',
] as const

export type AuditReadOutcome =
  (typeof AUDIT_READ_OUTCOMES)[number]

export type AuditReadCursor = {
  occurredAt: string
  id: string
}

export type AuditReadFilters = {
  category: AuditReadCategory | null
  outcome: AuditReadOutcome | null
  from: string | null
  to: string | null
  username: string | null
  orderId: string | null
  requestId: string | null
}

export type AuditReadQuery = {
  limit: number
  cursor: AuditReadCursor | null
  filters: AuditReadFilters
}

function isCanonicalIsoTimestamp(
  value: string,
): boolean {
  const timestamp = new Date(value)

  return (
    !Number.isNaN(timestamp.getTime()) &&
    timestamp.toISOString() === value
  )
}

function isPositivePostgresBigint(
  value: string,
): boolean {
  if (!/^[1-9]\d*$/.test(value)) {
    return false
  }

  try {
    return (
      BigInt(value) <= POSTGRES_BIGINT_MAX
    )
  } catch {
    return false
  }
}

function isPositivePostgresInteger(
  value: string,
): boolean {
  if (!/^[1-9]\d*$/.test(value)) {
    return false
  }

  try {
    return (
      BigInt(value) <= POSTGRES_INTEGER_MAX
    )
  } catch {
    return false
  }
}

const canonicalIsoTimestampSchema = z
  .string()
  .max(32)
  .refine(isCanonicalIsoTimestamp)

const auditReadCursorSchema = z.strictObject({
  occurredAt:
    canonicalIsoTimestampSchema,
  id: z
    .string()
    .max(19)
    .refine(isPositivePostgresBigint),
})

const pageLimitSchema = z
  .string()
  .max(3)
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(
    (value) =>
      Number.isSafeInteger(value) &&
      value <= MAX_PAGE_LIMIT,
  )

const orderIdSchema = z
  .string()
  .max(10)
  .refine(isPositivePostgresInteger)

const requestIdSchema = z
  .string()
  .max(36)
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )

const rawAuditReadQuerySchema = z.strictObject({
  limit: pageLimitSchema.optional(),
  cursor: z
    .string()
    .min(1)
    .max(MAX_CURSOR_LENGTH)
    .optional(),
  category: z
    .enum(AUDIT_READ_CATEGORIES)
    .optional(),
  outcome: z
    .enum(AUDIT_READ_OUTCOMES)
    .optional(),
  from:
    canonicalIsoTimestampSchema.optional(),
  to:
    canonicalIsoTimestampSchema.optional(),
  username: usernameSchema.optional(),
  orderId: orderIdSchema.optional(),
  requestId: requestIdSchema.optional(),
})

function decodeAuditReadCursor(
  encodedCursor: string,
): AuditReadCursor | null {
  try {
    const decodedBytes = Buffer.from(
      encodedCursor,
      'base64url',
    )

    if (
      decodedBytes.toString('base64url') !==
      encodedCursor
    ) {
      return null
    }

    const parsedJson: unknown = JSON.parse(
      decodedBytes.toString('utf8'),
    )

    const validationResult =
      auditReadCursorSchema.safeParse(parsedJson)

    if (!validationResult.success) {
      return null
    }

    return validationResult.data
  } catch {
    return null
  }
}

export function parseAuditReadQuery(
  input: unknown,
): AuditReadQuery | null {
  const validationResult =
    rawAuditReadQuerySchema.safeParse(input)

  if (!validationResult.success) {
    return null
  }

  const {
    category,
    cursor: encodedCursor,
    from,
    limit,
    orderId,
    outcome,
    requestId,
    to,
    username,
  } = validationResult.data

  if (
    from !== undefined &&
    to !== undefined &&
    new Date(from).getTime() >
      new Date(to).getTime()
  ) {
    return null
  }

  const cursor =
    encodedCursor === undefined
      ? null
      : decodeAuditReadCursor(encodedCursor)

  if (
    encodedCursor !== undefined &&
    cursor === null
  ) {
    return null
  }

  return {
    limit: limit ?? DEFAULT_PAGE_LIMIT,
    cursor,
    filters: {
      category: category ?? null,
      outcome: outcome ?? null,
      from: from ?? null,
      to: to ?? null,
      username: username ?? null,
      orderId: orderId ?? null,
      requestId: requestId ?? null,
    },
  }
}

export function encodeAuditReadCursor(
  cursor: AuditReadCursor,
): string {
  const validationResult =
    auditReadCursorSchema.safeParse(cursor)

  if (!validationResult.success) {
    throw new TypeError(
      'Invalid audit read cursor',
    )
  }

  return Buffer.from(
    JSON.stringify(validationResult.data),
    'utf8',
  ).toString('base64url')
}