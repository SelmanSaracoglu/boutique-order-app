import { randomBytes } from 'node:crypto'
import type { Request } from 'express'

interface AuthenticatedSessionIdentity {
  userId: number
  sessionVersion: number
}

function regenerateSession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => {
      if (error) {
        reject(error)

        return
      }

      resolve()
    })
  })
}

function saveSession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.save((error) => {
      if (error) {
        reject(error)

        return
      }

      resolve()
    })
  })
}

export async function establishAuthenticatedSession(
  request: Request,
  identity: AuthenticatedSessionIdentity,
): Promise<string> {
  await regenerateSession(request)

  const csrfToken = randomBytes(32).toString('base64url')

  request.session.userId = identity.userId
  request.session.sessionVersion = identity.sessionVersion
  request.session.authenticatedAt = Date.now()
  request.session.csrfToken = csrfToken

  await saveSession(request)

  return csrfToken
}