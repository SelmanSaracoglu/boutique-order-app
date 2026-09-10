import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { pool } from '../src/db.js'
import {
  createAuthenticatedTestClient,
  type AuthenticatedTestClient,
} from './authenticatedTestClient.js'

const orderInput = {
  orderSource: 'instagram',
  customerIdentifier:
    'payment-audit-customer-secret',
  customerName:
    'Payment Audit Customer Secret',
  operationalNote:
    'payment-audit-address-secret',
  items: [
    {
      supplierAlias: 'supplier-a',
      description:
        'payment-audit-item-secret',
      quantity: 1,
      unitPrice: 35,
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

async function createReportedOrder(
  orderClient:
    AuthenticatedTestClient,
  reportingClient:
    AuthenticatedTestClient,
): Promise<number> {
  const orderId =
    await createOrder(orderClient)

  await reportingClient
    .post(
      `/api/orders/${orderId}/payment-report`,
    )
    .send({
      paymentMethod: 'PAYPAL',
    })
    .expect(200)

  return orderId
}

describe(
  'Rejected payment product audit events',
  () => {
    beforeEach(async () => {
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
      await pool.end()
    })

    it(
      'records a repeated payment report as rejected without overwriting the method',
      async () => {
        const adminClient =
          await createAuthenticatedTestClient(
            'ADMIN',
          )

        const orderOperatorClient =
          await createAuthenticatedTestClient(
            'ORDER_OPERATOR',
          )

        const orderId =
          await createOrder(adminClient)

        await orderOperatorClient
          .post(
            `/api/orders/${orderId}/payment-report`,
          )
          .send({
            paymentMethod:
              'BANK_TRANSFER',
          })
          .expect(200)

        await pool.query(
          'TRUNCATE audit_events RESTART IDENTITY',
        )

        const forwardedIp =
          '203.0.113.170'

        const response =
          await orderOperatorClient
            .post(
              `/api/orders/${orderId}/payment-report`,
            )
            .set(
              'user-agent',
              'rejected-payment-report-test',
            )
            .set(
              'x-forwarded-for',
              forwardedIp,
            )
            .send({
              paymentMethod: 'PAYPAL',
            })
            .expect(409)

        expect(response.body).toEqual({
          error: {
            code:
              'INVALID_PAYMENT_TRANSITION',
            message:
              'Payment cannot be reported for this order.',
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
            action:
              'PAYMENT_REPORTED',
            outcome: 'REJECTED',
            severity: 'WARN',
            actor_type: 'USER',
            actor_user_id:
              orderOperatorClient.user.id,
            actor_username:
              orderOperatorClient.user
                .username,
            actor_role:
              'ORDER_OPERATOR',
            target_resource_type:
              'ORDER',
            target_resource_id:
              String(orderId),
            request_id: requestId,
            operation:
              'REPORT_PAYMENT',
            http_method: 'POST',
            http_route:
              '/api/orders/:orderId/payment-report',
            http_status: 409,
            reason_code:
              'INVALID_PAYMENT_TRANSITION',
            error_code: null,
            source_ip:
              expect.any(String),
            user_agent:
              'rejected-payment-report-test',
            previous_order_status:
              'NEW',
            new_order_status:
              'NEW',
            previous_payment_status:
              'REPORTED',
            new_payment_status:
              'REPORTED',
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
                payment_status,
                payment_method
              FROM orders
              WHERE id = $1
            `,
            [orderId],
          )

        expect(
          orderResult.rows[0],
        ).toEqual({
          payment_status: 'REPORTED',
          payment_method:
            'BANK_TRANSFER',
        })
      },
    )

    it(
      'records confirmation before reporting as the rejected confirmation action',
      async () => {
        const adminClient =
          await createAuthenticatedTestClient(
            'ADMIN',
          )

        const paymentOperatorClient =
          await createAuthenticatedTestClient(
            'PAYMENT_OPERATOR',
          )

        const orderId =
          await createOrder(adminClient)

        await pool.query(
          'TRUNCATE audit_events RESTART IDENTITY',
        )

        const response =
          await paymentOperatorClient
            .post(
              `/api/orders/${orderId}/payment-confirmation`,
            )
            .set(
              'user-agent',
              'rejected-confirmation-test',
            )
            .expect(409)

        expect(response.body).toEqual({
          error: {
            code:
              'INVALID_PAYMENT_TRANSITION',
            message:
              'Payment cannot be confirmed for this order.',
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
              'PAYMENT_CONFIRMED',
            outcome: 'REJECTED',
            severity: 'WARN',
            actor_user_id:
              paymentOperatorClient.user
                .id,
            actor_username:
              paymentOperatorClient.user
                .username,
            actor_role:
              'PAYMENT_OPERATOR',
            target_resource_type:
              'ORDER',
            target_resource_id:
              String(orderId),
            request_id: requestId,
            operation:
              'CONFIRM_PAYMENT',
            http_method: 'POST',
            http_route:
              '/api/orders/:orderId/payment-confirmation',
            http_status: 409,
            reason_code:
              'INVALID_PAYMENT_TRANSITION',
            previous_order_status:
              'NEW',
            new_order_status:
              'NEW',
            previous_payment_status:
              'AWAITING_PAYMENT',
            new_payment_status:
              'CONFIRMED',
          },
        ])
      },
    )

    it(
      'records one success and one rejection for concurrent confirmations',
      async () => {
        const adminClient =
          await createAuthenticatedTestClient(
            'ADMIN',
          )

        const orderOperatorClient =
          await createAuthenticatedTestClient(
            'ORDER_OPERATOR',
          )

        const paymentOperatorClient =
          await createAuthenticatedTestClient(
            'PAYMENT_OPERATOR',
          )

        const orderId =
          await createReportedOrder(
            adminClient,
            orderOperatorClient,
          )

        await pool.query(
          'TRUNCATE audit_events RESTART IDENTITY',
        )

        const responses =
          await Promise.all([
            paymentOperatorClient
              .post(
                `/api/orders/${orderId}/payment-confirmation`,
              )
              .set(
                'user-agent',
                'concurrent-confirmation-one',
              ),
            paymentOperatorClient
              .post(
                `/api/orders/${orderId}/payment-confirmation`,
              )
              .set(
                'user-agent',
                'concurrent-confirmation-two',
              ),
          ])

        expect(
          responses
            .map(
              (response) =>
                response.status,
            )
            .sort(),
        ).toEqual([200, 409])

        const successfulResponse =
          responses.find(
            (response) =>
              response.status === 200,
          )

        const rejectedResponse =
          responses.find(
            (response) =>
              response.status === 409,
          )

        if (
          !successfulResponse ||
          !rejectedResponse
        ) {
          throw new Error(
            'Expected one successful and one rejected confirmation',
          )
        }

        const successfulRequestId =
          readRequestId(
            successfulResponse,
          )

        const rejectedRequestId =
          readRequestId(
            rejectedResponse,
          )

        const successfulAuditResult =
          await pool.query(
            `
              SELECT
                action,
                outcome,
                severity,
                request_id,
                http_status,
                reason_code,
                previous_payment_status,
                new_payment_status
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
              'PAYMENT_CONFIRMED',
            outcome: 'SUCCESS',
            severity: 'INFO',
            request_id:
              successfulRequestId,
            http_status: 200,
            reason_code: null,
            previous_payment_status:
              'REPORTED',
            new_payment_status:
              'CONFIRMED',
          },
        ])

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
              'PAYMENT_CONFIRMED',
            outcome: 'REJECTED',
            severity: 'WARN',
            request_id:
              rejectedRequestId,
            http_status: 409,
            reason_code:
              'INVALID_PAYMENT_TRANSITION',
            previous_order_status:
              'NEW',
            new_order_status:
              'NEW',
            previous_payment_status:
              'CONFIRMED',
            new_payment_status:
              'CONFIRMED',
          },
        ])

        expect(
          successfulRequestId,
        ).not.toBe(rejectedRequestId)

        const persistedOrderResult =
          await pool.query(
            `
              SELECT
                payment_status,
                payment_method
              FROM orders
              WHERE id = $1
            `,
            [orderId],
          )

        expect(
          persistedOrderResult.rows[0],
        ).toEqual({
          payment_status:
            'CONFIRMED',
          payment_method: 'PAYPAL',
        })
      },
    )
  },
)