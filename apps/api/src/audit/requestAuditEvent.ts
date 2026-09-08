import type { Permission } from '../auth/permissions.js'
import type { SessionUser } from '../auth/sessionUserRepository.js'

export const AUDIT_OPERATIONS = [
  'AUTH_LOGIN',
  'AUTH_LOGOUT',
  'AUTHENTICATE_REQUEST',
  'AUTHORIZE_REQUEST',
  'VALIDATE_CSRF',
  'VALIDATE_REQUEST',
  'CREATE_ORDER',
  'LIST_ORDERS',
  'VIEW_ORDER_DETAIL',
  'UPDATE_ORDER_STATUS',
  'REPORT_PAYMENT',
  'CONFIRM_PAYMENT',
  'HANDLE_API_REQUEST',
] as const

export type AuditOperation =
  (typeof AUDIT_OPERATIONS)[number]

export const SECURITY_AUDIT_ACTIONS = [
  'AUTH_LOGIN_SUCCEEDED',
  'AUTH_LOGIN_FAILED',
  'AUTH_LOGIN_RATE_LIMITED',
  'AUTH_LOGOUT_SUCCEEDED',
  'AUTHENTICATION_REQUIRED',
  'SESSION_REJECTED',
  'AUTHORIZATION_DENIED',
  'CSRF_VALIDATION_FAILED',
  'REQUEST_VALIDATION_FAILED',
  'ORDER_DETAIL_VIEWED',
] as const

export type SecurityAuditAction =
  (typeof SECURITY_AUDIT_ACTIONS)[number]

export type SessionRejectionReasonCode =
  | 'SESSION_EXPIRED'
  | 'USER_DISABLED'
  | 'SESSION_VERSION_MISMATCH'
  | 'SESSION_USER_NOT_FOUND'
  | 'INVALID_SESSION'

export type RequestValidationReasonCode =
  | 'INVALID_JSON'
  | 'VALIDATION_ERROR'
  | 'INVALID_ORDER_ID'

export type SecurityAuditReasonCode =
  | 'INVALID_CREDENTIALS'
  | 'LOGIN_RATE_LIMIT_EXCEEDED'
  | 'AUTHENTICATION_REQUIRED'
  | SessionRejectionReasonCode
  | 'FORBIDDEN'
  | 'INVALID_CSRF_TOKEN'
  | RequestValidationReasonCode

export type AuditUserSnapshot = Pick<
  SessionUser,
  'id' | 'username' | 'role'
>

export type RequestAuditActor =
  | {
      type: 'USER'
      user: AuditUserSnapshot
    }
  | {
      type: 'ANONYMOUS'
    }
  | {
      type: 'SYSTEM'
    }

export type RequestAuditTarget = {
  resourceType:
    | 'ORDER'
    | 'AUTHENTICATION'
    | 'SESSION'
    | 'REQUEST'
    | 'APPLICATION'
  resourceId: string
}

export type RequestAuditMetadata = {
  requestId: string
  operation: AuditOperation
  method: string
  route: string
  status: number
  sourceIp: string
  userAgent: string | null
}

type SecurityAuditEventBase = {
  actor: RequestAuditActor
  target: RequestAuditTarget
  request: RequestAuditMetadata
}

export type SecurityAuditEventInput =
  | (
      SecurityAuditEventBase & {
        action: 'AUTH_LOGIN_SUCCEEDED'
      }
    )
  | (
      SecurityAuditEventBase & {
        action: 'AUTH_LOGIN_FAILED'
        reasonCode: 'INVALID_CREDENTIALS'
        attemptedUsername: string
      }
    )
  | (
      SecurityAuditEventBase & {
        action: 'AUTH_LOGIN_RATE_LIMITED'
        reasonCode: 'LOGIN_RATE_LIMIT_EXCEEDED'
        attemptedUsername: string
      }
    )
  | (
      SecurityAuditEventBase & {
        action: 'AUTH_LOGOUT_SUCCEEDED'
      }
    )
  | (
      SecurityAuditEventBase & {
        action: 'AUTHENTICATION_REQUIRED'
        reasonCode: 'AUTHENTICATION_REQUIRED'
      }
    )
  | (
      SecurityAuditEventBase & {
        action: 'SESSION_REJECTED'
        reasonCode: SessionRejectionReasonCode
      }
    )
  | (
      SecurityAuditEventBase & {
        action: 'AUTHORIZATION_DENIED'
        reasonCode: 'FORBIDDEN'
        permission: Permission
      }
    )
  | (
      SecurityAuditEventBase & {
        action: 'CSRF_VALIDATION_FAILED'
        reasonCode: 'INVALID_CSRF_TOKEN'
      }
    )
  | (
      SecurityAuditEventBase & {
        action: 'REQUEST_VALIDATION_FAILED'
        reasonCode: RequestValidationReasonCode
      }
    )
  | (
      SecurityAuditEventBase & {
        action: 'ORDER_DETAIL_VIEWED'
      }
    )

    