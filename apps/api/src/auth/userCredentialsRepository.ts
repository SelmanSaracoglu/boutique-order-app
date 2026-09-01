import { pool } from '../db.js'
import type {
  UserRole,
  UserStatus,
} from './user.js'

interface UserCredentialsRow {
  id: number
  username: string
  password_hash: string
  role: UserRole
  status: UserStatus
  session_version: number
}

export interface UserCredentials {
  id: number
  username: string
  passwordHash: string
  role: UserRole
  status: UserStatus
  sessionVersion: number
}

export async function findUserCredentialsByUsername(
  normalizedUsername: string,
): Promise<UserCredentials | null> {
  const result = await pool.query<UserCredentialsRow>(
    `
      SELECT
        id,
        username,
        password_hash,
        role,
        status,
        session_version
      FROM users
      WHERE username = $1
    `,
    [normalizedUsername],
  )

  const row = result.rows[0]

  if (!row) {
    return null
  }

  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    sessionVersion: row.session_version,
  }
}