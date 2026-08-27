import { describe, expect, it } from 'vitest'

import {
  canTransitionOrderStatus,
  type OrderStatus,
} from './orderLifecycle.js'

const permittedTransitions: Array<[OrderStatus, OrderStatus]> = [
  ['NEW', 'IN_PROGRESS'],
  ['NEW', 'CANCELLED'],
  ['IN_PROGRESS', 'COMPLETED'],
  ['IN_PROGRESS', 'CANCELLED'],
]

const rejectedTransitions: Array<[OrderStatus, OrderStatus]> = [
  ['NEW', 'NEW'],
  ['NEW', 'COMPLETED'],
  ['IN_PROGRESS', 'NEW'],
  ['IN_PROGRESS', 'IN_PROGRESS'],
  ['COMPLETED', 'NEW'],
  ['COMPLETED', 'IN_PROGRESS'],
  ['COMPLETED', 'COMPLETED'],
  ['COMPLETED', 'CANCELLED'],
  ['CANCELLED', 'NEW'],
  ['CANCELLED', 'IN_PROGRESS'],
  ['CANCELLED', 'COMPLETED'],
  ['CANCELLED', 'CANCELLED'],
]

describe('order lifecycle transitions', () => {
  it.each(permittedTransitions)(
    'allows %s to transition to %s',
    (currentStatus, requestedStatus) => {
      expect(
        canTransitionOrderStatus(currentStatus, requestedStatus),
      ).toBe(true)
    },
  )

  it.each(rejectedTransitions)(
    'rejects %s to %s',
    (currentStatus, requestedStatus) => {
      expect(
        canTransitionOrderStatus(currentStatus, requestedStatus),
      ).toBe(false)
    },
  )
})