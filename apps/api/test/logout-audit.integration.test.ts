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
    loginRateLimiter,
} from '../src/auth/loginRateLimiter.js'
import { provisionUser } from '../src/auth/provisionUser.js'
import { pool } from '../src/db.js'

const VALID_PASSWORD =
    'a memorable test passphrase'

const AUDIT_FAILURE_CONSTRAINT =
    'logout_audit_test_failure'

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

describe('Logout audit events', () => {
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

    it('records a successful logout after invalidating the session', async () => {
        const user = await provisionUser({
            username: 'order.operator',
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

        const sessionCookieValue =
            readSessionCookieValue(
                loginResponse.headers['set-cookie'],
            )

        await pool.query(
            'TRUNCATE audit_events RESTART IDENTITY',
        )

        const logoutResponse = await agent
            .post('/api/auth/logout')
            .set(
                'x-csrf-token',
                loginResponse.body.csrfToken,
            )
            .set(
                'user-agent',
                'logout-audit-integration-test',
            )
            .set(
                'x-forwarded-for',
                '203.0.113.30',
            )
            .expect(204)

        expect(logoutResponse.text).toBe('')

        expect(
            logoutResponse.headers['x-request-id'],
        ).toEqual(expect.any(String))

        const clearedCookie = findSessionCookie(
            logoutResponse.headers['set-cookie'],
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

        const auditResult = await pool.query(`
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
      WHERE action = 'AUTH_LOGOUT_SUCCEEDED'
    `)

        expect(auditResult.rows).toEqual([
            {
                schema_version: 2,
                category: 'SECURITY',
                action: 'AUTH_LOGOUT_SUCCEEDED',
                outcome: 'SUCCESS',
                severity: 'INFO',
                actor_type: 'USER',
                actor_user_id: user.id,
                actor_username: user.username,
                actor_role: user.role,
                target_resource_type: 'SESSION',
                target_resource_id: 'current',
                request_id:
                    logoutResponse.headers[
                    'x-request-id'
                    ],
                operation: 'AUTH_LOGOUT',
                http_method: 'POST',
                http_route: '/api/auth/logout',
                http_status: 204,
                reason_code: null,
                error_code: null,
                source_ip: expect.any(String),
                user_agent:
                    'logout-audit-integration-test',
                context: {},
            },
        ])

        expect(
            auditResult.rows[0].source_ip,
        ).not.toBe('203.0.113.30')

        const serializedEvent = JSON.stringify(
            auditResult.rows,
        )

        expect(serializedEvent).not.toContain(
            VALID_PASSWORD,
        )

        expect(serializedEvent).not.toContain(
            loginResponse.body.csrfToken,
        )

        expect(serializedEvent).not.toContain(
            sessionCookieValue,
        )
    })

    it('keeps the session invalidated when audit persistence fails', async () => {
        const user = await provisionUser({
            username: 'order.operator',
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

        const sessionCookieValue =
            readSessionCookieValue(
                loginResponse.headers['set-cookie'],
            )

        await pool.query(
            'TRUNCATE audit_events RESTART IDENTITY',
        )

        await pool.query(`
      ALTER TABLE audit_events
      ADD CONSTRAINT ${AUDIT_FAILURE_CONSTRAINT}
      CHECK (
        action <> 'AUTH_LOGOUT_SUCCEEDED'
      )
    `)

        const stderrWriteSpy = vi
            .spyOn(process.stderr, 'write')
            .mockReturnValue(true)

        try {
            const logoutResponse = await agent
                .post('/api/auth/logout')
                .set(
                    'x-csrf-token',
                    loginResponse.body.csrfToken,
                )
                .set(
                    'user-agent',
                    'logout-audit-fallback-test',
                )
                .set(
                    'x-forwarded-for',
                    '198.51.100.40',
                )
                .expect(204)

            expect(logoutResponse.text).toBe('')

            const clearedCookie =
                findSessionCookie(
                    logoutResponse.headers[
                    'set-cookie'
                    ],
                )

            expect(clearedCookie).toEqual(
                expect.any(String),
            )

            expect(clearedCookie).toContain(
                'boutique.sid=;',
            )

            const sessionResult =
                await pool.query(`
          SELECT COUNT(*)::int AS count
          FROM user_sessions
        `)

            expect(
                sessionResult.rows[0].count,
            ).toBe(0)

            const auditResult =
                await pool.query(`
          SELECT COUNT(*)::int AS count
          FROM audit_events
          WHERE action =
            'AUTH_LOGOUT_SUCCEEDED'
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
                    logoutResponse.headers[
                    'x-request-id'
                    ],
                eventType:
                    'AUDIT_PERSISTENCE_FAILED',
                failureCode:
                    'AUDIT_PERSISTENCE_FAILED',
                auditEvent: {
                    schemaVersion: 2,
                    category: 'SECURITY',
                    action:
                        'AUTH_LOGOUT_SUCCEEDED',
                    outcome: 'SUCCESS',
                    severity: 'INFO',
                    operation: 'AUTH_LOGOUT',
                    method: 'POST',
                    route: '/api/auth/logout',
                    status: 204,
                    actor: {
                        type: 'USER',
                        userId: user.id,
                        username: user.username,
                        role: user.role,
                    },
                    target: {
                        resourceType: 'SESSION',
                        resourceId: 'current',
                    },
                    reasonCode: null,
                    sourceIp: expect.any(String),
                    userAgent:
                        'logout-audit-fallback-test',
                    context: {},
                },
            })

            expect(
                fallbackRecord.auditEvent.sourceIp,
            ).not.toBe('198.51.100.40')

            expect(fallbackOutput).not.toContain(
                VALID_PASSWORD,
            )

            expect(fallbackOutput).not.toContain(
                loginResponse.body.csrfToken,
            )

            expect(fallbackOutput).not.toContain(
                sessionCookieValue,
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