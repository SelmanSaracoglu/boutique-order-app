import express from 'express'
import request from 'supertest'
import {
  describe,
  expect,
  it,
} from 'vitest'
import { app as apiApp } from '../src/app.js'
import {
  requestContextMiddleware,
} from '../src/http/requestContext.js'
import {
  createAccessLoggerMiddleware,
  type AccessLogRecord,
} from '../src/logging/accessLogger.js'
import {
  sanitizeLogText,
  serializeStructuredLog,
} from '../src/logging/structuredLogger.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function createTelemetryTestApp(
  records: AccessLogRecord[],
) {
  const telemetryTestApp = express()

  telemetryTestApp.use(
    requestContextMiddleware,
  )

  telemetryTestApp.use(
    createAccessLoggerMiddleware((record) => {
      records.push(record)
    }),
  )

  telemetryTestApp.use(express.json())

  return telemetryTestApp
}

describe('Request telemetry', () => {
  it('returns a server-generated request ID from the API app', async () => {
    const clientRequestId =
      '11111111-1111-4111-8111-111111111111'

    const response = await request(apiApp)
      .get('/api/not-a-real-route')
      .set('X-Request-ID', clientRequestId)

    expect(response.status).toBe(404)

    expect(
      response.headers['x-request-id'],
    ).toMatch(UUID_PATTERN)

    expect(
      response.headers['x-request-id'],
    ).not.toBe(clientRequestId)
  })

  it('writes one access record with request and actor context', async () => {
    const records: AccessLogRecord[] = []
    const telemetryTestApp =
      createTelemetryTestApp(records)

    telemetryTestApp.get(
      '/api/orders/:orderId',
      (request, response) => {
        request.authenticatedUser = {
          id: 42,
          username: 'order.operator',
          role: 'ORDER_OPERATOR',
        }

        response.status(202).json({
          accepted: true,
        })
      },
    )

    const response = await request(
      telemetryTestApp,
    )
      .get('/api/orders/123')
      .set(
        'User-Agent',
        'request-telemetry-test',
      )

    expect(response.status).toBe(202)
    expect(records).toHaveLength(1)

    const record = records[0]

    if (!record) {
      throw new Error(
        'Expected one access log record',
      )
    }

    expect(record).toMatchObject({
      requestId:
        response.headers['x-request-id'],
      eventType: 'HTTP_ACCESS',
      service: 'boutique-order-api',
      environment: expect.any(String),
      schemaVersion: 1,
      method: 'GET',
      route: '/api/orders/:orderId',
      status: 202,
      userAgent: 'request-telemetry-test',
      actor: {
        userId: 42,
        username: 'order.operator',
        role: 'ORDER_OPERATOR',
      },
    })

    expect(record.timestamp).toEqual(
      expect.any(String),
    )

    expect(
      Number.isNaN(Date.parse(record.timestamp)),
    ).toBe(false)

    expect(record.durationMs).toBeGreaterThanOrEqual(
      0,
    )

    expect(record.sourceIp).toEqual(
      expect.any(String),
    )
  })

  it('ignores forwarded IP and bounds the user-agent', async () => {
    const records: AccessLogRecord[] = []
    const telemetryTestApp =
      createTelemetryTestApp(records)

    const forwardedAddress = '203.0.113.10'
    const longUserAgent =
      `test-agent/${'a'.repeat(400)}`

    telemetryTestApp.get(
      '/api/test',
      (_request, response) => {
        response.sendStatus(204)
      },
    )

    const response = await request(
      telemetryTestApp,
    )
      .get('/api/test')
      .set(
        'X-Forwarded-For',
        forwardedAddress,
      )
      .set('User-Agent', longUserAgent)

    expect(response.status).toBe(204)
    expect(records).toHaveLength(1)

    const record = records[0]

    if (!record) {
      throw new Error(
        'Expected one access log record',
      )
    }

    expect(record.sourceIp).not.toBe(
      forwardedAddress,
    )

    expect(record.userAgent).toHaveLength(256)
  })

  it('does not copy sensitive request data into the access record', async () => {
    const records: AccessLogRecord[] = []
    const telemetryTestApp =
      createTelemetryTestApp(records)

    telemetryTestApp.post(
      '/api/test-login',
      (_request, response) => {
        response.status(401).json({
          rejected: true,
        })
      },
    )

    const response = await request(
      telemetryTestApp,
    )
      .post('/api/test-login')
      .set(
        'Authorization',
        'Bearer authorization-secret',
      )
      .set(
        'Cookie',
        'boutique.sid=cookie-secret',
      )
      .set(
        'X-CSRF-Token',
        'csrf-secret',
      )
      .send({
        username: 'attempted.user',
        password: 'password-secret',
        customerAddress:
          'customer-address-secret',
      })

    expect(response.status).toBe(401)
    expect(records).toHaveLength(1)

    const record = records[0]

    if (!record) {
      throw new Error(
        'Expected one access log record',
      )
    }

    const serializedRecord =
      serializeStructuredLog(record)

    expect(serializedRecord).not.toContain(
      'authorization-secret',
    )

    expect(serializedRecord).not.toContain(
      'cookie-secret',
    )

    expect(serializedRecord).not.toContain(
      'csrf-secret',
    )

    expect(serializedRecord).not.toContain(
      'password-secret',
    )

    expect(serializedRecord).not.toContain(
      'customer-address-secret',
    )
  })

  it('sanitizes external text and serializes one JSON line', () => {
    const sanitizedValue = sanitizeLogText(
      `browser\r\n{"eventType":"FORGED"}\u2028${'x'.repeat(100)}`,
      64,
    )

    const serializedRecord =
      serializeStructuredLog({
        eventType: 'HTTP_ACCESS',
        userAgent: sanitizedValue,
      })

    expect(sanitizedValue).not.toContain('\r')
    expect(sanitizedValue).not.toContain('\n')
    expect(sanitizedValue).not.toContain('\u2028')
    expect(sanitizedValue).not.toContain('\u2029')
    expect(sanitizedValue.length).toBeLessThanOrEqual(
      64,
    )

    expect(
      serializedRecord.endsWith('\n'),
    ).toBe(true)

    expect(
      serializedRecord.slice(0, -1),
    ).not.toContain('\n')

    expect(
      JSON.parse(serializedRecord),
    ).toEqual({
      eventType: 'HTTP_ACCESS',
      userAgent: sanitizedValue,
    })
  })
})