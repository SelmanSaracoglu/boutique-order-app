import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { pool } from '../src/db.js'
import {
  createAuthenticatedTestClient,
  type AuthenticatedTestClient,
} from './authenticatedTestClient.js'

const AUDIT_FAILURE_CONSTRAINT =
  'rejected_order_status_audit_test_failure'

const orderInput = {
  orderSource: 'instagram',
  customerIdentifier:
    'rejection-customer-secret',
  customerName:
    'Rejection Customer Secret',
  operationalNote:
    'rejection-address-secret',
  items: [
    {
      supplierAlias: 'supplier-a',
      description:
        'rejection-item-secret',
      quantity: 1,
      unitPrice: 25,
    },
  ],
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

async function createOrder(
  client: AuthenticatedTestClient,
): Promise<number> {
  const response = await client
    .post('/api/orders')
    .send(orderInput)
    .expect(201)

  return response.body.id as number
}

async function setConfirmedPayment(
  orderId: number,
): Promise<void> {
  await pool.query(
    `
      UPDATE orders
      SET
        payment_status = 'CONFIRMED',
        payment_method = 'BANK_TRANSFER'
      WHERE id = $1
    `,
    [orderId],
  )
}

describe(
  'Rejected order status product audit events',
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

    it( 'records the first invalid transition control as one rejected product event',
      async () => {
        const orderOperatorClient =
          await createAuthenticatedTestClient(
            'ORDER_OPERATOR',
          )

        const fulfillmentClient =
          await createAuthenticatedTestClient(
            'FULFILLMENT_OPERATOR',
          )

        const orderId =
          await createOrder(
            orderOperatorClient,
          )

        await pool.query(
          'TRUNCATE audit_events RESTART IDENTITY',
        )

        const forwardedIp =
          '203.0.113.160'

        const response =
          await fulfillmentClient
            .patch(
              `/api/orders/${orderId}/status`,
            )
            .set(
              'user-agent',
              'invalid-transition-test',
            )
            .set(
              'x-forwarded-for',
              forwardedIp,
            )
            .send({
              status: 'COMPLETED',
            })
            .expect(409)

        expect(response.body).toEqual({
          error: {
            code:
              'INVALID_STATUS_TRANSITION',
            message:
              'Order cannot transition from NEW to COMPLETED.',
          },
        })

        const requestId =
          readRequestId(response)

        const auditResult =
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
              WHERE request_id = $1
            `,
            [requestId],
          )

        expect(auditResult.rows).toEqual([
          {
            schema_version: 2,
            category: 'PRODUCT',
            action: 'ORDER_COMPLETED',
            outcome: 'REJECTED',
            severity: 'WARN',
            actor_type: 'USER',
            actor_user_id:
              fulfillmentClient.user.id,
            actor_username:
              fulfillmentClient.user
                .username,
            actor_role:
              'FULFILLMENT_OPERATOR',
            target_resource_type:
              'ORDER',
            target_resource_id:
              String(orderId),
            request_id: requestId,
            operation:
              'UPDATE_ORDER_STATUS',
            http_method: 'PATCH',
            http_route:
              '/api/orders/:orderId/status',
            http_status: 409,
            reason_code:
              'INVALID_STATUS_TRANSITION',
            error_code: null,
            source_ip:
              expect.any(String),
            user_agent:
              'invalid-transition-test',
            previous_order_status:
              'NEW',
            new_order_status:
              'COMPLETED',
            previous_payment_status:
              'AWAITING_PAYMENT',
            new_payment_status:
              'AWAITING_PAYMENT',
            context: {},
          },
        ])

        expect(
          auditResult.rows[0].source_ip,
        ).not.toBe(forwardedIp)

        const orderResult =
          await pool.query(
            `
              SELECT
                status,
                payment_status
              FROM orders
              WHERE id = $1
            `,
            [orderId],
          )

        expect(
          orderResult.rows[0],
        ).toEqual({
          status: 'NEW',
          payment_status:
            'AWAITING_PAYMENT',
        })
      },
    )

    it( 'records payment not confirmed as the rejected processing action',
      async () => {
        const orderOperatorClient =
          await createAuthenticatedTestClient(
            'ORDER_OPERATOR',
          )

        const fulfillmentClient =
          await createAuthenticatedTestClient(
            'FULFILLMENT_OPERATOR',
          )

        const orderId =
          await createOrder(
            orderOperatorClient,
          )

        await pool.query(
          'TRUNCATE audit_events RESTART IDENTITY',
        )

        const response =
          await fulfillmentClient
            .patch(
              `/api/orders/${orderId}/status`,
            )
            .set(
              'user-agent',
              'payment-control-test',
            )
            .send({
              status: 'IN_PROGRESS',
            })
            .expect(409)

        expect(response.body).toEqual({
          error: {
            code:
              'PAYMENT_NOT_CONFIRMED',
            message:
              'Order payment must be confirmed before processing can start.',
          },
        })

        const requestId =
          readRequestId(response)

        const auditResult =
          await pool.query(
            `
              SELECT
                category,
                action,
                outcome,
                severity,
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
                previous_order_status,
                new_order_status,
                previous_payment_status,
                new_payment_status
              FROM audit_events
              WHERE request_id = $1
            `,
            [requestId],
          )

        expect(auditResult.rows).toEqual([
          {
            category: 'PRODUCT',
            action:
              'ORDER_PROCESSING_STARTED',
            outcome: 'REJECTED',
            severity: 'WARN',
            actor_user_id:
              fulfillmentClient.user.id,
            actor_username:
              fulfillmentClient.user
                .username,
            actor_role:
              'FULFILLMENT_OPERATOR',
            target_resource_type:
              'ORDER',
            target_resource_id:
              String(orderId),
            request_id: requestId,
            operation:
              'UPDATE_ORDER_STATUS',
            http_method: 'PATCH',
            http_route:
              '/api/orders/:orderId/status',
            http_status: 409,
            reason_code:
              'PAYMENT_NOT_CONFIRMED',
            previous_order_status:
              'NEW',
            new_order_status:
              'IN_PROGRESS',
            previous_payment_status:
              'AWAITING_PAYMENT',
            new_payment_status:
              'AWAITING_PAYMENT',
          },
        ])
      },
    )

    it( 'records only the losing concurrent terminal transition as rejected',
      async () => {
        const orderOperatorClient =
          await createAuthenticatedTestClient(
            'ORDER_OPERATOR',
          )

        const fulfillmentClient =
          await createAuthenticatedTestClient(
            'FULFILLMENT_OPERATOR',
          )

        const orderId =
          await createOrder(
            orderOperatorClient,
          )

        await setConfirmedPayment(orderId)

        await fulfillmentClient
          .patch(
            `/api/orders/${orderId}/status`,
          )
          .send({
            status: 'IN_PROGRESS',
          })
          .expect(200)

        await pool.query(
          'TRUNCATE audit_events RESTART IDENTITY',
        )

        const attempts = [
          {
            requestedStatus:
              'COMPLETED',
            action:
              'ORDER_COMPLETED',
            request:
              fulfillmentClient
                .patch(
                  `/api/orders/${orderId}/status`,
                )
                .set(
                  'user-agent',
                  'concurrent-complete-test',
                )
                .send({
                  status: 'COMPLETED',
                }),
          },
          {
            requestedStatus:
              'CANCELLED',
            action:
              'ORDER_CANCELLED',
            request:
              fulfillmentClient
                .patch(
                  `/api/orders/${orderId}/status`,
                )
                .set(
                  'user-agent',
                  'concurrent-cancel-test',
                )
                .send({
                  status: 'CANCELLED',
                }),
          },
        ] as const

        const responses =
          await Promise.all(
            attempts.map(
              (attempt) =>
                attempt.request,
            ),
          )

        expect(
          responses
            .map(
              (response) =>
                response.status,
            )
            .sort(),
        ).toEqual([200, 409])

        const rejectedIndex =
          responses.findIndex(
            (response) =>
              response.status === 409,
          )

        const successfulIndex =
          responses.findIndex(
            (response) =>
              response.status === 200,
          )

        const rejectedAttempt =
          attempts[rejectedIndex]

        const successfulAttempt =
          attempts[successfulIndex]

        const rejectedResponse =
          responses[rejectedIndex]

        const successfulResponse =
          responses[successfulIndex]

        if (
          !rejectedAttempt ||
          !successfulAttempt ||
          !rejectedResponse ||
          !successfulResponse
        ) {
          throw new Error(
            'Expected one successful and one rejected transition',
          )
        }

        const rejectedRequestId =
          readRequestId(
            rejectedResponse,
          )

        const successfulRequestId =
          readRequestId(
            successfulResponse,
          )

        const rejectedAuditResult =
          await pool.query(
            `
              SELECT
                action,
                outcome,
                severity,
                request_id,
                http_status,
                reason_code,
                previous_order_status,
                new_order_status,
                previous_payment_status,
                new_payment_status
              FROM audit_events
              WHERE request_id = $1
            `,
            [rejectedRequestId],
          )

        expect(
          rejectedAuditResult.rows,
        ).toEqual([
          {
            action:
              rejectedAttempt.action,
            outcome: 'REJECTED',
            severity: 'WARN',
            request_id:
              rejectedRequestId,
            http_status: 409,
            reason_code:
              'INVALID_STATUS_TRANSITION',
            previous_order_status:
              successfulAttempt
                .requestedStatus,
            new_order_status:
              rejectedAttempt
                .requestedStatus,
            previous_payment_status:
              'CONFIRMED',
            new_payment_status:
              'CONFIRMED',
          },
        ])

        const successfulAuditResult =
          await pool.query(
            `
              SELECT
                action,
                outcome,
                severity,
                request_id,
                http_status,
                reason_code
              FROM audit_events
              WHERE request_id = $1
            `,
            [successfulRequestId],
          )

        expect(
          successfulAuditResult.rows,
        ).toEqual([
          {
            action:
              successfulAttempt.action,
            outcome: 'SUCCESS',
            severity: 'INFO',
            request_id:
              successfulRequestId,
            http_status: 200,
            reason_code: null,
          },
        ])
      },
    )

    it( 'preserves the conflict response and writes a safe fallback when audit persistence fails',
      async () => {
        const orderOperatorClient =
          await createAuthenticatedTestClient(
            'ORDER_OPERATOR',
          )

        const fulfillmentClient =
          await createAuthenticatedTestClient(
            'FULFILLMENT_OPERATOR',
          )

        const orderId =
          await createOrder(
            orderOperatorClient,
          )

        await pool.query(
          'TRUNCATE audit_events RESTART IDENTITY',
        )

        await pool.query(`
          ALTER TABLE audit_events
          ADD CONSTRAINT ${AUDIT_FAILURE_CONSTRAINT}
          CHECK (
            action <> 'ORDER_COMPLETED'
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
            'Bearer rejected-order-secret'

          const response =
            await fulfillmentClient
              .patch(
                `/api/orders/${orderId}/status`,
              )
              .set(
                'user-agent',
                'rejected-audit-failure-test',
              )
              .set(
                'authorization',
                authorizationSecret,
              )
              .send({
                status: 'COMPLETED',
              })
              .expect(409)

          expect(response.body).toEqual({
            error: {
              code:
                'INVALID_STATUS_TRANSITION',
              message:
                'Order cannot transition from NEW to COMPLETED.',
            },
          })

          const requestId =
            readRequestId(response)

          const auditResult =
            await pool.query(
              `
                SELECT
                  COUNT(*)::int
                    AS count
                FROM audit_events
                WHERE request_id = $1
              `,
              [requestId],
            )

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
              category: 'PRODUCT',
              action:
                'ORDER_COMPLETED',
              outcome: 'REJECTED',
              severity: 'WARN',
              operation:
                'UPDATE_ORDER_STATUS',
              method: 'PATCH',
              route:
                '/api/orders/:orderId/status',
              status: 409,
              actor: {
                type: 'USER',
                userId:
                  fulfillmentClient.user
                    .id,
                username:
                  fulfillmentClient.user
                    .username,
                role:
                  'FULFILLMENT_OPERATOR',
              },
              target: {
                resourceType:
                  'ORDER',
                resourceId:
                  String(orderId),
              },
              reasonCode:
                'INVALID_STATUS_TRANSITION',
              userAgent:
                'rejected-audit-failure-test',
              currentOrderStatus:
                'NEW',
              requestedOrderStatus:
                'COMPLETED',
              currentPaymentStatus:
                'AWAITING_PAYMENT',
              requestedPaymentStatus:
                'AWAITING_PAYMENT',
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
            fulfillmentClient.csrfToken,
          )

          expect(
            fallbackOutput,
          ).not.toContain(
            orderInput.customerIdentifier,
          )

          expect(
            fallbackOutput,
          ).not.toContain(
            orderInput.customerName,
          )

          expect(
            fallbackOutput,
          ).not.toContain(
            orderInput.operationalNote,
          )

          expect(
            fallbackOutput,
          ).not.toContain(
            orderInput.items[0]
              ?.description,
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
      },
    )
  },
)