import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  provisionUser,
  UserProvisioningError,
} from '../src/auth/provisionUser.js'
import {
  hashPassword,
  verifyPassword,
} from '../src/auth/password.js'
import { USER_ROLES } from '../src/auth/user.js'
import { pool } from '../src/db.js'

const VALID_PASSWORD = 'test passphrase'

describe('User provisioning', () => {
  beforeEach(async () => {
    await pool.query('TRUNCATE users RESTART IDENTITY CASCADE')
  })

  afterAll(async () => {
    await pool.end()
  })

  it('persists a named active user with an Argon2id credential', async () => {
    const user = await provisionUser({
      username: '  Order.Operator  ',
      password: VALID_PASSWORD,
      role: 'ORDER_OPERATOR',
    })

    expect(user).toMatchObject({
      id: 1,
      username: 'order.operator',
      role: 'ORDER_OPERATOR',
      status: 'ACTIVE',
      sessionVersion: 1,
    })

    expect(user.createdAt).toEqual(expect.any(String))
    expect(user).not.toHaveProperty('password')
    expect(user).not.toHaveProperty('passwordHash')

    const result = await pool.query(
      `
        SELECT
          username,
          password_hash,
          role,
          status,
          session_version
        FROM users
        WHERE id = $1
      `,
      [user.id],
    )

    expect(result.rows).toHaveLength(1)

    expect(result.rows[0]).toMatchObject({
      username: 'order.operator',
      role: 'ORDER_OPERATOR',
      status: 'ACTIVE',
      session_version: 1,
    })

    expect(result.rows[0].password_hash).toMatch(/^\$argon2id\$/)
    expect(result.rows[0].password_hash).not.toContain(
      VALID_PASSWORD,
    )

    await expect(
      verifyPassword(
        result.rows[0].password_hash,
        VALID_PASSWORD,
      ),
    ).resolves.toBe(true)
  })

  it.each(USER_ROLES)(
    'provisions a user with the %s role',
    async (role) => {
      const user = await provisionUser({
        username: `user.${role.toLowerCase()}`,
        password: VALID_PASSWORD,
        role,
      })

      expect(user.role).toBe(role)
    },
  )

  it('rejects duplicate canonical usernames', async () => {
    await provisionUser({
      username: 'operator',
      password: VALID_PASSWORD,
      role: 'ORDER_OPERATOR',
    })

    await expect(
      provisionUser({
        username: '  OPERATOR  ',
        password: VALID_PASSWORD,
        role: 'FULFILLMENT_OPERATOR',
      }),
    ).rejects.toMatchObject<Partial<UserProvisioningError>>({
      code: 'USERNAME_EXISTS',
    })

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM users',
    )

    expect(countResult.rows[0].count).toBe(1)
  })

  it('rejects invalid input without persisting a user', async () => {
    await expect(
      provisionUser({
        username: 'operator',
        password: 'short',
        role: 'ORDER_OPERATOR',
      }),
    ).rejects.toMatchObject<Partial<UserProvisioningError>>({
      code: 'INVALID_INPUT',
    })

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM users',
    )

    expect(countResult.rows[0].count).toBe(0)
  })

  it('enforces credential constraints in PostgreSQL', async () => {
    const passwordHash = await hashPassword(VALID_PASSWORD)

    await expect(
      pool.query(
        `
          INSERT INTO users (
            username,
            password_hash,
            role
          )
          VALUES ($1, $2, $3)
        `,
        ['invalid.role', passwordHash, 'SUPER_ADMIN'],
      ),
    ).rejects.toMatchObject({
      code: '23514',
    })

    await expect(
      pool.query(
        `
          INSERT INTO users (
            username,
            password_hash,
            role,
            status
          )
          VALUES ($1, $2, $3, $4)
        `,
        ['invalid.status', passwordHash, 'ADMIN', 'LOCKED'],
      ),
    ).rejects.toMatchObject({
      code: '23514',
    })

    await expect(
      pool.query(
        `
          INSERT INTO users (
            username,
            password_hash,
            role,
            session_version
          )
          VALUES ($1, $2, $3, $4)
        `,
        ['invalid.version', passwordHash, 'ADMIN', 0],
      ),
    ).rejects.toMatchObject({
      code: '23514',
    })

    await expect(
      pool.query(
        `
          INSERT INTO users (
            username,
            password_hash,
            role
          )
          VALUES ($1, $2, $3)
        `,
        ['plain.password', 'plain-text-password', 'ADMIN'],
      ),
    ).rejects.toMatchObject({
      code: '23514',
    })

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM users',
    )

    expect(countResult.rows[0].count).toBe(0)
  })
})