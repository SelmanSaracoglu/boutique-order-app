import { pool } from '../db.js'
import type {
  UserRole,
  UserStatus,
} from './user.js'

interface SessionUserRow {
  id: number
  username: string
  role: UserRole
  status: UserStatus
  session_version: number
}

export interface SessionUser {
  id: number
  username: string
  role: UserRole
}

export type SessionUserRejectionReasonCode =
  | 'SESSION_USER_NOT_FOUND'
  | 'USER_DISABLED'
  | 'SESSION_VERSION_MISMATCH'

export type SessionUserResolution =
  | {
      accepted: true
      user: SessionUser
    }
  | {
      accepted: false
      reasonCode:
        SessionUserRejectionReasonCode
    }

export async function resolveSessionUser(
  userId: number,
  sessionVersion: number,
): Promise<SessionUserResolution> {
  const result =
    await pool.query<SessionUserRow>(
      `
        SELECT
          id,
          username,
          role,
          status,
          session_version
        FROM users
        WHERE id = $1
      `,
      [userId],
    )

  const row = result.rows[0]

  if (!row) {
    return {
      accepted: false,
      reasonCode:
        'SESSION_USER_NOT_FOUND',
    }
  }

  if (row.status !== 'ACTIVE') {
    return {
      accepted: false,
      reasonCode: 'USER_DISABLED',
    }
  }

  if (
    row.session_version !== sessionVersion
  ) {
    return {
      accepted: false,
      reasonCode:
        'SESSION_VERSION_MISMATCH',
    }
  }

  return {
    accepted: true,
    user: {
      id: row.id,
      username: row.username,
      role: row.role,
    },
  }
}