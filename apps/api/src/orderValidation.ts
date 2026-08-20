import { z } from 'zod'

const orderItemSchema = z.object({
  supplierAlias: z.string().trim().min(1),
  description: z.string().trim().min(1),
  size: z.string().trim().min(1).optional(),
  color: z.string().trim().min(1).optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
})

export const createOrderSchema = z.object({
  orderSource: z.enum(['instagram', 'whatsapp']),
  customerIdentifier: z.string().trim().min(1),
  customerName: z.string().trim().min(1).optional(),
  operationalNote: z.string().trim().min(1).optional(),
  items: z.array(orderItemSchema).min(1),
}).strict()

export type CreateOrderInput = z.infer<typeof createOrderSchema>