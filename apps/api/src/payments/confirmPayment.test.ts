import { describe, expect, it } from 'vitest'
import type { PaymentOrder } from './paymentRepository.js'
import { canConfirmPayment } from './confirmPayment.js'

const confirmationCases: Array<{
  name: string
  orderStatus: PaymentOrder['orderStatus']
  paymentStatus: PaymentOrder['paymentStatus']
  paymentMethod: PaymentOrder['paymentMethod']
  expected: boolean
}> = [
  {
    name: 'a reported payment for a new order',
    orderStatus: 'NEW',
    paymentStatus: 'REPORTED',
    paymentMethod: 'BANK_TRANSFER',
    expected: true,
  },
  {
    name: 'a reported payment for an in-progress order',
    orderStatus: 'IN_PROGRESS',
    paymentStatus: 'REPORTED',
    paymentMethod: 'PAYPAL',
    expected: true,
  },
  {
    name: 'an awaiting payment',
    orderStatus: 'NEW',
    paymentStatus: 'AWAITING_PAYMENT',
    paymentMethod: null,
    expected: false,
  },
  {
    name: 'an already confirmed payment',
    orderStatus: 'NEW',
    paymentStatus: 'CONFIRMED',
    paymentMethod: 'BANK_TRANSFER',
    expected: false,
  },
  {
    name: 'a completed order',
    orderStatus: 'COMPLETED',
    paymentStatus: 'REPORTED',
    paymentMethod: 'BANK_TRANSFER',
    expected: false,
  },
  {
    name: 'a cancelled order',
    orderStatus: 'CANCELLED',
    paymentStatus: 'REPORTED',
    paymentMethod: 'BANK_TRANSFER',
    expected: false,
  },
  {
    name: 'an inconsistent report without a payment method',
    orderStatus: 'NEW',
    paymentStatus: 'REPORTED',
    paymentMethod: null,
    expected: false,
  },
]

describe('canConfirmPayment', () => {
  it.each(confirmationCases)(
    'returns $expected for $name',
    ({
      orderStatus,
      paymentStatus,
      paymentMethod,
      expected,
    }) => {
      expect(
        canConfirmPayment({
          id: 1,
          orderStatus,
          paymentStatus,
          paymentMethod,
        }),
      ).toBe(expected)
    },
  )
})