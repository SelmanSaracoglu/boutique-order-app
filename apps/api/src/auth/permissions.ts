import type { UserRole } from './user.js'

export const PERMISSIONS = [
  'ORDER_READ',
  'ORDER_CREATE',
  'ORDER_STATUS_UPDATE',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const ROLE_PERMISSIONS: Record<
  UserRole,
  readonly Permission[]
> = {
  ADMIN: PERMISSIONS,
  ORDER_OPERATOR: PERMISSIONS,
  PAYMENT_OPERATOR: ['ORDER_READ'],
  FULFILLMENT_OPERATOR: [
    'ORDER_READ',
    'ORDER_STATUS_UPDATE',
  ],
}

export function hasPermission(
  role: UserRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}