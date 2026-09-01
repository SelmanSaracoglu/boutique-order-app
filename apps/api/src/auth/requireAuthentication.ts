import type { RequestHandler } from 'express'
import { destroySession } from './sessionLifecycle.js'
import { findSessionUser } from './sessionUserRepository.js'

const authenticationRequiredResponse = {
  error: {
    code: 'AUTHENTICATION_REQUIRED',
    message: 'Authentication required.',
  },
}

export const requireAuthentication: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const { userId, sessionVersion } = request.session

    const hasValidSessionIdentity =
      typeof userId === 'number' &&
      Number.isInteger(userId) &&
      userId > 0 &&
      typeof sessionVersion === 'number' &&
      Number.isInteger(sessionVersion) &&
      sessionVersion > 0

    if (!hasValidSessionIdentity) {
      response.status(401).json(authenticationRequiredResponse)
      return
    }

    const sessionUser = await findSessionUser(
      userId,
      sessionVersion,
    )

    if (!sessionUser) {
      await destroySession(request)

      response.status(401).json(authenticationRequiredResponse)
      return
    }

    request.authenticatedUser = sessionUser
    next()
  } catch (error) {
    next(error)
  }
}