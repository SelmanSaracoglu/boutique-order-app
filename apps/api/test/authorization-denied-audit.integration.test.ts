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
  'authorization_denied_audit_test_failure'

const orderInput = {
  orderSource: 'instagram',
  customerIdentifier:
    '@authorization-audit-test',
  items: [
    {
      supplierAlias: 'supplier-a',
      description:
        'Authorization audit test item',
      quantity: 1,
      unitPrice: 25,
    },
  ],
}

const forbiddenResponse = {
  error: {
    code: 'FORBIDDEN',
    message:
      'You do not have permission to perform this action.',
  },
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

describe('Authorization security events', () => {
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

  it('records authorization denied with actor, order target, and request context', async () => {
    const adminClient =
      await createAuthenticatedTestClient(
        'ADMIN',
      )

    const orderId =
      await createOrder(adminClient)

    const paymentClient =
      await createAuthenticatedTestClient(
        'PAYMENT_OPERATOR',
      )

    await pool.query(
      'TRUNCATE audit_events RESTART IDENTITY',
    )

    const forwardedIp = '203.0.113.80'

    const response = await paymentClient
      .patch(
        `/api/orders/${orderId}/status`,
      )
      .set(
        'user-agent',
        'authorization-denied-test',
      )
      .set(
        'x-forwarded-for',
        forwardedIp,
      )
      .send({
        status: 'IN_PROGRESS',
      })
      .expect(403)

    expect(response.body).toEqual(
      forbiddenResponse,
    )

    const auditResult = await pool.query(
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
      `,
      [
        response.headers[
          'x-request-id'
        ],
      ],
    )

    expect(auditResult.rows).toEqual([
      {
        schema_version: 2,
        category: 'SECURITY',
        action:
          'AUTHORIZATION_DENIED',
        outcome: 'REJECTED',
        severity: 'WARN',
        actor_type: 'USER',
        actor_user_id:
          paymentClient.user.id,
        actor_username:
          paymentClient.user.username,
        actor_role:
          'PAYMENT_OPERATOR',
        target_resource_type: 'ORDER',
        target_resource_id:
          String(orderId),
        request_id:
          response.headers[
            'x-request-id'
          ],
        operation:
          'AUTHORIZE_REQUEST',
        http_method: 'PATCH',
        http_route:
          '/api/orders/:orderId/status',
        http_status: 403,
        reason_code: 'FORBIDDEN',
        error_code: null,
        source_ip: expect.any(String),
        user_agent:
          'authorization-denied-test',
        context: {
          permission:
            'ORDER_STATUS_UPDATE',
        },
      },
    ])

    expect(
      auditResult.rows[0].source_ip,
    ).not.toBe(forwardedIp)
  })

  it('does not record an authorization event when permission is granted', async () => {
    const orderOperatorClient =
      await createAuthenticatedTestClient(
        'ORDER_OPERATOR',
      )

    await pool.query(
      'TRUNCATE audit_events RESTART IDENTITY',
    )

    const response =
      await orderOperatorClient
        .get('/api/orders')
        .expect(200)

    const auditResult = await pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE request_id = $1
      `,
      [
        response.headers[
          'x-request-id'
        ],
      ],
    )

    expect(
      auditResult.rows[0].count,
    ).toBe(0)
  })

  it('preserves the forbidden response and writes a safe fallback when audit persistence fails', async () => {
    const paymentClient =
      await createAuthenticatedTestClient(
        'PAYMENT_OPERATOR',
      )

    await pool.query(
      'TRUNCATE audit_events RESTART IDENTITY',
    )

    await pool.query(`
      ALTER TABLE audit_events
      ADD CONSTRAINT ${AUDIT_FAILURE_CONSTRAINT}
      CHECK (
        action <> 'AUTHORIZATION_DENIED'
      )
    `)

    const stderrWriteSpy = vi
      .spyOn(process.stderr, 'write')
      .mockReturnValue(true)

    try {
      const response =
        await paymentClient.agent
          .post('/api/orders')
          .set(
            'user-agent',
            'authorization-audit-failure-test',
          )
          .set(
            'authorization',
            'Bearer authorization-secret',
          )
          .set(
            'x-csrf-token',
            'csrf-secret',
          )
          .send({
            password:
              'password-secret',
            customerAddress:
              'customer-address-secret',
          })
          .expect(403)

      expect(response.body).toEqual(
        forbiddenResponse,
      )

      const auditResult =
        await pool.query(`
          SELECT COUNT(*)::int AS count
          FROM audit_events
          WHERE action =
            'AUTHORIZATION_DENIED'
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

      expect(fallbackLines).toHaveLength(
        1,
      )

      const fallbackRecord =
        JSON.parse(
          fallbackLines[0] ?? '',
        )

      expect(
        fallbackRecord,
      ).toMatchObject({
        requestId:
          response.headers[
            'x-request-id'
          ],
        eventType:
          'AUDIT_PERSISTENCE_FAILED',
        failureCode:
          'AUDIT_PERSISTENCE_FAILED',
        auditEvent: {
          schemaVersion: 2,
          category: 'SECURITY',
          action:
            'AUTHORIZATION_DENIED',
          outcome: 'REJECTED',
          severity: 'WARN',
          operation:
            'AUTHORIZE_REQUEST',
          method: 'POST',
          route: '/api/orders/',
          status: 403,
          actor: {
            type: 'USER',
            userId:
              paymentClient.user.id,
            username:
              paymentClient.user
                .username,
            role:
              'PAYMENT_OPERATOR',
          },
          target: {
            resourceType: 'REQUEST',
            resourceId:
              '/api/orders/',
          },
          reasonCode: 'FORBIDDEN',
          userAgent:
            'authorization-audit-failure-test',
          context: {
            permission:
              'ORDER_CREATE',
          },
        },
      })

      expect(
        fallbackOutput,
      ).not.toContain(
        'authorization-secret',
      )

      expect(
        fallbackOutput,
      ).not.toContain(
        'csrf-secret',
      )

      expect(
        fallbackOutput,
      ).not.toContain(
        'password-secret',
      )

      expect(
        fallbackOutput,
      ).not.toContain(
        'customer-address-secret',
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
})