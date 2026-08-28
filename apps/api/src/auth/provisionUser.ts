import { z } from 'zod'
import { pool } from '../db.js'
import { hashPassword, passwordSchema } from './password.js'
import {
  userRoleSchema,
  usernameSchema,
  type UserRole,
  type UserStatus,
} from './user.js'

export const provisionUserInputSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    role: userRoleSchema,
  })
  .strict()

export type ProvisionUserInput = z.input<
  typeof provisionUserInputSchema
>

export interface ProvisionedUser {
  id: number
  username: string
  role: UserRole
  status: UserStatus
  sessionVersion: number
  createdAt: string
}

type ProvisioningErrorCode =
  | 'INVALID_INPUT'
  | 'USERNAME_EXISTS'

export class UserProvisioningError extends Error {
  constructor(
    public readonly code: ProvisioningErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'UserProvisioningError'
  }
}

interface UserRow {
  id: number
  username: string
  role: UserRole
  status: UserStatus
  session_version: number
  created_at: Date
}

function isUniqueUsernameViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'users_username_unique'
  )
}

export async function provisionUser(
  input: ProvisionUserInput,
): Promise<ProvisionedUser> {
  const validationResult = provisionUserInputSchema.safeParse(input)

  if (!validationResult.success) {
    const firstIssue = validationResult.error.issues[0]

    throw new UserProvisioningError(
      'INVALID_INPUT',
      firstIssue?.message ?? 'User provisioning input is invalid.',
      validationResult.error,
    )
  }

  const { username, password, role } = validationResult.data
  const passwordHash = await hashPassword(password)

  try {
    const result = await pool.query<UserRow>(
      `
        INSERT INTO users (
          username,
          password_hash,
          role
        )
        VALUES ($1, $2, $3)
        RETURNING
          id,
          username,
          role,
          status,
          session_version,
          created_at
      `,
      [username, passwordHash, role],
    )

    const user = result.rows[0]

    if (!user) {
      throw new Error('User insert returned no row')
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      sessionVersion: user.session_version,
      createdAt: user.created_at.toISOString(),
    }
  } catch (error) {
    if (isUniqueUsernameViolation(error)) {
      throw new UserProvisioningError(
        'USERNAME_EXISTS',
        'A user with this username already exists.',
        error,
      )
    }

    throw error
  }
}