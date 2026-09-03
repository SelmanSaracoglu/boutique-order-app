import type { UserRole } from './auth.types';

export const PERMISSIONS = [
  'ORDER_READ',
  'ORDER_CREATE',
  'ORDER_STATUS_UPDATE',
  'PAYMENT_REPORT',
  'PAYMENT_CONFIRM',
] as const;

export type Permission =
  (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<
  UserRole,
  readonly Permission[]
> = {
  ADMIN: [
    'ORDER_READ',
    'ORDER_CREATE',
    'ORDER_STATUS_UPDATE',
  ],
  ORDER_OPERATOR: [
    'ORDER_READ',
    'ORDER_CREATE',
    'ORDER_STATUS_UPDATE',
    'PAYMENT_REPORT',
  ],
  PAYMENT_OPERATOR: [
    'ORDER_READ',
    'PAYMENT_CONFIRM',
  ],
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