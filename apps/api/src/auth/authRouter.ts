import { Router } from 'express'
import { authenticateUser } from './authenticateUser.js'
import { establishAuthenticatedSession } from './sessionLifecycle.js'

export const authRouter = Router()

authRouter.post('/login', async (request, response, next) => {
  try {
    const authenticatedUser = await authenticateUser(request.body)

    if (!authenticatedUser) {
      response.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password.',
        },
      })
      return
    }

    const csrfToken = await establishAuthenticatedSession(request, {
      userId: authenticatedUser.id,
      sessionVersion: authenticatedUser.sessionVersion,
    })

    response.status(200).json({
      user: {
        id: authenticatedUser.id,
        username: authenticatedUser.username,
        role: authenticatedUser.role,
      },
      csrfToken,
    })
  } catch (error) {
    next(error)
  }
})