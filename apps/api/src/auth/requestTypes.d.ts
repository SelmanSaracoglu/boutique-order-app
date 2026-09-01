import type { SessionUser } from './sessionUserRepository.js'

declare module 'express-serve-static-core' {
  interface Request {
    authenticatedUser?: SessionUser
  }
}