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
    tryRecordRejectedProductAuditEvent,
} from '../audit/rejectedProductAuditRepository.js'
import {
    recordRequestValidationFailure,
} from '../audit/requestValidationAudit.js'
import { pool } from '../db.js'
import {
    canTransitionOrderStatus,
    type OrderStatus,
} from '../orderLifecycle.js'
import {
    orderIdSchema,
    updateOrderStatusSchema,
} from '../orderValidation.js'
import type {
    PaymentStatus,
} from '../payments/payment.js'

type RejectedLifecycleAction =
    | 'ORDER_PROCESSING_STARTED'
    | 'ORDER_COMPLETED'
    | 'ORDER_CANCELLED'

function resolveRejectedLifecycleAction(
    requestedStatus: OrderStatus,
): RejectedLifecycleAction | null {
    switch (requestedStatus) {
        case 'IN_PROGRESS':
            return 'ORDER_PROCESSING_STARTED'

        case 'COMPLETED':
            return 'ORDER_COMPLETED'

        case 'CANCELLED':
            return 'ORDER_CANCELLED'

        case 'NEW':
            return null
    }
}

export const updateOrderStatusHandler:
    RequestHandler = async (
        request,
        response,
    ) => {
        const orderIdValidationResult =
            orderIdSchema.safeParse(
                request.params.orderId,
            )

        if (
            !orderIdValidationResult.success
        ) {
            await recordRequestValidationFailure(
                request,
                {
                    operation:
                        'UPDATE_ORDER_STATUS',
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
            orderIdValidationResult.data

        const inputValidationResult =
            updateOrderStatusSchema.safeParse(
                request.body,
            )

        if (
            !inputValidationResult.success
        ) {
            await recordRequestValidationFailure(
                request,
                {
                    operation:
                        'UPDATE_ORDER_STATUS',
                    reasonCode:
                        'VALIDATION_ERROR',
                    target: {
                        resourceType: 'ORDER',
                        resourceId:
                            String(orderId),
                    },
                },
            )

            return response.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message:
                        'Order status input is invalid.',
                    issues:
                        inputValidationResult.error
                            .issues.map(
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

        const requestedStatus =
            inputValidationResult.data.status

        let client: PoolClient | undefined
        let transactionStarted = false

        try {
            const actor =
                request.authenticatedUser

            if (!actor) {
                throw new Error(
                    'Authenticated actor is missing from order status update',
                )
            }

            client = await pool.connect()

            await client.query('BEGIN')
            transactionStarted = true

            const orderResult =
                await client.query(
                    `
            SELECT
              id,
              status,
              payment_status
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
                        message:
                            'Order was not found.',
                    },
                })
            }

            const currentStatus =
                order.status as OrderStatus

            const paymentStatus =
                order.payment_status as PaymentStatus

            if (
                currentStatus ===
                requestedStatus
            ) {
                await client.query('COMMIT')
                transactionStarted = false

                return response.json({
                    id: order.id,
                    status: currentStatus,
                })
            }

            if (
                !canTransitionOrderStatus(
                    currentStatus,
                    requestedStatus,
                )
            ) {
                await client.query('ROLLBACK')
                transactionStarted = false

                const rejectionAction =
                    resolveRejectedLifecycleAction(
                        requestedStatus,
                    )

                if (rejectionAction) {
                    await tryRecordRejectedProductAuditEvent(
                        {
                            action:
                                rejectionAction,
                            reasonCode:
                                'INVALID_STATUS_TRANSITION',
                            actor,
                            orderId,
                            currentOrderStatus:
                                currentStatus,
                            currentPaymentStatus:
                                paymentStatus,
                            request:
                                buildRequestAuditMetadata(
                                    request,
                                    {
                                        operation:
                                            'UPDATE_ORDER_STATUS',
                                        route:
                                            resolveRequestAuditRoute(
                                                request,
                                            ),
                                        status: 409,
                                    },
                                ),
                        },
                    )
                }

                return response.status(409).json({
                    error: {
                        code:
                            'INVALID_STATUS_TRANSITION',
                        message:
                            `Order cannot transition from ${currentStatus} to ${requestedStatus}.`,
                    },
                })
            }

            if (
                currentStatus === 'NEW' &&
                requestedStatus ===
                'IN_PROGRESS' &&
                paymentStatus !== 'CONFIRMED'
            ) {
                await client.query('ROLLBACK')
                transactionStarted = false

                await tryRecordRejectedProductAuditEvent(
                    {
                        action:
                            'ORDER_PROCESSING_STARTED',
                        reasonCode:
                            'PAYMENT_NOT_CONFIRMED',
                        actor,
                        orderId,
                        currentOrderStatus:
                            currentStatus,
                        currentPaymentStatus:
                            paymentStatus,
                        request:
                            buildRequestAuditMetadata(
                                request,
                                {
                                    operation:
                                        'UPDATE_ORDER_STATUS',
                                    route:
                                        resolveRequestAuditRoute(
                                            request,
                                        ),
                                    status: 409,
                                },
                            ),
                    },
                )

                return response.status(409).json({
                    error: {
                        code:
                            'PAYMENT_NOT_CONFIRMED',
                        message:
                            'Order payment must be confirmed before processing can start.',
                    },
                })
            }

            const productAuditRequest =
                buildRequestAuditMetadata(
                    request,
                    {
                        operation:
                            'UPDATE_ORDER_STATUS',
                        route:
                            resolveRequestAuditRoute(
                                request,
                            ),
                        status: 200,
                    },
                )

            const updateResult =
                await client.query(
                    `
            UPDATE orders
            SET status = $1
            WHERE id = $2
            RETURNING
              id,
              status
          `,
                    [
                        requestedStatus,
                        orderId,
                    ],
                )

            const updatedOrder =
                updateResult.rows[0]

            if (!updatedOrder) {
                throw new Error(
                    'Order status update returned no row',
                )
            }

            switch (requestedStatus) {
                case 'IN_PROGRESS':
                    await recordProductAuditEvent(
                        client,
                        {
                            action:
                                'ORDER_PROCESSING_STARTED',
                            actor,
                            orderId,
                            request:
                                productAuditRequest,
                            paymentStatus,
                        },
                    )
                    break

                case 'COMPLETED':
                    await recordProductAuditEvent(
                        client,
                        {
                            action:
                                'ORDER_COMPLETED',
                            actor,
                            orderId,
                            request:
                                productAuditRequest,
                            paymentStatus,
                        },
                    )
                    break

                case 'CANCELLED':
                    if (
                        currentStatus !== 'NEW' &&
                        currentStatus !==
                        'IN_PROGRESS'
                    ) {
                        throw new Error(
                            'Cancellation audit received an invalid previous status',
                        )
                    }

                    await recordProductAuditEvent(
                        client,
                        {
                            action:
                                'ORDER_CANCELLED',
                            actor,
                            orderId,
                            request:
                                productAuditRequest,
                            previousOrderStatus:
                                currentStatus,
                            paymentStatus,
                        },
                    )
                    break

                case 'NEW':
                    throw new Error(
                        'A successful lifecycle transition cannot target NEW',
                    )
            }

            await client.query('COMMIT')
            transactionStarted = false

            return response.json({
                id: updatedOrder.id,
                status:
                    updatedOrder.status,
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
                } catch {
                    client.release(true)
                    client = undefined
                }
            }

            throw error
        } finally {
            client?.release()
        }
    }