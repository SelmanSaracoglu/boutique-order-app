import type {
  SessionUser,
} from '../auth/sessionUserRepository.js'
import type {
  OrderStatus,
} from '../orderLifecycle.js'
import type {
  CreateOrderInput,
} from '../orderValidation.js'
import type {
  PaymentMethod,
  PaymentStatus,
} from '../payments/payment.js'
import type {
  RequestAuditMetadata,
} from './requestAuditEvent.js'

export const PRODUCT_AUDIT_ACTIONS = [
  'ORDER_CREATED',
  'PAYMENT_REPORTED',
  'PAYMENT_CONFIRMED',
  'ORDER_PROCESSING_STARTED',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
] as const

export type ProductAuditAction =
  (typeof PRODUCT_AUDIT_ACTIONS)[number]

export type AuditActor = Pick<
  SessionUser,
  'id' | 'username' | 'role'
>

type BaseProductAuditEventInput = {
  actor: AuditActor
  orderId: number
  request: RequestAuditMetadata
}

export type ProductAuditEventInput =
  | (
      BaseProductAuditEventInput & {
        action: 'ORDER_CREATED'
        orderSource:
          CreateOrderInput['orderSource']
        itemCount: number
      }
    )
  | (
      BaseProductAuditEventInput & {
        action: 'PAYMENT_REPORTED'
        orderStatus: OrderStatus
        paymentMethod: PaymentMethod
      }
    )
  | (
      BaseProductAuditEventInput & {
        action: 'PAYMENT_CONFIRMED'
        orderStatus: OrderStatus
        paymentMethod: PaymentMethod
      }
    )
  | (
      BaseProductAuditEventInput & {
        action:
          'ORDER_PROCESSING_STARTED'
        paymentStatus: PaymentStatus
      }
    )
  | (
      BaseProductAuditEventInput & {
        action: 'ORDER_COMPLETED'
        paymentStatus: PaymentStatus
      }
    )
  | (
      BaseProductAuditEventInput & {
        action: 'ORDER_CANCELLED'
        previousOrderStatus:
          | 'NEW'
          | 'IN_PROGRESS'
        paymentStatus: PaymentStatus
      }
    )