import express from 'express'
import request from 'supertest'
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { 
    SESSION_IDLE_TIMEOUT_MS,
    sessionMiddleware } from '../src/auth/session.js'
import { pool } from '../src/db.js'

const sessionTestApp = express()

sessionTestApp.use(sessionMiddleware)

sessionTestApp.get(
  '/test/untouched-session',
  (_request, response) => {
    response.sendStatus(204)
  },
)

sessionTestApp.post(
  '/test/authenticated-session',
  (request, response) => {
    request.session.userId = 42
    request.session.sessionVersion = 3
    request.session.authenticatedAt = Date.now()

    response.sendStatus(204)
  },
)

describe('PostgreSQL session store', () => {
  beforeEach(async () => {
    await pool.query('TRUNCATE user_sessions')
  })

  afterAll(async () => {
    await pool.end()
  })

  it('does not persist an untouched anonymous session', async () => {
    const response = await request(sessionTestApp).get(
      '/test/untouched-session',
    )

    expect(response.status).toBe(204)
    expect(response.headers['set-cookie']).toBeUndefined()

    const result = await pool.query(
      'SELECT COUNT(*)::int AS count FROM user_sessions',
    )

    expect(result.rows[0].count).toBe(0)
  })

  it('persists authenticated session data in PostgreSQL', async () => {
    const response = await request(sessionTestApp).post(
        '/test/authenticated-session',
    )

    expect(response.status).toBe(204)
    const setCookieHeader = response.headers['set-cookie']
    const sessionCookie = Array.isArray(setCookieHeader)
        ? setCookieHeader[0]
        : setCookieHeader

    if (!sessionCookie) {
        throw new Error('Expected session cookie was not returned')
        }

    expect(sessionCookie).toContain('boutique.sid=')
    expect(sessionCookie).toContain('HttpOnly')
    expect(sessionCookie).toContain('SameSite=Strict')
    expect(sessionCookie).toContain('Path=/')
    expect(sessionCookie).not.toContain('; Secure')

    const result = await pool.query(
        `
        SELECT 
            sid, 
            sess,
            EXTRACT(
                EPOCH FROM (expire - LOCALTIMESTAMP)
            )::double precision AS remaining_seconds
        FROM user_sessions
        `,
    )

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].sid).toEqual(expect.any(String))
    expect(result.rows[0].sess).toMatchObject({
        userId: 42,
        sessionVersion: 3,
        authenticatedAt: expect.any(Number),
    })
    expect(result.rows[0].sess).not.toHaveProperty('role')
    expect(result.rows[0].sess).not.toHaveProperty('status')

    expect(result.rows[0].remaining_seconds).toBeGreaterThan(
        SESSION_IDLE_TIMEOUT_MS / 1000 - 10,
    )
    expect(result.rows[0].remaining_seconds).toBeLessThanOrEqual(
        SESSION_IDLE_TIMEOUT_MS / 1000 + 5,
    )
    })
})