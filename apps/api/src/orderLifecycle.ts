export const ORDER_STATUSES = [
  'NEW',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

const allowedTransitions: Record<
  OrderStatus,
  readonly OrderStatus[]
> = {
  NEW: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

export function canTransitionOrderStatus(
  currentStatus: OrderStatus,
  requestedStatus: OrderStatus,
): boolean {
  return allowedTransitions[currentStatus].includes(requestedStatus)
}

