import { pool } from '../db.js'
import type { UserRole } from './user.js'

interface SessionUserRow {
  id: number
  username: string
  role: UserRole
}

export interface SessionUser {
  id: number
  username: string
  role: UserRole
}

export async function findSessionUser(
  userId: number,
  sessionVersion: number,
): Promise<SessionUser | null> {
  const result = await pool.query<SessionUserRow>(
    `
      SELECT
        id,
        username,
        role
      FROM users
      WHERE id = $1
        AND status = 'ACTIVE'
        AND session_version = $2
    `,
    [userId, sessionVersion],
  )

  return result.rows[0] ?? null
}