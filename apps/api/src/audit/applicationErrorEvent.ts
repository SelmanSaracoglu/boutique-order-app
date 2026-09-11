import type {
  RequestAuditActor,
  RequestAuditMetadata,
  RequestAuditTarget,
} from './requestAuditEvent.js'

export const APPLICATION_ERROR_ACTION =
  'APPLICATION_ERROR' as const

export const APPLICATION_ERROR_CODE =
  'UNEXPECTED_ERROR' as const

export type ApplicationErrorCode =
  typeof APPLICATION_ERROR_CODE

export type ApplicationErrorEventInput = {
  actor: RequestAuditActor
  target: RequestAuditTarget
  request: RequestAuditMetadata
  errorCode: ApplicationErrorCode
}