import { Router } from 'express'
import { buildRequestAuditMetadata } from '../audit/auditRequestMetadata.js'
import { tryRecordSecurityAuditEvent } from '../audit/requestAuditRepository.js'
import { authenticateUser } from './authenticateUser.js'
import {
  loginRateLimiter,
} from './loginRateLimiter.js'
import {
  destroySession,
  establishAuthenticatedSession,
} from './sessionLifecycle.js'
import { requireAuthentication } from './requireAuthentication.js'
import { requireCsrf } from './requireCsrf.js'
import { SESSION_COOKIE_NAME } from './session.js'

const LOGIN_ROUTE = '/api/auth/login'

const invalidCredentialsResponse = {
  error: {
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid username or password.',
  },
}

const loginRateLimitedResponse = {
  error: {
    code: 'LOGIN_RATE_LIMITED',
    message:
      'Too many login attempts. Try again later.',
  },
}

const loginAuditFailureResponse = {
  error: {
    code: 'INTERNAL_ERROR',
    message: 'Unable to complete login.',
  },
}

function readAttemptedUsername(
  body: unknown,
): string {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('username' in body) ||
    typeof body.username !== 'string'
  ) {
    return 'unknown'
  }

  return body.username
}

export const authRouter = Router()

authRouter.post(
  '/login',
  async (request, response, next) => {
    try {
      const attemptedUsername =
        readAttemptedUsername(request.body)

      const sourceIp =
        request.requestContext.sourceIp

      const rateLimitDecision =
        loginRateLimiter.check(
          sourceIp,
          attemptedUsername,
        )

      if (!rateLimitDecision.allowed) {
        await tryRecordSecurityAuditEvent({
          action:
            'AUTH_LOGIN_RATE_LIMITED',
          reasonCode:
            'LOGIN_RATE_LIMIT_EXCEEDED',
          attemptedUsername,
          actor: {
            type: 'ANONYMOUS',
          },
          target: {
            resourceType: 'AUTHENTICATION',
            resourceId: 'login',
          },
          request: buildRequestAuditMetadata(
            request,
            {
              operation: 'AUTH_LOGIN',
              route: LOGIN_ROUTE,
              status: 429,
            },
          ),
        })

        response
          .set(
            'Retry-After',
            String(
              rateLimitDecision.retryAfterSeconds,
            ),
          )
          .status(429)
          .json(loginRateLimitedResponse)

        return
      }

      const authenticatedUser =
        await authenticateUser(request.body)

      if (!authenticatedUser) {
        loginRateLimiter.recordFailure(
          sourceIp,
          attemptedUsername,
        )

        await tryRecordSecurityAuditEvent({
          action: 'AUTH_LOGIN_FAILED',
          reasonCode: 'INVALID_CREDENTIALS',
          attemptedUsername,
          actor: {
            type: 'ANONYMOUS',
          },
          target: {
            resourceType: 'AUTHENTICATION',
            resourceId: 'login',
          },
          request: buildRequestAuditMetadata(
            request,
            {
              operation: 'AUTH_LOGIN',
              route: LOGIN_ROUTE,
              status: 401,
            },
          ),
        })

        response
          .status(401)
          .json(invalidCredentialsResponse)

        return
      }

      const csrfToken =
        await establishAuthenticatedSession(
          request,
          {
            userId: authenticatedUser.id,
            sessionVersion:
              authenticatedUser.sessionVersion,
          },
        )

      const auditRecorded =
        await tryRecordSecurityAuditEvent({
          action: 'AUTH_LOGIN_SUCCEEDED',
          actor: {
            type: 'USER',
            user: {
              id: authenticatedUser.id,
              username:
                authenticatedUser.username,
              role: authenticatedUser.role,
            },
          },
          target: {
            resourceType: 'AUTHENTICATION',
            resourceId: 'login',
          },
          request: buildRequestAuditMetadata(
            request,
            {
              operation: 'AUTH_LOGIN',
              route: LOGIN_ROUTE,
              status: 200,
            },
          ),
        })

      if (!auditRecorded) {
        try {
          await destroySession(request)
        } finally {
          response.clearCookie(
            SESSION_COOKIE_NAME,
            {
              path: '/',
            },
          )
        }

        response
          .status(500)
          .json(loginAuditFailureResponse)

        return
      }

      loginRateLimiter.reset(
        sourceIp,
        attemptedUsername,
      )

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
  },
)

authRouter.get(
  '/session',
  requireAuthentication,
  (request, response, next) => {
    const authenticatedUser =
      request.authenticatedUser

    const csrfToken =
      request.session.csrfToken

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

      response.clearCookie(
        SESSION_COOKIE_NAME,
        {
          path: '/',
        },
      )

      response.status(204).send()
    } catch (error) {
      next(error)
    }
  },
)