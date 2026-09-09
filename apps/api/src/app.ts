import express, {
  type ErrorRequestHandler,
} from 'express'
import {
  recordRequestValidationFailure,
} from './audit/requestValidationAudit.js'
import { authRouter } from './auth/authRouter.js'
import {
  requireAuthentication,
} from './auth/requireAuthentication.js'
import {
  sessionMiddleware,
} from './auth/session.js'
import {
  requestContextMiddleware,
} from './http/requestContext.js'
import {
  accessLoggerMiddleware,
} from './logging/accessLogger.js'
import { ordersRouter } from './orders.js'
import {
  paymentRouter,
} from './payments/paymentRouter.js'

export const app = express()

app.use(requestContextMiddleware)
app.use(accessLoggerMiddleware)
app.use(sessionMiddleware)
app.use(express.json())

app.use('/api/auth', authRouter)

app.use(
  '/api/orders',
  requireAuthentication,
  paymentRouter,
  ordersRouter,
)

const errorHandler: ErrorRequestHandler =
  async (
    error,
    request,
    response,
    _next,
  ) => {
    void _next

    if (
      error instanceof SyntaxError &&
      'status' in error &&
      error.status === 400
    ) {
      await recordRequestValidationFailure(
        request,
        {
          operation:
            'VALIDATE_REQUEST',
          reasonCode: 'INVALID_JSON',
        },
      )

      response.status(400).json({
        error: {
          code: 'INVALID_JSON',
          message:
            'Request body contains invalid JSON.',
        },
      })

      return
    }

    console.error(
      'Unhandled application error',
      error,
    )

    response.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message:
          'An unexpected error occurred.',
      },
    })
  }

app.use(errorHandler)