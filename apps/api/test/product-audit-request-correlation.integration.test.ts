import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import type {
  ProductAuditAction,
} from '../src/audit/auditEvent.js'
import type {
  AuditOperation,
} from '../src/audit/requestAuditEvent.js'
import { pool } from '../src/db.js'
import {
  createAuthenticatedTestClient,
  type AuthenticatedTestClient,
} from './authenticatedTestClient.js'

const orderInput = {
  orderSource: 'instagram',
  customerIdentifier:
    '@product-correlation-test',
  items: [
    {
      supplierAlias: 'supplier-a',
      description:
        'Product correlation item',
      quantity: 1,
      unitPrice: 25,
    },
  ],
}

type ExpectedProductEvent = {
  action: ProductAuditAction
  operation: AuditOperation
  method: 'POST' | 'PATCH'
  route: string
  status: 200 | 201
  actor: AuthenticatedTestClient
  orderId: number
  userAgent: string
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

async function expectProductEvent(
  requestId: string,
  expected: ExpectedProductEvent,
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
        user_agent
      FROM audit_events
      WHERE request_id = $1
      ORDER BY id
    `,
    [requestId],
  )

  expect(result.rows).toEqual([
    {
      schema_version: 2,
      category: 'PRODUCT',
      action: expected.action,
      outcome: 'SUCCESS',
      severity: 'INFO',
      actor_type: 'USER',
      actor_user_id:
        expected.actor.user.id,
      actor_username:
        expected.actor.user.username,
      actor_role:
        expected.actor.user.role,
      target_resource_type: 'ORDER',
      target_resource_id:
        String(expected.orderId),
      request_id: requestId,
      operation: expected.operation,
      http_method: expected.method,
      http_route: expected.route,
      http_status: expected.status,
      reason_code: null,
      error_code: null,
      source_ip: expect.any(String),
      user_agent:
        expected.userAgent,
    },
  ])

  return result.rows[0]
}

describe(
  'Product audit request correlation',
  () => {
    let adminClient:
      AuthenticatedTestClient

    let paymentReporterClient:
      AuthenticatedTestClient

    let paymentConfirmerClient:
      AuthenticatedTestClient

    let fulfillmentClient:
      AuthenticatedTestClient

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

      adminClient =
        await createAuthenticatedTestClient(
          'ADMIN',
        )

      paymentReporterClient =
        await createAuthenticatedTestClient(
          'ORDER_OPERATOR',
        )

      paymentConfirmerClient =
        await createAuthenticatedTestClient(
          'PAYMENT_OPERATOR',
        )

      fulfillmentClient =
        await createAuthenticatedTestClient(
          'FULFILLMENT_OPERATOR',
        )

      await pool.query(
        'TRUNCATE audit_events RESTART IDENTITY',
      )
    })

    afterAll(async () => {
      await pool.end()
    })

    it('correlates every successful product action with its API request', async () => {
      const forwardedIp =
        '203.0.113.120'

      const createUserAgent =
        'product-order-created-test'

      const createResponse =
        await adminClient
          .post('/api/orders')
          .set(
            'user-agent',
            createUserAgent,
          )
          .set(
            'x-forwarded-for',
            forwardedIp,
          )
          .send(orderInput)
          .expect(201)

      const orderId =
        createResponse.body.id as number

      const createRequestId =
        readRequestId(createResponse)

      const createdEvent =
        await expectProductEvent(
          createRequestId,
          {
            action: 'ORDER_CREATED',
            operation: 'CREATE_ORDER',
            method: 'POST',
            route: '/api/orders/',
            status: 201,
            actor: adminClient,
            orderId,
            userAgent:
              createUserAgent,
          },
        )

      expect(
        createdEvent.source_ip,
      ).not.toBe(forwardedIp)

      const reportUserAgent =
        'product-payment-reported-test'

      const reportResponse =
        await paymentReporterClient
          .post(
            `/api/orders/${orderId}/payment-report`,
          )
          .set(
            'user-agent',
            reportUserAgent,
          )
          .send({
            paymentMethod:
              'BANK_TRANSFER',
          })
          .expect(200)

      const reportRequestId =
        readRequestId(reportResponse)

      await expectProductEvent(
        reportRequestId,
        {
          action:
            'PAYMENT_REPORTED',
          operation:
            'REPORT_PAYMENT',
          method: 'POST',
          route:
            '/api/orders/:orderId/payment-report',
          status: 200,
          actor:
            paymentReporterClient,
          orderId,
          userAgent:
            reportUserAgent,
        },
      )

      const confirmUserAgent =
        'product-payment-confirmed-test'

      const confirmResponse =
        await paymentConfirmerClient
          .post(
            `/api/orders/${orderId}/payment-confirmation`,
          )
          .set(
            'user-agent',
            confirmUserAgent,
          )
          .expect(200)

      const confirmRequestId =
        readRequestId(confirmResponse)

      await expectProductEvent(
        confirmRequestId,
        {
          action:
            'PAYMENT_CONFIRMED',
          operation:
            'CONFIRM_PAYMENT',
          method: 'POST',
          route:
            '/api/orders/:orderId/payment-confirmation',
          status: 200,
          actor:
            paymentConfirmerClient,
          orderId,
          userAgent:
            confirmUserAgent,
        },
      )

      const processingUserAgent =
        'product-processing-started-test'

      const processingResponse =
        await fulfillmentClient
          .patch(
            `/api/orders/${orderId}/status`,
          )
          .set(
            'user-agent',
            processingUserAgent,
          )
          .send({
            status: 'IN_PROGRESS',
          })
          .expect(200)

      const processingRequestId =
        readRequestId(
          processingResponse,
        )

      await expectProductEvent(
        processingRequestId,
        {
          action:
            'ORDER_PROCESSING_STARTED',
          operation:
            'UPDATE_ORDER_STATUS',
          method: 'PATCH',
          route:
            '/api/orders/:orderId/status',
          status: 200,
          actor:
            fulfillmentClient,
          orderId,
          userAgent:
            processingUserAgent,
        },
      )

      const completedUserAgent =
        'product-order-completed-test'

      const completedResponse =
        await fulfillmentClient
          .patch(
            `/api/orders/${orderId}/status`,
          )
          .set(
            'user-agent',
            completedUserAgent,
          )
          .send({
            status: 'COMPLETED',
          })
          .expect(200)

      const completedRequestId =
        readRequestId(
          completedResponse,
        )

      await expectProductEvent(
        completedRequestId,
        {
          action:
            'ORDER_COMPLETED',
          operation:
            'UPDATE_ORDER_STATUS',
          method: 'PATCH',
          route:
            '/api/orders/:orderId/status',
          status: 200,
          actor:
            fulfillmentClient,
          orderId,
          userAgent:
            completedUserAgent,
        },
      )

      const cancellationOrderResponse =
        await adminClient
          .post('/api/orders')
          .send({
            ...orderInput,
            customerIdentifier:
              '@product-cancellation-test',
          })
          .expect(201)

      const cancellationOrderId =
        cancellationOrderResponse.body
          .id as number

      const cancelledUserAgent =
        'product-order-cancelled-test'

      const cancelledResponse =
        await fulfillmentClient
          .patch(
            `/api/orders/${cancellationOrderId}/status`,
          )
          .set(
            'user-agent',
            cancelledUserAgent,
          )
          .send({
            status: 'CANCELLED',
          })
          .expect(200)

      const cancelledRequestId =
        readRequestId(
          cancelledResponse,
        )

      await expectProductEvent(
        cancelledRequestId,
        {
          action:
            'ORDER_CANCELLED',
          operation:
            'UPDATE_ORDER_STATUS',
          method: 'PATCH',
          route:
            '/api/orders/:orderId/status',
          status: 200,
          actor:
            fulfillmentClient,
          orderId:
            cancellationOrderId,
          userAgent:
            cancelledUserAgent,
        },
      )

      const correlatedRequestIds = [
        createRequestId,
        reportRequestId,
        confirmRequestId,
        processingRequestId,
        completedRequestId,
        cancelledRequestId,
      ]

      expect(
        new Set(
          correlatedRequestIds,
        ).size,
      ).toBe(
        correlatedRequestIds.length,
      )
    })
  },
)