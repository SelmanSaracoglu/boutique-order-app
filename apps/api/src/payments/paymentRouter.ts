import { Router } from 'express'
import { requireCsrf } from '../auth/requireCsrf.js'
import { requirePermission } from '../auth/requirePermission.js'
import { orderIdSchema } from '../orderValidation.js'
import { reportPayment } from './reportPayment.js'
import { reportPaymentSchema } from './paymentValidation.js'
import { confirmPayment } from './confirmPayment.js'

export const paymentRouter = Router()

paymentRouter.post( '/:orderId/payment-confirmation',
  requirePermission('PAYMENT_CONFIRM'),
  requireCsrf,
  async (request, response) => {
    const orderIdValidationResult =
      orderIdSchema.safeParse(request.params.orderId)

    if (!orderIdValidationResult.success) {
      return response.status(400).json({
        error: {
          code: 'INVALID_ORDER_ID',
          message: 'Order ID is invalid.',
        },
      })
    }

    try {
      const result = await confirmPayment(
        orderIdValidationResult.data,
      )

      if (result.outcome === 'not_found') {
        return response.status(404).json({
          error: {
            code: 'ORDER_NOT_FOUND',
            message: 'Order was not found.',
          },
        })
      }

      if (result.outcome === 'not_allowed') {
        return response.status(409).json({
          error: {
            code: 'INVALID_PAYMENT_TRANSITION',
            message:
              'Payment cannot be confirmed for this order.',
          },
        })
      }

      return response.json({
        id: result.payment.id,
        paymentStatus: result.payment.paymentStatus,
        paymentMethod: result.payment.paymentMethod,
      })
    } catch (error) {
      console.error('Failed to confirm payment', error)

      return response.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to confirm payment.',
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
      orderIdSchema.safeParse(request.params.orderId)

    if (!orderIdValidationResult.success) {
      return response.status(400).json({
        error: {
          code: 'INVALID_ORDER_ID',
          message: 'Order ID is invalid.',
        },
      })
    }

    const inputValidationResult =
      reportPaymentSchema.safeParse(request.body)

    if (!inputValidationResult.success) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Payment report input is invalid.',
          issues:
            inputValidationResult.error.issues.map(
              (issue) => ({
                path: issue.path.join('.'),
                message: issue.message,
              }),
            ),
        },
      })
    }

    try {
      const result = await reportPayment(
        orderIdValidationResult.data,
        inputValidationResult.data.paymentMethod,
      )

      if (result.outcome === 'not_found') {
        return response.status(404).json({
          error: {
            code: 'ORDER_NOT_FOUND',
            message: 'Order was not found.',
          },
        })
      }

      if (result.outcome === 'not_allowed') {
        return response.status(409).json({
          error: {
            code: 'INVALID_PAYMENT_TRANSITION',
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
      console.error('Failed to report payment', error)

      return response.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to report payment.',
        },
      })
    }
  },
)