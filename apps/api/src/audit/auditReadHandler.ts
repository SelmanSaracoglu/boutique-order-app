import type {
  RequestHandler,
} from 'express'
import type { PoolClient } from 'pg'
import {
  buildRequestAuditMetadata,
  resolveRequestAuditRoute,
} from './auditRequestMetadata.js'
import {
  parseAuditReadQuery,
} from './auditReadQuery.js'
import {
  listAuditEvents,
} from './auditReadRepository.js'
import {
  recordSecurityAuditEvent,
} from './requestAuditRepository.js'
import {
  recordRequestValidationFailure,
} from './requestValidationAudit.js'
import { pool } from '../db.js'

const invalidAuditQueryResponse = {
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Audit query is invalid.',
  },
}

export const auditReadHandler:
  RequestHandler = async (
    request,
    response,
  ) => {
    const query =
      parseAuditReadQuery(
        request.query,
      )

    if (query === null) {
      await recordRequestValidationFailure(
        request,
        {
          operation:
            'VIEW_AUDIT_LOG',
          reasonCode:
            'VALIDATION_ERROR',
          target: {
            resourceType: 'AUDIT_LOG',
            resourceId: 'audit-events',
          },
        },
      )

      return response
        .status(400)
        .json(
          invalidAuditQueryResponse,
        )
    }

    const actor =
      request.authenticatedUser

    if (!actor) {
      throw new Error(
        'Authenticated actor is missing from audit read',
      )
    }

    const auditRoute =
      resolveRequestAuditRoute(
        request,
      )

    const auditRequest =
      buildRequestAuditMetadata(
        request,
        {
          operation:
            'VIEW_AUDIT_LOG',
          route: auditRoute,
          status: 200,
        },
      )

    let client: PoolClient | undefined
    let transactionStarted = false

    try {
      client = await pool.connect()

      await client.query('BEGIN')
      transactionStarted = true

      const page =
        await listAuditEvents(
          client,
          query,
        )

      await recordSecurityAuditEvent(
        client,
        {
          action: 'AUDIT_LOG_VIEWED',
          actor: {
            type: 'USER',
            user: actor,
          },
          target: {
            resourceType: 'AUDIT_LOG',
            resourceId: 'audit-events',
          },
          request: auditRequest,
        },
      )

      await client.query('COMMIT')
      transactionStarted = false

      return response.json(page)
    } catch (error) {
      if (
        client &&
        transactionStarted
      ) {
        try {
          await client.query(
            'ROLLBACK',
          )
        } catch {
          client.release(true)
          client = undefined
        }
      }

      throw error
    } finally {
      client?.release()
    }
  }