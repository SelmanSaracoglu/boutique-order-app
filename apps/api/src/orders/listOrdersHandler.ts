import type {
  RequestHandler,
} from 'express'
import { pool } from '../db.js'

export const listOrdersHandler:
  RequestHandler = async (
    _request,
    response,
  ) => {
    try {
      const result =
        await pool.query(
          `
            SELECT
              o.id,
              o.customer_identifier,
              o.customer_name,
              o.created_at,
              o.status,
              o.payment_status,
              o.payment_method,
              SUM(
                oi.quantity *
                oi.unit_price
              ) AS total
            FROM orders o
            JOIN order_items oi
              ON oi.order_id = o.id
            GROUP BY
              o.id,
              o.customer_identifier,
              o.customer_name,
              o.created_at,
              o.status,
              o.payment_status,
              o.payment_method
            ORDER BY
              o.created_at DESC
          `,
        )

      const orders =
        result.rows.map(
          (order) => ({
            id: order.id,
            customerIdentifier:
              order.customer_identifier,
            ...(order.customer_name
              ? {
                  customerName:
                    order.customer_name,
                }
              : {}),
            createdAt:
              order.created_at.toISOString(),
            status: order.status,
            paymentStatus:
              order.payment_status,
            paymentMethod:
              order.payment_method,
            total: Number(
              order.total,
            ),
          }),
        )

      return response.json(orders)
    } catch (error) {
      console.error(
        'Failed to list orders',
        error,
      )

      return response.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message:
            'Unable to retrieve orders.',
        },
      })
    }
  }