import {
    afterAll,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest'
import { pool } from '../src/db.js'
import {
    createAuthenticatedTestClient,
    type AuthenticatedTestClient,
} from './authenticatedTestClient.js'

describe('Product audit events', () => {
    let authenticatedClient: AuthenticatedTestClient
    let paymentReporterClient: AuthenticatedTestClient

    beforeEach(async () => {
        await pool.query(
            'TRUNCATE audit_events RESTART IDENTITY',
        )

        await pool.query(
            'TRUNCATE order_items, orders RESTART IDENTITY CASCADE',
        )

        await pool.query(
            'TRUNCATE user_sessions, users RESTART IDENTITY CASCADE',
        )

        authenticatedClient =
            await createAuthenticatedTestClient('ADMIN')

        paymentReporterClient =
            await createAuthenticatedTestClient('ORDER_OPERATOR')
    })

    afterAll(async () => {
        await pool.end()
    })

    it('records one allowlisted ORDER_CREATED event from the authenticated session', async () => {
        const response = await authenticatedClient
            .post('/api/orders')
            .send({
                orderSource: 'instagram',
                customerIdentifier: '@sensitive-customer',
                customerName: 'Sensitive Customer',
                operationalNote: 'Sensitive operational note',
                items: [
                    {
                        supplierAlias: 'supplier-a',
                        description: 'Black dress',
                        quantity: 2,
                        unitPrice: 29.99,
                    },
                    {
                        supplierAlias: 'supplier-b',
                        description: 'White scarf',
                        quantity: 1,
                        unitPrice: 14.5,
                    },
                ],
            })

        expect(response.status).toBe(201)

        const result = await pool.query(
            `
        SELECT
          id,
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
          previous_order_status,
          new_order_status,
          previous_payment_status,
          new_payment_status,
          context
        FROM audit_events
        WHERE action = 'ORDER_CREATED'
      `,
        )

        expect(result.rows).toHaveLength(1)

        const event = result.rows[0]

        expect(event).toMatchObject({
            schema_version: 1,
            category: 'PRODUCT',
            action: 'ORDER_CREATED',
            outcome: 'SUCCESS',
            severity: 'INFO',
            actor_type: 'USER',
            actor_user_id: authenticatedClient.user.id,
            actor_username: authenticatedClient.user.username,
            actor_role: 'ADMIN',
            target_resource_type: 'ORDER',
            target_resource_id: String(response.body.id),
            previous_order_status: null,
            new_order_status: 'NEW',
            previous_payment_status: null,
            new_payment_status: 'AWAITING_PAYMENT',
            context: {
                orderSource: 'instagram',
                itemCount: 2,
            },
        })

        expect(event.id).toEqual(expect.any(String))
        expect(event.occurred_at).toBeInstanceOf(Date)

        const serializedContext = JSON.stringify(event.context)

        expect(serializedContext).not.toContain(
            '@sensitive-customer',
        )
        expect(serializedContext).not.toContain(
            'Sensitive Customer',
        )
        expect(serializedContext).not.toContain(
            'Sensitive operational note',
        )
        expect(serializedContext).not.toContain('Black dress')
    })

    it('rolls back order creation when the audit insert fails', async () => {
        const constraintName =
            'audit_order_created_test_failure'

        await pool.query(`
    ALTER TABLE audit_events
    DROP CONSTRAINT IF EXISTS ${constraintName}
  `)

        await pool.query(`
    ALTER TABLE audit_events
    ADD CONSTRAINT ${constraintName}
    CHECK (action <> 'ORDER_CREATED')
  `)

        try {
            const response = await authenticatedClient
                .post('/api/orders')
                .send({
                    orderSource: 'instagram',
                    customerIdentifier: '@audit-rollback-test',
                    items: [
                        {
                            supplierAlias: 'supplier-a',
                            description: 'Rollback test item',
                            quantity: 1,
                            unitPrice: 25,
                        },
                    ],
                })

            expect(response.status).toBe(500)

            expect(response.body).toEqual({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Unable to create order.',
                },
            })

            const orderCountResult = await pool.query(
                'SELECT COUNT(*)::int AS count FROM orders',
            )

            const itemCountResult = await pool.query(
                'SELECT COUNT(*)::int AS count FROM order_items',
            )

            const auditCountResult = await pool.query(
                `
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE action = 'ORDER_CREATED'
      `,
            )

            expect(orderCountResult.rows[0].count).toBe(0)
            expect(itemCountResult.rows[0].count).toBe(0)
            expect(auditCountResult.rows[0].count).toBe(0)
        } finally {
            await pool.query(`
      ALTER TABLE audit_events
      DROP CONSTRAINT IF EXISTS ${constraintName}
    `)
        }
    })

    it('records one PAYMENT_REPORTED event with the reporting actor and state transition', async () => {
        const createResponse = await authenticatedClient
            .post('/api/orders')
            .send({
                orderSource: 'whatsapp',
                customerIdentifier: '+49123456789',
                items: [
                    {
                        supplierAlias: 'supplier-a',
                        description: 'Payment audit test item',
                        quantity: 1,
                        unitPrice: 35,
                    },
                ],
            })

        expect(createResponse.status).toBe(201)

        const orderId = createResponse.body.id as number

        const reportResponse = await paymentReporterClient
            .post(`/api/orders/${orderId}/payment-report`)
            .send({
                paymentMethod: 'BANK_TRANSFER',
            })

        expect(reportResponse.status).toBe(200)

        const result = await pool.query(
            `
      SELECT
        action,
        actor_user_id,
        actor_username,
        actor_role,
        target_resource_type,
        target_resource_id,
        previous_order_status,
        new_order_status,
        previous_payment_status,
        new_payment_status,
        context
      FROM audit_events
      WHERE action = 'PAYMENT_REPORTED'
    `,
        )

        expect(result.rows).toHaveLength(1)

        expect(result.rows[0]).toEqual({
            action: 'PAYMENT_REPORTED',
            actor_user_id: paymentReporterClient.user.id,
            actor_username: paymentReporterClient.user.username,
            actor_role: 'ORDER_OPERATOR',
            target_resource_type: 'ORDER',
            target_resource_id: String(orderId),
            previous_order_status: 'NEW',
            new_order_status: 'NEW',
            previous_payment_status: 'AWAITING_PAYMENT',
            new_payment_status: 'REPORTED',
            context: {
                paymentMethod: 'BANK_TRANSFER',
            },
        })
    })
})