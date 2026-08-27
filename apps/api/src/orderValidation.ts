import { z } from 'zod'
import { ORDER_STATUSES } from './orderLifecycle.js'

const MAX_POSTGRES_INTEGER = 2_147_483_647
const MAX_UNIT_PRICE = 9_999_999_999.99

const orderItemSchema = z.object({
  supplierAlias: z.string().trim().min(1),
  description: z.string().trim().min(1),
  size: z.string().trim().min(1).optional(),
  color: z.string().trim().min(1).optional(),
  quantity: z.number().int().positive().max(MAX_POSTGRES_INTEGER),
  unitPrice: z.number().positive().max(MAX_UNIT_PRICE).multipleOf(0.01),
})

export const createOrderSchema = z.object({
  orderSource: z.enum(['instagram', 'whatsapp']),
  customerIdentifier: z.string().trim().min(1),
  customerName: z.string().trim().min(1).optional(),
  operationalNote: z.string().trim().min(1).optional(),
  items: z.array(orderItemSchema).min(1),
}).strict()

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
}).strict()

export const orderIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(MAX_POSTGRES_INTEGER)

export type CreateOrderInput = z.infer<typeof createOrderSchema>