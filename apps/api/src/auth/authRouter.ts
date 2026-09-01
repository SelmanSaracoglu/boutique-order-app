import { Router } from 'express'
import { authenticateUser } from './authenticateUser.js'
import { 
  destroySession,
  establishAuthenticatedSession 
} from './sessionLifecycle.js'
import { requireAuthentication } from './requireAuthentication.js'
import { requireCsrf } from './requireCsrf.js'
import { SESSION_COOKIE_NAME } from './session.js'

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

authRouter.get(
  '/session',
  requireAuthentication,
  (request, response, next) => {
    const authenticatedUser = request.authenticatedUser
    const csrfToken = request.session.csrfToken

    if (
      !authenticatedUser ||
      typeof csrfToken !== 'string'
    ) {
      next(
        new Error(
          'Authenticated session context is incomplete',
        ),
      )
      return
    }

    response.status(200).json({
      user: authenticatedUser,
      csrfToken,
    })
  },
)
authRouter.post(
  '/logout',
  requireAuthentication,
  requireCsrf,
  async (request, response, next) => {
    try {
      await destroySession(request)

      response.clearCookie(SESSION_COOKIE_NAME, {
        path: '/',
      })

      response.status(204).send()
    } catch (error) {
      next(error)
    }
  },
)
