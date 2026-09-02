import type { RequestHandler } from 'express'
import {
  hasPermission,
  type Permission,
} from './permissions.js'

const authenticationRequiredResponse = {
  error: {
    code: 'AUTHENTICATION_REQUIRED',
    message: 'Authentication required.',
  },
}

const forbiddenResponse = {
  error: {
    code: 'FORBIDDEN',
    message: 'You do not have permission to perform this action.',
  },
}

export function requirePermission(
  permission: Permission,
): RequestHandler {
  return (request, response, next) => {
    const authenticatedUser = request.authenticatedUser

    if (!authenticatedUser) {
      response.status(401).json(authenticationRequiredResponse)
      return
    }

    if (!hasPermission(authenticatedUser.role, permission)) {
      response.status(403).json(forbiddenResponse)
      return
    }

    next()
  }
}