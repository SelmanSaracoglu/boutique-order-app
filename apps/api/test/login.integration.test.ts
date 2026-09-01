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
})