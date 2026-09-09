import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import type {
  SessionRejectionReasonCode,
} from '../src/audit/requestAuditEvent.js'
import {
  loginRateLimiter,
} from '../src/auth/loginRateLimiter.js'
import { provisionUser } from '../src/auth/provisionUser.js'
import {
  SESSION_ABSOLUTE_TIMEOUT_MS,
} from '../src/auth/session.js'
import { pool } from '../src/db.js'

const VALID_PASSWORD =
  'a memorable test passphrase'

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

function readSessionCookieValue(
  setCookieHeader: unknown,
): string {
  const sessionCookie =
    findSessionCookie(setCookieHeader)

  if (!sessionCookie) {
    throw new Error(
      'Expected a session cookie',
    )
  }

  const cookiePair =
    sessionCookie.split(';')[0]

  const separatorIndex =
    cookiePair?.indexOf('=') ?? -1

  const cookieValue =
    separatorIndex >= 0
      ? cookiePair?.slice(
          separatorIndex + 1,
        )
      : undefined

  if (!cookieValue) {
    throw new Error(
      'Expected a session cookie value',
    )
  }

  return cookieValue
}

function expectSessionCookieCleared(
  setCookieHeader: unknown,
): void {
  const clearedCookie =
    findSessionCookie(setCookieHeader)

  expect(clearedCookie).toEqual(
    expect.any(String),
  )

  expect(clearedCookie).toContain(
    'boutique.sid=;',
  )
}

async function createAuthenticatedSession(
  username: string,
) {
  const user = await provisionUser({
    username,
    password: VALID_PASSWORD,
    role: 'ORDER_OPERATOR',
  })

  const agent = request.agent(app)

  const loginResponse = await agent
    .post('/api/auth/login')
    .send({
      username: user.username,
      password: VALID_PASSWORD,
    })
    .expect(200)

  const csrfToken =
    loginResponse.body.csrfToken

  if (typeof csrfToken !== 'string') {
    throw new Error(
      'Expected a CSRF token',
    )
  }

  const sessionCookieValue =
    readSessionCookieValue(
      loginResponse.headers['set-cookie'],
    )

  await pool.query(
    'TRUNCATE audit_events RESTART IDENTITY',
  )

  return {
    user,
    agent,
    csrfToken,
    sessionCookieValue,
  }
}

async function expectNoStoredSession(): Promise<void> {
  const result = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM user_sessions
  `)

  expect(result.rows[0].count).toBe(0)
}

async function expectSessionRejectionEvent(
  requestId: string,
  reasonCode:
    SessionRejectionReasonCode,
  userAgent: string,
  forwardedIp: string,
  forbiddenValues: string[],
): Promise<void> {
  const result = await pool.query(
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
    [requestId],
  )

  expect(result.rows).toEqual([
    {
      schema_version: 2,
      category: 'SECURITY',
      action: 'SESSION_REJECTED',
      outcome: 'REJECTED',
      severity: 'WARN',
      actor_type: 'ANONYMOUS',
      actor_user_id: null,
      actor_username: null,
      actor_role: null,
      target_resource_type: 'SESSION',
      target_resource_id: 'current',
      request_id: requestId,
      operation:
        'AUTHENTICATE_REQUEST',
      http_method: 'GET',
      http_route: '/api/orders',
      http_status: 401,
      reason_code: reasonCode,
      error_code: null,
      source_ip: expect.any(String),
      user_agent: userAgent,
      context: {},
    },
  ])

  expect(result.rows[0].source_ip).not.toBe(
    forwardedIp,
  )

  const serializedEvent =
    JSON.stringify(result.rows)

  for (
    const forbiddenValue
    of forbiddenValues
  ) {
    expect(serializedEvent).not.toContain(
      forbiddenValue,
    )
  }
}

describe('Stored session rejection events', () => {
  beforeEach(async () => {
    loginRateLimiter.clear()

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
    await pool.end()
  })

  it('records an expired absolute session', async () => {
    const {
      agent,
      csrfToken,
      sessionCookieValue,
    } = await createAuthenticatedSession(
      'expired.operator',
    )

    const expiredAuthenticatedAt =
      Date.now() -
      SESSION_ABSOLUTE_TIMEOUT_MS -
      1_000

    const updateResult = await pool.query(
      `
        UPDATE user_sessions
        SET sess = jsonb_set(
          sess::jsonb,
          '{authenticatedAt}',
          to_jsonb($1::bigint),
          false
        )::json
      `,
      [expiredAuthenticatedAt],
    )

    expect(updateResult.rowCount).toBe(1)

    const forwardedIp = '203.0.113.60'
    const userAgent =
      'expired-session-test'

    const response = await agent
      .get('/api/orders')
      .set('user-agent', userAgent)
      .set(
        'x-forwarded-for',
        forwardedIp,
      )
      .expect(401)

    expect(response.body).toEqual(
      authenticationRequiredResponse,
    )

    expectSessionCookieCleared(
      response.headers['set-cookie'],
    )

    await expectNoStoredSession()

    const requestId =
      response.headers['x-request-id']

    expect(requestId).toEqual(
      expect.any(String),
    )

    if (typeof requestId !== 'string') {
      throw new Error(
        'Expected a request ID',
      )
    }

    await expectSessionRejectionEvent(
      requestId,
      'SESSION_EXPIRED',
      userAgent,
      forwardedIp,
      [
        VALID_PASSWORD,
        csrfToken,
        sessionCookieValue,
      ],
    )
  })

  it('records a disabled user session', async () => {
    const {
      user,
      agent,
      csrfToken,
      sessionCookieValue,
    } = await createAuthenticatedSession(
      'disabled.operator',
    )

    const updateResult = await pool.query(
      `
        UPDATE users
        SET status = 'DISABLED'
        WHERE id = $1
      `,
      [user.id],
    )

    expect(updateResult.rowCount).toBe(1)

    const forwardedIp = '203.0.113.61'
    const userAgent =
      'disabled-session-test'

    const response = await agent
      .get('/api/orders')
      .set('user-agent', userAgent)
      .set(
        'x-forwarded-for',
        forwardedIp,
      )
      .expect(401)

    expect(response.body).toEqual(
      authenticationRequiredResponse,
    )

    expectSessionCookieCleared(
      response.headers['set-cookie'],
    )

    await expectNoStoredSession()

    const requestId =
      response.headers['x-request-id']

    expect(requestId).toEqual(
      expect.any(String),
    )

    if (typeof requestId !== 'string') {
      throw new Error(
        'Expected a request ID',
      )
    }

    await expectSessionRejectionEvent(
      requestId,
      'USER_DISABLED',
      userAgent,
      forwardedIp,
      [
        VALID_PASSWORD,
        csrfToken,
        sessionCookieValue,
      ],
    )
  })

  it('records a session version mismatch', async () => {
    const {
      user,
      agent,
      csrfToken,
      sessionCookieValue,
    } = await createAuthenticatedSession(
      'versioned.operator',
    )

    const updateResult = await pool.query(
      `
        UPDATE users
        SET session_version =
          session_version + 1
        WHERE id = $1
      `,
      [user.id],
    )

    expect(updateResult.rowCount).toBe(1)

    const forwardedIp = '203.0.113.62'
    const userAgent =
      'session-version-test'

    const response = await agent
      .get('/api/orders')
      .set('user-agent', userAgent)
      .set(
        'x-forwarded-for',
        forwardedIp,
      )
      .expect(401)

    expect(response.body).toEqual(
      authenticationRequiredResponse,
    )

    expectSessionCookieCleared(
      response.headers['set-cookie'],
    )

    await expectNoStoredSession()

    const requestId =
      response.headers['x-request-id']

    expect(requestId).toEqual(
      expect.any(String),
    )

    if (typeof requestId !== 'string') {
      throw new Error(
        'Expected a request ID',
      )
    }

    await expectSessionRejectionEvent(
      requestId,
      'SESSION_VERSION_MISMATCH',
      userAgent,
      forwardedIp,
      [
        VALID_PASSWORD,
        csrfToken,
        sessionCookieValue,
      ],
    )
  })

  it('records a session whose user no longer exists', async () => {
    const {
      user,
      agent,
      csrfToken,
      sessionCookieValue,
    } = await createAuthenticatedSession(
      'removed.operator',
    )

    const deleteResult = await pool.query(
      `
        DELETE FROM users
        WHERE id = $1
      `,
      [user.id],
    )

    expect(deleteResult.rowCount).toBe(1)

    const forwardedIp = '203.0.113.63'
    const userAgent =
      'missing-session-user-test'

    const response = await agent
      .get('/api/orders')
      .set('user-agent', userAgent)
      .set(
        'x-forwarded-for',
        forwardedIp,
      )
      .expect(401)

    expect(response.body).toEqual(
      authenticationRequiredResponse,
    )

    expectSessionCookieCleared(
      response.headers['set-cookie'],
    )

    await expectNoStoredSession()

    const requestId =
      response.headers['x-request-id']

    expect(requestId).toEqual(
      expect.any(String),
    )

    if (typeof requestId !== 'string') {
      throw new Error(
        'Expected a request ID',
      )
    }

    await expectSessionRejectionEvent(
      requestId,
      'SESSION_USER_NOT_FOUND',
      userAgent,
      forwardedIp,
      [
        VALID_PASSWORD,
        csrfToken,
        sessionCookieValue,
      ],
    )
  })
})