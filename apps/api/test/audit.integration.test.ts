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

import { ensureAuditLoggingStarted } from '../src/audit/auditRepository.js'

describe('Product audit events', () => {
    let authenticatedClient: AuthenticatedTestClient
    let paymentReporterClient: AuthenticatedTestClient
    let paymentConfirmerClient: AuthenticatedTestClient
    let fulfillmentClient: AuthenticatedTestClient

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

        paymentConfirmerClient =
            await createAuthenticatedTestClient('PAYMENT_OPERATOR')

        fulfillmentClient =
            await createAuthenticatedTestClient('FULFILLMENT_OPERATOR',)
    })

    afterAll(async () => {
        await pool.end()
    })

    async function createReportedOrder(): Promise<number> {
        const createResponse = await authenticatedClient
            .post('/api/orders')
            .send({
                orderSource: 'instagram',
                customerIdentifier: '@confirmation-audit-test',
                items: [
                    {
                        supplierAlias: 'supplier-a',
                        description: 'Confirmation audit item',
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

        return orderId
    }

    async function createConfirmedOrder(): Promise<number> {
        const orderId = await createReportedOrder()

        const confirmResponse =
            await paymentConfirmerClient.post(
                `/api/orders/${orderId}/payment-confirmation`,
            )

        expect(confirmResponse.status).toBe(200)

        return orderId
    }

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

    it('records one PAYMENT_CONFIRMED event with the confirming actor and state transition', async () => {
        const orderId = await createReportedOrder()

        const response = await paymentConfirmerClient.post(
            `/api/orders/${orderId}/payment-confirmation`,
        )

        expect(response.status).toBe(200)

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
      WHERE action = 'PAYMENT_CONFIRMED'
    `,
        )

        expect(result.rows).toHaveLength(1)

        expect(result.rows[0]).toEqual({
            action: 'PAYMENT_CONFIRMED',
            actor_user_id: paymentConfirmerClient.user.id,
            actor_username: paymentConfirmerClient.user.username,
            actor_role: 'PAYMENT_OPERATOR',
            target_resource_type: 'ORDER',
            target_resource_id: String(orderId),
            previous_order_status: 'NEW',
            new_order_status: 'NEW',
            previous_payment_status: 'REPORTED',
            new_payment_status: 'CONFIRMED',
            context: {
                paymentMethod: 'BANK_TRANSFER',
            },
        })
    })

    it('records only one success event for concurrent payment confirmations', async () => {
        const orderId = await createReportedOrder()

        const responses = await Promise.all([
            paymentConfirmerClient.post(
                `/api/orders/${orderId}/payment-confirmation`,
            ),
            paymentConfirmerClient.post(
                `/api/orders/${orderId}/payment-confirmation`,
            ),
        ])

        expect(
            responses
                .map((response) => response.status)
                .sort(),
        ).toEqual([200, 409])

        const result = await pool.query(
            `
      SELECT COUNT(*)::int AS count
      FROM audit_events
      WHERE action = 'PAYMENT_CONFIRMED'
        AND target_resource_id = $1
    `,
            [String(orderId)],
        )

        expect(result.rows[0].count).toBe(1)
    })

    it('rolls back payment confirmation when the audit insert fails', async () => {
        const orderId = await createReportedOrder()
        const constraintName =
            'audit_payment_confirmation_test_failure'

        await pool.query(`
    ALTER TABLE audit_events
    DROP CONSTRAINT IF EXISTS ${constraintName}
  `)

        await pool.query(`
    ALTER TABLE audit_events
    ADD CONSTRAINT ${constraintName}
    CHECK (action <> 'PAYMENT_CONFIRMED')
  `)

        try {
            const response = await paymentConfirmerClient.post(
                `/api/orders/${orderId}/payment-confirmation`,
            )

            expect(response.status).toBe(500)

            expect(response.body).toEqual({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Unable to confirm payment.',
                },
            })

            const orderResult = await pool.query(
                `
        SELECT
          payment_status,
          payment_method
        FROM orders
        WHERE id = $1
      `,
                [orderId],
            )

            expect(orderResult.rows[0]).toEqual({
                payment_status: 'REPORTED',
                payment_method: 'BANK_TRANSFER',
            })

            const auditResult = await pool.query(
                `
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE action = 'PAYMENT_CONFIRMED'
          AND target_resource_id = $1
      `,
                [String(orderId)],
            )

            expect(auditResult.rows[0].count).toBe(0)
        } finally {
            await pool.query(`
      ALTER TABLE audit_events
      DROP CONSTRAINT IF EXISTS ${constraintName}
    `)
        }
    })

    it('records processing and completion events with lifecycle state transitions', async () => {
        const orderId = await createConfirmedOrder()

        const processingResponse = await fulfillmentClient
            .patch(`/api/orders/${orderId}/status`)
            .send({
                status: 'IN_PROGRESS',
            })

        expect(processingResponse.status).toBe(200)

        const repeatedProcessingResponse =
            await fulfillmentClient
                .patch(`/api/orders/${orderId}/status`)
                .send({
                    status: 'IN_PROGRESS',
                })

        expect(repeatedProcessingResponse.status).toBe(200)

        const completionResponse = await fulfillmentClient
            .patch(`/api/orders/${orderId}/status`)
            .send({
                status: 'COMPLETED',
            })

        expect(completionResponse.status).toBe(200)

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
      WHERE target_resource_id = $1
        AND action IN (
          'ORDER_PROCESSING_STARTED',
          'ORDER_COMPLETED'
        )
      ORDER BY id
    `,
            [String(orderId)],
        )

        expect(result.rows).toEqual([
            {
                action: 'ORDER_PROCESSING_STARTED',
                actor_user_id: fulfillmentClient.user.id,
                actor_username: fulfillmentClient.user.username,
                actor_role: 'FULFILLMENT_OPERATOR',
                target_resource_type: 'ORDER',
                target_resource_id: String(orderId),
                previous_order_status: 'NEW',
                new_order_status: 'IN_PROGRESS',
                previous_payment_status: 'CONFIRMED',
                new_payment_status: 'CONFIRMED',
                context: {},
            },
            {
                action: 'ORDER_COMPLETED',
                actor_user_id: fulfillmentClient.user.id,
                actor_username: fulfillmentClient.user.username,
                actor_role: 'FULFILLMENT_OPERATOR',
                target_resource_type: 'ORDER',
                target_resource_id: String(orderId),
                previous_order_status: 'IN_PROGRESS',
                new_order_status: 'COMPLETED',
                previous_payment_status: 'CONFIRMED',
                new_payment_status: 'CONFIRMED',
                context: {},
            },
        ])
    })

    it('records an ORDER_CANCELLED event from the actual previous state', async () => {
        const createResponse = await authenticatedClient
            .post('/api/orders')
            .send({
                orderSource: 'instagram',
                customerIdentifier: '@cancellation-audit-test',
                items: [
                    {
                        supplierAlias: 'supplier-a',
                        description: 'Cancellation audit item',
                        quantity: 1,
                        unitPrice: 25,
                    },
                ],
            })

        expect(createResponse.status).toBe(201)

        const orderId = createResponse.body.id as number

        const cancelResponse = await fulfillmentClient
            .patch(`/api/orders/${orderId}/status`)
            .send({
                status: 'CANCELLED',
            })

        expect(cancelResponse.status).toBe(200)

        const result = await pool.query(
            `
      SELECT
        action,
        actor_user_id,
        actor_username,
        actor_role,
        target_resource_id,
        previous_order_status,
        new_order_status,
        previous_payment_status,
        new_payment_status,
        context
      FROM audit_events
      WHERE action = 'ORDER_CANCELLED'
        AND target_resource_id = $1
    `,
            [String(orderId)],
        )

        expect(result.rows).toEqual([
            {
                action: 'ORDER_CANCELLED',
                actor_user_id: fulfillmentClient.user.id,
                actor_username: fulfillmentClient.user.username,
                actor_role: 'FULFILLMENT_OPERATOR',
                target_resource_id: String(orderId),
                previous_order_status: 'NEW',
                new_order_status: 'CANCELLED',
                previous_payment_status: 'AWAITING_PAYMENT',
                new_payment_status: 'AWAITING_PAYMENT',
                context: {},
            },
        ])
    })

    it('records only one terminal success event for concurrent lifecycle transitions', async () => {
        const orderId = await createConfirmedOrder()

        const processingResponse = await fulfillmentClient
            .patch(`/api/orders/${orderId}/status`)
            .send({
                status: 'IN_PROGRESS',
            })

        expect(processingResponse.status).toBe(200)

        const responses = await Promise.all([
            fulfillmentClient
                .patch(`/api/orders/${orderId}/status`)
                .send({
                    status: 'COMPLETED',
                }),
            fulfillmentClient
                .patch(`/api/orders/${orderId}/status`)
                .send({
                    status: 'CANCELLED',
                }),
        ])

        expect(
            responses
                .map((response) => response.status)
                .sort(),
        ).toEqual([200, 409])

        const successfulResponse = responses.find(
            (response) => response.status === 200,
        )

        if (!successfulResponse) {
            throw new Error(
                'Expected one successful terminal transition',
            )
        }

        const expectedAction =
            successfulResponse.body.status === 'COMPLETED'
                ? 'ORDER_COMPLETED'
                : 'ORDER_CANCELLED'

        const result = await pool.query(
            `
      SELECT action
      FROM audit_events
      WHERE target_resource_id = $1
        AND action IN (
          'ORDER_COMPLETED',
          'ORDER_CANCELLED'
        )
    `,
            [String(orderId)],
        )

        expect(result.rows).toEqual([
            {
                action: expectedAction,
            },
        ])
    })

    it('rolls back a lifecycle transition when the audit insert fails', async () => {
        const orderId = await createConfirmedOrder()
        const constraintName =
            'audit_lifecycle_test_failure'

        await pool.query(`
    ALTER TABLE audit_events
    DROP CONSTRAINT IF EXISTS ${constraintName}
  `)

        await pool.query(`
    ALTER TABLE audit_events
    ADD CONSTRAINT ${constraintName}
    CHECK (action <> 'ORDER_PROCESSING_STARTED')
  `)

        try {
            const response = await fulfillmentClient
                .patch(`/api/orders/${orderId}/status`)
                .send({
                    status: 'IN_PROGRESS',
                })

            expect(response.status).toBe(500)

            expect(response.body).toEqual({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Unable to update order status.',
                },
            })

            const orderResult = await pool.query(
                `
        SELECT status
        FROM orders
        WHERE id = $1
      `,
                [orderId],
            )

            expect(orderResult.rows[0].status).toBe('NEW')

            const auditResult = await pool.query(
                `
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE action = 'ORDER_PROCESSING_STARTED'
          AND target_resource_id = $1
      `,
                [String(orderId)],
            )

            expect(auditResult.rows[0].count).toBe(0)
        } finally {
            await pool.query(`
      ALTER TABLE audit_events
      DROP CONSTRAINT IF EXISTS ${constraintName}
    `)
        }
    })

    it('creates the audit coverage marker once without backfilling existing orders', async () => {
        await pool.query(`
    INSERT INTO orders (
      order_source,
      customer_identifier
    )
    VALUES (
      'instagram',
      'existing-before-audit'
    )
  `)

        const client = await pool.connect()

        try {
            await ensureAuditLoggingStarted(client)
            await ensureAuditLoggingStarted(client)
        } finally {
            client.release()
        }

        const markerResult = await pool.query(`
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
      context
    FROM audit_events
    WHERE action = 'AUDIT_LOGGING_STARTED'
  `)

        expect(markerResult.rows).toEqual([
            {
                schema_version: 1,
                category: 'SYSTEM',
                action: 'AUDIT_LOGGING_STARTED',
                outcome: 'SUCCESS',
                severity: 'INFO',
                actor_type: 'SYSTEM',
                actor_user_id: null,
                actor_username: null,
                actor_role: null,
                target_resource_type: 'AUDIT_LOG',
                target_resource_id: 'product-audit',
                context: {},
            },
        ])

        const productEventResult = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM audit_events
    WHERE target_resource_type = 'ORDER'
  `)

        expect(productEventResult.rows[0].count).toBe(0)
    })
})