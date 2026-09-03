import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/db.js'
import {
  createAuthenticatedTestClient,
  type AuthenticatedTestClient,
} from './authenticatedTestClient.js'

describe('Orders API', () => {
  let authenticatedClient: AuthenticatedTestClient

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

  it('creates an order and persists it in PostgreSQL', async () => {
    const response = await authenticatedClient
      .post('/api/orders')
      .send({
        orderSource: 'instagram',
        customerIdentifier: '@integration-test',
        customerName: 'Integration Test',
        operationalNote: 'Created by automated test',
        items: [
          {
            supplierAlias: 'supplier-a',
            description: 'Black dress',
            size: 'M',
            color: 'Black',
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
    expect(response.body.id).toEqual(expect.any(Number))
    expect(response.body.status).toBe('NEW')
    expect(response.body.paymentStatus).toBe('AWAITING_PAYMENT')
    expect(response.body.paymentMethod).toBeNull()
    expect(response.body.createdAt).toEqual(expect.any(String))
    expect(response.body.items).toHaveLength(2)

    const orderResult = await pool.query(
      `
        SELECT
          id,
          customer_identifier,
          status,
          payment_status,
          payment_method
        FROM orders
        WHERE id = $1
      `,
      [response.body.id],
    )

    expect(orderResult.rows).toHaveLength(1)
    expect(orderResult.rows[0].customer_identifier).toBe(
      '@integration-test',
    )
    expect(orderResult.rows[0].status).toBe('NEW')
    expect(orderResult.rows[0].payment_status).toBe(
      'AWAITING_PAYMENT',
    )
    expect(orderResult.rows[0].payment_method).toBeNull()

    const itemResult = await pool.query(
      `
        SELECT
          position,
          description
        FROM order_items
        WHERE order_id = $1
        ORDER BY position
      `,
      [response.body.id],
    )

    expect(itemResult.rows).toHaveLength(2)
    expect(itemResult.rows[0].position).toBe(1)
    expect(itemResult.rows[1].position).toBe(2)
  })

  it.each([
    {
      name: 'unsupported payment status',
      paymentStatus: 'REFUNDED',
      paymentMethod: null,
    },
    {
      name: 'unsupported payment method',
      paymentStatus: 'REPORTED',
      paymentMethod: 'CARD',
    },
    {
      name: 'reported payment without a method',
      paymentStatus: 'REPORTED',
      paymentMethod: null,
    },
    {
      name: 'payment method before payment is reported',
      paymentStatus: 'AWAITING_PAYMENT',
      paymentMethod: 'PAYPAL',
    },
  ])(
    'rejects $name at the database boundary',
    async ({ paymentStatus, paymentMethod }) => {
      await expect(
        pool.query(
          `
          INSERT INTO orders (
            order_source,
            customer_identifier,
            payment_status,
            payment_method
          )
          VALUES (
            'instagram',
            '@payment-constraint-test',
            $1,
            $2
          )
        `,
          [paymentStatus, paymentMethod],
        ),
      ).rejects.toMatchObject({
        code: '23514',
      })
    },
  )

  it('rejects invalid order input without persisting data', async () => {
    const response = await authenticatedClient
      .post('/api/orders')
      .send({
        orderSource: 'instagram',
        customerIdentifier: '',
        items: [],
      })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')

    const orderCountResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM orders',
    )

    const itemCountResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM order_items',
    )

    expect(orderCountResult.rows[0].count).toBe(0)
    expect(itemCountResult.rows[0].count).toBe(0)
  })

  it('creates an order without optional fields', async () => {
    const response = await authenticatedClient
      .post('/api/orders')
      .send({
        orderSource: 'whatsapp',
        customerIdentifier: '+49123456789',
        items: [
          {
            supplierAlias: 'supplier-c',
            description: 'Blue blouse',
            quantity: 1,
            unitPrice: 39.9,
          },
        ],
      })

    expect(response.status).toBe(201)

    expect(response.body).toMatchObject({
      orderSource: 'whatsapp',
      customerIdentifier: '+49123456789',
      status: 'NEW',
    })

    expect(response.body).not.toHaveProperty('customerName')
    expect(response.body).not.toHaveProperty('operationalNote')

    expect(response.body.items).toHaveLength(1)
    expect(response.body.items[0]).not.toHaveProperty('size')
    expect(response.body.items[0]).not.toHaveProperty('color')

    const result = await pool.query(
      `
      SELECT
        customer_name,
        operational_note
      FROM orders
      WHERE id = $1
    `,
      [response.body.id],
    )

    expect(result.rows[0].customer_name).toBeNull()
    expect(result.rows[0].operational_note).toBeNull()
  })

  it('lists order summaries with calculated totals in newest-first order', async () => {
    const olderOrder = await authenticatedClient
      .post('/api/orders')
      .send({
        orderSource: 'instagram',
        customerIdentifier: '@older-customer',
        items: [
          {
            supplierAlias: 'supplier-a',
            description: 'Dress',
            quantity: 2,
            unitPrice: 20,
          },
        ],
      })

    const newerOrder = await authenticatedClient
      .post('/api/orders')
      .send({
        orderSource: 'whatsapp',
        customerIdentifier: '+49111111111',
        items: [
          {
            supplierAlias: 'supplier-b',
            description: 'Scarf',
            quantity: 3,
            unitPrice: 10,
          },
          {
            supplierAlias: 'supplier-c',
            description: 'Bag',
            quantity: 1,
            unitPrice: 15,
          },
        ],
      })

    await pool.query(
      'UPDATE orders SET created_at = $1 WHERE id = $2',
      ['2026-08-20T10:00:00.000Z', olderOrder.body.id],
    )

    await pool.query(
      'UPDATE orders SET created_at = $1 WHERE id = $2',
      ['2026-08-21T10:00:00.000Z', newerOrder.body.id],
    )

    const response = await authenticatedClient.get('/api/orders')

    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(2)

    expect(response.body[0]).toMatchObject({
      id: newerOrder.body.id,
      customerIdentifier: '+49111111111',
      status: 'NEW',
      paymentStatus: 'AWAITING_PAYMENT',
      paymentMethod: null,
      total: 45,
    })

    expect(response.body[1]).toMatchObject({
      id: olderOrder.body.id,
      customerIdentifier: '@older-customer',
      status: 'NEW',
      paymentStatus: 'AWAITING_PAYMENT',
      paymentMethod: null,
      total: 40,
    })

    expect(response.body[0]).not.toHaveProperty('items')
    expect(response.body[1]).not.toHaveProperty('items')
  })

  it('returns full order details by ID', async () => {
    const createdOrder = await authenticatedClient
      .post('/api/orders')
      .send({
        orderSource: 'instagram',
        customerIdentifier: '@detail-test',
        customerName: 'Detail Test',
        operationalNote: 'Deliver in the afternoon',
        items: [
          {
            supplierAlias: 'supplier-a',
            description: 'Black dress',
            size: 'M',
            color: 'Black',
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

    const response = await authenticatedClient.get(
      `/api/orders/${createdOrder.body.id}`,
    )

    expect(response.status).toBe(200)

    expect(response.body).toMatchObject({
      id: createdOrder.body.id,
      orderSource: 'instagram',
      customerIdentifier: '@detail-test',
      customerName: 'Detail Test',
      operationalNote: 'Deliver in the afternoon',
      status: 'NEW',
      paymentStatus: 'AWAITING_PAYMENT',
      paymentMethod: null,
      total: 74.48,
    })

    expect(response.body.createdAt).toEqual(expect.any(String))

    expect(response.body.items).toHaveLength(2)

    expect(response.body.items[0]).toMatchObject({
      position: 1,
      supplierAlias: 'supplier-a',
      description: 'Black dress',
      size: 'M',
      color: 'Black',
      quantity: 2,
      unitPrice: 29.99,
    })

    expect(response.body.items[1]).toMatchObject({
      position: 2,
      supplierAlias: 'supplier-b',
      description: 'White scarf',
      quantity: 1,
      unitPrice: 14.5,
    })
  })

  it('returns 404 when the order does not exist', async () => {
    const response = await authenticatedClient.get('/api/orders/999999')

    expect(response.status).toBe(404)

    expect(response.body).toEqual({
      error: {
        code: 'ORDER_NOT_FOUND',
        message: 'Order was not found.',
      },
    })
  })

  it('returns 400 for a malformed order ID', async () => {
    const response = await authenticatedClient.get('/api/orders/abc')

    expect(response.status).toBe(400)

    expect(response.body).toEqual({
      error: {
        code: 'INVALID_ORDER_ID',
        message: 'Order ID is invalid.',
      },
    })
  })

  it('rolls back the entire order when an item insert fails', async () => {
    await pool.query(`
    ALTER TABLE order_items
    ADD CONSTRAINT order_items_atomicity_test_failure
    CHECK (description <> '__force_atomicity_failure__')
  `)

    try {
      const response = await authenticatedClient
        .post('/api/orders')
        .send({
          orderSource: 'instagram',
          customerIdentifier: '@atomicity-test',
          items: [
            {
              supplierAlias: 'supplier-a',
              description: 'Valid item',
              quantity: 1,
              unitPrice: 25,
            },
            {
              supplierAlias: 'supplier-b',
              description: '__force_atomicity_failure__',
              quantity: 1,
              unitPrice: 30,
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

      expect(orderCountResult.rows[0].count).toBe(0)
      expect(itemCountResult.rows[0].count).toBe(0)
    } finally {
      await pool.query(`
      ALTER TABLE order_items
      DROP CONSTRAINT IF EXISTS order_items_atomicity_test_failure
    `)
    }
  })

  it('rejects client-controlled order status', async () => {
    const response = await authenticatedClient
      .post('/api/orders')
      .send({
        orderSource: 'instagram',
        customerIdentifier: '@status-test',
        status: 'COMPLETED',
        items: [
          {
            supplierAlias: 'supplier-a',
            description: 'Black dress',
            quantity: 1,
            unitPrice: 25,
          },
        ],
      })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')

    const orderCountResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM orders',
    )

    expect(orderCountResult.rows[0].count).toBe(0)
  })

  it.each([
    {
      field: 'id',
      value: 999
    },
    {
      field: 'createdAt',
      value: '2026-08-21T20:00:00.000Z',
    },
  ])('rejects client-controlled $field', async ({ field, value }) => {
    const response = await authenticatedClient
      .post('/api/orders')
      .send({
        orderSource: 'instagram',
        customerIdentifier: '@server-owned-test',
        [field]: value,
        items: [
          {
            supplierAlias: 'supplier-a',
            description: 'Black dress',
            quantity: 1,
            unitPrice: 25,
          },
        ],
      })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')

    const orderCountResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM orders',
    )

    expect(orderCountResult.rows[0].count).toBe(0)
  })

  it.each([
    {
      name: 'unsupported price decimal precision',
      unitPrice: 19.999,
      quantity: 1,
    },
    {
      name: 'price exceeding PostgreSQL NUMERIC range',
      unitPrice: 10_000_000_000,
      quantity: 1,
    },
    {
      name: 'quantity exceeding PostgreSQL INTEGER range',
      unitPrice: 19.99,
      quantity: 2_147_483_648,
    },
  ])('rejects $name before persistence', async ({ unitPrice, quantity }) => {
    const response = await authenticatedClient
      .post('/api/orders')
      .send({
        orderSource: 'instagram',
        customerIdentifier: '@numeric-boundary-test',
        items: [
          {
            supplierAlias: 'supplier-a',
            description: 'Boundary test item',
            quantity,
            unitPrice,
          },
        ],
      })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')

    const orderCountResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM orders',
    )

    const itemCountResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM order_items',
    )

    expect(orderCountResult.rows[0].count).toBe(0)
    expect(itemCountResult.rows[0].count).toBe(0)
  })

  it('returns controlled JSON for malformed request JSON', async () => {
    const response = await authenticatedClient
      .post('/api/orders')
      .set('Content-Type', 'application/json')
      .send('{"orderSource":"instagram"')

    expect(response.status).toBe(400)
    expect(response.type).toMatch(/json/)

    expect(response.body).toEqual({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON.',
      },
    })

    const orderCountResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM orders',
    )

    expect(orderCountResult.rows[0].count).toBe(0)
  })

  it('rejects order mutations without a valid CSRF token', async () => {
    const createResponse = await authenticatedClient.agent
      .post('/api/orders')
      .send({})

    const statusResponse = await authenticatedClient.agent
      .patch('/api/orders/1/status')
      .set('x-csrf-token', 'A'.repeat(43))
      .send({})

    const expectedError = {
      error: {
        code: 'INVALID_CSRF_TOKEN',
        message: 'Invalid CSRF token.',
      },
    }

    expect(createResponse.status).toBe(403)
    expect(statusResponse.status).toBe(403)

    expect(createResponse.body).toEqual(expectedError)
    expect(statusResponse.body).toEqual(expectedError)

    const orderResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM orders',
    )

    expect(orderResult.rows[0].count).toBe(0)
  })

})