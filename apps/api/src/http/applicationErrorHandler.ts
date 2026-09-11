import type {
  ErrorRequestHandler,
} from 'express'
import {
  tryRecordApplicationErrorEvent,
} from '../audit/applicationErrorAuditRepository.js'
import {
  buildApplicationErrorEvent,
} from '../audit/applicationErrorContext.js'
import {
  recordRequestValidationFailure,
} from '../audit/requestValidationAudit.js'
import {
  tryWriteApplicationErrorLog,
} from '../logging/applicationErrorLogger.js'

function isInvalidJsonError(
  error: unknown,
): boolean {
  return (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400
  )
}

export const applicationErrorHandler:
  ErrorRequestHandler =
  async (
    error,
    request,
    response,
    next,
  ) => {
    if (isInvalidJsonError(error)) {
      await recordRequestValidationFailure(
        request,
        {
          operation:
            'VALIDATE_REQUEST',
          reasonCode: 'INVALID_JSON',
        },
      )

      response.status(400).json({
        error: {
          code: 'INVALID_JSON',
          message:
            'Request body contains invalid JSON.',
        },
      })

      return
    }

    const applicationErrorEvent =
      buildApplicationErrorEvent(
        request,
      )

    tryWriteApplicationErrorLog(
      applicationErrorEvent,
      error,
    )

    await tryRecordApplicationErrorEvent(
      applicationErrorEvent,
    )

    if (response.headersSent) {
      next(
        new Error(
          `Request ${applicationErrorEvent.request.requestId} failed after response headers were sent`,
        ),
      )

      return
    }

    response.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message:
          'An unexpected error occurred.',
        requestId:
          applicationErrorEvent.request.requestId,
      },
    })
  }