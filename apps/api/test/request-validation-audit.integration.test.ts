import request from 'supertest'
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type {
  UserRole,
} from '../src/auth/user.js'
import { app } from '../src/app.js'
import { pool } from '../src/db.js'
import {
  createAuthenticatedTestClient,
} from './authenticatedTestClient.js'

const AUDIT_FAILURE_CONSTRAINT =
  'request_validation_audit_test_failure'

const invalidJsonResponse = {
  error: {
    code: 'INVALID_JSON',
    message:
      'Request body contains invalid JSON.',
  },
}

type InvalidOrderIdCase = {
  name: string
  role: UserRole
  method: 'GET' | 'POST' | 'PATCH'
  path: string
  body?: Record<string, unknown>
  operation:
    | 'VIEW_ORDER_DETAIL'
    | 'UPDATE_ORDER_STATUS'
    | 'REPORT_PAYMENT'
    | 'CONFIRM_PAYMENT'
  route: string
}

function readRequestId(response: {
  headers: Record<string, unknown>
}): string {
  const requestId =
    response.headers['x-request-id']

  if (typeof requestId !== 'string') {
    throw new Error(
      'Expected a response request ID',
    )
  }

  return requestId
}

async function readAuditEvents(
  requestId: string,
) {
  const result = await pool.query(
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
        host(source_ip) AS source_ip,
        user_agent,
        context
      FROM audit_events
      WHERE request_id = $1
      ORDER BY id
    `,
    [requestId],
  )

  return result.rows
}

describe(
  'Request validation security events',
  () => {
    beforeEach(async () => {
      await pool.query(`
        ALTER TABLE audit_events
        DROP CONSTRAINT IF EXISTS ${AUDIT_FAILURE_CONSTRAINT}
      `)

      await pool.query(
        'TRUNCATE audit_events RESTART IDENTITY',
      )

      await pool.query(`
        TRUNCATE order_items, orders
        RESTART IDENTITY CASCADE
      `)

      await pool.query(`
        TRUNCATE user_sessions, users
        RESTART IDENTITY CASCADE
      `)
    })

    afterAll(async () => {
      await pool.query(`
        ALTER TABLE audit_events
        DROP CONSTRAINT IF EXISTS ${AUDIT_FAILURE_CONSTRAINT}
      `)

      await pool.end()
    })

    it('records malformed JSON without persisting raw request data', async () => {
      const forwardedIp =
        '203.0.113.100'

      const authorizationSecret =
        'Bearer authorization-secret'

      const cookieSecret =
        'boutique.sid=cookie-secret'

      const csrfSecret =
        'csrf-token-secret'

      const passwordSecret =
        'password-secret'

      const response = await request(app)
        .post('/api/orders')
        .set(
          'Content-Type',
          'application/json',
        )
        .set(
          'user-agent',
          'invalid-json-audit-test',
        )
        .set(
          'x-forwarded-for',
          forwardedIp,
        )
        .set(
          'authorization',
          authorizationSecret,
        )
        .set('cookie', cookieSecret)
        .set(
          'x-csrf-token',
          csrfSecret,
        )
        .send(
          `{"password":"${passwordSecret}"`,
        )
        .expect(400)

      expect(response.body).toEqual(
        invalidJsonResponse,
      )

      const requestId =
        readRequestId(response)

      const auditEvents =
        await readAuditEvents(requestId)

      expect(auditEvents).toEqual([
        {
          schema_version: 2,
          category: 'SECURITY',
          action:
            'REQUEST_VALIDATION_FAILED',
          outcome: 'REJECTED',
          severity: 'INFO',
          actor_type: 'ANONYMOUS',
          actor_user_id: null,
          actor_username: null,
          actor_role: null,
          target_resource_type:
            'REQUEST',
          target_resource_id:
            '/api/orders',
          request_id: requestId,
          operation:
            'VALIDATE_REQUEST',
          http_method: 'POST',
          http_route: '/api/orders',
          http_status: 400,
          reason_code: 'INVALID_JSON',
          error_code: null,
          source_ip:
            expect.any(String),
          user_agent:
            'invalid-json-audit-test',
          context: {},
        },
      ])

      expect(
        auditEvents[0].source_ip,
      ).not.toBe(forwardedIp)

      const serializedEvents =
        JSON.stringify(auditEvents)

      expect(
        serializedEvents,
      ).not.toContain(
        authorizationSecret,
      )

      expect(
        serializedEvents,
      ).not.toContain(cookieSecret)

      expect(
        serializedEvents,
      ).not.toContain(csrfSecret)

      expect(
        serializedEvents,
      ).not.toContain(
        passwordSecret,
      )
    })

    it('records authenticated order input validation without persisting the body', async () => {
      const orderOperatorClient =
        await createAuthenticatedTestClient(
          'ORDER_OPERATOR',
        )

      await pool.query(
        'TRUNCATE audit_events RESTART IDENTITY',
      )

      const customerSecret =
        'customer-address-secret'

      const passwordSecret =
        'password-secret'

      const response =
        await orderOperatorClient
          .post('/api/orders')
          .set(
            'user-agent',
            'order-validation-audit-test',
          )
          .send({
            orderSource: 'instagram',
            customerIdentifier:
              customerSecret,
            password: passwordSecret,
          })
          .expect(400)

      expect(
        response.body.error.code,
      ).toBe('VALIDATION_ERROR')

      const requestId =
        readRequestId(response)

      const auditEvents =
        await readAuditEvents(requestId)

      expect(auditEvents).toEqual([
        {
          schema_version: 2,
          category: 'SECURITY',
          action:
            'REQUEST_VALIDATION_FAILED',
          outcome: 'REJECTED',
          severity: 'INFO',
          actor_type: 'USER',
          actor_user_id:
            orderOperatorClient.user.id,
          actor_username:
            orderOperatorClient.user
              .username,
          actor_role:
            'ORDER_OPERATOR',
          target_resource_type:
            'REQUEST',
          target_resource_id:
            '/api/orders/',
          request_id: requestId,
          operation: 'CREATE_ORDER',
          http_method: 'POST',
          http_route:
            '/api/orders/',
          http_status: 400,
          reason_code:
            'VALIDATION_ERROR',
          error_code: null,
          source_ip:
            expect.any(String),
          user_agent:
            'order-validation-audit-test',
          context: {},
        },
      ])

      const serializedEvents =
        JSON.stringify(auditEvents)

      expect(
        serializedEvents,
      ).not.toContain(customerSecret)

      expect(
        serializedEvents,
      ).not.toContain(
        passwordSecret,
      )
    })

    it.each<InvalidOrderIdCase>([
      {
        name: 'order detail',
        role: 'ORDER_OPERATOR',
        method: 'GET',
        path:
          '/api/orders/invalid-id',
        operation:
          'VIEW_ORDER_DETAIL',
        route:
          '/api/orders/:orderId',
      },
      {
        name: 'order status update',
        role: 'ORDER_OPERATOR',
        method: 'PATCH',
        path:
          '/api/orders/invalid-id/status',
        body: {
          status: 'IN_PROGRESS',
        },
        operation:
          'UPDATE_ORDER_STATUS',
        route:
          '/api/orders/:orderId/status',
      },
      {
        name: 'payment report',
        role: 'ORDER_OPERATOR',
        method: 'POST',
        path:
          '/api/orders/invalid-id/payment-report',
        body: {
          paymentMethod:
            'BANK_TRANSFER',
        },
        operation:
          'REPORT_PAYMENT',
        route:
          '/api/orders/:orderId/payment-report',
      },
      {
        name: 'payment confirmation',
        role: 'PAYMENT_OPERATOR',
        method: 'POST',
        path:
          '/api/orders/invalid-id/payment-confirmation',
        operation:
          'CONFIRM_PAYMENT',
        route:
          '/api/orders/:orderId/payment-confirmation',
      },
    ])( 'records invalid order ID for $name',
      async (testCase) => {
        const authenticatedClient =
          await createAuthenticatedTestClient(
            testCase.role,
          )

        await pool.query(
          'TRUNCATE audit_events RESTART IDENTITY',
        )

        const pendingRequest =
          testCase.method === 'GET'
            ? authenticatedClient.get(
                testCase.path,
              )
            : testCase.method ===
                'PATCH'
              ? authenticatedClient
                  .patch(testCase.path)
                  .send(
                    testCase.body ?? {},
                  )
              : authenticatedClient
                  .post(testCase.path)
                  .send(
                    testCase.body ?? {},
                  )

        const response =
          await pendingRequest.expect(400)

        expect(response.body).toEqual({
          error: {
            code: 'INVALID_ORDER_ID',
            message:
              'Order ID is invalid.',
          },
        })

        const requestId =
          readRequestId(response)

        const auditEvents =
          await readAuditEvents(
            requestId,
          )

        expect(auditEvents).toHaveLength(
          1,
        )

        expect(
          auditEvents[0],
        ).toMatchObject({
          schema_version: 2,
          category: 'SECURITY',
          action:
            'REQUEST_VALIDATION_FAILED',
          outcome: 'REJECTED',
          severity: 'INFO',
          actor_type: 'USER',
          actor_user_id:
            authenticatedClient.user.id,
          actor_username:
            authenticatedClient.user
              .username,
          actor_role:
            authenticatedClient.user.role,
          target_resource_type:
            'ORDER',
          target_resource_id:
            'invalid-id',
          request_id: requestId,
          operation:
            testCase.operation,
          http_method:
            testCase.method,
          http_route:
            testCase.route,
          http_status: 400,
          reason_code:
            'INVALID_ORDER_ID',
          error_code: null,
          context: {},
        })
      },
    )

    it('records invalid payment report input with its order target', async () => {
      const orderOperatorClient =
        await createAuthenticatedTestClient(
          'ORDER_OPERATOR',
        )

      await pool.query(
        'TRUNCATE audit_events RESTART IDENTITY',
      )

      const response =
        await orderOperatorClient
          .post(
            '/api/orders/123/payment-report',
          )
          .send({
            paymentMethod: 'CASH',
          })
          .expect(400)

      expect(
        response.body.error.code,
      ).toBe('VALIDATION_ERROR')

      const requestId =
        readRequestId(response)

      const auditEvents =
        await readAuditEvents(requestId)

      expect(auditEvents).toHaveLength(1)

      expect(
        auditEvents[0],
      ).toMatchObject({
        action:
          'REQUEST_VALIDATION_FAILED',
        outcome: 'REJECTED',
        severity: 'INFO',
        actor_type: 'USER',
        actor_user_id:
          orderOperatorClient.user.id,
        target_resource_type: 'ORDER',
        target_resource_id: '123',
        request_id: requestId,
        operation: 'REPORT_PAYMENT',
        http_method: 'POST',
        http_route:
          '/api/orders/:orderId/payment-report',
        http_status: 400,
        reason_code:
          'VALIDATION_ERROR',
        context: {},
      })
    })

    it('preserves the validation response and writes a safe fallback when audit persistence fails', async () => {
      const orderOperatorClient =
        await createAuthenticatedTestClient(
          'ORDER_OPERATOR',
        )

      await pool.query(
        'TRUNCATE audit_events RESTART IDENTITY',
      )

      await pool.query(`
        ALTER TABLE audit_events
        ADD CONSTRAINT ${AUDIT_FAILURE_CONSTRAINT}
        CHECK (
          action <>
            'REQUEST_VALIDATION_FAILED'
        )
      `)

      const stderrWriteSpy = vi
        .spyOn(
          process.stderr,
          'write',
        )
        .mockReturnValue(true)

      try {
        const authorizationSecret =
          'Bearer authorization-secret'

        const passwordSecret =
          'password-secret'

        const customerSecret =
          'customer-address-secret'

        const response =
          await orderOperatorClient
            .post('/api/orders')
            .set(
              'user-agent',
              'validation-audit-failure-test',
            )
            .set(
              'authorization',
              authorizationSecret,
            )
            .send({
              customerIdentifier:
                customerSecret,
              password:
                passwordSecret,
            })
            .expect(400)

        expect(
          response.body.error.code,
        ).toBe('VALIDATION_ERROR')

        const requestId =
          readRequestId(response)

        const auditResult =
          await pool.query(`
            SELECT COUNT(*)::int AS count
            FROM audit_events
            WHERE action =
              'REQUEST_VALIDATION_FAILED'
          `)

        expect(
          auditResult.rows[0].count,
        ).toBe(0)

        const fallbackOutput =
          stderrWriteSpy.mock.calls
            .map((call) =>
              String(call[0]),
            )
            .join('')

        const fallbackLines =
          fallbackOutput
            .trim()
            .split('\n')

        expect(
          fallbackLines,
        ).toHaveLength(1)

        const fallbackRecord =
          JSON.parse(
            fallbackLines[0] ?? '',
          )

        expect(
          fallbackRecord,
        ).toMatchObject({
          requestId,
          eventType:
            'AUDIT_PERSISTENCE_FAILED',
          failureCode:
            'AUDIT_PERSISTENCE_FAILED',
          auditEvent: {
            schemaVersion: 2,
            category: 'SECURITY',
            action:
              'REQUEST_VALIDATION_FAILED',
            outcome: 'REJECTED',
            severity: 'INFO',
            operation:
              'CREATE_ORDER',
            method: 'POST',
            route:
              '/api/orders/',
            status: 400,
            actor: {
              type: 'USER',
              userId:
                orderOperatorClient.user
                  .id,
              username:
                orderOperatorClient.user
                  .username,
              role:
                'ORDER_OPERATOR',
            },
            target: {
              resourceType:
                'REQUEST',
              resourceId:
                '/api/orders/',
            },
            reasonCode:
              'VALIDATION_ERROR',
            userAgent:
              'validation-audit-failure-test',
            context: {},
          },
        })

        expect(
          fallbackOutput,
        ).not.toContain(
          authorizationSecret,
        )

        expect(
          fallbackOutput,
        ).not.toContain(
          orderOperatorClient.csrfToken,
        )

        expect(
          fallbackOutput,
        ).not.toContain(
          passwordSecret,
        )

        expect(
          fallbackOutput,
        ).not.toContain(
          customerSecret,
        )

        expect(
          fallbackOutput,
        ).not.toContain(
          'boutique.sid=',
        )

        expect(
          fallbackOutput,
        ).not.toContain(
          AUDIT_FAILURE_CONSTRAINT,
        )

        expect(
          fallbackOutput,
        ).not.toContain('23514')
      } finally {
        stderrWriteSpy.mockRestore()

        await pool.query(`
          ALTER TABLE audit_events
          DROP CONSTRAINT IF EXISTS ${AUDIT_FAILURE_CONSTRAINT}
        `)
      }
    })
  },
)