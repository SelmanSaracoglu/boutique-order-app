import { describe, expect, it } from 'vitest'
import {
  USER_ROLES,
  USER_STATUSES,
  userRoleSchema,
  userStatusSchema,
  usernameSchema,
} from './user.js'

describe('User identity rules', () => {
  it('normalizes usernames before validation', () => {
    expect(usernameSchema.parse('  Order.Operator  ')).toBe(
      'order.operator',
    )
  })

  it.each([
    'ab',
    '_operator',
    'order operator',
    'operator!',
    'a'.repeat(65),
  ])('rejects invalid username %s', (username) => {
    expect(usernameSchema.safeParse(username).success).toBe(false)
  })

  it.each(USER_ROLES)('accepts the %s role', (role) => {
    expect(userRoleSchema.safeParse(role).success).toBe(true)
  })

  it('rejects unsupported roles', () => {
    expect(userRoleSchema.safeParse('SUPER_ADMIN').success).toBe(false)
  })

  it.each(USER_STATUSES)('accepts the %s status', (status) => {
    expect(userStatusSchema.safeParse(status).success).toBe(true)
  })

  it('rejects unsupported account statuses', () => {
    expect(userStatusSchema.safeParse('LOCKED').success).toBe(false)
  })
})