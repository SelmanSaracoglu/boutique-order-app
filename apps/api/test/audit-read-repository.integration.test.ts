import { afterAll, beforeEach, describe, expect, it, } from 'vitest'
import { listAuditEvents, type AuditEventPage, } from '../src/audit/auditReadRepository.js'
import { parseAuditReadQuery, } from '../src/audit/auditReadQuery.js'
import { pool } from '../src/db.js'

const OCCURRED_AT =
    '2026-09-12T10:30:00.000Z'

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

async function seedFilterAuditEvents(): Promise<void> {
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
      error_code,
      context
    )
    VALUES
      (
        2,
        '2026-01-01T10:00:00.000Z',
        'PRODUCT',
        'ORDER_CREATED',
        'SUCCESS',
        'INFO',
        'USER',
        1,
        'admin',
        'ADMIN',
        'ORDER',
        '41',
        '00000000-0000-4000-8000-000000000001',
        'CREATE_ORDER',
        'POST',
        '/api/orders',
        201,
        NULL,
        NULL,
        '{}'::jsonb
      ),
      (
        2,
        '2026-01-02T10:00:00.000Z',
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
        '00000000-0000-4000-8000-000000000002',
        'UPDATE_ORDER_STATUS',
        'PATCH',
        '/api/orders/:orderId/status',
        409,
        'INVALID_STATUS_TRANSITION',
        NULL,
        '{}'::jsonb
      ),
      (
        2,
        '2026-01-03T10:00:00.000Z',
        'SECURITY',
        'AUTHORIZATION_DENIED',
        'REJECTED',
        'WARN',
        'USER',
        2,
        'order.operator',
        'ORDER_OPERATOR',
        'AUDIT_LOG',
        'audit-events',
        '00000000-0000-4000-8000-000000000003',
        'AUTHORIZE_REQUEST',
        'GET',
        '/api/audit-events/',
        403,
        'FORBIDDEN',
        NULL,
        '{}'::jsonb
      ),
      (
        2,
        '2026-01-04T10:00:00.000Z',
        'ERROR',
        'APPLICATION_ERROR',
        'FAILURE',
        'ERROR',
        'USER',
        1,
        'admin',
        'ADMIN',
        'APPLICATION',
        'api',
        '00000000-0000-4000-8000-000000000004',
        'HANDLE_API_REQUEST',
        'GET',
        '/api/test',
        500,
        NULL,
        'UNEXPECTED_ERROR',
        '{}'::jsonb
      ),
      (
        1,
        '2026-01-05T10:00:00.000Z',
        'SYSTEM',
        'AUDIT_LOGGING_STARTED',
        'SUCCESS',
        'INFO',
        'SYSTEM',
        NULL,
        NULL,
        NULL,
        'AUDIT_LOG',
        'product-audit',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        '{}'::jsonb
      )
  `)
}

async function listWithQuery(
    input: unknown,
): Promise<AuditEventPage> {
    const query = parseAuditReadQuery(input)

    if (query === null) {
        throw new Error(
            'Expected a valid audit read query',
        )
    }

    const client = await pool.connect()

    try {
        return await listAuditEvents(
            client,
            query,
        )
    } finally {
        client.release()
    }
}

describe('Audit read repository', () => {
    beforeEach(async () => {
        await pool.query(
            'TRUNCATE audit_events RESTART IDENTITY',
        )

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
        VALUES
          (
            2,
            $1,
            'SECURITY',
            'AUDIT_LOG_VIEWED',
            'SUCCESS',
            'INFO',
            'USER',
            1,
            E'admin\\r\\nspoofed',
            'ADMIN',
            'AUDIT_LOG',
            E'audit-events-1\\r\\nspoofed',
            '00000000-0000-4000-8000-000000000001',
            'VIEW_AUDIT_LOG',
            'GET',
            '/api/audit-events/',
            200,
            '192.0.2.1',
            'cookie=super-secret-cookie',
            $2::jsonb
          ),
          (
            2,
            $1,
            'SECURITY',
            'AUDIT_LOG_VIEWED',
            'SUCCESS',
            'INFO',
            'USER',
            1,
            E'admin\\r\\nspoofed',
            'ADMIN',
            'AUDIT_LOG',
            E'audit-events-2\\r\\nspoofed',
            '00000000-0000-4000-8000-000000000002',
            'VIEW_AUDIT_LOG',
            'GET',
            '/api/audit-events/',
            200,
            '192.0.2.2',
            'cookie=super-secret-cookie',
            $2::jsonb
          ),
          (
            2,
            $1,
            'SECURITY',
            'AUDIT_LOG_VIEWED',
            'SUCCESS',
            'INFO',
            'USER',
            1,
            E'admin\\r\\nspoofed',
            'ADMIN',
            'AUDIT_LOG',
            E'audit-events-3\\r\\nspoofed',
            '00000000-0000-4000-8000-000000000003',
            'VIEW_AUDIT_LOG',
            'GET',
            '/api/audit-events/',
            200,
            '192.0.2.3',
            'cookie=super-secret-cookie',
            $2::jsonb
          )
      `,
            [
                OCCURRED_AT,
                JSON.stringify(SENSITIVE_CONTEXT),
            ],
        )
    })

    afterAll(async () => {
        await pool.end()
    })

    it('returns deterministic cursor pages without sensitive fields', async () => {
        const client = await pool.connect()

        try {
            const firstQuery =
                parseAuditReadQuery({
                    limit: '2',
                })

            if (firstQuery === null) {
                throw new Error(
                    'Expected a valid first-page query',
                )
            }

            const firstPage =
                await listAuditEvents(
                    client,
                    firstQuery,
                )

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
                action: 'AUDIT_LOG_VIEWED',
                outcome: 'SUCCESS',
                severity: 'INFO',
                actor: {
                    type: 'USER',
                    username: 'admin spoofed',
                    role: 'ADMIN',
                },
                target: {
                    resourceType: 'AUDIT_LOG',
                    resourceId:
                        'audit-events-3 spoofed',
                },
                requestId:
                    '00000000-0000-4000-8000-000000000003',
                detail: {
                    operation: 'VIEW_AUDIT_LOG',
                    http: {
                        method: 'GET',
                        route:
                            '/api/audit-events/',
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

            const serializedFirstPage =
                JSON.stringify(firstPage)

            expect(
                serializedFirstPage,
            ).not.toContain('super-secret')

            expect(
                serializedFirstPage,
            ).not.toContain('Sensitive Customer')

            expect(
                serializedFirstPage,
            ).not.toContain('SELECT sensitive_data')

            expect(
                serializedFirstPage,
            ).not.toContain('Sensitive stack trace')

            if (firstPage.nextCursor === null) {
                throw new Error(
                    'Expected a next-page cursor',
                )
            }

            const secondQuery =
                parseAuditReadQuery({
                    limit: '2',
                    cursor: firstPage.nextCursor,
                })

            if (secondQuery === null) {
                throw new Error(
                    'Expected a valid second-page query',
                )
            }

            const secondPage =
                await listAuditEvents(
                    client,
                    secondQuery,
                )

            expect(
                secondPage.items.map(
                    (event) => event.id,
                ),
            ).toEqual(['1'])

            expect(
                secondPage.nextCursor,
            ).toBeNull()
        } finally {
            client.release()
        }
    })

    it('includes every category when the category filter is omitted', async () => {
        await pool.query(
            'TRUNCATE audit_events RESTART IDENTITY',
        )

        await seedFilterAuditEvents()

        const page = await listWithQuery({
            limit: '10',
        })

        expect(
            page.items.map(
                (event) => event.category,
            ),
        ).toEqual([
            'SYSTEM',
            'ERROR',
            'SECURITY',
            'PRODUCT',
            'PRODUCT',
        ])
    })

    it('combines category, outcome, and inclusive date filters', async () => {
        await pool.query(
            'TRUNCATE audit_events RESTART IDENTITY',
        )

        await seedFilterAuditEvents()

        const page = await listWithQuery({
            category: 'PRODUCT',
            outcome: 'REJECTED',
            from:
                '2026-01-02T10:00:00.000Z',
            to:
                '2026-01-02T10:00:00.000Z',
        })

        expect(
            page.items.map(
                (event) => event.id,
            ),
        ).toEqual(['2'])

        expect(page.items[0]).toMatchObject({
            category: 'PRODUCT',
            action: 'ORDER_CANCELLED',
            outcome: 'REJECTED',
            target: {
                resourceType: 'ORDER',
                resourceId: '42',
            },
        })
    })

    it.each([
        {
            label: 'normalized username',
            query: {
                username: 'ADMIN',
            },
            expectedIds: ['4', '2', '1'],
        },
        {
            label: 'order ID',
            query: {
                orderId: '42',
            },
            expectedIds: ['2'],
        },
        {
            label: 'request ID',
            query: {
                requestId:
                    '00000000-0000-4000-8000-000000000003',
            },
            expectedIds: ['3'],
        },
    ])('filters by $label using exact target matching',
        async ({
            query,
            expectedIds,
        }) => {
            await pool.query(
                'TRUNCATE audit_events RESTART IDENTITY',
            )

            await seedFilterAuditEvents()

            const page =
                await listWithQuery(query)

            expect(
                page.items.map(
                    (event) => event.id,
                ),
            ).toEqual(expectedIds)
        },
    )

    it('returns only action-specific allowlisted detail fields', async () => {
        await pool.query(
            'TRUNCATE audit_events RESTART IDENTITY',
        )

        const context = {
            ...SENSITIVE_CONTEXT,
            orderSource: 'instagram',
            itemCount: 2,
            paymentMethod: 'PAYPAL',
            permission: 'AUDIT_READ',
            attemptedUsername:
                'should-not-be-exposed',
        }

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
          previous_order_status,
          new_order_status,
          previous_payment_status,
          new_payment_status,
          context
        )
        VALUES (
          2,
          '2026-02-01T10:00:00.000Z',
          'PRODUCT',
          'ORDER_CREATED',
          'SUCCESS',
          'INFO',
          'USER',
          1,
          'admin',
          'ADMIN',
          'ORDER',
          '99',
          '00000000-0000-4000-8000-000000000099',
          'CREATE_ORDER',
          'POST',
          '/api/orders',
          201,
          '192.0.2.99',
          'cookie=super-secret-cookie',
          NULL,
          'NEW',
          NULL,
          'AWAITING_PAYMENT',
          $1::jsonb
        )
      `,
            [JSON.stringify(context)],
        )

        const page = await listWithQuery({
            limit: '10',
        })

        expect(page.items).toHaveLength(1)

        expect(page.items[0]?.detail).toEqual({
            operation: 'CREATE_ORDER',
            http: {
                method: 'POST',
                route: '/api/orders',
                status: 201,
            },
            reasonCode: null,
            errorCode: null,
            stateTransition: {
                previousOrderStatus: null,
                newOrderStatus: 'NEW',
                previousPaymentStatus: null,
                newPaymentStatus:
                    'AWAITING_PAYMENT',
            },
            attributes: {
                orderSource: 'instagram',
                itemCount: 2,
                paymentMethod: null,
                permission: null,
                attemptedUsername: null,
            },
        })

        const serializedPage =
            JSON.stringify(page)

        const forbiddenValues = [
            'super-secret-token',
            'super-secret-cookie',
            'super-secret-session',
            'Sensitive Customer',
            'SELECT sensitive_data',
            'Sensitive stack trace',
            'PAYPAL',
            'AUDIT_READ',
            'should-not-be-exposed',
        ]

        for (
            const forbiddenValue of
            forbiddenValues
        ) {
            expect(
                serializedPage,
            ).not.toContain(forbiddenValue)
        }
    })

    it('keeps filters applied across cursor pages', async () => {
        await pool.query(
            'TRUNCATE audit_events RESTART IDENTITY',
        )

        await seedFilterAuditEvents()

        const firstPage =
            await listWithQuery({
                limit: '1',
                category: 'PRODUCT',
            })

        expect(
            firstPage.items.map(
                (event) => event.id,
            ),
        ).toEqual(['2'])

        expect(
            firstPage.nextCursor,
        ).not.toBeNull()

        if (firstPage.nextCursor === null) {
            throw new Error(
                'Expected a filtered next-page cursor',
            )
        }

        const secondPage =
            await listWithQuery({
                limit: '1',
                category: 'PRODUCT',
                cursor: firstPage.nextCursor,
            })

        expect(
            secondPage.items.map(
                (event) => event.id,
            ),
        ).toEqual(['1'])

        expect(
            secondPage.items.every(
                (event) =>
                    event.category === 'PRODUCT',
            ),
        ).toBe(true)

        expect(
            secondPage.nextCursor,
        ).toBeNull()
    })

})