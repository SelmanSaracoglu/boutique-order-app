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
    allowedPermissions: PERMISSIONS,
  },
  {
    role: 'ORDER_OPERATOR',
    allowedPermissions: PERMISSIONS,
  },
  {
    role: 'PAYMENT_OPERATOR',
    allowedPermissions: ['ORDER_READ'],
  },
  {
    role: 'FULFILLMENT_OPERATOR',
    allowedPermissions: [
      'ORDER_READ',
      'ORDER_STATUS_UPDATE',
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