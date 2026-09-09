import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import { pool } from '../src/db.js'

const AUDIT_FAILURE_CONSTRAINT =
  'authentication_required_audit_test_failure'

const authenticationRequiredResponse = {
  error: {
    code: 'AUTHENTICATION_REQUIRED',
    message: 'Authentication required.',
  },
}

function findSessionCookie(
  setCookieHeader: unknown,
): string | undefined {
  const cookies = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : typeof setCookieHeader === 'string'
      ? [setCookieHeader]
      : []

  return cookies.find(
    (cookie): cookie is string =>
      typeof cookie === 'string' &&
      cookie.startsWith('boutique.sid='),
  )
}

describe('Authentication security events', () => {
  beforeEach(async () => {
    await pool.query(`
      ALTER TABLE audit_events
      DROP CONSTRAINT IF EXISTS ${AUDIT_FAILURE_CONSTRAINT}
    `)

    await pool.query(
      'TRUNCATE audit_events RESTART IDENTITY',
    )

    await pool.query(`
      TRUNCATE user_sessions, users
      RESTART IDENTITY CASCADE
    `)
  })

  afterAll(async () => {
    await pool.query(`
      ALTER TABLE audit_events
      DROP CONSTRAINT IF EXISTS ${AUDIT_FAILURE_CONSTRAINT}
    `)

    await pool.end()
  })

  it('does not persist an event for normal anonymous session bootstrap', async () => {
    const response = await request(app)
      .get('/api/auth/session')
      .set(
        'user-agent',
        'anonymous-session-bootstrap-test',
      )
      .expect(401)

    expect(response.body).toEqual(
      authenticationRequiredResponse,
    )

    expect(
      response.headers['x-request-id'],
    ).toEqual(expect.any(String))

    expect(
      response.headers['set-cookie'],
    ).toBeUndefined()

    const auditResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM audit_events
    `)

    expect(auditResult.rows[0].count).toBe(0)
  })

  it('records authentication required for anonymous protected API access', async () => {
    const response = await request(app)
      .get('/api/orders')
      .set(
        'user-agent',
        'authentication-required-test',
      )
      .set(
        'x-forwarded-for',
        '203.0.113.50',
      )
      .expect(401)

    expect(response.body).toEqual(
      authenticationRequiredResponse,
    )

    expect(
      response.headers['set-cookie'],
    ).toBeUndefined()

    const auditResult = await pool.query(
      `
        SELECT
          schema_version,
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
          request_id,
          operation,
          http_method,
          http_route,
          http_status,
          reason_code,
          error_code,
          host(source_ip) AS source_ip,
          user_agent,
          context
        FROM audit_events
        WHERE request_id = $1
      `,
      [response.headers['x-request-id']],
    )

    expect(auditResult.rows).toEqual([
      {
        schema_version: 2,
        category: 'SECURITY',
        action:
          'AUTHENTICATION_REQUIRED',
        outcome: 'REJECTED',
        severity: 'WARN',
        actor_type: 'ANONYMOUS',
        actor_user_id: null,
        actor_username: null,
        actor_role: null,
        target_resource_type: 'REQUEST',
        target_resource_id:
          '/api/orders',
        request_id:
          response.headers['x-request-id'],
        operation:
          'AUTHENTICATE_REQUEST',
        http_method: 'GET',
        http_route: '/api/orders',
        http_status: 401,
        reason_code:
          'AUTHENTICATION_REQUIRED',
        error_code: null,
        source_ip: expect.any(String),
        user_agent:
          'authentication-required-test',
        context: {},
      },
    ])

    expect(
      auditResult.rows[0].source_ip,
    ).not.toBe('203.0.113.50')
  })

  it('records an invalid session without persisting the cookie value', async () => {
    const forgedSessionCookie =
      'boutique.sid=forged-session-token'

    const response = await request(app)
      .get('/api/orders')
      .set('Cookie', forgedSessionCookie)
      .set(
        'user-agent',
        'invalid-session-test',
      )
      .expect(401)

    expect(response.body).toEqual(
      authenticationRequiredResponse,
    )

    const clearedCookie = findSessionCookie(
      response.headers['set-cookie'],
    )

    expect(clearedCookie).toEqual(
      expect.any(String),
    )

    expect(clearedCookie).toContain(
      'boutique.sid=;',
    )

    const sessionResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM user_sessions
    `)

    expect(sessionResult.rows[0].count).toBe(0)

    const auditResult = await pool.query(
      `
        SELECT
          category,
          action,
          outcome,
          severity,
          actor_type,
          target_resource_type,
          target_resource_id,
          request_id,
          operation,
          http_method,
          http_route,
          http_status,
          reason_code,
          error_code,
          user_agent,
          context
        FROM audit_events
        WHERE request_id = $1
      `,
      [response.headers['x-request-id']],
    )

    expect(auditResult.rows).toEqual([
      {
        category: 'SECURITY',
        action: 'SESSION_REJECTED',
        outcome: 'REJECTED',
        severity: 'WARN',
        actor_type: 'ANONYMOUS',
        target_resource_type: 'SESSION',
        target_resource_id: 'current',
        request_id:
          response.headers['x-request-id'],
        operation:
          'AUTHENTICATE_REQUEST',
        http_method: 'GET',
        http_route: '/api/orders',
        http_status: 401,
        reason_code: 'INVALID_SESSION',
        error_code: null,
        user_agent:
          'invalid-session-test',
        context: {},
      },
    ])

    const serializedEvent = JSON.stringify(
      auditResult.rows,
    )

    expect(serializedEvent).not.toContain(
      'forged-session-token',
    )

    expect(serializedEvent).not.toContain(
      forgedSessionCookie,
    )
  })

  it('preserves the 401 response when authentication audit persistence fails', async () => {
    await pool.query(`
      ALTER TABLE audit_events
      ADD CONSTRAINT ${AUDIT_FAILURE_CONSTRAINT}
      CHECK (
        action <> 'AUTHENTICATION_REQUIRED'
      )
    `)

    const stderrWriteSpy = vi
      .spyOn(process.stderr, 'write')
      .mockReturnValue(true)

    try {
      const response = await request(app)
        .get('/api/orders')
        .set(
          'user-agent',
          'authentication-fallback-test',
        )
        .expect(401)

      expect(response.body).toEqual(
        authenticationRequiredResponse,
      )

      const auditResult =
        await pool.query(`
          SELECT COUNT(*)::int AS count
          FROM audit_events
          WHERE action =
            'AUTHENTICATION_REQUIRED'
        `)

      expect(
        auditResult.rows[0].count,
      ).toBe(0)

      const fallbackOutput =
        stderrWriteSpy.mock.calls
          .map((call) => String(call[0]))
          .join('')

      const fallbackLines = fallbackOutput
        .trim()
        .split('\n')

      expect(fallbackLines).toHaveLength(1)

      const fallbackRecord = JSON.parse(
        fallbackLines[0] ?? '',
      )

      expect(fallbackRecord).toMatchObject({
        requestId:
          response.headers['x-request-id'],
        eventType:
          'AUDIT_PERSISTENCE_FAILED',
        failureCode:
          'AUDIT_PERSISTENCE_FAILED',
        auditEvent: {
          schemaVersion: 2,
          category: 'SECURITY',
          action:
            'AUTHENTICATION_REQUIRED',
          outcome: 'REJECTED',
          severity: 'WARN',
          operation:
            'AUTHENTICATE_REQUEST',
          method: 'GET',
          route: '/api/orders',
          status: 401,
          actor: {
            type: 'ANONYMOUS',
          },
          target: {
            resourceType: 'REQUEST',
            resourceId: '/api/orders',
          },
          reasonCode:
            'AUTHENTICATION_REQUIRED',
          sourceIp: expect.any(String),
          userAgent:
            'authentication-fallback-test',
          context: {},
        },
      })

      expect(fallbackOutput).not.toContain(
        AUDIT_FAILURE_CONSTRAINT,
      )

      expect(fallbackOutput).not.toContain(
        '23514',
      )

      expect(fallbackOutput).not.toContain(
        'password',
      )

      expect(fallbackOutput).not.toContain(
        'cookie',
      )

      expect(fallbackOutput).not.toContain(
        'authorization',
      )

      expect(fallbackOutput).not.toContain(
        'csrfToken',
      )
    } finally {
      stderrWriteSpy.mockRestore()

      await pool.query(`
        ALTER TABLE audit_events
        DROP CONSTRAINT IF EXISTS ${AUDIT_FAILURE_CONSTRAINT}
      `)
    }
  })
})