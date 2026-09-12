import { Buffer } from 'node:buffer'
import { z } from 'zod'

const DEFAULT_PAGE_LIMIT = 25
const MAX_PAGE_LIMIT = 100
const MAX_CURSOR_LENGTH = 512
const POSTGRES_BIGINT_MAX =
  9_223_372_036_854_775_807n

export type AuditReadCursor = {
  occurredAt: string
  id: string
}

export type AuditReadQuery = {
  limit: number
  cursor: AuditReadCursor | null
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

const auditReadCursorSchema = z.strictObject({
  occurredAt: z
    .string()
    .max(32)
    .refine(isCanonicalIsoTimestamp),
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

const rawAuditReadQuerySchema = z.strictObject({
  limit: pageLimitSchema.optional(),
  cursor: z
    .string()
    .min(1)
    .max(MAX_CURSOR_LENGTH)
    .optional(),
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

  const encodedCursor =
    validationResult.data.cursor

  if (encodedCursor === undefined) {
    return {
      limit:
        validationResult.data.limit ??
        DEFAULT_PAGE_LIMIT,
      cursor: null,
    }
  }

  const cursor =
    decodeAuditReadCursor(encodedCursor)

  if (cursor === null) {
    return null
  }

  return {
    limit:
      validationResult.data.limit ??
      DEFAULT_PAGE_LIMIT,
    cursor,
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