export const USER_ROLES = [
  'ADMIN',
  'ORDER_OPERATOR',
  'PAYMENT_OPERATOR',
  'FULFILLMENT_OPERATOR',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type AuthenticatedUser = {
  id: number;
  username: string;
  role: UserRole;
};

export type AuthenticatedSession = {
  user: AuthenticatedUser;
  csrfToken: string;
};

export type LoginCredentials = {
  username: string;
  password: string;
};