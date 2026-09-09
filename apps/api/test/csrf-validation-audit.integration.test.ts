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
} from './authenticatedTestClient.js'

const AUDIT_FAILURE_CONSTRAINT =
  'csrf_validation_audit_test_failure'

const orderInput = {
  orderSource: 'instagram',
  customerIdentifier:
    '@csrf-audit-test',
  items: [
    {
      supplierAlias: 'supplier-a',
      description:
        'CSRF audit test item',
      quantity: 1,
      unitPrice: 25,
    },
  ],
}

const invalidCsrfResponse = {
  error: {
    code: 'INVALID_CSRF_TOKEN',
    message: 'Invalid CSRF token.',
  },
}

const forbiddenResponse = {
  error: {
    code: 'FORBIDDEN',
    message:
      'You do not have permission to perform this action.',
  },
}

describe('CSRF security events', () => {
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

  it('records CSRF validation failure with actor and request context', async () => {
    const orderOperatorClient =
      await createAuthenticatedTestClient(
        'ORDER_OPERATOR',
      )

    await pool.query(
      'TRUNCATE audit_events RESTART IDENTITY',
    )

    const forwardedIp = '203.0.113.90'
    const invalidToken =
      'invalid-csrf-token-secret'

    const response =
      await orderOperatorClient.agent
        .post('/api/orders')
        .set(
          'user-agent',
          'csrf-validation-failed-test',
        )
        .set(
          'x-forwarded-for',
          forwardedIp,
        )
        .set(
          'x-csrf-token',
          invalidToken,
        )
        .send(orderInput)
        .expect(403)

    expect(response.body).toEqual(
      invalidCsrfResponse,
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
          'CSRF_VALIDATION_FAILED',
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
          'REQUEST',
        target_resource_id:
          '/api/orders/',
        request_id:
          response.headers[
            'x-request-id'
          ],
        operation: 'VALIDATE_CSRF',
        http_method: 'POST',
        http_route:
          '/api/orders/',
        http_status: 403,
        reason_code:
          'INVALID_CSRF_TOKEN',
        error_code: null,
        source_ip: expect.any(String),
        user_agent:
          'csrf-validation-failed-test',
        context: {},
      },
    ])

    expect(
      auditResult.rows[0].source_ip,
    ).not.toBe(forwardedIp)

    const serializedEvent =
      JSON.stringify(auditResult.rows)

    expect(serializedEvent).not.toContain(
      invalidToken,
    )

    expect(serializedEvent).not.toContain(
      orderInput.customerIdentifier,
    )
  })

  it('records only authorization denied when authorization fails before CSRF validation', async () => {
    const paymentClient =
      await createAuthenticatedTestClient(
        'PAYMENT_OPERATOR',
      )

    await pool.query(
      'TRUNCATE audit_events RESTART IDENTITY',
    )

    const response =
      await paymentClient.agent
        .post('/api/orders')
        .set(
          'x-csrf-token',
          'invalid-csrf-token',
        )
        .send(orderInput)
        .expect(403)

    expect(response.body).toEqual(
      forbiddenResponse,
    )

    const auditResult = await pool.query(
      `
        SELECT
          action,
          reason_code,
          context
        FROM audit_events
        WHERE request_id = $1
        ORDER BY id
      `,
      [
        response.headers[
          'x-request-id'
        ],
      ],
    )

    expect(auditResult.rows).toEqual([
      {
        action:
          'AUTHORIZATION_DENIED',
        reason_code: 'FORBIDDEN',
        context: {
          permission: 'ORDER_CREATE',
        },
      },
    ])
  })

  it('does not record a CSRF failure when the token is valid', async () => {
    const orderOperatorClient =
      await createAuthenticatedTestClient(
        'ORDER_OPERATOR',
      )

    await pool.query(
      'TRUNCATE audit_events RESTART IDENTITY',
    )

    const response =
      await orderOperatorClient
        .post('/api/orders')
        .send(orderInput)
        .expect(201)

    const auditResult = await pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE
          request_id = $1
          AND action =
            'CSRF_VALIDATION_FAILED'
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
        action <> 'CSRF_VALIDATION_FAILED'
      )
    `)

    const stderrWriteSpy = vi
      .spyOn(process.stderr, 'write')
      .mockReturnValue(true)

    try {
      const response =
        await orderOperatorClient.agent
          .post('/api/orders')
          .set(
            'user-agent',
            'csrf-audit-failure-test',
          )
          .set(
            'authorization',
            'Bearer authorization-secret',
          )
          .set(
            'x-csrf-token',
            'csrf-token-secret',
          )
          .send({
            password:
              'password-secret',
            customerAddress:
              'customer-address-secret',
          })
          .expect(403)

      expect(response.body).toEqual(
        invalidCsrfResponse,
      )

      const auditResult =
        await pool.query(`
          SELECT COUNT(*)::int AS count
          FROM audit_events
          WHERE action =
            'CSRF_VALIDATION_FAILED'
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
            'CSRF_VALIDATION_FAILED',
          outcome: 'REJECTED',
          severity: 'WARN',
          operation:
            'VALIDATE_CSRF',
          method: 'POST',
          route: '/api/orders/',
          status: 403,
          actor: {
            type: 'USER',
            userId:
              orderOperatorClient.user.id,
            username:
              orderOperatorClient.user
                .username,
            role:
              'ORDER_OPERATOR',
          },
          target: {
            resourceType: 'REQUEST',
            resourceId:
              '/api/orders/',
          },
          reasonCode:
            'INVALID_CSRF_TOKEN',
          userAgent:
            'csrf-audit-failure-test',
          context: {},
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
        'csrf-token-secret',
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