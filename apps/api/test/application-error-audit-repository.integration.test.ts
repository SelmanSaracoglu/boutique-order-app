import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import {
  tryRecordApplicationErrorEvent,
  type ApplicationErrorAuditFallbackWriter,
} from '../src/audit/applicationErrorAuditRepository.js'
import {
  APPLICATION_ERROR_CODE,
} from '../src/audit/applicationErrorEvent.js'
import { pool } from '../src/db.js'
import type {
  StructuredLogRecord,
} from '../src/logging/structuredLogger.js'

const FAILURE_CONSTRAINT =
  'application_error_audit_test_failure'

describe(
  'Application error audit repository',
  () => {
    beforeEach(async () => {
      await pool.query(`
        ALTER TABLE audit_events
        DROP CONSTRAINT IF EXISTS ${FAILURE_CONSTRAINT}
      `)

      await pool.query(
        'TRUNCATE audit_events RESTART IDENTITY',
      )
    })

    afterAll(async () => {
      await pool.query(`
        ALTER TABLE audit_events
        DROP CONSTRAINT IF EXISTS ${FAILURE_CONSTRAINT}
      `)

      await pool.end()
    })

    it(
      'persists a sanitized application error event',
      async () => {
        const requestId =
          '95024893-ad8a-4f4c-969e-1e7e88eb9d89'

        const fallbackRecords:
          StructuredLogRecord[] = []

        const writeFallback:
          ApplicationErrorAuditFallbackWriter =
          (record) => {
            fallbackRecords.push(record)
          }

        const recorded =
          await tryRecordApplicationErrorEvent(
            {
              errorCode:
                APPLICATION_ERROR_CODE,
              actor: {
                type: 'USER',
                user: {
                  id: 67,
                  username:
                    'error.operator\r\ninjected-entry',
                  role: 'ORDER_OPERATOR',
                },
              },
              target: {
                resourceType: 'ORDER',
                resourceId: '91',
              },
              request: {
                requestId,
                operation:
                  'UPDATE_ORDER_STATUS',
                method: 'PATCH',
                route:
                  '/api/orders/:orderId/status',
                status: 500,
                sourceIp:
                  '127.0.0.1',
                userAgent:
                  'error-test-agent\r\ninjected-entry',
              },
            },
            writeFallback,
          )

        expect(recorded).toBe(true)
        expect(
          fallbackRecords,
        ).toEqual([])

        const result =
          await pool.query(
            `
              SELECT
                schema_version,
                category,
                action,
                outcome,
                severity,
                actor_type,
                actor_user_id,
                actor_username,
                actor_role,
                target_resource_type,
                target_resource_id,
                request_id,
                operation,
                http_method,
                http_route,
                http_status,
                reason_code,
                error_code,
                host(source_ip)
                  AS source_ip,
                user_agent,
                context
              FROM audit_events
            `,
          )

        expect(result.rows).toEqual([
          {
            schema_version: 2,
            category: 'ERROR',
            action:
              'APPLICATION_ERROR',
            outcome: 'FAILURE',
            severity: 'ERROR',
            actor_type: 'USER',
            actor_user_id: 67,
            actor_username:
              'error.operator injected-entry',
            actor_role:
              'ORDER_OPERATOR',
            target_resource_type:
              'ORDER',
            target_resource_id: '91',
            request_id: requestId,
            operation:
              'UPDATE_ORDER_STATUS',
            http_method: 'PATCH',
            http_route:
              '/api/orders/:orderId/status',
            http_status: 500,
            reason_code: null,
            error_code:
              'UNEXPECTED_ERROR',
            source_ip: '127.0.0.1',
            user_agent:
              'error-test-agent injected-entry',
            context: {},
          },
        ])
      },
    )

    it(
      'uses a safe fallback when application error persistence fails',
      async () => {
        await pool.query(`
          ALTER TABLE audit_events
          ADD CONSTRAINT ${FAILURE_CONSTRAINT}
          CHECK (
            action <> 'APPLICATION_ERROR'
          )
        `)

        const requestId =
          '6978de50-5234-4d18-bddd-8d50bf8ed789'

        const fallbackRecords:
          StructuredLogRecord[] = []

        const recorded =
          await tryRecordApplicationErrorEvent(
            {
              errorCode:
                APPLICATION_ERROR_CODE,
              actor: {
                type: 'ANONYMOUS',
              },
              target: {
                resourceType:
                  'APPLICATION',
                resourceId: 'api',
              },
              request: {
                requestId,
                operation:
                  'HANDLE_API_REQUEST',
                method: 'GET',
                route: 'UNMATCHED',
                status: 500,
                sourceIp:
                  '127.0.0.1',
                userAgent:
                  'fallback-test-agent',
              },
            },
            (record) => {
              fallbackRecords.push(record)
            },
          )

        expect(recorded).toBe(false)

        const auditResult =
          await pool.query(`
            SELECT
              COUNT(*)::int AS count
            FROM audit_events
          `)

        expect(
          auditResult.rows[0].count,
        ).toBe(0)

        expect(
          fallbackRecords,
        ).toHaveLength(1)

        expect(
          fallbackRecords[0],
        ).toMatchObject({
          requestId,
          eventType:
            'AUDIT_PERSISTENCE_FAILED',
          failureCode:
            'AUDIT_PERSISTENCE_FAILED',
          service:
            'boutique-order-api',
          schemaVersion: 1,
          auditEvent: {
            schemaVersion: 2,
            category: 'ERROR',
            action:
              'APPLICATION_ERROR',
            outcome: 'FAILURE',
            severity: 'ERROR',
            operation:
              'HANDLE_API_REQUEST',
            method: 'GET',
            route: 'UNMATCHED',
            status: 500,
            errorCode:
              'UNEXPECTED_ERROR',
            actor: {
              type: 'ANONYMOUS',
            },
            target: {
              resourceType:
                'APPLICATION',
              resourceId: 'api',
            },
            sourceIp:
              '127.0.0.1',
            userAgent:
              'fallback-test-agent',
          },
        })

        const serializedFallback =
          JSON.stringify(
            fallbackRecords[0],
          )

        expect(
          serializedFallback,
        ).not.toContain(
          FAILURE_CONSTRAINT,
        )
        expect(
          serializedFallback,
        ).not.toContain('23514')
        expect(
          serializedFallback,
        ).not.toContain('password')
        expect(
          serializedFallback,
        ).not.toContain('cookie')
        expect(
          serializedFallback,
        ).not.toContain(
          'authorization',
        )
        expect(
          serializedFallback,
        ).not.toContain(
          'csrfToken',
        )

        await expect(
          tryRecordApplicationErrorEvent(
            {
              errorCode:
                APPLICATION_ERROR_CODE,
              actor: {
                type: 'ANONYMOUS',
              },
              target: {
                resourceType:
                  'APPLICATION',
                resourceId: 'api',
              },
              request: {
                requestId:
                  '98f68916-1e02-4f63-b68b-75ed223acb24',
                operation:
                  'HANDLE_API_REQUEST',
                method: 'GET',
                route: 'UNMATCHED',
                status: 500,
                sourceIp:
                  '127.0.0.1',
                userAgent: null,
              },
            },
            () => {
              throw new Error(
                'Fallback writer failed',
              )
            },
          ),
        ).resolves.toBe(false)
      },
    )
  },
)