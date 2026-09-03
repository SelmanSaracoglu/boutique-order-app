import express, { type ErrorRequestHandler } from 'express'
import { ordersRouter } from './orders.js'
import { authRouter } from './auth/authRouter.js'
import { paymentRouter } from './payments/paymentRouter.js'
import { sessionMiddleware } from './auth/session.js'
import { requireAuthentication } from './auth/requireAuthentication.js'

export const app = express()

app.use(sessionMiddleware)
app.use(express.json())
app.use('/api/auth', authRouter)

app.use(
  '/api/orders',
  requireAuthentication,
  paymentRouter,
  ordersRouter,
)

const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  void _next

  if (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400
  ) {
    return response.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON.',
      },
    })
  }

  console.error('Unhandled application error', error)

  return response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  })
}

app.use(errorHandler)

