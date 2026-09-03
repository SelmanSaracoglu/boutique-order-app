import { describe, expect, it } from 'vitest'
import type { UserRole } from './user.js'
import {
  hasPermission,
  PERMISSIONS,
  type Permission,
} from './permissions.js'

const rolePermissionCases: Array<{
  role: UserRole
  allowedPermissions: readonly Permission[]
}> = [
  {
    role: 'ADMIN',
    allowedPermissions: [
      'ORDER_READ',
      'ORDER_CREATE',
      'ORDER_STATUS_UPDATE',
      'PAYMENT_REPORT',
    ],
  },
  {
    role: 'ORDER_OPERATOR',
    allowedPermissions: [
      'ORDER_READ',
      'ORDER_CREATE',
      'ORDER_STATUS_UPDATE',
      'PAYMENT_REPORT',
    ],
  },
  {
    role: 'PAYMENT_OPERATOR',
    allowedPermissions: [
      'ORDER_READ',
      'PAYMENT_REPORT',
      'PAYMENT_CONFIRM',
    ],
  },
  {
    role: 'FULFILLMENT_OPERATOR',
    allowedPermissions: [
      'ORDER_READ',
      'ORDER_STATUS_UPDATE',
      'PAYMENT_REPORT',
    ],
  },
]

describe('Role permissions', () => {
  it.each(rolePermissionCases)(
    'grants only the expected permissions to $role',
    ({ role, allowedPermissions }) => {
      for (const permission of PERMISSIONS) {
        expect(hasPermission(role, permission)).toBe(
          allowedPermissions.includes(permission),
        )
      }
    },
  )
})