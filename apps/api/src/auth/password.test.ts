import { describe, expect, it } from 'vitest'
import {
  ARGON2_OPTIONS,
  hashPassword,
  passwordSchema,
  verifyPassword,
} from './password.js'

describe('Password security', () => {
  it('enforces password length boundaries', () => {
    expect(passwordSchema.safeParse('a'.repeat(11)).success).toBe(false)
    expect(passwordSchema.safeParse('a'.repeat(12)).success).toBe(true)
    expect(passwordSchema.safeParse('a'.repeat(128)).success).toBe(true)
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false)
  })

  it('counts Unicode code points instead of UTF-16 units', () => {
    expect(passwordSchema.safeParse('😀'.repeat(12)).success).toBe(true)
  })

  it('accepts passphrases without composition requirements', () => {
    expect(
      passwordSchema.safeParse('a memorable test passphrase').success,
    ).toBe(true)
  })

  it('creates salted Argon2id hashes with the configured cost', async () => {
    const password = 'a memorable test passphrase'

    const firstHash = await hashPassword(password)
    const secondHash = await hashPassword(password)

    expect(firstHash).toMatch(/^\$argon2id\$/)
    expect(firstHash).toContain(`m=${ARGON2_OPTIONS.memoryCost}`)
    expect(firstHash).toContain(`t=${ARGON2_OPTIONS.timeCost}`)
    expect(firstHash).toContain(`p=${ARGON2_OPTIONS.parallelism}`)

    expect(firstHash).not.toBe(secondHash)
    expect(firstHash).not.toContain(password)
  })

  it('verifies the correct password and rejects a different password', async () => {
    const passwordHash = await hashPassword(
      'a memorable test passphrase',
    )

    await expect(
      verifyPassword(passwordHash, 'a memorable test passphrase'),
    ).resolves.toBe(true)

    await expect(
      verifyPassword(passwordHash, 'a different test passphrase'),
    ).resolves.toBe(false)
  })

  it('treats canonically equivalent Unicode passwords as equal', async () => {
    const composedPassword = 'café secure passphrase'
    const decomposedPassword = 'cafe\u0301 secure passphrase'

    const passwordHash = await hashPassword(composedPassword)

    await expect(
      verifyPassword(passwordHash, decomposedPassword),
    ).resolves.toBe(true)
  })
})