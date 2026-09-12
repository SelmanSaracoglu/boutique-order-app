import request from 'supertest'
import {
    afterAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'
import type {
    AuditEventPage,
} from '../src/audit/auditReadRepository.js'
import type {
    UserRole,
} from '../src/auth/user.js'
import { app } from '../src/app.js'
import { pool } from '../src/db.js'
import {
    createAuthenticatedTestClient,
} from './authenticatedTestClient.js'

const AUDIT_FAILURE_CONSTRAINT =
    'audit_log_viewed_integration_failure'

const OCCURRED_AT =
    '2026-01-01T10:30:00.000Z'

const SENSITIVE_CONTEXT = {
    token: 'super-secret-token',
    cookie: 'super-secret-cookie',
    sessionId: 'super-secret-session',
    requestBody: {
        customerName: 'Sensitive Customer',
    },
    sql: 'SELECT sensitive_data',
    stack: 'Sensitive stack trace',
}

const NON_ADMIN_ROLES = [
    'ORDER_OPERATOR',
    'PAYMENT_OPERATOR',
    'FULFILLMENT_OPERATOR',
] as const satisfies readonly UserRole[]

const authenticationRequiredResponse = {
    error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required.',
    },
}

const forbiddenResponse = {
    error: {
        code: 'FORBIDDEN',
        message:
            'You do not have permission to perform this action.',
    },
}

function readRequestId(response: {
    headers: Record<string, unknown>
}): string {
    const requestId =
        response.headers['x-request-id']

    if (typeof requestId !== 'string') {
        throw new Error(
            'Expected a response request ID',
        )
    }

    return requestId
}

async function seedAuditEvents(): Promise<void> {
    await pool.query(
        `
      INSERT INTO audit_events (
        schema_version,
        occurred_at,
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
        source_ip,
        user_agent,
        context
      )
      SELECT
        2,
        $1::timestamptz,
        'SECURITY',
        'AUTH_LOGIN_SUCCEEDED',
        'SUCCESS',
        'INFO',
        'USER',
        1,
        E'admin\\r\\nspoofed',
        'ADMIN',
        'AUTHENTICATION',
        (
          'login-' ||
          sequence_number ||
          E'\\r\\nspoofed'
        ),
        (
          '00000000-0000-4000-8000-' ||
          lpad(
            sequence_number::text,
            12,
            '0'
          )
        )::uuid,
        'AUTH_LOGIN',
        'POST',
        '/api/auth/login',
        200,
        '192.0.2.1',
        'cookie=super-secret-cookie',
        $2::jsonb
      FROM generate_series(
        1,
        3
      ) AS sequence_number
    `,
        [
            OCCURRED_AT,
            JSON.stringify(SENSITIVE_CONTEXT),
        ],
    )
}

describe('Admin audit read API', () => {
    beforeEach(async () => {
        await pool.query(`
      ALTER TABLE audit_events
      DROP CONSTRAINT IF EXISTS
        ${AUDIT_FAILURE_CONSTRAINT}
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
      DROP CONSTRAINT IF EXISTS
        ${AUDIT_FAILURE_CONSTRAINT}
    `)

        await pool.end()
    })

    it('returns 401 without authentication', async () => {
        const response = await request(app)
            .get('/api/audit-events')
            .expect(401)

        expect(response.body).toEqual(
            authenticationRequiredResponse,
        )
    })

    it.each(NON_ADMIN_ROLES)('returns 403 for %s and records the denied audit target',
        async (role) => {
            const authenticatedClient =
                await createAuthenticatedTestClient(
                    role,
                )

            await pool.query(
                'TRUNCATE audit_events RESTART IDENTITY',
            )

            const response =
                await authenticatedClient
                    .get('/api/audit-events')
                    .expect(403)

            expect(response.body).toEqual(
                forbiddenResponse,
            )

            const requestId =
                readRequestId(response)

            const auditResult =
                await pool.query(
                    `
            SELECT
              action,
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
              context
            FROM audit_events
            WHERE request_id = $1
          `,
                    [requestId],
                )

            expect(auditResult.rows).toEqual([
                {
                    action:
                        'AUTHORIZATION_DENIED',
                    actor_user_id:
                        authenticatedClient.user.id,
                    actor_username:
                        authenticatedClient.user.username,
                    actor_role: role,
                    target_resource_type:
                        'AUDIT_LOG',
                    target_resource_id:
                        'audit-events',
                    request_id: requestId,
                    operation:
                        'AUTHORIZE_REQUEST',
                    http_method: 'GET',
                    http_route:
                        '/api/audit-events/',
                    http_status: 403,
                    reason_code: 'FORBIDDEN',
                    context: {
                        permission: 'AUDIT_READ',
                    },
                },
            ])
        },
    )

    it('returns deterministic pages and records one view event per page', async () => {
        const adminClient =
            await createAuthenticatedTestClient(
                'ADMIN',
            )

        await pool.query(
            'TRUNCATE audit_events RESTART IDENTITY',
        )

        await seedAuditEvents()

        const firstResponse =
            await adminClient
                .get('/api/audit-events')
                .query({
                    limit: '2',
                })
                .expect(200)

        const firstRequestId =
            readRequestId(firstResponse)

        const firstPage =
            firstResponse.body as
            AuditEventPage

        expect(
            firstPage.items.map(
                (event) => event.id,
            ),
        ).toEqual(['3', '2'])

        expect(firstPage.nextCursor).not.toBeNull()

        expect(firstPage.items[0]).toEqual({
            id: '3',
            occurredAt: OCCURRED_AT,
            category: 'SECURITY',
            action:
                'AUTH_LOGIN_SUCCEEDED',
            outcome: 'SUCCESS',
            severity: 'INFO',
            actor: {
                type: 'USER',
                username: 'admin spoofed',
                role: 'ADMIN',
            },
            target: {
                resourceType:
                    'AUTHENTICATION',
                resourceId:
                    'login-3 spoofed',
            },
            requestId:
                '00000000-0000-4000-8000-000000000003',
            detail: {
                operation: 'AUTH_LOGIN',
                http: {
                    method: 'POST',
                    route: '/api/auth/login',
                    status: 200,
                },
                reasonCode: null,
                errorCode: null,
                stateTransition: null,
                attributes: null,
            },
        })

        expect(
            firstPage.items[0],
        ).not.toHaveProperty('context')

        expect(
            firstPage.items[0],
        ).not.toHaveProperty('sourceIp')

        expect(
            firstPage.items[0],
        ).not.toHaveProperty('userAgent')

        expect(
            firstPage.items[0]?.actor,
        ).not.toHaveProperty('userId')

        if (firstPage.nextCursor === null) {
            throw new Error(
                'Expected a next-page cursor',
            )
        }

        const secondResponse =
            await adminClient
                .get('/api/audit-events')
                .query({
                    limit: '2',
                    cursor:
                        firstPage.nextCursor,
                })
                .expect(200)

        const secondRequestId =
            readRequestId(secondResponse)

        const secondPage =
            secondResponse.body as
            AuditEventPage

        expect(
            secondPage.items.map(
                (event) => event.id,
            ),
        ).toEqual(['1'])

        expect(
            secondPage.nextCursor,
        ).toBeNull()

        const serializedPages =
            JSON.stringify({
                firstPage,
                secondPage,
            })

        const sensitiveValues = [
            'super-secret-token',
            'super-secret-cookie',
            'super-secret-session',
            'Sensitive Customer',
            'SELECT sensitive_data',
            'Sensitive stack trace',
        ]

        for (
            const sensitiveValue of
            sensitiveValues
        ) {
            expect(
                serializedPages,
            ).not.toContain(sensitiveValue)
        }

        const viewedAuditResult =
            await pool.query(`
        SELECT
          category,
          action,
          outcome,
          severity,
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
          context
        FROM audit_events
        WHERE action =
          'AUDIT_LOG_VIEWED'
        ORDER BY id
      `)

        expect(
            viewedAuditResult.rows,
        ).toEqual([
            {
                category: 'SECURITY',
                action: 'AUDIT_LOG_VIEWED',
                outcome: 'SUCCESS',
                severity: 'INFO',
                actor_user_id:
                    adminClient.user.id,
                actor_username:
                    adminClient.user.username,
                actor_role: 'ADMIN',
                target_resource_type:
                    'AUDIT_LOG',
                target_resource_id:
                    'audit-events',
                request_id: firstRequestId,
                operation:
                    'VIEW_AUDIT_LOG',
                http_method: 'GET',
                http_route:
                    '/api/audit-events/',
                http_status: 200,
                context: {},
            },
            {
                category: 'SECURITY',
                action: 'AUDIT_LOG_VIEWED',
                outcome: 'SUCCESS',
                severity: 'INFO',
                actor_user_id:
                    adminClient.user.id,
                actor_username:
                    adminClient.user.username,
                actor_role: 'ADMIN',
                target_resource_type:
                    'AUDIT_LOG',
                target_resource_id:
                    'audit-events',
                request_id: secondRequestId,
                operation:
                    'VIEW_AUDIT_LOG',
                http_method: 'GET',
                http_route:
                    '/api/audit-events/',
                http_status: 200,
                context: {},
            },
        ])
    })

    it('returns 400 and audits an invalid query', async () => {
        const adminClient =
            await createAuthenticatedTestClient(
                'ADMIN',
            )

        await pool.query(
            'TRUNCATE audit_events RESTART IDENTITY',
        )

        const response =
            await adminClient
                .get('/api/audit-events')
                .query({
                    limit: '101',
                })
                .expect(400)

        expect(response.body).toEqual({
            error: {
                code: 'VALIDATION_ERROR',
                message:
                    'Audit query is invalid.',
            },
        })

        const requestId =
            readRequestId(response)

        const auditResult =
            await pool.query(
                `
          SELECT
            action,
            target_resource_type,
            target_resource_id,
            request_id,
            operation,
            http_status,
            reason_code,
            context
          FROM audit_events
          WHERE request_id = $1
        `,
                [requestId],
            )

        expect(auditResult.rows).toEqual([
            {
                action:
                    'REQUEST_VALIDATION_FAILED',
                target_resource_type:
                    'AUDIT_LOG',
                target_resource_id:
                    'audit-events',
                request_id: requestId,
                operation:
                    'VIEW_AUDIT_LOG',
                http_status: 400,
                reason_code:
                    'VALIDATION_ERROR',
                context: {},
            },
        ])
    })

    it('fails closed when the view event cannot be persisted', async () => {
        const adminClient =
            await createAuthenticatedTestClient(
                'ADMIN',
            )

        await pool.query(
            'TRUNCATE audit_events RESTART IDENTITY',
        )

        await seedAuditEvents()

        await pool.query(`
      ALTER TABLE audit_events
      ADD CONSTRAINT
        ${AUDIT_FAILURE_CONSTRAINT}
      CHECK (
        action <> 'AUDIT_LOG_VIEWED'
      )
    `)

        const stderrWriteSpy = vi
            .spyOn(process.stderr, 'write')
            .mockReturnValue(true)

        try {
            const response =
                await adminClient
                    .get('/api/audit-events')
                    .expect(500)

            const requestId =
                readRequestId(response)

            expect(response.body).toEqual({
                error: {
                    code: 'INTERNAL_ERROR',
                    message:
                        'An unexpected error occurred.',
                    requestId,
                },
            })

            expect(
                JSON.stringify(response.body),
            ).not.toContain(
                'super-secret',
            )

            expect(
                JSON.stringify(response.body),
            ).not.toContain(
                AUDIT_FAILURE_CONSTRAINT,
            )

            const viewedResult =
                await pool.query(`
          SELECT COUNT(*)::int AS count
          FROM audit_events
          WHERE action =
            'AUDIT_LOG_VIEWED'
        `)

            expect(
                viewedResult.rows[0].count,
            ).toBe(0)

            const applicationErrorResult =
                await pool.query(
                    `
            SELECT
              action,
              target_resource_type,
              target_resource_id,
              request_id,
              operation,
              http_method,
              http_route,
              http_status,
              context
            FROM audit_events
            WHERE action =
              'APPLICATION_ERROR'
          `,
                )

            expect(
                applicationErrorResult.rows,
            ).toEqual([
                {
                    action:
                        'APPLICATION_ERROR',
                    target_resource_type:
                        'AUDIT_LOG',
                    target_resource_id:
                        'audit-events',
                    request_id: requestId,
                    operation:
                        'VIEW_AUDIT_LOG',
                    http_method: 'GET',
                    http_route:
                        '/api/audit-events/',
                    http_status: 500,
                    context: {},
                },
            ])

            const stderrOutput =
                stderrWriteSpy.mock.calls
                    .map((call) =>
                        String(call[0]),
                    )
                    .join('')

            expect(
                stderrOutput,
            ).not.toContain(
                AUDIT_FAILURE_CONSTRAINT,
            )

            expect(
                stderrOutput,
            ).not.toContain(
                'super-secret',
            )
        } finally {
            stderrWriteSpy.mockRestore()

            await pool.query(`
        ALTER TABLE audit_events
        DROP CONSTRAINT IF EXISTS
          ${AUDIT_FAILURE_CONSTRAINT}
      `)
        }
    })

    it('applies combined filters and records one non-recursive view event', async () => {
    const adminClient =
      await createAuthenticatedTestClient(
        'ADMIN',
      )

    await pool.query(
      'TRUNCATE audit_events RESTART IDENTITY',
    )

    await pool.query(`
      INSERT INTO audit_events (
        schema_version,
        occurred_at,
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
        previous_order_status,
        new_order_status,
        previous_payment_status,
        new_payment_status,
        context
      )
      VALUES
        (
          2,
          '2026-03-10T10:00:00.000Z',
          'PRODUCT',
          'ORDER_CANCELLED',
          'REJECTED',
          'WARN',
          'USER',
          1,
          'admin',
          'ADMIN',
          'ORDER',
          '42',
          '00000000-0000-4000-8000-000000000042',
          'UPDATE_ORDER_STATUS',
          'PATCH',
          '/api/orders/:orderId/status',
          409,
          'INVALID_STATUS_TRANSITION',
          'NEW',
          'CANCELLED',
          'AWAITING_PAYMENT',
          'AWAITING_PAYMENT',
          '{}'::jsonb
        ),
        (
          2,
          '2026-03-10T10:00:00.000Z',
          'PRODUCT',
          'ORDER_CANCELLED',
          'REJECTED',
          'WARN',
          'USER',
          1,
          'admin',
          'ADMIN',
          'ORDER',
          '43',
          '00000000-0000-4000-8000-000000000043',
          'UPDATE_ORDER_STATUS',
          'PATCH',
          '/api/orders/:orderId/status',
          409,
          'INVALID_STATUS_TRANSITION',
          'NEW',
          'CANCELLED',
          'AWAITING_PAYMENT',
          'AWAITING_PAYMENT',
          '{}'::jsonb
        )
    `)

    const response =
      await adminClient
        .get('/api/audit-events')
        .query({
          category: 'PRODUCT',
          outcome: 'REJECTED',
          from:
            '2026-03-10T10:00:00.000Z',
          to:
            '2026-03-10T10:00:00.000Z',
          username: 'ADMIN',
          orderId: '42',
          requestId:
            '00000000-0000-4000-8000-000000000042',
        })
        .expect(200)

    const requestId =
      readRequestId(response)

    const page =
      response.body as AuditEventPage

    expect(page.nextCursor).toBeNull()

    expect(page.items).toEqual([
      {
        id: '1',
        occurredAt:
          '2026-03-10T10:00:00.000Z',
        category: 'PRODUCT',
        action: 'ORDER_CANCELLED',
        outcome: 'REJECTED',
        severity: 'WARN',
        actor: {
          type: 'USER',
          username: 'admin',
          role: 'ADMIN',
        },
        target: {
          resourceType: 'ORDER',
          resourceId: '42',
        },
        requestId:
          '00000000-0000-4000-8000-000000000042',
        detail: {
          operation:
            'UPDATE_ORDER_STATUS',
          http: {
            method: 'PATCH',
            route:
              '/api/orders/:orderId/status',
            status: 409,
          },
          reasonCode:
            'INVALID_STATUS_TRANSITION',
          errorCode: null,
          stateTransition: {
            previousOrderStatus: 'NEW',
            newOrderStatus: 'CANCELLED',
            previousPaymentStatus:
              'AWAITING_PAYMENT',
            newPaymentStatus:
              'AWAITING_PAYMENT',
          },
          attributes: null,
        },
      },
    ])

    expect(
      page.items.map(
        (event) => event.action,
      ),
    ).not.toContain('AUDIT_LOG_VIEWED')

    const viewedResult =
      await pool.query(
        `
          SELECT
            request_id,
            action,
            target_resource_type,
            target_resource_id
          FROM audit_events
          WHERE action =
            'AUDIT_LOG_VIEWED'
        `,
      )

    expect(viewedResult.rows).toEqual([
      {
        request_id: requestId,
        action: 'AUDIT_LOG_VIEWED',
        target_resource_type:
          'AUDIT_LOG',
        target_resource_id:
          'audit-events',
      },
    ])
  })
})