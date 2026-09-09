import type {
  Request,
  RequestHandler,
  Response,
} from 'express'
import { buildRequestAuditMetadata } from '../audit/auditRequestMetadata.js'
import type {
  SessionRejectionReasonCode,
} from '../audit/requestAuditEvent.js'
import { tryRecordSecurityAuditEvent } from '../audit/requestAuditRepository.js'
import {
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_COOKIE_NAME,
} from './session.js'
import { destroySession } from './sessionLifecycle.js'
import {
  resolveSessionUser,
} from './sessionUserRepository.js'

const AUTH_SESSION_ROUTE =
  '/api/auth/session'

const authenticationRequiredResponse = {
  error: {
    code: 'AUTHENTICATION_REQUIRED',
    message: 'Authentication required.',
  },
}

type ValidSessionIdentity = {
  userId: number
  sessionVersion: number
}

type ValidSessionMetadata = {
  authenticatedAt: number
}

function resolveAuthenticationAuditRoute(
  request: Request,
): string {
  const routePath = request.route?.path

  if (typeof routePath === 'string') {
    return `${request.baseUrl}${routePath}`
  }

  return request.baseUrl || 'UNMATCHED'
}

function hasSessionCookie(
  request: Request,
): boolean {
  const cookieHeader =
    request.headers.cookie

  if (typeof cookieHeader !== 'string') {
    return false
  }

  return cookieHeader
    .split(';')
    .some((cookie) =>
      cookie
        .trimStart()
        .startsWith(
          `${SESSION_COOKIE_NAME}=`,
        ),
    )
}

function hasAnySessionState(
  request: Request,
): boolean {
  const {
    userId,
    sessionVersion,
    authenticatedAt,
    csrfToken,
  } = request.session

  return (
    userId !== undefined ||
    sessionVersion !== undefined ||
    authenticatedAt !== undefined ||
    csrfToken !== undefined
  )
}

function readValidSessionIdentity(
  request: Request,
): ValidSessionIdentity | null {
  const {
    userId,
    sessionVersion,
  } = request.session

  if (
    typeof userId !== 'number' ||
    !Number.isInteger(userId) ||
    userId <= 0 ||
    typeof sessionVersion !== 'number' ||
    !Number.isInteger(sessionVersion) ||
    sessionVersion <= 0
  ) {
    return null
  }

  return {
    userId,
    sessionVersion,
  }
}

function readValidSessionMetadata(
  request: Request,
  currentTime: number,
): ValidSessionMetadata | null {
  const {
    authenticatedAt,
    csrfToken,
  } = request.session

  if (
    typeof authenticatedAt !== 'number' ||
    !Number.isInteger(authenticatedAt) ||
    authenticatedAt <= 0 ||
    authenticatedAt > currentTime ||
    typeof csrfToken !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(
      csrfToken,
    )
  ) {
    return null
  }

  return {
    authenticatedAt,
  }
}

function isAnonymousSessionBootstrap(
  request: Request,
  auditRoute: string,
): boolean {
  return (
    request.method === 'GET' &&
    auditRoute === AUTH_SESSION_ROUTE
  )
}

async function recordAuthenticationRequired(
  request: Request,
  auditRoute: string,
): Promise<void> {
  await tryRecordSecurityAuditEvent({
    action: 'AUTHENTICATION_REQUIRED',
    reasonCode:
      'AUTHENTICATION_REQUIRED',
    actor: {
      type: 'ANONYMOUS',
    },
    target: {
      resourceType: 'REQUEST',
      resourceId: auditRoute,
    },
    request: buildRequestAuditMetadata(
      request,
      {
        operation:
          'AUTHENTICATE_REQUEST',
        route: auditRoute,
        status: 401,
      },
    ),
  })
}

async function rejectSession(
  request: Request,
  response: Response,
  auditRoute: string,
  reasonCode:
    SessionRejectionReasonCode,
): Promise<void> {
  await destroySession(request)

  response.clearCookie(
    SESSION_COOKIE_NAME,
    {
      path: '/',
    },
  )

  await tryRecordSecurityAuditEvent({
    action: 'SESSION_REJECTED',
    reasonCode,
    actor: {
      type: 'ANONYMOUS',
    },
    target: {
      resourceType: 'SESSION',
      resourceId: 'current',
    },
    request: buildRequestAuditMetadata(
      request,
      {
        operation:
          'AUTHENTICATE_REQUEST',
        route: auditRoute,
        status: 401,
      },
    ),
  })
}

export const requireAuthentication: RequestHandler =
  async (
    request,
    response,
    next,
  ) => {
    try {
      const auditRoute =
        resolveAuthenticationAuditRoute(
          request,
        )

      const sessionCookieWasSent =
        hasSessionCookie(request)

      const sessionStateExists =
        hasAnySessionState(request)

      const sessionIdentity =
        readValidSessionIdentity(request)

      if (!sessionIdentity) {
        const isNormalAnonymousBootstrap =
          isAnonymousSessionBootstrap(
            request,
            auditRoute,
          ) &&
          !sessionCookieWasSent &&
          !sessionStateExists

        if (isNormalAnonymousBootstrap) {
          response
            .status(401)
            .json(
              authenticationRequiredResponse,
            )

          return
        }

        if (
          sessionCookieWasSent ||
          sessionStateExists
        ) {
          await rejectSession(
            request,
            response,
            auditRoute,
            'INVALID_SESSION',
          )
        } else {
          await recordAuthenticationRequired(
            request,
            auditRoute,
          )
        }

        response
          .status(401)
          .json(
            authenticationRequiredResponse,
          )

        return
      }

      const currentTime = Date.now()

      const sessionMetadata =
        readValidSessionMetadata(
          request,
          currentTime,
        )

      if (!sessionMetadata) {
        await rejectSession(
          request,
          response,
          auditRoute,
          'INVALID_SESSION',
        )

        response
          .status(401)
          .json(
            authenticationRequiredResponse,
          )

        return
      }

      if (
        currentTime -
          sessionMetadata.authenticatedAt >=
        SESSION_ABSOLUTE_TIMEOUT_MS
      ) {
        await rejectSession(
          request,
          response,
          auditRoute,
          'SESSION_EXPIRED',
        )

        response
          .status(401)
          .json(
            authenticationRequiredResponse,
          )

        return
      }

      const sessionUserResolution =
        await resolveSessionUser(
          sessionIdentity.userId,
          sessionIdentity.sessionVersion,
        )

      if (!sessionUserResolution.accepted) {
        await rejectSession(
          request,
          response,
          auditRoute,
          sessionUserResolution.reasonCode,
        )

        response
          .status(401)
          .json(
            authenticationRequiredResponse,
          )

        return
      }

      request.authenticatedUser =
        sessionUserResolution.user

      next()
    } catch (error) {
      next(error)
    }
  }