import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import {
  authenticateUser,
} from '../src/auth/authenticateUser.js'
import { hashPassword } from '../src/auth/password.js'
import { pool } from '../src/db.js'

const VALID_PASSWORD = 'a memorable test passphrase'

describe('User authentication', () => {
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE users RESTART IDENTITY CASCADE',
    )
  })

  afterAll(async () => {
    await pool.end()
  })

  it('authenticates an active user with valid credentials', async () => {
    const passwordHash = await hashPassword(VALID_PASSWORD)

    const insertResult = await pool.query<{ id: number }>(
      `
        INSERT INTO users (
          username,
          password_hash,
          role
        )
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      [
        'login.operator',
        passwordHash,
        'ORDER_OPERATOR',
      ],
    )

    const insertedUser = insertResult.rows[0]

    if (!insertedUser) {
      throw new Error('Test user insert returned no row')
    }

    const authenticatedUser = await authenticateUser({
      username: '  LOGIN.OPERATOR  ',
      password: VALID_PASSWORD,
    })

    expect(authenticatedUser).toEqual({
      id: insertedUser.id,
      username: 'login.operator',
      role: 'ORDER_OPERATOR',
      sessionVersion: 1,
    })

    expect(authenticatedUser).not.toHaveProperty('passwordHash')
    expect(authenticatedUser).not.toHaveProperty('status')
  })
  it('returns the same result for an unknown user and a wrong password', async () => {
    const passwordHash = await hashPassword(VALID_PASSWORD)

    await pool.query(
        `
        INSERT INTO users (
            username,
            password_hash,
            role
        )
        VALUES ($1, $2, $3)
        `,
        [
        'login.operator',
        passwordHash,
        'ORDER_OPERATOR',
        ],
    )

    const wrongPasswordResult = await authenticateUser({
        username: 'login.operator',
        password: 'this password is not correct',
    })

    const unknownUserResult = await authenticateUser({
        username: 'unknown.operator',
        password: VALID_PASSWORD,
    })

    expect(wrongPasswordResult).toBeNull()
    expect(unknownUserResult).toBeNull()
    })
    it('rejects a disabled user with valid credentials', async () => {
        const passwordHash = await hashPassword(VALID_PASSWORD)

        await pool.query(
            `
            INSERT INTO users (
                username,
                password_hash,
                role,
                status
            )
            VALUES ($1, $2, $3, $4)
            `,
            [
            'disabled.operator',
            passwordHash,
            'ORDER_OPERATOR',
            'DISABLED',
            ],
        )

        const authenticatedUser = await authenticateUser({
            username: 'disabled.operator',
            password: VALID_PASSWORD,
        })

        expect(authenticatedUser).toBeNull()
        })
})