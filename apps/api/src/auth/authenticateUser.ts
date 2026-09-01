import { z } from 'zod'
import {
  hashPassword,
  MAX_PASSWORD_LENGTH,
  verifyPassword,
} from './password.js'
import {
  findUserCredentialsByUsername,
} from './userCredentialsRepository.js'
import {
  usernameSchema,
  type UserRole,
} from './user.js'

export const authenticateUserInputSchema = z
  .object({
    username: usernameSchema,
    password: z.string().max(MAX_PASSWORD_LENGTH),
  })
  .strict()

export type AuthenticateUserInput = z.input<
  typeof authenticateUserInputSchema
>

export interface AuthenticatedUser {
  id: number
  username: string
  role: UserRole
  sessionVersion: number
}

const dummyPasswordHashPromise = hashPassword(
  'authentication-dummy-password-never-used-by-a-user',
)

export async function authenticateUser(
  input: unknown,
): Promise<AuthenticatedUser | null> {
  const validationResult =
    authenticateUserInputSchema.safeParse(input)

  const dummyPasswordHash = await dummyPasswordHashPromise

  if (!validationResult.success) {
    await verifyPassword(dummyPasswordHash, 'invalid-input')

    return null
  }

  const { username, password } = validationResult.data

  const credentials =
    await findUserCredentialsByUsername(username)

  const passwordHash =
    credentials?.passwordHash ?? dummyPasswordHash

  const passwordMatches = await verifyPassword(
    passwordHash,
    password,
  )

  if (
    !credentials ||
    !passwordMatches ||
    credentials.status !== 'ACTIVE'
  ) {
    return null
  }

  return {
    id: credentials.id,
    username: credentials.username,
    role: credentials.role,
    sessionVersion: credentials.sessionVersion,
  }
}