import {
    afterAll,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest'
import { pool } from '../src/db.js'
import type { PaymentMethod } from '../src/payments/payment.js'
import {
    createAuthenticatedTestClient,
    type AuthenticatedTestClient,
} from './authenticatedTestClient.js'

import type { UserRole } from '../src/auth/user.js'

const forbiddenPaymentConfirmationRoles = [
    'ADMIN',
    'ORDER_OPERATOR',
    'FULFILLMENT_OPERATOR',
] satisfies readonly UserRole[]

let adminClient: AuthenticatedTestClient
let orderOperatorClient: AuthenticatedTestClient
let paymentOperatorClient: AuthenticatedTestClient

async function createOrder(): Promise<number> {
    const response = await adminClient
        .post('/api/orders')
        .send({
            orderSource: 'instagram',
            customerIdentifier: '@payment-confirmation-test',
            items: [
                {
                    supplierAlias: 'supplier-a',
                    description: 'Payment confirmation test item',
                    quantity: 1,
                    unitPrice: 35,
                },
            ],
        })

    expect(response.status).toBe(201)

    return response.body.id as number
}

async function createReportedOrder(
    paymentMethod: PaymentMethod,
): Promise<number> {
    const orderId = await createOrder()

    const response = await orderOperatorClient
        .post(`/api/orders/${orderId}/payment-report`)
        .send({ paymentMethod })

    expect(response.status).toBe(200)

    return orderId
}

describe('Payment confirmation API', () => {
    beforeEach(async () => {
        await pool.query(
            'TRUNCATE order_items, orders RESTART IDENTITY CASCADE',
        )
        await pool.query(
            'TRUNCATE user_sessions, users RESTART IDENTITY CASCADE',
        )

        adminClient =
            await createAuthenticatedTestClient('ADMIN')

        orderOperatorClient =
            await createAuthenticatedTestClient(
                'ORDER_OPERATOR',
            )

        paymentOperatorClient =
            await createAuthenticatedTestClient(
                'PAYMENT_OPERATOR',
            )
    })

    afterAll(async () => {
        await pool.end()
    })

    it.each(['BANK_TRANSFER', 'PAYPAL'] as const)('allows a payment operator to confirm a reported %s payment',
        async (paymentMethod) => {
            const orderId =
                await createReportedOrder(paymentMethod)

            const response = await paymentOperatorClient.post(
                `/api/orders/${orderId}/payment-confirmation`,
            )

            expect(response.status).toBe(200)

            expect(response.body).toEqual({
                id: orderId,
                paymentStatus: 'CONFIRMED',
                paymentMethod,
            })

            const persistedOrderResult = await pool.query(
                `
          SELECT payment_status, payment_method
          FROM orders
          WHERE id = $1
        `,
                [orderId],
            )

            expect(persistedOrderResult.rows[0]).toEqual({
                payment_status: 'CONFIRMED',
                payment_method: paymentMethod,
            })
        },
    )

    it.each(forbiddenPaymentConfirmationRoles)('forbids payment confirmation for %s',
        async (role) => {
            const orderId =
                await createReportedOrder('BANK_TRANSFER')

            const client =
                role === 'ADMIN'
                    ? adminClient
                    : role === 'ORDER_OPERATOR'
                        ? orderOperatorClient
                        : await createAuthenticatedTestClient(role)

            const response = await client.post(
                `/api/orders/${orderId}/payment-confirmation`,
            )

            expect(response.status).toBe(403)

            expect(response.body).toEqual({
                error: {
                    code: 'FORBIDDEN',
                    message:
                        'You do not have permission to perform this action.',
                },
            })

            const persistedOrderResult = await pool.query(
                `
        SELECT payment_status, payment_method
        FROM orders
        WHERE id = $1
      `,
                [orderId],
            )

            expect(persistedOrderResult.rows[0]).toEqual({
                payment_status: 'REPORTED',
                payment_method: 'BANK_TRANSFER',
            })
        },
    )

    it('requires a valid CSRF token when confirming payment', async () => {
        const orderId =
            await createReportedOrder('BANK_TRANSFER')

        const response =
            await paymentOperatorClient.agent.post(
                `/api/orders/${orderId}/payment-confirmation`,
            )

        expect(response.status).toBe(403)

        expect(response.body).toEqual({
            error: {
                code: 'INVALID_CSRF_TOKEN',
                message: 'Invalid CSRF token.',
            },
        })

        const persistedOrderResult = await pool.query(
            `
      SELECT payment_status, payment_method
      FROM orders
      WHERE id = $1
    `,
            [orderId],
        )

        expect(persistedOrderResult.rows[0]).toEqual({
            payment_status: 'REPORTED',
            payment_method: 'BANK_TRANSFER',
        })
    })

    it.each(['abc', '2147483648'])('returns 400 for invalid order ID %s',
        async (invalidOrderId) => {
            const response = await paymentOperatorClient.post(
                `/api/orders/${invalidOrderId}/payment-confirmation`,
            )

            expect(response.status).toBe(400)

            expect(response.body).toEqual({
                error: {
                    code: 'INVALID_ORDER_ID',
                    message: 'Order ID is invalid.',
                },
            })
        },
    )

    it('returns 404 when the order does not exist', async () => {
        const response = await paymentOperatorClient.post(
            '/api/orders/999999/payment-confirmation',
        )

        expect(response.status).toBe(404)

        expect(response.body).toEqual({
            error: {
                code: 'ORDER_NOT_FOUND',
                message: 'Order was not found.',
            },
        })
    })

    it('rejects confirmation while payment is awaiting customer reporting', async () => {
        const orderId = await createOrder()

        const response = await paymentOperatorClient.post(
            `/api/orders/${orderId}/payment-confirmation`,
        )

        expect(response.status).toBe(409)

        expect(response.body).toEqual({
            error: {
                code: 'INVALID_PAYMENT_TRANSITION',
                message:
                    'Payment cannot be confirmed for this order.',
            },
        })

        const persistedOrderResult = await pool.query(
            `
      SELECT payment_status, payment_method
      FROM orders
      WHERE id = $1
    `,
            [orderId],
        )

        expect(persistedOrderResult.rows[0]).toEqual({
            payment_status: 'AWAITING_PAYMENT',
            payment_method: null,
        })
    })

    it('rejects repeated confirmation without changing the payment method', async () => {
        const orderId =
            await createReportedOrder('PAYPAL')

        const firstResponse = await paymentOperatorClient.post(
            `/api/orders/${orderId}/payment-confirmation`,
        )

        const repeatedResponse =
            await paymentOperatorClient.post(
                `/api/orders/${orderId}/payment-confirmation`,
            )

        expect(firstResponse.status).toBe(200)
        expect(repeatedResponse.status).toBe(409)

        expect(repeatedResponse.body).toEqual({
            error: {
                code: 'INVALID_PAYMENT_TRANSITION',
                message:
                    'Payment cannot be confirmed for this order.',
            },
        })

        const persistedOrderResult = await pool.query(
            `
      SELECT payment_status, payment_method
      FROM orders
      WHERE id = $1
    `,
            [orderId],
        )

        expect(persistedOrderResult.rows[0]).toEqual({
            payment_status: 'CONFIRMED',
            payment_method: 'PAYPAL',
        })
    })

    it.each(['COMPLETED', 'CANCELLED'] as const)('rejects payment confirmation for a %s order',
        async (terminalStatus) => {
            const orderId =
                await createReportedOrder('BANK_TRANSFER')

            await pool.query(
                `
        UPDATE orders
        SET status = $1
        WHERE id = $2
      `,
                [terminalStatus, orderId],
            )

            const response = await paymentOperatorClient.post(
                `/api/orders/${orderId}/payment-confirmation`,
            )

            expect(response.status).toBe(409)

            expect(response.body.error.code).toBe(
                'INVALID_PAYMENT_TRANSITION',
            )

            const persistedOrderResult = await pool.query(
                `
        SELECT
          status,
          payment_status,
          payment_method
        FROM orders
        WHERE id = $1
      `,
                [orderId],
            )

            expect(persistedOrderResult.rows[0]).toEqual({
                status: terminalStatus,
                payment_status: 'REPORTED',
                payment_method: 'BANK_TRANSFER',
            })
        },
    )

    it('serializes concurrent payment confirmations', async () => {
        const orderId =
            await createReportedOrder('PAYPAL')

        const responses = await Promise.all([
            paymentOperatorClient.post(
                `/api/orders/${orderId}/payment-confirmation`,
            ),
            paymentOperatorClient.post(
                `/api/orders/${orderId}/payment-confirmation`,
            ),
        ])

        expect(
            responses
                .map((response) => response.status)
                .sort(),
        ).toEqual([200, 409])

        const persistedOrderResult = await pool.query(
            `
      SELECT payment_status, payment_method
      FROM orders
      WHERE id = $1
    `,
            [orderId],
        )

        expect(persistedOrderResult.rows[0]).toEqual({
            payment_status: 'CONFIRMED',
            payment_method: 'PAYPAL',
        })
    })

    it('rolls back and returns controlled JSON when persistence fails', async () => {
        const orderId =
            await createReportedOrder('BANK_TRANSFER')

        const constraintName =
            'payment_confirmation_test_failure'

        await pool.query(`
    ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS ${constraintName}
  `)

        await pool.query(`
    ALTER TABLE orders
    ADD CONSTRAINT ${constraintName}
    CHECK (payment_status <> 'CONFIRMED')
  `)

        try {
            const response = await paymentOperatorClient.post(
                `/api/orders/${orderId}/payment-confirmation`,
            )

            expect(response.status).toBe(500)

            expect(response.body).toEqual({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Unable to confirm payment.',
                },
            })

            const persistedOrderResult = await pool.query(
                `
        SELECT payment_status, payment_method
        FROM orders
        WHERE id = $1
      `,
                [orderId],
            )

            expect(persistedOrderResult.rows[0]).toEqual({
                payment_status: 'REPORTED',
                payment_method: 'BANK_TRANSFER',
            })
        } finally {
            await pool.query(`
      ALTER TABLE orders
      DROP CONSTRAINT IF EXISTS ${constraintName}
    `)
        }
    })
})