import type { UserRole } from './auth.types';

export const ORDER_PERMISSIONS = [
  'ORDER_READ',
  'ORDER_CREATE',
  'ORDER_STATUS_UPDATE',
] as const;

export type Permission =
  (typeof ORDER_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<
  UserRole,
  readonly Permission[]
> = {
  ADMIN: ORDER_PERMISSIONS,
  ORDER_OPERATOR: ORDER_PERMISSIONS,
  PAYMENT_OPERATOR: ['ORDER_READ'],
  FULFILLMENT_OPERATOR: [
    'ORDER_READ',
    'ORDER_STATUS_UPDATE',
  ],
};

export function hasPermission(
  role: UserRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}