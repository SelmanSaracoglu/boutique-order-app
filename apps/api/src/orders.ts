import { Router } from 'express'
import {
  requireCsrf,
} from './auth/requireCsrf.js'
import {
  requirePermission,
} from './auth/requirePermission.js'
import {
  createOrderHandler,
} from './orders/createOrderHandler.js'
import {
  getOrderDetailHandler,
} from './orders/getOrderDetailHandler.js'
import {
  listOrdersHandler,
} from './orders/listOrdersHandler.js'
import {
  updateOrderStatusHandler,
} from './orders/updateOrderStatusHandler.js'

export const ordersRouter = Router()

ordersRouter.post(
  '/',
  requirePermission('ORDER_CREATE'),
  requireCsrf,
  createOrderHandler,
)

ordersRouter.patch(
  '/:orderId/status',
  requirePermission(
    'ORDER_STATUS_UPDATE',
  ),
  requireCsrf,
  updateOrderStatusHandler,
)

ordersRouter.get(
  '/',
  requirePermission('ORDER_READ'),
  listOrdersHandler,
)

ordersRouter.get(
  '/:orderId',
  requirePermission('ORDER_READ'),
  getOrderDetailHandler,
)