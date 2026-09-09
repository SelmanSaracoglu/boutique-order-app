import {
    afterAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'
import { pool } from '../src/db.js'
import {
    createAuthenticatedTestClient,
    type AuthenticatedTestClient,
} from './authenticatedTestClient.js'

const AUDIT_FAILURE_CONSTRAINT =
    'order_detail_view_audit_test_failure'

const ORDER_ITEM_DESCRIPTION_SECRET =
    'customer-order-item-secret'

const orderInput = {
    orderSource: 'instagram',
    customerIdentifier:
        'customer-contact-secret',
    customerName:
        'Customer Name Secret',
    operationalNote:
        'customer-address-secret',
    items: [
        {
            supplierAlias: 'supplier-a',
            description:
                ORDER_ITEM_DESCRIPTION_SECRET,
            quantity: 1,
            unitPrice: 25,
        },
    ],
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

async function createOrder(
    client: AuthenticatedTestClient,
): Promise<number> {
    const response = await client
        .post('/api/orders')
        .send(orderInput)
        .expect(201)

    return response.body.id as number
}

describe(
    'Order detail view security events',
    () => {
        beforeEach(async () => {
            await pool.query(`
        ALTER TABLE audit_events
        DROP CONSTRAINT IF EXISTS ${AUDIT_FAILURE_CONSTRAINT}
      `)

            await pool.query(
                'TRUNCATE audit_events RESTART IDENTITY',
            )

            await pool.query(`
        TRUNCATE order_items, orders
        RESTART IDENTITY CASCADE
      `)

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

        it('records a successful order detail view without customer data', async () => {
            const orderOperatorClient =
                await createAuthenticatedTestClient(
                    'ORDER_OPERATOR',
                )

            const orderId =
                await createOrder(
                    orderOperatorClient,
                )

            await pool.query(
                'TRUNCATE audit_events RESTART IDENTITY',
            )

            const forwardedIp =
                '203.0.113.110'

            const response =
                await orderOperatorClient
                    .get(
                        `/api/orders/${orderId}`,
                    )
                    .set(
                        'user-agent',
                        'order-detail-view-test',
                    )
                    .set(
                        'x-forwarded-for',
                        forwardedIp,
                    )
                    .expect(200)

            expect(response.body.id).toBe(
                orderId,
            )

            const requestId =
                readRequestId(response)

            const auditResult =
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
              host(source_ip)
                AS source_ip,
              user_agent,
              context
            FROM audit_events
            WHERE request_id = $1
          `,
                    [requestId],
                )

            expect(auditResult.rows).toEqual([
                {
                    schema_version: 2,
                    category: 'SECURITY',
                    action:
                        'ORDER_DETAIL_VIEWED',
                    outcome: 'SUCCESS',
                    severity: 'INFO',
                    actor_type: 'USER',
                    actor_user_id:
                        orderOperatorClient.user.id,
                    actor_username:
                        orderOperatorClient.user
                            .username,
                    actor_role:
                        'ORDER_OPERATOR',
                    target_resource_type:
                        'ORDER',
                    target_resource_id:
                        String(orderId),
                    request_id: requestId,
                    operation:
                        'VIEW_ORDER_DETAIL',
                    http_method: 'GET',
                    http_route:
                        '/api/orders/:orderId',
                    http_status: 200,
                    reason_code: null,
                    error_code: null,
                    source_ip:
                        expect.any(String),
                    user_agent:
                        'order-detail-view-test',
                    context: {},
                },
            ])

            expect(
                auditResult.rows[0].source_ip,
            ).not.toBe(forwardedIp)

            const serializedEvent =
                JSON.stringify(
                    auditResult.rows,
                )

            expect(
                serializedEvent,
            ).not.toContain(
                orderInput.customerIdentifier,
            )

            expect(
                serializedEvent,
            ).not.toContain(
                orderInput.customerName,
            )

            expect(
                serializedEvent,
            ).not.toContain(
                orderInput.operationalNote,
            )

            expect(
                serializedEvent,
            ).not.toContain(
                ORDER_ITEM_DESCRIPTION_SECRET,
            )
        })

        it('does not record an order detail event for dashboard listing', async () => {
            const orderOperatorClient =
                await createAuthenticatedTestClient(
                    'ORDER_OPERATOR',
                )

            await createOrder(
                orderOperatorClient,
            )

            await pool.query(
                'TRUNCATE audit_events RESTART IDENTITY',
            )

            const response =
                await orderOperatorClient
                    .get('/api/orders')
                    .expect(200)

            const requestId =
                readRequestId(response)

            const auditResult =
                await pool.query(
                    `
            SELECT COUNT(*)::int AS count
            FROM audit_events
            WHERE
              request_id = $1
              AND action =
                'ORDER_DETAIL_VIEWED'
          `,
                    [requestId],
                )

            expect(
                auditResult.rows[0].count,
            ).toBe(0)
        })

        it('does not record an order detail event when the order does not exist', async () => {
            const orderOperatorClient =
                await createAuthenticatedTestClient(
                    'ORDER_OPERATOR',
                )

            await pool.query(
                'TRUNCATE audit_events RESTART IDENTITY',
            )

            const response =
                await orderOperatorClient
                    .get(
                        '/api/orders/999999',
                    )
                    .expect(404)

            expect(response.body).toEqual({
                error: {
                    code: 'ORDER_NOT_FOUND',
                    message:
                        'Order was not found.',
                },
            })

            const requestId =
                readRequestId(response)

            const auditResult =
                await pool.query(
                    `
            SELECT COUNT(*)::int AS count
            FROM audit_events
            WHERE request_id = $1
          `,
                    [requestId],
                )

            expect(
                auditResult.rows[0].count,
            ).toBe(0)
        })

        it('preserves the successful response and writes a safe fallback when audit persistence fails', async () => {
            const orderOperatorClient =
                await createAuthenticatedTestClient(
                    'ORDER_OPERATOR',
                )

            const orderId =
                await createOrder(
                    orderOperatorClient,
                )

            await pool.query(
                'TRUNCATE audit_events RESTART IDENTITY',
            )

            await pool.query(`
        ALTER TABLE audit_events
        ADD CONSTRAINT ${AUDIT_FAILURE_CONSTRAINT}
        CHECK (
          action <>
            'ORDER_DETAIL_VIEWED'
        )
      `)

            const stderrWriteSpy = vi
                .spyOn(
                    process.stderr,
                    'write',
                )
                .mockReturnValue(true)

            try {
                const authorizationSecret =
                    'Bearer authorization-secret'

                const response =
                    await orderOperatorClient
                        .get(
                            `/api/orders/${orderId}`,
                        )
                        .set(
                            'user-agent',
                            'order-detail-audit-failure-test',
                        )
                        .set(
                            'authorization',
                            authorizationSecret,
                        )
                        .expect(200)

                expect(response.body.id).toBe(
                    orderId,
                )

                const requestId =
                    readRequestId(response)

                const auditResult =
                    await pool.query(`
            SELECT COUNT(*)::int AS count
            FROM audit_events
            WHERE action =
              'ORDER_DETAIL_VIEWED'
          `)

                expect(
                    auditResult.rows[0].count,
                ).toBe(0)

                const fallbackOutput =
                    stderrWriteSpy.mock.calls
                        .map((call) =>
                            String(call[0]),
                        )
                        .join('')

                const fallbackLines =
                    fallbackOutput
                        .trim()
                        .split('\n')

                expect(
                    fallbackLines,
                ).toHaveLength(1)

                const fallbackRecord =
                    JSON.parse(
                        fallbackLines[0] ?? '',
                    )

                expect(
                    fallbackRecord,
                ).toMatchObject({
                    requestId,
                    eventType:
                        'AUDIT_PERSISTENCE_FAILED',
                    failureCode:
                        'AUDIT_PERSISTENCE_FAILED',
                    auditEvent: {
                        schemaVersion: 2,
                        category: 'SECURITY',
                        action:
                            'ORDER_DETAIL_VIEWED',
                        outcome: 'SUCCESS',
                        severity: 'INFO',
                        operation:
                            'VIEW_ORDER_DETAIL',
                        method: 'GET',
                        route:
                            '/api/orders/:orderId',
                        status: 200,
                        actor: {
                            type: 'USER',
                            userId:
                                orderOperatorClient.user
                                    .id,
                            username:
                                orderOperatorClient.user
                                    .username,
                            role:
                                'ORDER_OPERATOR',
                        },
                        target: {
                            resourceType: 'ORDER',
                            resourceId:
                                String(orderId),
                        },
                        reasonCode: null,
                        userAgent:
                            'order-detail-audit-failure-test',
                        context: {},
                    },
                })

                expect(
                    fallbackOutput,
                ).not.toContain(
                    authorizationSecret,
                )

                expect(
                    fallbackOutput,
                ).not.toContain(
                    orderOperatorClient.csrfToken,
                )

                expect(
                    fallbackOutput,
                ).not.toContain(
                    orderInput.customerIdentifier,
                )

                expect(
                    fallbackOutput,
                ).not.toContain(
                    orderInput.customerName,
                )

                expect(
                    fallbackOutput,
                ).not.toContain(
                    orderInput.operationalNote,
                )

                expect(
                    fallbackOutput,
                ).not.toContain(
                    ORDER_ITEM_DESCRIPTION_SECRET,
                )

                expect(
                    fallbackOutput,
                ).not.toContain(
                    'boutique.sid=',
                )

                expect(
                    fallbackOutput,
                ).not.toContain(
                    AUDIT_FAILURE_CONSTRAINT,
                )

                expect(
                    fallbackOutput,
                ).not.toContain('23514')
            } finally {
                stderrWriteSpy.mockRestore()

                await pool.query(`
          ALTER TABLE audit_events
          DROP CONSTRAINT IF EXISTS ${AUDIT_FAILURE_CONSTRAINT}
        `)
            }
        })
    },
)