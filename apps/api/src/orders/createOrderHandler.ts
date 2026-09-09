import type {
  RequestHandler,
} from 'express'
import type {
  PoolClient,
} from 'pg'
import {
  buildRequestAuditMetadata,
  resolveRequestAuditRoute,
} from '../audit/auditRequestMetadata.js'
import {
  recordProductAuditEvent,
} from '../audit/auditRepository.js'
import {
  recordRequestValidationFailure,
} from '../audit/requestValidationAudit.js'
import { pool } from '../db.js'
import {
  createOrderSchema,
} from '../orderValidation.js'

export const createOrderHandler:
  RequestHandler = async (
    request,
    response,
  ) => {
    const validationResult =
      createOrderSchema.safeParse(
        request.body,
      )

    if (!validationResult.success) {
      await recordRequestValidationFailure(
        request,
        {
          operation: 'CREATE_ORDER',
          reasonCode:
            'VALIDATION_ERROR',
        },
      )

      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Order input is invalid.',
          issues:
            validationResult.error.issues.map(
              (issue) => ({
                path:
                  issue.path.join('.'),
                message:
                  issue.message,
              }),
            ),
        },
      })
    }

    const orderInput =
      validationResult.data

    let client: PoolClient | undefined
    let transactionStarted = false

    try {
      const actor =
        request.authenticatedUser

      if (!actor) {
        throw new Error(
          'Authenticated user is missing from order creation',
        )
      }

      const productAuditRequest =
        buildRequestAuditMetadata(
          request,
          {
            operation: 'CREATE_ORDER',
            route:
              resolveRequestAuditRoute(
                request,
              ),
            status: 201,
          },
        )

      client = await pool.connect()

      await client.query('BEGIN')
      transactionStarted = true

      const orderResult =
        await client.query(
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
              payment_status,
              payment_method,
              created_at
          `,
          [
            orderInput.orderSource,
            orderInput.customerIdentifier,
            orderInput.customerName ??
              null,
            orderInput.operationalNote ??
              null,
          ],
        )

      const order = orderResult.rows[0]

      if (!order) {
        throw new Error(
          'Order insert returned no row',
        )
      }

      const savedItems = []

      for (
        const [index, item] of
        orderInput.items.entries()
      ) {
        const itemResult =
          await client.query(
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
              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8
              )
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

        const savedItem =
          itemResult.rows[0]

        if (!savedItem) {
          throw new Error(
            'Order item insert returned no row',
          )
        }

        savedItems.push({
          id: savedItem.id,
          position:
            savedItem.position,
          supplierAlias:
            savedItem.supplier_alias,
          description:
            savedItem.description,
          ...(savedItem.size
            ? {
                size: savedItem.size,
              }
            : {}),
          ...(savedItem.color
            ? {
                color:
                  savedItem.color,
              }
            : {}),
          quantity:
            savedItem.quantity,
          unitPrice: Number(
            savedItem.unit_price,
          ),
        })
      }

      await recordProductAuditEvent(
        client,
        {
          action: 'ORDER_CREATED',
          actor,
          orderId: order.id,
          request:
            productAuditRequest,
          orderSource:
            order.order_source,
          itemCount:
            savedItems.length,
        },
      )

      await client.query('COMMIT')
      transactionStarted = false

      return response
        .status(201)
        .json({
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
          items: savedItems,
        })
    } catch (error) {
      if (
        client &&
        transactionStarted
      ) {
        try {
          await client.query(
            'ROLLBACK',
          )
        } catch (rollbackError) {
          console.error(
            'Failed to rollback order transaction',
            rollbackError,
          )
        }
      }

      console.error(
        'Failed to create order',
        error,
      )

      return response.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message:
            'Unable to create order.',
        },
      })
    } finally {
      client?.release()
    }
  }