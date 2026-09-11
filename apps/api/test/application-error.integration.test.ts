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

const DATABASE_FAILURE_CONSTRAINT =
  'application_error_integration_failure'

const AUDIT_FAILURE_CONSTRAINT =
  'application_error_audit_failure'

const CUSTOMER_IDENTIFIER_SECRET =
  'customer-phone-secret'

const CUSTOMER_ADDRESS_SECRET =
  'customer-address-secret'

const ORDER_ITEM_SECRET =
  'application-error-body-secret'

const AUTHORIZATION_SECRET =
  'Bearer application-error-authorization-secret'

const FORWARDED_IP = '203.0.113.210'

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

describe('Application error handling', () => {
  beforeEach(async () => {
    await pool.query(`
      ALTER TABLE order_items
      DROP CONSTRAINT IF EXISTS
        ${DATABASE_FAILURE_CONSTRAINT}
    `)

    await pool.query(`
  ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS
    ${AUDIT_FAILURE_CONSTRAINT}
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
      ALTER TABLE order_items
      DROP CONSTRAINT IF EXISTS
        ${DATABASE_FAILURE_CONSTRAINT}
    `)


    await pool.query(`
  ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS
    ${AUDIT_FAILURE_CONSTRAINT}
`)

    await pool.end()
  })

  it('records a sanitized correlated application error and rolls back the mutation', async () => {
    const authenticatedClient =
      await createAuthenticatedTestClient()

    await pool.query(
      'TRUNCATE audit_events RESTART IDENTITY',
    )

    await pool.query(`
      ALTER TABLE order_items
      ADD CONSTRAINT
        ${DATABASE_FAILURE_CONSTRAINT}
      CHECK (
        description <> '${ORDER_ITEM_SECRET}'
      )
    `)

    const stderrWriteSpy = vi
      .spyOn(process.stderr, 'write')
      .mockReturnValue(true)

    try {
      const response =
        await authenticatedClient
          .post('/api/orders')
          .set(
            'user-agent',
            'application-error-integration-agent',
          )
          .set(
            'authorization',
            AUTHORIZATION_SECRET,
          )
          .set(
            'x-forwarded-for',
            FORWARDED_IP,
          )
          .send({
            orderSource: 'instagram',
            customerIdentifier:
              CUSTOMER_IDENTIFIER_SECRET,
            operationalNote:
              CUSTOMER_ADDRESS_SECRET,
            items: [
              {
                supplierAlias: 'supplier-a',
                description:
                  ORDER_ITEM_SECRET,
                quantity: 1,
                unitPrice: 25,
              },
            ],
          })

      expect(response.status).toBe(500)

      const requestId =
        readRequestId(response)

      expect(response.body).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message:
            'An unexpected error occurred.',
          requestId,
        },
      })

      const orderCountResult =
        await pool.query(`
          SELECT COUNT(*)::int AS count
          FROM orders
        `)

      const itemCountResult =
        await pool.query(`
          SELECT COUNT(*)::int AS count
          FROM order_items
        `)

      expect(
        orderCountResult.rows[0].count,
      ).toBe(0)

      expect(
        itemCountResult.rows[0].count,
      ).toBe(0)

      const auditResult = await pool.query(`
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
        WHERE action = 'APPLICATION_ERROR'
      `)

      expect(auditResult.rows).toHaveLength(1)

      expect(auditResult.rows[0]).toMatchObject({
        schema_version: 2,
        category: 'ERROR',
        action: 'APPLICATION_ERROR',
        outcome: 'FAILURE',
        severity: 'ERROR',
        actor_type: 'USER',
        actor_user_id:
          authenticatedClient.user.id,
        actor_username:
          authenticatedClient.user.username,
        actor_role: 'ADMIN',
        target_resource_type:
          'APPLICATION',
        target_resource_id: 'api',
        request_id: requestId,
        operation: 'CREATE_ORDER',
        http_method: 'POST',
        http_route: '/api/orders/',
        http_status: 500,
        reason_code: null,
        error_code: 'UNEXPECTED_ERROR',
        user_agent:
          'application-error-integration-agent',
        context: {},
      })

      expect(
        auditResult.rows[0].source_ip,
      ).toEqual(expect.any(String))

      expect(
        auditResult.rows[0].source_ip,
      ).not.toBe(FORWARDED_IP)

      const structuredErrorOutput =
        stderrWriteSpy.mock.calls
          .map((call) => String(call[0]))
          .join('')

      const structuredErrorLines =
        structuredErrorOutput
          .trim()
          .split('\n')
          .filter(
            (line) => line.length > 0,
          )

      expect(
        structuredErrorLines,
      ).toHaveLength(1)

      const structuredErrorRecords =
        structuredErrorLines.map(
          (line) =>
            JSON.parse(line) as Record<
              string,
              unknown
            >,
        )

      expect(
        structuredErrorRecords[0],
      ).toMatchObject({
        requestId,
        eventType: 'APPLICATION_ERROR',
        operation: 'CREATE_ORDER',
        method: 'POST',
        route: '/api/orders/',
        status: 500,
        errorCode: 'UNEXPECTED_ERROR',
      })

      const serializedResponse =
        JSON.stringify(response.body)

      const serializedAudit =
        JSON.stringify(auditResult.rows[0])

      const sensitiveValues = [
        CUSTOMER_IDENTIFIER_SECRET,
        CUSTOMER_ADDRESS_SECRET,
        ORDER_ITEM_SECRET,
        AUTHORIZATION_SECRET,
        authenticatedClient.csrfToken,
        DATABASE_FAILURE_CONSTRAINT,
      ]

      for (
        const sensitiveValue of
        sensitiveValues
      ) {
        expect(
          serializedResponse,
        ).not.toContain(sensitiveValue)

        expect(
          serializedAudit,
        ).not.toContain(sensitiveValue)

        expect(
          structuredErrorOutput,
        ).not.toContain(sensitiveValue)
      }
    } finally {
      stderrWriteSpy.mockRestore()

      await pool.query(`
        ALTER TABLE order_items
        DROP CONSTRAINT IF EXISTS
          ${DATABASE_FAILURE_CONSTRAINT}
      `)
    }
  })

  it('preserves the response and writes a safe fallback when application error persistence fails', async () => {
  const authenticatedClient =
    await createAuthenticatedTestClient()

  await pool.query(
    'TRUNCATE audit_events RESTART IDENTITY',
  )

  await pool.query(`
    ALTER TABLE order_items
    ADD CONSTRAINT
      ${DATABASE_FAILURE_CONSTRAINT}
    CHECK (
      description <> '${ORDER_ITEM_SECRET}'
    )
  `)

  await pool.query(`
    ALTER TABLE audit_events
    ADD CONSTRAINT
      ${AUDIT_FAILURE_CONSTRAINT}
    CHECK (
      action <> 'APPLICATION_ERROR'
    )
  `)

  const stderrWriteSpy = vi
    .spyOn(process.stderr, 'write')
    .mockReturnValue(true)

  try {
    const response =
      await authenticatedClient
        .post('/api/orders')
        .set(
          'user-agent',
          'application-error-fallback-agent',
        )
        .set(
          'authorization',
          AUTHORIZATION_SECRET,
        )
        .set(
          'x-forwarded-for',
          FORWARDED_IP,
        )
        .send({
          orderSource: 'instagram',
          customerIdentifier:
            CUSTOMER_IDENTIFIER_SECRET,
          operationalNote:
            CUSTOMER_ADDRESS_SECRET,
          items: [
            {
              supplierAlias: 'supplier-a',
              description:
                ORDER_ITEM_SECRET,
              quantity: 1,
              unitPrice: 25,
            },
          ],
        })

    expect(response.status).toBe(500)

    const requestId =
      readRequestId(response)

    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message:
          'An unexpected error occurred.',
        requestId,
      },
    })

    const orderCountResult =
      await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM orders
      `)

    const itemCountResult =
      await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM order_items
      `)

    expect(
      orderCountResult.rows[0].count,
    ).toBe(0)

    expect(
      itemCountResult.rows[0].count,
    ).toBe(0)

    const auditResult =
      await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE action = 'APPLICATION_ERROR'
      `)

    expect(
      auditResult.rows[0].count,
    ).toBe(0)

    const structuredErrorOutput =
      stderrWriteSpy.mock.calls
        .map((call) => String(call[0]))
        .join('')

    const structuredErrorLines =
      structuredErrorOutput
        .trim()
        .split('\n')
        .filter(
          (line) => line.length > 0,
        )

    expect(
      structuredErrorLines,
    ).toHaveLength(2)

    const structuredErrorRecords =
      structuredErrorLines.map(
        (line) =>
          JSON.parse(line) as Record<
            string,
            unknown
          >,
      )

    const applicationErrorRecord =
      structuredErrorRecords.find(
        (record) =>
          record.eventType ===
          'APPLICATION_ERROR',
      )

    expect(
      applicationErrorRecord,
    ).toMatchObject({
      requestId,
      eventType: 'APPLICATION_ERROR',
      operation: 'CREATE_ORDER',
      method: 'POST',
      route: '/api/orders/',
      status: 500,
      errorCode: 'UNEXPECTED_ERROR',
    })

    const fallbackRecord =
      structuredErrorRecords.find(
        (record) =>
          record.eventType ===
          'AUDIT_PERSISTENCE_FAILED',
      )

    expect(fallbackRecord).toMatchObject({
      requestId,
      eventType:
        'AUDIT_PERSISTENCE_FAILED',
      failureCode:
        'AUDIT_PERSISTENCE_FAILED',
      auditEvent: {
        schemaVersion: 2,
        category: 'ERROR',
        action: 'APPLICATION_ERROR',
        outcome: 'FAILURE',
        severity: 'ERROR',
        operation: 'CREATE_ORDER',
        method: 'POST',
        route: '/api/orders/',
        status: 500,
        errorCode: 'UNEXPECTED_ERROR',
      },
    })

    const serializedResponse =
      JSON.stringify(response.body)

    const sensitiveValues = [
      CUSTOMER_IDENTIFIER_SECRET,
      CUSTOMER_ADDRESS_SECRET,
      ORDER_ITEM_SECRET,
      AUTHORIZATION_SECRET,
      authenticatedClient.csrfToken,
      DATABASE_FAILURE_CONSTRAINT,
      AUDIT_FAILURE_CONSTRAINT,
    ]

    for (
      const sensitiveValue of
      sensitiveValues
    ) {
      expect(
        serializedResponse,
      ).not.toContain(sensitiveValue)

      expect(
        structuredErrorOutput,
      ).not.toContain(sensitiveValue)
    }
  } finally {
    stderrWriteSpy.mockRestore()

    await pool.query(`
      ALTER TABLE audit_events
      DROP CONSTRAINT IF EXISTS
        ${AUDIT_FAILURE_CONSTRAINT}
    `)

    await pool.query(`
      ALTER TABLE order_items
      DROP CONSTRAINT IF EXISTS
        ${DATABASE_FAILURE_CONSTRAINT}
    `)
  }
})
})