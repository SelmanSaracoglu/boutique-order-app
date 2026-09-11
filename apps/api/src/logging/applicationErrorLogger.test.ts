import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  type ApplicationErrorEventInput,
  APPLICATION_ERROR_CODE,
} from '../audit/applicationErrorEvent.js'
import {
  serializeStructuredLog,
  type StructuredLogRecord,
} from './structuredLogger.js'
import {
  tryWriteApplicationErrorLog,
} from './applicationErrorLogger.js'

function buildApplicationErrorEvent():
  ApplicationErrorEventInput {
  return {
    errorCode:
      APPLICATION_ERROR_CODE,
    actor: {
      type: 'USER',
      user: {
        id: 71,
        username:
          'order.operator\r\nforged-entry',
        role: 'ORDER_OPERATOR',
      },
    },
    target: {
      resourceType: 'ORDER',
      resourceId: '105',
    },
    request: {
      requestId:
        '26377d77-163a-4b15-b521-14e52ab8d2d8',
      operation: 'CREATE_ORDER',
      method: 'POST',
      route: '/api/orders',
      status: 500,
      sourceIp: '127.0.0.1',
      userAgent:
        'error-agent\r\nforged-entry',
    },
  }
}

describe( 'Application error logger',
  () => {
    it('writes structured technical details without the exception message',
      () => {
        const error = new Error(
          'password=plain-text-password; authorization=Bearer secret-token; SELECT * FROM users',
        )

        error.stack = [
          'Error: password=plain-text-password; authorization=Bearer secret-token; SELECT * FROM users',
          '    at createOrder (C:\\app\\createOrder.ts:42:17)',
          '    at processRequest (C:\\app\\router.ts:18:9)',
        ].join('\n')

        const records:
          StructuredLogRecord[] = []

        const written =
          tryWriteApplicationErrorLog(
            buildApplicationErrorEvent(),
            error,
            (record) => {
              records.push(record)
            },
          )

        expect(written).toBe(true)
        expect(records).toHaveLength(1)

        const record = records[0]!

        expect(record).toMatchObject({
          requestId:
            '26377d77-163a-4b15-b521-14e52ab8d2d8',
          eventType:
            'APPLICATION_ERROR',
          service:
            'boutique-order-api',
          schemaVersion: 1,
          severity: 'ERROR',
          operation:
            'CREATE_ORDER',
          method: 'POST',
          route: '/api/orders',
          status: 500,
          errorCode:
            'UNEXPECTED_ERROR',
          actor: {
            type: 'USER',
            userId: 71,
            username:
              'order.operator forged-entry',
            role: 'ORDER_OPERATOR',
          },
          target: {
            resourceType: 'ORDER',
            resourceId: '105',
          },
          sourceIp: '127.0.0.1',
          userAgent:
            'error-agent forged-entry',
          technical: {
            errorName: 'Error',
            stackFrames: [
              'at createOrder (C:\\app\\createOrder.ts:42:17)',
              'at processRequest (C:\\app\\router.ts:18:9)',
            ],
          },
        })

        const serializedRecord =
          serializeStructuredLog(record)

        expect(() =>
          JSON.parse(serializedRecord),
        ).not.toThrow()

        expect(
          serializedRecord,
        ).not.toContain(
          'plain-text-password',
        )
        expect(
          serializedRecord,
        ).not.toContain(
          'secret-token',
        )
        expect(
          serializedRecord,
        ).not.toContain(
          'password=',
        )
        expect(
          serializedRecord,
        ).not.toContain(
          'authorization=',
        )
        expect(
          serializedRecord,
        ).not.toContain(
          'SELECT * FROM users',
        )
        expect(
          serializedRecord,
        ).not.toContain(
          'forged-entry\\r',
        )
        expect(
          serializedRecord,
        ).not.toContain(
          'forged-entry\\n',
        )
      },
    )

    it('does not serialize an unknown thrown value',
      () => {
        const records:
          StructuredLogRecord[] = []

        const written =
          tryWriteApplicationErrorLog(
            buildApplicationErrorEvent(),
            'cookie=session-secret; csrfToken=secret-csrf',
            (record) => {
              records.push(record)
            },
          )

        expect(written).toBe(true)

        const record = records[0]!

        expect(
          record.technical,
        ).toEqual({
          errorName: 'UnknownError',
          stackFrames: [],
        })

        const serializedRecord =
          JSON.stringify(record)

        expect(
          serializedRecord,
        ).not.toContain(
          'session-secret',
        )
        expect(
          serializedRecord,
        ).not.toContain(
          'secret-csrf',
        )
        expect(
          serializedRecord,
        ).not.toContain('cookie')
        expect(
          serializedRecord,
        ).not.toContain(
          'csrfToken',
        )
      },
    )

    it('does not throw when the structured log writer fails',
      () => {
        const written =
          tryWriteApplicationErrorLog(
            buildApplicationErrorEvent(),
            new Error(
              'internal failure',
            ),
            () => {
              throw new Error(
                'Log writer failed',
              )
            },
          )

        expect(written).toBe(false)
      },
    )
  },
)