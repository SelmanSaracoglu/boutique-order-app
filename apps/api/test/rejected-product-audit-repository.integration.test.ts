import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import {
  tryRecordRejectedProductAuditEvent,
  type RejectedProductAuditFallbackWriter,
} from '../src/audit/rejectedProductAuditRepository.js'
import { pool } from '../src/db.js'
import type {
  StructuredLogRecord,
} from '../src/logging/structuredLogger.js'

const FAILURE_CONSTRAINT =
  'rejected_product_audit_test_failure'

describe(
  'Rejected product audit repository',
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

    it( 'persists a sanitized rejected product event with current and requested state',
      async () => {
        const requestId =
          'b94a7eb5-b614-4072-bb88-0b6f30e0507f'

        const fallbackRecords:
          StructuredLogRecord[] = []

        const writeFallback:
          RejectedProductAuditFallbackWriter =
          (record) => {
            fallbackRecords.push(record)
          }

        const recorded =
          await tryRecordRejectedProductAuditEvent(
            {
              action:
                'ORDER_PROCESSING_STARTED',
              reasonCode:
                'PAYMENT_NOT_CONFIRMED',
              actor: {
                id: 41,
                username:
                  'operator\r\ninjected-entry',
                role:
                  'FULFILLMENT_OPERATOR',
              },
              orderId: 73,
              currentOrderStatus:
                'NEW',
              currentPaymentStatus:
                'REPORTED',
              request: {
                requestId,
                operation:
                  'UPDATE_ORDER_STATUS',
                method: 'PATCH',
                route:
                  '/api/orders/:orderId/status',
                status: 409,
                sourceIp:
                  '127.0.0.1',
                userAgent:
                  'rejection-test-agent\r\ninjected-entry',
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
                previous_order_status,
                new_order_status,
                previous_payment_status,
                new_payment_status,
                context
              FROM audit_events
            `,
          )

        expect(result.rows).toEqual([
          {
            schema_version: 2,
            category: 'PRODUCT',
            action:
              'ORDER_PROCESSING_STARTED',
            outcome: 'REJECTED',
            severity: 'WARN',
            actor_type: 'USER',
            actor_user_id: 41,
            actor_username:
              'operator injected-entry',
            actor_role:
              'FULFILLMENT_OPERATOR',
            target_resource_type:
              'ORDER',
            target_resource_id: '73',
            request_id: requestId,
            operation:
              'UPDATE_ORDER_STATUS',
            http_method: 'PATCH',
            http_route:
              '/api/orders/:orderId/status',
            http_status: 409,
            reason_code:
              'PAYMENT_NOT_CONFIRMED',
            error_code: null,
            source_ip: '127.0.0.1',
            user_agent:
              'rejection-test-agent injected-entry',
            previous_order_status:
              'NEW',
            new_order_status:
              'IN_PROGRESS',
            previous_payment_status:
              'REPORTED',
            new_payment_status:
              'REPORTED',
            context: {},
          },
        ])
      },
    )

    it( 'uses a safe fallback record when rejected event persistence fails',
      async () => {
        await pool.query(`
          ALTER TABLE audit_events
          ADD CONSTRAINT ${FAILURE_CONSTRAINT}
          CHECK (
            action <> 'PAYMENT_CONFIRMED'
          )
        `)

        const requestId =
          '91655a08-4c45-42c4-87a0-fe82c4e1ee53'

        const fallbackRecords:
          StructuredLogRecord[] = []

        const recorded =
          await tryRecordRejectedProductAuditEvent(
            {
              action:
                'PAYMENT_CONFIRMED',
              reasonCode:
                'INVALID_PAYMENT_TRANSITION',
              actor: {
                id: 52,
                username:
                  'payment.operator',
                role:
                  'PAYMENT_OPERATOR',
              },
              orderId: 84,
              currentOrderStatus:
                'NEW',
              currentPaymentStatus:
                'AWAITING_PAYMENT',
              request: {
                requestId,
                operation:
                  'CONFIRM_PAYMENT',
                method: 'POST',
                route:
                  '/api/orders/:orderId/payment-confirmation',
                status: 409,
                sourceIp:
                  '127.0.0.1',
                userAgent:
                  'rejection-test-agent',
              },
            },
            (record) => {
              fallbackRecords.push(
                record,
              )
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
            category: 'PRODUCT',
            action:
              'PAYMENT_CONFIRMED',
            outcome: 'REJECTED',
            severity: 'WARN',
            operation:
              'CONFIRM_PAYMENT',
            method: 'POST',
            route:
              '/api/orders/:orderId/payment-confirmation',
            status: 409,
            actor: {
              type: 'USER',
              userId: 52,
              username:
                'payment.operator',
              role:
                'PAYMENT_OPERATOR',
            },
            target: {
              resourceType: 'ORDER',
              resourceId: '84',
            },
            reasonCode:
              'INVALID_PAYMENT_TRANSITION',
            sourceIp:
              '127.0.0.1',
            userAgent:
              'rejection-test-agent',
            currentOrderStatus:
              'NEW',
            requestedOrderStatus:
              'NEW',
            currentPaymentStatus:
              'AWAITING_PAYMENT',
            requestedPaymentStatus:
              'CONFIRMED',
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
      },
    )
  },
)