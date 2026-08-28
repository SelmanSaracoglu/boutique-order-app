import * as argon2 from 'argon2'
import { z } from 'zod'

export const MIN_PASSWORD_LENGTH = 12
export const MAX_PASSWORD_LENGTH = 128

export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const

export function normalizePassword(password: string): string {
  return password.normalize('NFC')
}

function getPasswordLength(password: string): number {
  return Array.from(password).length
}

export const passwordSchema = z
  .string()
  .transform(normalizePassword)
  .superRefine((password, context) => {
    const passwordLength = getPasswordLength(password)

    if (passwordLength < MIN_PASSWORD_LENGTH) {
      context.addIssue({
        code: 'custom',
        message: `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`,
      })
    }

    if (passwordLength > MAX_PASSWORD_LENGTH) {
      context.addIssue({
        code: 'custom',
        message: `Password must contain at most ${MAX_PASSWORD_LENGTH} characters.`,
      })
    }
  })

export async function hashPassword(password: string): Promise<string> {
  const validatedPassword = passwordSchema.parse(password)

  return argon2.hash(validatedPassword, ARGON2_OPTIONS)
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  const normalizedPassword = normalizePassword(password)

  return argon2.verify(passwordHash, normalizedPassword)
}