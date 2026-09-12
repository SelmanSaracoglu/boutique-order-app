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

function encodeRawCursor(
  value: unknown,
): string {
  return Buffer.from(
    JSON.stringify(value),
    'utf8',
  ).toString('base64url')
}

describe('Audit read query', () => {
  it('uses the default page size without a cursor', () => {
    expect(parseAuditReadQuery({})).toEqual({
      limit: 25,
      cursor: null,
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
    })
  })

  it('round-trips a valid cursor', () => {
    const encodedCursor =
      encodeAuditReadCursor(VALID_CURSOR)

    expect(
      parseAuditReadQuery({
        limit: '10',
        cursor: encodedCursor,
      }),
    ).toEqual({
      limit: 10,
      cursor: VALID_CURSOR,
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
    'rejects an invalid query: $limit',
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