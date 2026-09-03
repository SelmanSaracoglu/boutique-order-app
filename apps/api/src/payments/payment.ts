export const PAYMENT_STATUSES = [
  'AWAITING_PAYMENT',
  'REPORTED',
  'CONFIRMED',
] as const

export type PaymentStatus =
  (typeof PAYMENT_STATUSES)[number]

export const PAYMENT_METHODS = [
  'BANK_TRANSFER',
  'PAYPAL',
] as const

export type PaymentMethod =
  (typeof PAYMENT_METHODS)[number]