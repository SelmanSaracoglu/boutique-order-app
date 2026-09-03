import { describe, expect, it } from 'vitest';

import {
  USER_ROLES,
  type UserRole,
} from './auth.types';
import {
  hasPermission,
  PERMISSIONS,
  type Permission,
} from './permissions';

const EXPECTED_PERMISSIONS: Record<
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

describe('hasPermission', () => {
  it('matches the order permission matrix for every role', () => {
    for (const role of USER_ROLES) {
      for (const permission of PERMISSIONS) {
        const expected =
          EXPECTED_PERMISSIONS[role].includes(
            permission,
          );

        expect(
          hasPermission(role, permission),
          `${role} / ${permission}`,
        ).toBe(expected);
      }
    }
  });
});