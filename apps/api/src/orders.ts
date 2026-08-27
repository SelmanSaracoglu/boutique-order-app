import { Router } from 'express'
import { pool } from './db.js'
import {
  canTransitionOrderStatus,
  type OrderStatus,
} from './orderLifecycle.js'
import { 
  createOrderSchema, 
  orderIdSchema,
  updateOrderStatusSchema,
 } from './orderValidation.js'
import type { PoolClient } from 'pg'

export const ordersRouter = Router()

ordersRouter.post('/', async (request, response) => {
  const validationResult = createOrderSchema.safeParse(request.body)

  if (!validationResult.success) {
    return response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Order input is invalid.',
        issues: validationResult.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    })
  }

  const orderInput = validationResult.data
  let client: PoolClient | undefined
  let transactionStarted = false
  
  try {
    client = await pool.connect()

    await client.query('BEGIN')
    transactionStarted = true

    const orderResult = await client.query(
      `
        INSERT INTO orders (
          order_source,
          customer_identifier,
          customer_name,
          operational_note
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
          id,
          order_source,
          customer_identifier,
          customer_name,
          operational_note,
          status,
          created_at
      `,
      [
        orderInput.orderSource,
        orderInput.customerIdentifier,
        orderInput.customerName ?? null,
        orderInput.operationalNote ?? null,
      ],
    )

    const order = orderResult.rows[0]

    if (!order) {
      throw new Error('Order insert returned no row')
    }

    const savedItems = []

    for (const [index, item] of orderInput.items.entries()) {
      const itemResult = await client.query(
        `
          INSERT INTO order_items (
            order_id,
            position,
            supplier_alias,
            description,
            size,
            color,
            quantity,
            unit_price
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING
            id,
            position,
            supplier_alias,
            description,
            size,
            color,
            quantity,
            unit_price
        `,
        [
          order.id,
          index + 1,
          item.supplierAlias,
          item.description,
          item.size ?? null,
          item.color ?? null,
          item.quantity,
          item.unitPrice,
        ],
      )

      const savedItem = itemResult.rows[0]

      if (!savedItem) {
        throw new Error('Order item insert returned no row')
      }

      savedItems.push({
        id: savedItem.id,
        position: savedItem.position,
        supplierAlias: savedItem.supplier_alias,
        description: savedItem.description,
        ...(savedItem.size ? { size: savedItem.size } : {}),
        ...(savedItem.color ? { color: savedItem.color } : {}),
        quantity: savedItem.quantity,
        unitPrice: Number(savedItem.unit_price),
      })
    }

    await client.query('COMMIT')

    return response.status(201).json({
      id: order.id,
      orderSource: order.order_source,
      customerIdentifier: order.customer_identifier,
      ...(order.customer_name
        ? { customerName: order.customer_name }
        : {}),
      ...(order.operational_note
        ? { operationalNote: order.operational_note }
        : {}),
      status: order.status,
      createdAt: order.created_at.toISOString(),
      items: savedItems,
    })
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        console.error('Failed to rollback order transaction', rollbackError)
      }
    }
    console.error('Failed to create order', error)

    return response.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to create order.',
      },
    })
  } finally {
    client?.release()
  }
})

ordersRouter.patch('/:orderId/status', async (request, response) => {
  const orderIdValidationResult = orderIdSchema.safeParse(
    request.params.orderId,
  )

  if (!orderIdValidationResult.success) {
    return response.status(400).json({
      error: {
        code: 'INVALID_ORDER_ID',
        message: 'Order ID is invalid.',
      },
    })
  }

  const inputValidationResult = updateOrderStatusSchema.safeParse(
    request.body,
  )

  if (!inputValidationResult.success) {
    return response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Order status input is invalid.',
        issues: inputValidationResult.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    })
  }

  const orderId = orderIdValidationResult.data
  const requestedStatus = inputValidationResult.data.status
  let client: PoolClient | undefined
  let transactionStarted = false

  try {
    client = await pool.connect()

    await client.query('BEGIN')
    transactionStarted = true

    const orderResult = await client.query(
      `
        SELECT
          id,
          status
        FROM orders
        WHERE id = $1
        FOR UPDATE
      `,
      [orderId],
    )

    const order = orderResult.rows[0]

    if (!order) {
      await client.query('ROLLBACK')
      transactionStarted = false

      return response.status(404).json({
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order was not found.',
        },
      })
    }

    const currentStatus = order.status as OrderStatus

    if (currentStatus === requestedStatus) {
      await client.query('COMMIT')
      transactionStarted = false

      return response.json({
        id: order.id,
        status: currentStatus,
      })
    }

    if (!canTransitionOrderStatus(currentStatus, requestedStatus)) {
      await client.query('ROLLBACK')
      transactionStarted = false

      return response.status(409).json({
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `Order cannot transition from ${currentStatus} to ${requestedStatus}.`,
        },
      })
    }

    const updateResult = await client.query(
      `
        UPDATE orders
        SET status = $1
        WHERE id = $2
        RETURNING
          id,
          status
      `,
      [requestedStatus, orderId],
    )

    const updatedOrder = updateResult.rows[0]

    if (!updatedOrder) {
      throw new Error('Order status update returned no row')
    }

    await client.query('COMMIT')
    transactionStarted = false

    return response.json({
      id: updatedOrder.id,
      status: updatedOrder.status,
    })
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        console.error(
          'Failed to rollback order status transaction',
          rollbackError,
        )
      }
    }

    console.error('Failed to update order status', error)

    return response.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to update order status.',
      },
    })
  } finally {
    client?.release()
  }
})

ordersRouter.get('/', async (_request, response) => {
  try {
    const result = await pool.query(
      `
        SELECT
          o.id,
          o.customer_identifier,
          o.customer_name,
          o.created_at,
          o.status,
          SUM(oi.quantity * oi.unit_price) AS total
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        GROUP BY
          o.id,
          o.customer_identifier,
          o.customer_name,
          o.created_at,
          o.status
        ORDER BY o.created_at DESC
      `,
    )

    const orders = result.rows.map((order) => ({
      id: order.id,
      customerIdentifier: order.customer_identifier,
      ...(order.customer_name
        ? { customerName: order.customer_name }
        : {}),
      createdAt: order.created_at.toISOString(),
      status: order.status,
      total: Number(order.total),
    }))

    return response.json(orders)
  } catch (error) {
    console.error('Failed to list orders', error)

    return response.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to retrieve orders.',
      },
    })
  }
})

ordersRouter.get('/:orderId', async (request, response) => {
  const validationResult = orderIdSchema.safeParse(request.params.orderId)

  if (!validationResult.success) {
    return response.status(400).json({
      error: {
        code: 'INVALID_ORDER_ID',
        message: 'Order ID is invalid.',
      },
    })
  }

  const orderId = validationResult.data

  try {
    const orderResult = await pool.query(
      `
        SELECT
          o.id,
          o.order_source,
          o.customer_identifier,
          o.customer_name,
          o.operational_note,
          o.status,
          o.created_at,
          (
          SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0)
          FROM order_items oi
          WHERE oi.order_id = o.id
          ) AS total
        FROM orders o
        WHERE o.id = $1
      `,
      [orderId],
    )

    const order = orderResult.rows[0]

    if (!order) {
      return response.status(404).json({
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order was not found.',
        },
      })
    }

    const itemResult = await pool.query(
      `
        SELECT
          id,
          position,
          supplier_alias,
          description,
          size,
          color,
          quantity,
          unit_price
        FROM order_items
        WHERE order_id = $1
        ORDER BY position
      `,
      [orderId],
    )

    const items = itemResult.rows.map((item) => ({
      id: item.id,
      position: item.position,
      supplierAlias: item.supplier_alias,
      description: item.description,
      ...(item.size ? { size: item.size } : {}),
      ...(item.color ? { color: item.color } : {}),
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
    }))

    return response.json({
      id: order.id,
      orderSource: order.order_source,
      customerIdentifier: order.customer_identifier,
      ...(order.customer_name
        ? { customerName: order.customer_name }
        : {}),
      ...(order.operational_note
        ? { operationalNote: order.operational_note }
        : {}),
      status: order.status,
      createdAt: order.created_at.toISOString(),
      items,
      total: Number(order.total),
    })
  } catch (error) {
    console.error('Failed to retrieve order', error)

    return response.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to retrieve order.',
      },
    })
  }
})