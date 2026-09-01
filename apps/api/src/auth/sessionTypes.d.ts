import 'express-session'

declare module 'express-session' {
  interface SessionData {
    userId?: number
    sessionVersion?: number
    authenticatedAt?: number
    csrfToken?: string
  }
}