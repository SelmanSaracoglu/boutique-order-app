import { z } from 'zod'

export const USER_ROLES = [
  'ADMIN',
  'ORDER_OPERATOR',
  'PAYMENT_OPERATOR',
  'FULFILLMENT_OPERATOR',
] as const

export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const

export type UserRole = (typeof USER_ROLES)[number]
export type UserStatus = (typeof USER_STATUSES)[number]

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

export const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .pipe(
    z
      .string()
      .min(3, 'Username must contain at least 3 characters.')
      .max(64, 'Username must contain at most 64 characters.')
      .regex(
        /^[a-z0-9][a-z0-9._-]*$/,
        'Username contains unsupported characters.',
      ),
  )

export const userRoleSchema = z.enum(USER_ROLES)

export const userStatusSchema = z.enum(USER_STATUSES)