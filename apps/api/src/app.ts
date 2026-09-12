import express from 'express'
import { authRouter } from './auth/authRouter.js'
import { requireAuthentication, } from './auth/requireAuthentication.js'
import { sessionMiddleware, } from './auth/session.js'
import { applicationErrorHandler, } from './http/applicationErrorHandler.js'
import { requestContextMiddleware, } from './http/requestContext.js'
import { accessLoggerMiddleware, } from './logging/accessLogger.js'
import { ordersRouter } from './orders.js'
import { paymentRouter, } from './payments/paymentRouter.js'
import { auditReadRouter, } from './audit/auditReadRouter.js'

export const app = express()

app.use(requestContextMiddleware)
app.use(accessLoggerMiddleware)
app.use(sessionMiddleware)
app.use(express.json())

app.use('/api/auth', authRouter)

app.use(
  '/api/audit-events',
  requireAuthentication,
  auditReadRouter,
)

app.use(
  '/api/orders',
  requireAuthentication,
  paymentRouter,
  ordersRouter,
)

app.use(applicationErrorHandler)