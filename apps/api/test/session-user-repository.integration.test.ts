import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { provisionUser } from '../src/auth/provisionUser.js'
import {
  resolveSessionUser,
} from '../src/auth/sessionUserRepository.js'
import { pool } from '../src/db.js'

const VALID_PASSWORD =
  'a memorable test passphrase'

describe('Session user resolution', () => {
  beforeEach(async () => {
    await pool.query(`
      TRUNCATE user_sessions, users
      RESTART IDENTITY CASCADE
    `)
  })

  afterAll(async () => {
    await pool.end()
  })

  it('resolves an active user with the matching session version', async () => {
    const user = await provisionUser({
      username: 'order.operator',
      password: VALID_PASSWORD,
      role: 'ORDER_OPERATOR',
    })

    const resolution =
      await resolveSessionUser(
        user.id,
        user.sessionVersion,
      )

    expect(resolution).toEqual({
      accepted: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    })
  })

  it('rejects a session when its user no longer exists', async () => {
    const resolution =
      await resolveSessionUser(
        999_999,
        1,
      )

    expect(resolution).toEqual({
      accepted: false,
      reasonCode:
        'SESSION_USER_NOT_FOUND',
    })
  })

  it('rejects a disabled user before evaluating the session version', async () => {
    const user = await provisionUser({
      username: 'disabled.operator',
      password: VALID_PASSWORD,
      role: 'ORDER_OPERATOR',
    })

    await pool.query(
      `
        UPDATE users
        SET status = 'DISABLED'
        WHERE id = $1
      `,
      [user.id],
    )

    const resolution =
      await resolveSessionUser(
        user.id,
        user.sessionVersion + 1,
      )

    expect(resolution).toEqual({
      accepted: false,
      reasonCode: 'USER_DISABLED',
    })
  })

  it('rejects an active user when the session version does not match', async () => {
    const user = await provisionUser({
      username: 'order.operator',
      password: VALID_PASSWORD,
      role: 'ORDER_OPERATOR',
    })

    const resolution =
      await resolveSessionUser(
        user.id,
        user.sessionVersion + 1,
      )

    expect(resolution).toEqual({
      accepted: false,
      reasonCode:
        'SESSION_VERSION_MISMATCH',
    })
  })
  
})