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
import { provisionUser } from '../src/auth/provisionUser.js'
import { pool } from '../src/db.js'

const VALID_PASSWORD =
  'a memorable test passphrase'

const AUDIT_FAILURE_CONSTRAINT =
  'login_success_audit_test_failure'

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

describe('Login audit events', () => {
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

  it('records a successful login with actor and request context', async () => {
    const user = await provisionUser({
      username: 'order.operator',
      password: VALID_PASSWORD,
      role: 'ORDER_OPERATOR',
    })

    const response = await request(app)
      .post('/api/auth/login')
      .set(
        'user-agent',
        'login-audit-integration-test',
      )
      .set(
        'x-forwarded-for',
        '203.0.113.10',
      )
      .send({
        username: 'order.operator',
        password: VALID_PASSWORD,
      })
      .expect(200)

    const requestId =
      response.headers['x-request-id']

    expect(requestId).toEqual(expect.any(String))

    const result = await pool.query(`
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
      WHERE action = 'AUTH_LOGIN_SUCCEEDED'
    `)

    expect(result.rows).toHaveLength(1)

    expect(result.rows[0]).toMatchObject({
      schema_version: 2,
      category: 'SECURITY',
      action: 'AUTH_LOGIN_SUCCEEDED',
      outcome: 'SUCCESS',
      severity: 'INFO',
      actor_type: 'USER',
      actor_user_id: user.id,
      actor_username: 'order.operator',
      actor_role: 'ORDER_OPERATOR',
      target_resource_type: 'AUTHENTICATION',
      target_resource_id: 'login',
      request_id: requestId,
      operation: 'AUTH_LOGIN',
      http_method: 'POST',
      http_route: '/api/auth/login',
      http_status: 200,
      reason_code: null,
      error_code: null,
      user_agent:
        'login-audit-integration-test',
      context: {},
    })

    expect(result.rows[0].source_ip).toEqual(
      expect.any(String),
    )

    expect(result.rows[0].source_ip).not.toBe(
      '203.0.113.10',
    )
  })

  it('records failed logins without exposing credentials', async () => {
    await provisionUser({
      username: 'order.operator',
      password: VALID_PASSWORD,
      role: 'ORDER_OPERATOR',
    })

    const wrongPassword =
      'a completely wrong password'

    const wrongPasswordResponse =
      await request(app)
        .post('/api/auth/login')
        .send({
          username: 'order.operator',
          password: wrongPassword,
        })
        .expect(401)

    const unknownUserResponse =
      await request(app)
        .post('/api/auth/login')
        .send({
          username: 'unknown.operator',
          password: wrongPassword,
        })
        .expect(401)

    const result = await pool.query(`
      SELECT
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
        context
      FROM audit_events
      WHERE action = 'AUTH_LOGIN_FAILED'
      ORDER BY id
    `)

    expect(result.rows).toEqual([
      {
        category: 'SECURITY',
        action: 'AUTH_LOGIN_FAILED',
        outcome: 'FAILURE',
        severity: 'WARN',
        actor_type: 'ANONYMOUS',
        actor_user_id: null,
        actor_username: null,
        actor_role: null,
        target_resource_type: 'AUTHENTICATION',
        target_resource_id: 'login',
        request_id:
          wrongPasswordResponse.headers[
            'x-request-id'
          ],
        operation: 'AUTH_LOGIN',
        http_method: 'POST',
        http_route: '/api/auth/login',
        http_status: 401,
        reason_code: 'INVALID_CREDENTIALS',
        error_code: null,
        context: {
          attemptedUsername:
            'order.operator',
        },
      },
      {
        category: 'SECURITY',
        action: 'AUTH_LOGIN_FAILED',
        outcome: 'FAILURE',
        severity: 'WARN',
        actor_type: 'ANONYMOUS',
        actor_user_id: null,
        actor_username: null,
        actor_role: null,
        target_resource_type: 'AUTHENTICATION',
        target_resource_id: 'login',
        request_id:
          unknownUserResponse.headers[
            'x-request-id'
          ],
        operation: 'AUTH_LOGIN',
        http_method: 'POST',
        http_route: '/api/auth/login',
        http_status: 401,
        reason_code: 'INVALID_CREDENTIALS',
        error_code: null,
        context: {
          attemptedUsername:
            'unknown.operator',
        },
      },
    ])

    const serializedEvents =
      JSON.stringify(result.rows)

    expect(serializedEvents).not.toContain(
      VALID_PASSWORD,
    )

    expect(serializedEvents).not.toContain(
      wrongPassword,
    )

    expect(serializedEvents).not.toContain(
      'password',
    )
  })

  it('removes the session when successful login audit persistence fails', async () => {
    const user = await provisionUser({
      username: 'order.operator',
      password: VALID_PASSWORD,
      role: 'ORDER_OPERATOR',
    })

    await pool.query(`
      ALTER TABLE audit_events
      ADD CONSTRAINT ${AUDIT_FAILURE_CONSTRAINT}
      CHECK (
        action <> 'AUTH_LOGIN_SUCCEEDED'
      )
    `)

    const stderrWriteSpy = vi
      .spyOn(process.stderr, 'write')
      .mockReturnValue(true)

    try {
      const response = await request(app)
        .post('/api/auth/login')
        .set(
          'user-agent',
          'login-audit-failure-test',
        )
        .send({
          username: user.username,
          password: VALID_PASSWORD,
        })
        .expect(500)

      expect(response.body).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to complete login.',
        },
      })

      const sessionResult = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM user_sessions
      `)

      expect(sessionResult.rows[0].count).toBe(0)

      const auditResult = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE action = 'AUTH_LOGIN_SUCCEEDED'
      `)

      expect(auditResult.rows[0].count).toBe(0)

      const clearedCookie = findSessionCookie(
        response.headers['set-cookie'],
      )

      expect(clearedCookie).toEqual(
        expect.any(String),
      )

      expect(clearedCookie).toContain(
        'boutique.sid=;',
      )

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
          action: 'AUTH_LOGIN_SUCCEEDED',
          outcome: 'SUCCESS',
          severity: 'INFO',
          operation: 'AUTH_LOGIN',
          method: 'POST',
          route: '/api/auth/login',
          status: 200,
          actor: {
            type: 'USER',
            userId: user.id,
            username: user.username,
            role: user.role,
          },
          target: {
            resourceType:
              'AUTHENTICATION',
            resourceId: 'login',
          },
          reasonCode: null,
          userAgent:
            'login-audit-failure-test',
          context: {},
        },
      })

      expect(fallbackOutput).not.toContain(
        VALID_PASSWORD,
      )

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