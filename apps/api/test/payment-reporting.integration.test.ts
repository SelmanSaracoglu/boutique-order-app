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

import type { UserRole } from '../src/auth/user.js'

const forbiddenPaymentReportRoles = [
    'ADMIN',
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
            customerIdentifier: '@payment-report-test',
            items: [
                {
                    supplierAlias: 'supplier-a',
                    description: 'Payment report test item',
                    quantity: 1,
                    unitPrice: 35,
                },
            ],
        })

    expect(response.status).toBe(201)

    return response.body.id as number
}

describe('Payment reporting API', () => {
    beforeEach(async () => {
        await pool.query(
            'TRUNCATE order_items, orders RESTART IDENTITY CASCADE',
        )
        await pool.query(
            'TRUNCATE user_sessions, users RESTART IDENTITY CASCADE',
        )

        adminClient = await createAuthenticatedTestClient('ADMIN')
        orderOperatorClient =
            await createAuthenticatedTestClient('ORDER_OPERATOR')

        paymentOperatorClient =
            await createAuthenticatedTestClient(
                'PAYMENT_OPERATOR',
            )
    })

    afterAll(async () => {
        await pool.end()
    })

    it.each([
        ['ORDER_OPERATOR', 'BANK_TRANSFER'],
        ['ORDER_OPERATOR', 'PAYPAL'],
        ['PAYMENT_OPERATOR', 'BANK_TRANSFER'],
        ['PAYMENT_OPERATOR', 'PAYPAL'],
    ] as const)(
        'allows %s to report customer payment with %s', async (role, paymentMethod) => {
            const orderId = await createOrder()

            const client =
                role === 'ORDER_OPERATOR'
                    ? orderOperatorClient
                    : paymentOperatorClient

            const response = await client
                .post(`/api/orders/${orderId}/payment-report`)
                .send({ paymentMethod })

            expect(response.status).toBe(200)
            expect(response.body).toEqual({
                id: orderId,
                paymentStatus: 'REPORTED',
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
                payment_status: 'REPORTED',
                payment_method: paymentMethod,
            })
        },
    )

    it('rolls back and returns controlled JSON when persistence fails', async () => {
        const orderId = await createOrder()
        const constraintName =
            'payment_reporting_test_failure'

        await pool.query(`
    ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS ${constraintName}
  `)

        await pool.query(`
    ALTER TABLE orders
    ADD CONSTRAINT ${constraintName}
    CHECK (payment_status <> 'REPORTED')
  `)

        try {
            const response = await orderOperatorClient
                .post(`/api/orders/${orderId}/payment-report`)
                .send({
                    paymentMethod: 'BANK_TRANSFER',
                })

            expect(response.status).toBe(500)
            expect(response.body).toEqual({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Unable to report payment.',
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
        } finally {
            await pool.query(`
      ALTER TABLE orders
      DROP CONSTRAINT IF EXISTS ${constraintName}
    `)
        }
    })

    it.each(forbiddenPaymentReportRoles)(
        'forbids payment reporting for %s',
        async (role) => {
            const orderId = await createOrder()

            const client =
                role === 'ADMIN'
                    ? adminClient
                    : await createAuthenticatedTestClient(role)

            const response = await client
                .post(`/api/orders/${orderId}/payment-report`)
                .send({
                    paymentMethod: 'BANK_TRANSFER',
                })

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
                payment_status: 'AWAITING_PAYMENT',
                payment_method: null,
            })
        },
    )

    it('requires a valid CSRF token when reporting payment', async () => {
        const orderId = await createOrder()

        const response = await orderOperatorClient.agent
            .post(`/api/orders/${orderId}/payment-report`)
            .send({
                paymentMethod: 'BANK_TRANSFER',
            })

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
            payment_status: 'AWAITING_PAYMENT',
            payment_method: null,
        })
    })

    it.each([
        {
            name: 'missing payment method',
            body: {},
        },
        {
            name: 'unsupported payment method',
            body: {
                paymentMethod: 'CASH',
            },
        },
        {
            name: 'unexpected fields',
            body: {
                paymentMethod: 'PAYPAL',
                paymentStatus: 'CONFIRMED',
            },
        },
    ])('rejects $name without changing payment state', async ({ body }) => {
        const orderId = await createOrder()

        const response = await orderOperatorClient
            .post(`/api/orders/${orderId}/payment-report`)
            .send(body)

        expect(response.status).toBe(400)
        expect(response.body.error.code).toBe(
            'VALIDATION_ERROR',
        )

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
    },
    )

    it.each(['abc', '2147483648'])('returns 400 for invalid order ID %s', async (invalidOrderId) => {
        const response = await orderOperatorClient
            .post(
                `/api/orders/${invalidOrderId}/payment-report`,
            )
            .send({
                paymentMethod: 'BANK_TRANSFER',
            })

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
        const response = await orderOperatorClient
            .post('/api/orders/999999/payment-report')
            .send({
                paymentMethod: 'BANK_TRANSFER',
            })

        expect(response.status).toBe(404)
        expect(response.body).toEqual({
            error: {
                code: 'ORDER_NOT_FOUND',
                message: 'Order was not found.',
            },
        })
    })

    it('rejects a repeated payment report without overwriting the method', async () => {
        const orderId = await createOrder()

        const firstResponse = await orderOperatorClient
            .post(`/api/orders/${orderId}/payment-report`)
            .send({
                paymentMethod: 'BANK_TRANSFER',
            })

        const repeatedResponse = await orderOperatorClient
            .post(`/api/orders/${orderId}/payment-report`)
            .send({
                paymentMethod: 'PAYPAL',
            })

        expect(firstResponse.status).toBe(200)
        expect(repeatedResponse.status).toBe(409)
        expect(repeatedResponse.body).toEqual({
            error: {
                code: 'INVALID_PAYMENT_TRANSITION',
                message:
                    'Payment cannot be reported for this order.',
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

    it.each(['COMPLETED', 'CANCELLED'] as const)('rejects payment reporting for a %s order', async (terminalStatus) => {
        const orderId = await createOrder()

        await pool.query(
            `
        UPDATE orders
        SET status = $1
        WHERE id = $2
      `,
            [terminalStatus, orderId],
        )

        const response = await orderOperatorClient
            .post(`/api/orders/${orderId}/payment-report`)
            .send({
                paymentMethod: 'BANK_TRANSFER',
            })

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
            payment_status: 'AWAITING_PAYMENT',
            payment_method: null,
        })
    },
    )

    it('serializes concurrent payment reports', async () => {
        const orderId = await createOrder()

        const responses = await Promise.all([
            orderOperatorClient
                .post(`/api/orders/${orderId}/payment-report`)
                .send({
                    paymentMethod: 'BANK_TRANSFER',
                }),
            orderOperatorClient
                .post(`/api/orders/${orderId}/payment-report`)
                .send({
                    paymentMethod: 'PAYPAL',
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
        const conflictResponse = responses.find(
            (response) => response.status === 409,
        )

        if (!successfulResponse || !conflictResponse) {
            throw new Error(
                'Expected one successful and one conflicting response',
            )
        }

        expect(conflictResponse.body.error.code).toBe(
            'INVALID_PAYMENT_TRANSITION',
        )

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
            payment_method:
                successfulResponse.body.paymentMethod,
        })
    })
})