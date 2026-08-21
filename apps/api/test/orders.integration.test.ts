import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { pool } from '../src/db.js'

describe('Orders API', () => {
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE order_items, orders RESTART IDENTITY CASCADE',
    )
  })

  afterAll(async () => {
    await pool.end()
  })

  it('creates an order and persists it in PostgreSQL', async () => {
    const response = await request(app)
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
    expect(response.body.createdAt).toEqual(expect.any(String))
    expect(response.body.items).toHaveLength(2)

    const orderResult = await pool.query(
      `
        SELECT
          id,
          customer_identifier,
          status
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
})