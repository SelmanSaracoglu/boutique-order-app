import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/db.js'
import {
  createAuthenticatedTestClient,
  type AuthenticatedTestClient,
} from './authenticatedTestClient.js'

import type {
  PaymentMethod,
  PaymentStatus,
} from '../src/payments/payment.js'

let authenticatedClient: AuthenticatedTestClient

const unconfirmedPaymentStates = [
  {
    paymentStatus: 'AWAITING_PAYMENT',
    paymentMethod: null,
  },
  {
    paymentStatus: 'REPORTED',
    paymentMethod: 'BANK_TRANSFER',
  },
] satisfies readonly {
  paymentStatus: PaymentStatus
  paymentMethod: PaymentMethod | null
}[]

async function createOrder(): Promise<number> {
  const response = await authenticatedClient
    .post('/api/orders')
    .send({
      orderSource: 'instagram',
      customerIdentifier: '@lifecycle-test',
      items: [
        {
          supplierAlias: 'supplier-a',
          description: 'Lifecycle test item',
          quantity: 1,
          unitPrice: 25,
        },
      ],
    })

  expect(response.status).toBe(201)

  return response.body.id as number
}

async function setPaymentState(
  orderId: number,
  paymentStatus: PaymentStatus,
  paymentMethod: PaymentMethod | null,
): Promise<void> {
  await pool.query(
    `
      UPDATE orders
      SET
        payment_status = $1,
        payment_method = $2
      WHERE id = $3
    `,
    [paymentStatus, paymentMethod, orderId],
  )
}



describe('Order status API', () => {
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE order_items, orders RESTART IDENTITY CASCADE',
    )
    await pool.query(
      'TRUNCATE user_sessions, users RESTART IDENTITY CASCADE',
    )

    authenticatedClient =
      await createAuthenticatedTestClient()
  })

  afterAll(async () => {
    await pool.end()
  })

  it('persists permitted status transitions and exposes the current status', async () => {
    const orderId = await createOrder()

    await setPaymentState(
      orderId,
      'CONFIRMED',
      'BANK_TRANSFER',
    )

    const inProgressResponse = await authenticatedClient
      .patch(`/api/orders/${orderId}/status`)
      .send({ status: 'IN_PROGRESS' })

    expect(inProgressResponse.status).toBe(200)
    expect(inProgressResponse.body).toEqual({
      id: orderId,
      status: 'IN_PROGRESS',
    })

    const completedResponse = await authenticatedClient
      .patch(`/api/orders/${orderId}/status`)
      .send({ status: 'COMPLETED' })

    expect(completedResponse.status).toBe(200)
    expect(completedResponse.body).toEqual({
      id: orderId,
      status: 'COMPLETED',
    })

    const persistedOrderResult = await pool.query(
      'SELECT status FROM orders WHERE id = $1',
      [orderId],
    )

    expect(persistedOrderResult.rows[0].status).toBe('COMPLETED')

    const listResponse = await authenticatedClient.get('/api/orders')
    const detailResponse = await authenticatedClient.get(
      `/api/orders/${orderId}`,
    )

    expect(listResponse.status).toBe(200)
    expect(listResponse.body[0].status).toBe('COMPLETED')
    expect(detailResponse.status).toBe(200)
    expect(detailResponse.body.status).toBe('COMPLETED')
  })

  it.each(unconfirmedPaymentStates)('rejects starting processing while payment is $paymentStatus',
    async ({ paymentStatus, paymentMethod }) => {
      const orderId = await createOrder()

      await setPaymentState(
        orderId,
        paymentStatus,
        paymentMethod,
      )

      const response = await authenticatedClient
        .patch(`/api/orders/${orderId}/status`)
        .send({ status: 'IN_PROGRESS' })

      expect(response.status).toBe(409)
      expect(response.body).toEqual({
        error: {
          code: 'PAYMENT_NOT_CONFIRMED',
          message:
            'Order payment must be confirmed before processing can start.',
        },
      })

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
        status: 'NEW',
        payment_status: paymentStatus,
        payment_method: paymentMethod,
      })
    },
  )

  it('rejects an invalid transition without changing persisted status', async () => {
    const orderId = await createOrder()

    const response = await authenticatedClient
      .patch(`/api/orders/${orderId}/status`)
      .send({ status: 'COMPLETED' })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_STATUS_TRANSITION',
        message: 'Order cannot transition from NEW to COMPLETED.',
      },
    })

    const persistedOrderResult = await pool.query(
      'SELECT status FROM orders WHERE id = $1',
      [orderId],
    )

    expect(persistedOrderResult.rows[0].status).toBe('NEW')
  })

  it('treats a repeated status request as an idempotent success', async () => {
    const orderId = await createOrder()
    await setPaymentState(
      orderId,
      'CONFIRMED',
      'BANK_TRANSFER',
    )

    const firstResponse = await authenticatedClient
      .patch(`/api/orders/${orderId}/status`)
      .send({ status: 'IN_PROGRESS' })

    const repeatedResponse = await authenticatedClient
      .patch(`/api/orders/${orderId}/status`)
      .send({ status: 'IN_PROGRESS' })

    expect(firstResponse.status).toBe(200)
    expect(repeatedResponse.status).toBe(200)
    expect(repeatedResponse.body).toEqual({
      id: orderId,
      status: 'IN_PROGRESS',
    })

    const persistedOrderResult = await pool.query(
      'SELECT status FROM orders WHERE id = $1',
      [orderId],
    )

    expect(persistedOrderResult.rows[0].status).toBe('IN_PROGRESS')
  })

  it.each([
    {
      name: 'missing status',
      body: {},
    },
    {
      name: 'unsupported status',
      body: { status: 'SHIPPED' },
    },
    {
      name: 'unexpected fields',
      body: {
        status: 'IN_PROGRESS',
        customerName: 'Not allowed',
      },
    },
  ])('rejects $name without changing persisted status', async ({ body }) => {
    const orderId = await createOrder()

    const response = await authenticatedClient
      .patch(`/api/orders/${orderId}/status`)
      .send(body)

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')

    const persistedOrderResult = await pool.query(
      'SELECT status FROM orders WHERE id = $1',
      [orderId],
    )

    expect(persistedOrderResult.rows[0].status).toBe('NEW')
  })

  it.each(['abc', '2147483648'])(
    'returns 400 for invalid order ID %s',
    async (invalidOrderId) => {
      const response = await authenticatedClient
        .patch(`/api/orders/${invalidOrderId}/status`)
        .send({ status: 'IN_PROGRESS' })

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
    const response = await authenticatedClient
      .patch('/api/orders/999999/status')
      .send({ status: 'IN_PROGRESS' })

    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      error: {
        code: 'ORDER_NOT_FOUND',
        message: 'Order was not found.',
      },
    })
  })

  it('serializes concurrent terminal status transitions', async () => {
    const orderId = await createOrder()

    await setPaymentState(
      orderId,
      'CONFIRMED',
      'BANK_TRANSFER',
    )

    const inProgressResponse = await authenticatedClient
      .patch(`/api/orders/${orderId}/status`)
      .send({ status: 'IN_PROGRESS' })

    expect(inProgressResponse.status).toBe(200)

    const responses = await Promise.all([
      authenticatedClient
        .patch(`/api/orders/${orderId}/status`)
        .send({ status: 'COMPLETED' }),
      authenticatedClient
        .patch(`/api/orders/${orderId}/status`)
        .send({ status: 'CANCELLED' }),
    ])

    expect(responses.map((response) => response.status).sort()).toEqual([
      200,
      409,
    ])

    const successfulResponse = responses.find(
      (response) => response.status === 200,
    )
    const conflictResponse = responses.find(
      (response) => response.status === 409,
    )

    if (!successfulResponse || !conflictResponse) {
      throw new Error('Expected one successful and one conflicting response')
    }

    expect(['COMPLETED', 'CANCELLED']).toContain(
      successfulResponse.body.status,
    )
    expect(conflictResponse.body.error.code).toBe(
      'INVALID_STATUS_TRANSITION',
    )

    const persistedOrderResult = await pool.query(
      'SELECT status FROM orders WHERE id = $1',
      [orderId],
    )

    expect(persistedOrderResult.rows[0].status).toBe(
      successfulResponse.body.status,
    )
  })

  it('rolls back and returns controlled JSON when persistence fails', async () => {
    const orderId = await createOrder()
    await setPaymentState(
      orderId,
      'CONFIRMED',
      'BANK_TRANSFER',
    )

    await pool.query(`
      ALTER TABLE orders
      DROP CONSTRAINT IF EXISTS orders_status_update_test_failure
    `)

    await pool.query(`
      ALTER TABLE orders
      ADD CONSTRAINT orders_status_update_test_failure
      CHECK (status <> 'IN_PROGRESS')
    `)

    try {
      const response = await authenticatedClient
        .patch(`/api/orders/${orderId}/status`)
        .send({ status: 'IN_PROGRESS' })

      expect(response.status).toBe(500)
      expect(response.body).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to update order status.',
        },
      })

      const persistedOrderResult = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId],
      )

      expect(persistedOrderResult.rows[0].status).toBe('NEW')
    } finally {
      await pool.query(`
        ALTER TABLE orders
        DROP CONSTRAINT IF EXISTS orders_status_update_test_failure
      `)
    }
  })
})