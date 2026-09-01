import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import { provisionUser } from '../src/auth/provisionUser.js'
import { pool } from '../src/db.js'

const VALID_PASSWORD = 'a memorable test passphrase'

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

describe('Login API', () => {
  beforeEach(async () => {
    await pool.query(
      `
        TRUNCATE user_sessions, users
        RESTART IDENTITY CASCADE
      `,
    )
  })

  afterAll(async () => {
    await pool.end()
  })

  it('authenticates an active user and establishes a server-side session', async () => {
    const user = await provisionUser({
      username: 'order.operator',
      password: VALID_PASSWORD,
      role: 'ORDER_OPERATOR',
    })

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'order.operator',
        password: VALID_PASSWORD,
      })
      .expect(200)

    expect(response.body).toEqual({
      user: {
        id: user.id,
        username: 'order.operator',
        role: 'ORDER_OPERATOR',
      },
      csrfToken: expect.any(String),
    })

    expect(response.body.csrfToken).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    )

    const cookies = response.headers['set-cookie']

    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringContaining('boutique.sid='),
      ]),
    )

    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringContaining('HttpOnly'),
      ]),
    )

    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringContaining('SameSite=Strict'),
      ]),
    )

    const sessionResult = await pool.query(
      `
        SELECT sess
        FROM user_sessions
      `,
    )

    expect(sessionResult.rows).toHaveLength(1)
    expect(sessionResult.rows[0].sess).toMatchObject({
      userId: user.id,
      sessionVersion: 1,
      csrfToken: response.body.csrfToken,
    })
    expect(sessionResult.rows[0].sess.authenticatedAt).toEqual(
      expect.any(Number),
    )
  })
  it('returns the same generic response for an unknown user and a wrong password', async () => {
    await provisionUser({
        username: 'order.operator',
        password: VALID_PASSWORD,
        role: 'ORDER_OPERATOR',
    })

    const wrongPasswordResponse = await request(app)
        .post('/api/auth/login')
        .send({
        username: 'order.operator',
        password: 'a completely wrong password',
        })

    const unknownUserResponse = await request(app)
        .post('/api/auth/login')
        .send({
        username: 'unknown.operator',
        password: 'a completely wrong password',
        })

    const expectedError = {
        error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password.',
        },
    }

    expect(wrongPasswordResponse.status).toBe(401)
    expect(unknownUserResponse.status).toBe(401)

    expect(wrongPasswordResponse.body).toEqual(expectedError)
    expect(unknownUserResponse.body).toEqual(expectedError)

    expect(wrongPasswordResponse.headers['set-cookie']).toBeUndefined()
    expect(unknownUserResponse.headers['set-cookie']).toBeUndefined()

    const sessionResult = await pool.query(
        'SELECT COUNT(*)::int AS count FROM user_sessions',
    )

    expect(sessionResult.rows[0].count).toBe(0)
    })

  it('rejects a disabled user without revealing the account status', async () => {
    const user = await provisionUser({
        username: 'disabled.operator',
        password: VALID_PASSWORD,
        role: 'ORDER_OPERATOR',
    })

    await pool.query(
        `
        UPDATE users
        SET status = 'DISABLED'
        WHERE id = $1
        `,
        [user.id],
    )

    const response = await request(app)
        .post('/api/auth/login')
        .send({
        username: 'disabled.operator',
        password: VALID_PASSWORD,
        })
        .expect(401)

    expect(response.body).toEqual({
        error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password.',
        },
    })

    expect(response.headers['set-cookie']).toBeUndefined()

    const sessionResult = await pool.query(
        'SELECT COUNT(*)::int AS count FROM user_sessions',
    )

    expect(sessionResult.rows[0].count).toBe(0)
    })

  it('regenerates the session identifier when the client logs in again', async () => {
    await provisionUser({
        username: 'order.operator',
        password: VALID_PASSWORD,
        role: 'ORDER_OPERATOR',
    })

    const agent = request.agent(app)

    const firstLoginResponse = await agent
        .post('/api/auth/login')
        .send({
        username: 'order.operator',
        password: VALID_PASSWORD,
        })
        .expect(200)

    const firstSessionCookie = findSessionCookie(
        firstLoginResponse.headers['set-cookie'],
        )

    expect(firstSessionCookie).toEqual(expect.any(String))

    const secondLoginResponse = await agent
        .post('/api/auth/login')
        .send({
        username: 'order.operator',
        password: VALID_PASSWORD,
        })
        .expect(200)

    const secondSessionCookie = findSessionCookie(
        secondLoginResponse.headers['set-cookie'],
    )

    expect(secondSessionCookie).toEqual(expect.any(String))
    expect(secondSessionCookie).not.toBe(firstSessionCookie)

    const sessionResult = await pool.query(
        'SELECT COUNT(*)::int AS count FROM user_sessions',
    )

    expect(sessionResult.rows[0].count).toBe(1)
    })

    it('restores the authenticated user from the server-side session', async () => {
  const user = await provisionUser({
    username: 'order.operator',
    password: VALID_PASSWORD,
    role: 'ORDER_OPERATOR',
  })

  const agent = request.agent(app)

  const loginResponse = await agent
    .post('/api/auth/login')
    .send({
      username: 'order.operator',
      password: VALID_PASSWORD,
    })
    .expect(200)

  const sessionResponse = await agent
    .get('/api/auth/session')
    .expect(200)

  expect(sessionResponse.body).toEqual({
    user: {
      id: user.id,
      username: 'order.operator',
      role: 'ORDER_OPERATOR',
    },
    csrfToken: loginResponse.body.csrfToken,
  })
})
it('rejects a session request from an unauthenticated client', async () => {
  const response = await request(app)
    .get('/api/auth/session')
    .expect(401)

  expect(response.body).toEqual({
    error: {
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required.',
    },
  })

  expect(response.headers['set-cookie']).toBeUndefined()

  const sessionResult = await pool.query(
    'SELECT COUNT(*)::int AS count FROM user_sessions',
  )

  expect(sessionResult.rows[0].count).toBe(0)
})
it('invalidates an existing session when the user is disabled', async () => {
  const user = await provisionUser({
    username: 'order.operator',
    password: VALID_PASSWORD,
    role: 'ORDER_OPERATOR',
  })

  const agent = request.agent(app)

  await agent
    .post('/api/auth/login')
    .send({
      username: 'order.operator',
      password: VALID_PASSWORD,
    })
    .expect(200)

  await pool.query(
    `
      UPDATE users
      SET status = 'DISABLED'
      WHERE id = $1
    `,
    [user.id],
  )

  const response = await agent
    .get('/api/auth/session')
    .expect(401)

  expect(response.body).toEqual({
    error: {
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required.',
    },
  })

  const sessionResult = await pool.query(
    'SELECT COUNT(*)::int AS count FROM user_sessions',
  )

  expect(sessionResult.rows[0].count).toBe(0)
})
it('invalidates an existing session when the session version changes', async () => {
  const user = await provisionUser({
    username: 'order.operator',
    password: VALID_PASSWORD,
    role: 'ORDER_OPERATOR',
  })

  const agent = request.agent(app)

  await agent
    .post('/api/auth/login')
    .send({
      username: 'order.operator',
      password: VALID_PASSWORD,
    })
    .expect(200)

  await pool.query(
    `
      UPDATE users
      SET session_version = session_version + 1
      WHERE id = $1
    `,
    [user.id],
  )

  const response = await agent
    .get('/api/auth/session')
    .expect(401)

  expect(response.body).toEqual({
    error: {
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required.',
    },
  })

  const sessionResult = await pool.query(
    'SELECT COUNT(*)::int AS count FROM user_sessions',
  )

  expect(sessionResult.rows[0].count).toBe(0)
})
it('returns the current database role instead of the role from login time', async () => {
  const user = await provisionUser({
    username: 'order.operator',
    password: VALID_PASSWORD,
    role: 'ORDER_OPERATOR',
  })

  const agent = request.agent(app)

  await agent
    .post('/api/auth/login')
    .send({
      username: 'order.operator',
      password: VALID_PASSWORD,
    })
    .expect(200)

  await pool.query(
    `
      UPDATE users
      SET role = 'PAYMENT_OPERATOR'
      WHERE id = $1
    `,
    [user.id],
  )

  const response = await agent
    .get('/api/auth/session')
    .expect(200)

  expect(response.body.user).toEqual({
    id: user.id,
    username: 'order.operator',
    role: 'PAYMENT_OPERATOR',
  })
})

it('destroys the server-side session and clears the cookie on logout', async () => {
  await provisionUser({
    username: 'order.operator',
    password: VALID_PASSWORD,
    role: 'ORDER_OPERATOR',
  })

  const agent = request.agent(app)

  const loginResponse = await agent
    .post('/api/auth/login')
    .send({
      username: 'order.operator',
      password: VALID_PASSWORD,
    })
    .expect(200)

  const logoutResponse = await agent
    .post('/api/auth/logout')
    .set('x-csrf-token', loginResponse.body.csrfToken)
    .expect(204)

  expect(logoutResponse.text).toBe('')

  const clearedSessionCookie = findSessionCookie(
    logoutResponse.headers['set-cookie'],
  )

  expect(clearedSessionCookie).toEqual(expect.any(String))
  expect(clearedSessionCookie).toContain('boutique.sid=;')
  expect(clearedSessionCookie).toContain(
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  )

  const sessionResult = await pool.query(
    'SELECT COUNT(*)::int AS count FROM user_sessions',
  )

  expect(sessionResult.rows[0].count).toBe(0)

  await agent
    .get('/api/auth/session')
    .expect(401)
})
it('rejects logout when the CSRF token is missing or incorrect', async () => {
  await provisionUser({
    username: 'order.operator',
    password: VALID_PASSWORD,
    role: 'ORDER_OPERATOR',
  })

  const agent = request.agent(app)

  const loginResponse = await agent
    .post('/api/auth/login')
    .send({
      username: 'order.operator',
      password: VALID_PASSWORD,
    })
    .expect(200)

  const expectedError = {
    error: {
      code: 'INVALID_CSRF_TOKEN',
      message: 'Invalid CSRF token.',
    },
  }

  const missingTokenResponse = await agent
    .post('/api/auth/logout')
    .expect(403)

  const incorrectTokenResponse = await agent
    .post('/api/auth/logout')
    .set('x-csrf-token', 'A'.repeat(43))
    .expect(403)

  expect(missingTokenResponse.body).toEqual(expectedError)
  expect(incorrectTokenResponse.body).toEqual(expectedError)

  const sessionResult = await pool.query(
    'SELECT COUNT(*)::int AS count FROM user_sessions',
  )

  expect(sessionResult.rows[0].count).toBe(1)

  const sessionResponse = await agent
    .get('/api/auth/session')
    .expect(200)

  expect(sessionResponse.body.csrfToken).toBe(
    loginResponse.body.csrfToken,
  )
})
})