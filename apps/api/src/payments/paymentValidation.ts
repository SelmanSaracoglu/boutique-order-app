import { z } from 'zod'
import { PAYMENT_METHODS } from './payment.js'

export const reportPaymentSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS),
}).strict()