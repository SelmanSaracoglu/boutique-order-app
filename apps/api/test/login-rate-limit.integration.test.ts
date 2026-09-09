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
import {
  LOGIN_RATE_LIMIT_MAX_FAILURES,
  loginRateLimiter,
} from '../src/auth/loginRateLimiter.js'
import { provisionUser } from '../src/auth/provisionUser.js'
import { pool } from '../src/db.js'

const VALID_PASSWORD =
  'a memorable test passphrase'

const INVALID_PASSWORD =
  'a deliberately invalid test password'

const AUDIT_FAILURE_CONSTRAINT =
  'login_rate_limit_audit_test_failure'

async function recordFailedLoginAttempts(
  username: string,
  attemptCount: number,
): Promise<void> {
  for (
    let attemptIndex = 0;
    attemptIndex < attemptCount;
    attemptIndex += 1
  ) {
    await request(app)
      .post('/api/auth/login')
      .set(
        'x-forwarded-for',
        `203.0.113.${attemptIndex + 10}`,
      )
      .send({
        username,
        password: INVALID_PASSWORD,
      })
      .expect(401)
  }
}

describe('Login rate limiting', () => {
  beforeEach(async () => {
    loginRateLimiter.clear()

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
    loginRateLimiter.clear()

    await pool.query(`
      ALTER TABLE audit_events
      DROP CONSTRAINT IF EXISTS ${AUDIT_FAILURE_CONSTRAINT}
    `)

    await pool.end()
  })

  it('rate limits login and records one correlated security event', async () => {
    await provisionUser({
      username: 'order.operator',
      password: VALID_PASSWORD,
      role: 'ORDER_OPERATOR',
    })

    await recordFailedLoginAttempts(
      'order.operator',
      LOGIN_RATE_LIMIT_MAX_FAILURES,
    )

    const response = await request(app)
      .post('/api/auth/login')
      .set(
        'user-agent',
        'login-rate-limit-integration-test',
      )
      .set(
        'x-forwarded-for',
        '198.51.100.25',
      )
      .send({
        username: 'order.operator',
        password: VALID_PASSWORD,
      })
      .expect(429)

    expect(response.body).toEqual({
      error: {
        code: 'LOGIN_RATE_LIMITED',
        message:
          'Too many login attempts. Try again later.',
      },
    })

    expect(response.headers['x-request-id']).toEqual(
      expect.any(String),
    )

    const retryAfterSeconds = Number(
      response.headers['retry-after'],
    )

    expect(retryAfterSeconds).toBeGreaterThan(0)

    expect(retryAfterSeconds).toBeLessThanOrEqual(
      15 * 60,
    )

    expect(
      response.headers['set-cookie'],
    ).toBeUndefined()

    const rateLimitEventResult =
      await pool.query(
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

    expect(rateLimitEventResult.rows).toEqual([
      {
        schema_version: 2,
        category: 'SECURITY',
        action:
          'AUTH_LOGIN_RATE_LIMITED',
        outcome: 'REJECTED',
        severity: 'WARN',
        actor_type: 'ANONYMOUS',
        actor_user_id: null,
        actor_username: null,
        actor_role: null,
        target_resource_type:
          'AUTHENTICATION',
        target_resource_id: 'login',
        request_id:
          response.headers['x-request-id'],
        operation: 'AUTH_LOGIN',
        http_method: 'POST',
        http_route: '/api/auth/login',
        http_status: 429,
        reason_code:
          'LOGIN_RATE_LIMIT_EXCEEDED',
        error_code: null,
        source_ip: expect.any(String),
        user_agent:
          'login-rate-limit-integration-test',
        context: {
          attemptedUsername:
            'order.operator',
        },
      },
    ])

    expect(
      rateLimitEventResult.rows[0].source_ip,
    ).not.toBe('198.51.100.25')

    const failedEventResult =
      await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE action = 'AUTH_LOGIN_FAILED'
      `)

    expect(
      failedEventResult.rows[0].count,
    ).toBe(LOGIN_RATE_LIMIT_MAX_FAILURES)

    const sessionResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM user_sessions
    `)

    expect(sessionResult.rows[0].count).toBe(0)

    const serializedEvents = JSON.stringify([
      ...rateLimitEventResult.rows,
    ])

    expect(serializedEvents).not.toContain(
      VALID_PASSWORD,
    )

    expect(serializedEvents).not.toContain(
      INVALID_PASSWORD,
    )
  })

  it('resets the failure counter after a successful audited login', async () => {
    await provisionUser({
      username: 'order.operator',
      password: VALID_PASSWORD,
      role: 'ORDER_OPERATOR',
    })

    await recordFailedLoginAttempts(
      'order.operator',
      LOGIN_RATE_LIMIT_MAX_FAILURES - 1,
    )

    await request(app)
      .post('/api/auth/login')
      .send({
        username: 'order.operator',
        password: VALID_PASSWORD,
      })
      .expect(200)

    const firstFailureAfterSuccess =
      await request(app)
        .post('/api/auth/login')
        .send({
          username: 'order.operator',
          password: INVALID_PASSWORD,
        })
        .expect(401)

    const secondFailureAfterSuccess =
      await request(app)
        .post('/api/auth/login')
        .send({
          username: 'order.operator',
          password: INVALID_PASSWORD,
        })
        .expect(401)

    expect(
      firstFailureAfterSuccess.headers[
        'retry-after'
      ],
    ).toBeUndefined()

    expect(
      secondFailureAfterSuccess.headers[
        'retry-after'
      ],
    ).toBeUndefined()
  })

  it('preserves the 429 response when audit persistence fails', async () => {
    await provisionUser({
      username: 'order.operator',
      password: VALID_PASSWORD,
      role: 'ORDER_OPERATOR',
    })

    await recordFailedLoginAttempts(
      'order.operator',
      LOGIN_RATE_LIMIT_MAX_FAILURES,
    )

    await pool.query(`
      ALTER TABLE audit_events
      ADD CONSTRAINT ${AUDIT_FAILURE_CONSTRAINT}
      CHECK (
        action <> 'AUTH_LOGIN_RATE_LIMITED'
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
          'login-rate-limit-fallback-test',
        )
        .send({
          username: 'order.operator',
          password: VALID_PASSWORD,
        })
        .expect(429)

      expect(response.body).toEqual({
        error: {
          code: 'LOGIN_RATE_LIMITED',
          message:
            'Too many login attempts. Try again later.',
        },
      })

      expect(
        response.headers['retry-after'],
      ).toEqual(expect.any(String))

      expect(
        response.headers['set-cookie'],
      ).toBeUndefined()

      const auditResult =
        await pool.query(`
          SELECT COUNT(*)::int AS count
          FROM audit_events
          WHERE action =
            'AUTH_LOGIN_RATE_LIMITED'
        `)

      expect(auditResult.rows[0].count).toBe(0)

      const sessionResult =
        await pool.query(`
          SELECT COUNT(*)::int AS count
          FROM user_sessions
        `)

      expect(sessionResult.rows[0].count).toBe(0)

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
            'AUTH_LOGIN_RATE_LIMITED',
          outcome: 'REJECTED',
          severity: 'WARN',
          operation: 'AUTH_LOGIN',
          method: 'POST',
          route: '/api/auth/login',
          status: 429,
          actor: {
            type: 'ANONYMOUS',
          },
          target: {
            resourceType:
              'AUTHENTICATION',
            resourceId: 'login',
          },
          reasonCode:
            'LOGIN_RATE_LIMIT_EXCEEDED',
          sourceIp: expect.any(String),
          userAgent:
            'login-rate-limit-fallback-test',
          context: {
            attemptedUsername:
              'order.operator',
          },
        },
      })

      expect(fallbackOutput).not.toContain(
        VALID_PASSWORD,
      )

      expect(fallbackOutput).not.toContain(
        INVALID_PASSWORD,
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