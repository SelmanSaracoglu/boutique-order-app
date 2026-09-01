import 'dotenv/config'
import connectPgSimple from 'connect-pg-simple'
import session from 'express-session'
import { pool } from '../db.js'

export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000
export const SESSION_ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000
export const SESSION_COOKIE_NAME = 'boutique.sid'

const SESSION_SECRET_EXAMPLE =
  'replace_with_at_least_32_random_bytes'

const sessionSecret = process.env.SESSION_SECRET

if (
  !sessionSecret ||
  Buffer.byteLength(sessionSecret, 'utf8') < 32 ||
  sessionSecret === SESSION_SECRET_EXAMPLE
) {
  throw new Error(
    'SESSION_SECRET must contain at least 32 bytes of random data',
  )
}

const PostgresSessionStore = connectPgSimple(session)
const isProduction = process.env.NODE_ENV === 'production'

export const sessionMiddleware = session({
    name: SESSION_COOKIE_NAME,

    secret: sessionSecret,

    store: new PostgresSessionStore({
      pool,
      tableName: 'user_sessions',
      createTableIfMissing: false,
      ttl: SESSION_IDLE_TIMEOUT_MS / 1000,
      pruneSessionInterval: 15 * 60,
    }),

    resave: false,
    saveUninitialized: false,
    rolling: true,

    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: SESSION_IDLE_TIMEOUT_MS,
      path: '/',
    },
})

