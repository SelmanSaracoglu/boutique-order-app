import { Router } from 'express'
import {
  recordRequestValidationFailure,
} from '../audit/requestValidationAudit.js'
import {
  requireCsrf,
} from '../auth/requireCsrf.js'
import {
  requirePermission,
} from '../auth/requirePermission.js'
import {
  orderIdSchema,
} from '../orderValidation.js'
import {
  confirmPayment,
} from './confirmPayment.js'
import {
  reportPayment,
} from './reportPayment.js'
import {
  reportPaymentSchema,
} from './paymentValidation.js'

export const paymentRouter = Router()

paymentRouter.post( '/:orderId/payment-confirmation',
  requirePermission('PAYMENT_CONFIRM'),
  requireCsrf,
  async (request, response) => {
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
            'CONFIRM_PAYMENT',
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

    try {
      const actor =
        request.authenticatedUser

      if (!actor) {
        throw new Error(
          'Authenticated actor is missing from payment confirmation',
        )
      }

      const result =
        await confirmPayment(
          orderId,
          actor,
        )

      if (
        result.outcome === 'not_found'
      ) {
        return response.status(404).json({
          error: {
            code: 'ORDER_NOT_FOUND',
            message:
              'Order was not found.',
          },
        })
      }

      if (
        result.outcome === 'not_allowed'
      ) {
        return response.status(409).json({
          error: {
            code:
              'INVALID_PAYMENT_TRANSITION',
            message:
              'Payment cannot be confirmed for this order.',
          },
        })
      }

      return response.json({
        id: result.payment.id,
        paymentStatus:
          result.payment.paymentStatus,
        paymentMethod:
          result.payment.paymentMethod,
      })
    } catch (error) {
      console.error(
        'Failed to confirm payment',
        error,
      )

      return response.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message:
            'Unable to confirm payment.',
        },
      })
    }
  },
)

paymentRouter.post( '/:orderId/payment-report',
  requirePermission('PAYMENT_REPORT'),
  requireCsrf,
  async (request, response) => {
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
            'REPORT_PAYMENT',
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
      reportPaymentSchema.safeParse(
        request.body,
      )

    if (
      !inputValidationResult.success
    ) {
      await recordRequestValidationFailure(
        request,
        {
          operation:
            'REPORT_PAYMENT',
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
            'Payment report input is invalid.',
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

    try {
      const actor =
        request.authenticatedUser

      if (!actor) {
        throw new Error(
          'Authenticated actor is missing from payment report',
        )
      }

      const result =
        await reportPayment(
          orderId,
          inputValidationResult.data
            .paymentMethod,
          actor,
        )

      if (
        result.outcome === 'not_found'
      ) {
        return response.status(404).json({
          error: {
            code: 'ORDER_NOT_FOUND',
            message:
              'Order was not found.',
          },
        })
      }

      if (
        result.outcome === 'not_allowed'
      ) {
        return response.status(409).json({
          error: {
            code:
              'INVALID_PAYMENT_TRANSITION',
            message:
              'Payment cannot be reported for this order.',
          },
        })
      }

      return response.json({
        id: result.payment.id,
        paymentStatus:
          result.payment.paymentStatus,
        paymentMethod:
          result.payment.paymentMethod,
      })
    } catch (error) {
      console.error(
        'Failed to report payment',
        error,
      )

      return response.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message:
            'Unable to report payment.',
        },
      })
    }
  },
)