import type {
  RequestHandler,
} from 'express'
import {
  buildRequestAuditMetadata,
  resolveRequestAuditRoute,
} from '../audit/auditRequestMetadata.js'
import {
  recordRequestValidationFailure,
} from '../audit/requestValidationAudit.js'
import {
  tryRecordSecurityAuditEvent,
} from '../audit/requestAuditRepository.js'
import { pool } from '../db.js'
import {
  orderIdSchema,
} from '../orderValidation.js'

export const getOrderDetailHandler:
  RequestHandler = async (
    request,
    response,
  ) => {
    const validationResult =
      orderIdSchema.safeParse(
        request.params.orderId,
      )

    if (!validationResult.success) {
      await recordRequestValidationFailure(
        request,
        {
          operation:
            'VIEW_ORDER_DETAIL',
          reasonCode:
            'INVALID_ORDER_ID',
          target: {
            resourceType: 'ORDER',
            resourceId: String(
              request.params.orderId ??
                'missing',
            ),
          },
        },
      )

      return response.status(400).json({
        error: {
          code: 'INVALID_ORDER_ID',
          message:
            'Order ID is invalid.',
        },
      })
    }

    const orderId =
      validationResult.data

    try {
      const actor =
        request.authenticatedUser

      if (!actor) {
        throw new Error(
          'Authenticated actor is missing from order detail',
        )
      }

      const orderResult =
        await pool.query(
          `
            SELECT
              o.id,
              o.order_source,
              o.customer_identifier,
              o.customer_name,
              o.operational_note,
              o.status,
              o.payment_status,
              o.payment_method,
              o.created_at,
              (
                SELECT COALESCE(
                  SUM(
                    oi.quantity *
                    oi.unit_price
                  ),
                  0
                )
                FROM order_items oi
                WHERE
                  oi.order_id = o.id
              ) AS total
            FROM orders o
            WHERE o.id = $1
          `,
          [orderId],
        )

      const order =
        orderResult.rows[0]

      if (!order) {
        return response.status(404).json({
          error: {
            code:
              'ORDER_NOT_FOUND',
            message:
              'Order was not found.',
          },
        })
      }

      const itemResult =
        await pool.query(
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

      const items =
        itemResult.rows.map(
          (item) => ({
            id: item.id,
            position:
              item.position,
            supplierAlias:
              item.supplier_alias,
            description:
              item.description,
            ...(item.size
              ? {
                  size: item.size,
                }
              : {}),
            ...(item.color
              ? {
                  color: item.color,
                }
              : {}),
            quantity:
              item.quantity,
            unitPrice: Number(
              item.unit_price,
            ),
          }),
        )

      const auditRoute =
        resolveRequestAuditRoute(
          request,
        )

      await tryRecordSecurityAuditEvent({
        action:
          'ORDER_DETAIL_VIEWED',
        actor: {
          type: 'USER',
          user: actor,
        },
        target: {
          resourceType: 'ORDER',
          resourceId:
            String(orderId),
        },
        request:
          buildRequestAuditMetadata(
            request,
            {
              operation:
                'VIEW_ORDER_DETAIL',
              route: auditRoute,
              status: 200,
            },
          ),
      })

      return response.json({
        id: order.id,
        orderSource:
          order.order_source,
        customerIdentifier:
          order.customer_identifier,
        ...(order.customer_name
          ? {
              customerName:
                order.customer_name,
            }
          : {}),
        ...(order.operational_note
          ? {
              operationalNote:
                order.operational_note,
            }
          : {}),
        status: order.status,
        paymentStatus:
          order.payment_status,
        paymentMethod:
          order.payment_method,
        createdAt:
          order.created_at.toISOString(),
        items,
        total: Number(order.total),
      })
    } catch (error) {
      console.error(
        'Failed to retrieve order',
        error,
      )

      return response.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message:
            'Unable to retrieve order.',
        },
      })
    }
  }