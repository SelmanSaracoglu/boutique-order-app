import { Buffer } from 'node:buffer'
import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  encodeAuditReadCursor,
  parseAuditReadQuery,
} from './auditReadQuery.js'

const VALID_CURSOR = {
  occurredAt: '2026-09-12T10:30:00.000Z',
  id: '42',
}

const EMPTY_FILTERS = {
  category: null,
  outcome: null,
  from: null,
  to: null,
  username: null,
  orderId: null,
  requestId: null,
}

function encodeRawCursor(
  value: unknown,
): string {
  return Buffer.from(
    JSON.stringify(value),
    'utf8',
  ).toString('base64url')
}

describe('Audit read query', () => {
  it('uses defaults without filters or a cursor', () => {
    expect(parseAuditReadQuery({})).toEqual({
      limit: 25,
      cursor: null,
      filters: EMPTY_FILTERS,
    })
  })

  it('accepts an explicit page size', () => {
    expect(
      parseAuditReadQuery({
        limit: '100',
      }),
    ).toEqual({
      limit: 100,
      cursor: null,
      filters: EMPTY_FILTERS,
    })
  })

  it('accepts and normalizes supported filters', () => {
    expect(
      parseAuditReadQuery({
        category: 'ERROR',
        outcome: 'FAILURE',
        from:
          '2026-01-01T00:00:00.000Z',
        to:
          '2026-01-31T23:59:59.999Z',
        username: '  Admin.User  ',
        orderId: '42',
        requestId:
          '00000000-0000-4000-8000-000000000042',
      }),
    ).toEqual({
      limit: 25,
      cursor: null,
      filters: {
        category: 'ERROR',
        outcome: 'FAILURE',
        from:
          '2026-01-01T00:00:00.000Z',
        to:
          '2026-01-31T23:59:59.999Z',
        username: 'admin.user',
        orderId: '42',
        requestId:
          '00000000-0000-4000-8000-000000000042',
      },
    })
  })

  it('allows equal date range boundaries', () => {
    const timestamp =
      '2026-09-12T10:30:00.000Z'

    expect(
      parseAuditReadQuery({
        from: timestamp,
        to: timestamp,
      }),
    ).toEqual({
      limit: 25,
      cursor: null,
      filters: {
        ...EMPTY_FILTERS,
        from: timestamp,
        to: timestamp,
      },
    })
  })

  it('round-trips a valid cursor', () => {
    const encodedCursor =
      encodeAuditReadCursor(VALID_CURSOR)

    expect(
      parseAuditReadQuery({
        limit: '10',
        cursor: encodedCursor,
        category: 'SECURITY',
      }),
    ).toEqual({
      limit: 10,
      cursor: VALID_CURSOR,
      filters: {
        ...EMPTY_FILTERS,
        category: 'SECURITY',
      },
    })
  })

  it.each([
    { limit: '0' },
    { limit: '101' },
    { limit: '-1' },
    { limit: '1.5' },
    { limit: '01' },
    { limit: ['25'] },
    { unsupported: 'value' },
  ])(
    'rejects an invalid pagination query',
    (query) => {
      expect(
        parseAuditReadQuery(query),
      ).toBeNull()
    },
  )

  it.each([
    { category: 'ALL' },
    { category: 'SYSTEM' },
    { category: 'product' },
    { category: ['PRODUCT'] },
    { outcome: 'INFO' },
    { outcome: 'success' },
    { outcome: ['SUCCESS'] },
    { from: '2026-01-01' },
    {
      to:
        '2026-01-31T23:59:59+00:00',
    },
    {
      from:
        '2026-02-01T00:00:00.000Z',
      to:
        '2026-01-01T00:00:00.000Z',
    },
    { username: 'a' },
    { username: ['admin'] },
    { orderId: '0' },
    { orderId: '01' },
    { orderId: '2147483648' },
    { orderId: ['42'] },
    { requestId: 'not-a-uuid' },
    {
      requestId:
        '00000000-0000-0000-0000-000000000000',
    },
    {
      requestId: [
        '00000000-0000-4000-8000-000000000042',
      ],
    },
  ])(
    'rejects invalid filter input',
    (query) => {
      expect(
        parseAuditReadQuery(query),
      ).toBeNull()
    },
  )

  it.each([
    '',
    'not-base64!',
    'a'.repeat(513),
    encodeRawCursor({
      occurredAt: 'not-a-date',
      id: '42',
    }),
    encodeRawCursor({
      occurredAt:
        '2026-09-12T10:30:00.000Z',
      id: '0',
    }),
    encodeRawCursor({
      occurredAt:
        '2026-09-12T10:30:00.000Z',
      id: '9223372036854775808',
    }),
    encodeRawCursor({
      ...VALID_CURSOR,
      unexpected: true,
    }),
  ])(
    'rejects an invalid cursor',
    (cursor) => {
      expect(
        parseAuditReadQuery({ cursor }),
      ).toBeNull()
    },
  )

  it('refuses to encode an invalid cursor', () => {
    expect(() =>
      encodeAuditReadCursor({
        occurredAt: 'invalid',
        id: '42',
      }),
    ).toThrow('Invalid audit read cursor')
  })
})