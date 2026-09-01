import { timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'

export const CSRF_HEADER_NAME = 'x-csrf-token'

const invalidCsrfTokenResponse = {
  error: {
    code: 'INVALID_CSRF_TOKEN',
    message: 'Invalid CSRF token.',
  },
}

function csrfTokensMatch(
  sessionToken: string,
  requestToken: string,
): boolean {
  const sessionTokenBuffer = Buffer.from(sessionToken)
  const requestTokenBuffer = Buffer.from(requestToken)

  if (sessionTokenBuffer.length !== requestTokenBuffer.length) {
    return false
  }

  return timingSafeEqual(
    sessionTokenBuffer,
    requestTokenBuffer,
  )
}

export const requireCsrf: RequestHandler = (
  request,
  response,
  next,
) => {
  const sessionToken = request.session.csrfToken
  const requestToken = request.get(CSRF_HEADER_NAME)

  if (
    typeof sessionToken !== 'string' ||
    typeof requestToken !== 'string' ||
    !csrfTokensMatch(sessionToken, requestToken)
  ) {
    response.status(403).json(invalidCsrfTokenResponse)
    return
  }

  next()
}