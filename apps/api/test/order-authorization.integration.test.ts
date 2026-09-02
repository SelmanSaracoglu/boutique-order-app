import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import type { UserRole } from '../src/auth/user.js'
import { pool } from '../src/db.js'
import {
  createAuthenticatedTestClient,
  type AuthenticatedTestClient,
} from './authenticatedTestClient.js'

const orderInput = {
  orderSource: 'instagram',
  customerIdentifier: '@authorization-test',
  items: [
    {
      supplierAlias: 'supplier-a',
      description: 'Authorization test item',
      quantity: 1,
      unitPrice: 25,
    },
  ],
}

const forbiddenResponse = {
  error: {
    code: 'FORBIDDEN',
    message: 'You do not have permission to perform this action.',
  },
}

async function createOrder(
  client: AuthenticatedTestClient,
): Promise<number> {
  const response = await client
    .post('/api/orders')
    .send(orderInput)

  expect(response.status).toBe(201)

  return response.body.id as number
}

describe('Order authorization', () => {
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE order_items, orders RESTART IDENTITY CASCADE',
    )
    await pool.query(
      'TRUNCATE user_sessions, users RESTART IDENTITY CASCADE',
    )
  })

  afterAll(async () => {
    await pool.end()
  })

  it.each<UserRole>([
    'ADMIN',
    'ORDER_OPERATOR',
    'PAYMENT_OPERATOR',
    'FULFILLMENT_OPERATOR',
  ])('allows %s to list and view orders', async (role) => {
    const adminClient =
      await createAuthenticatedTestClient('ADMIN')
    const orderId = await createOrder(adminClient)
    const roleClient =
      await createAuthenticatedTestClient(role)

    const listResponse = await roleClient.get('/api/orders')
    const detailResponse = await roleClient.get(
      `/api/orders/${orderId}`,
    )

    expect(listResponse.status).toBe(200)
    expect(listResponse.body).toHaveLength(1)
    expect(detailResponse.status).toBe(200)
    expect(detailResponse.body.id).toBe(orderId)
  })

  it.each<UserRole>(['ADMIN', 'ORDER_OPERATOR'])(
    'allows %s to create orders',
    async (role) => {
      const roleClient =
        await createAuthenticatedTestClient(role)

      const response = await roleClient
        .post('/api/orders')
        .send(orderInput)

      expect(response.status).toBe(201)
    },
  )

  it.each<UserRole>([
    'PAYMENT_OPERATOR',
    'FULFILLMENT_OPERATOR',
  ])('forbids %s from creating orders', async (role) => {
    const roleClient =
      await createAuthenticatedTestClient(role)

    const response = await roleClient
      .post('/api/orders')
      .send(orderInput)

    expect(response.status).toBe(403)
    expect(response.body).toEqual(forbiddenResponse)

    const orderCountResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM orders',
    )

    expect(orderCountResult.rows[0].count).toBe(0)
  })

  it.each<UserRole>([
    'ADMIN',
    'ORDER_OPERATOR',
    'FULFILLMENT_OPERATOR',
  ])('allows %s to update order status', async (role) => {
    const adminClient =
      await createAuthenticatedTestClient('ADMIN')
    const orderId = await createOrder(adminClient)
    const roleClient =
      await createAuthenticatedTestClient(role)

    const response = await roleClient
      .patch(`/api/orders/${orderId}/status`)
      .send({ status: 'IN_PROGRESS' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      id: orderId,
      status: 'IN_PROGRESS',
    })
  })

  it(
    'forbids PAYMENT_OPERATOR from updating order status',
    async () => {
      const adminClient =
        await createAuthenticatedTestClient('ADMIN')
      const orderId = await createOrder(adminClient)
      const paymentClient =
        await createAuthenticatedTestClient(
          'PAYMENT_OPERATOR',
        )

      const response = await paymentClient
        .patch(`/api/orders/${orderId}/status`)
        .send({ status: 'IN_PROGRESS' })

      expect(response.status).toBe(403)
      expect(response.body).toEqual(forbiddenResponse)

      const orderResult = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId],
      )

      expect(orderResult.rows[0].status).toBe('NEW')
    },
  )
})