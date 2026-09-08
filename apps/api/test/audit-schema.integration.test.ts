import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { pool } from '../src/db.js'

describe('Extended audit event schema', () => {
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE audit_events RESTART IDENTITY',
    )
  })

  afterAll(async () => {
    await pool.end()
  })

  it('accepts structured version two security event metadata', async () => {
    const requestId =
      '8ecaf06d-61f6-45d7-a9a8-edac9e897989'

    const result = await pool.query(
      `
        INSERT INTO audit_events (
          schema_version,
          category,
          action,
          outcome,
          severity,
          actor_type,
          target_resource_type,
          target_resource_id,
          request_id,
          operation,
          http_method,
          http_route,
          http_status,
          reason_code,
          source_ip,
          user_agent,
          context
        )
        VALUES (
          2,
          'SECURITY',
          'AUTH_LOGIN_FAILED',
          'FAILURE',
          'WARN',
          'ANONYMOUS',
          'AUTHENTICATION',
          'login',
          $1,
          'AUTH_LOGIN',
          'POST',
          '/api/auth/login',
          401,
          'INVALID_CREDENTIALS',
          '127.0.0.1',
          'schema-test-agent',
          '{}'::jsonb
        )
        RETURNING
          schema_version,
          category,
          action,
          outcome,
          severity,
          actor_type,
          actor_user_id,
          request_id,
          operation,
          http_method,
          http_route,
          http_status,
          reason_code,
          error_code,
          host(source_ip) AS source_ip,
          user_agent
      `,
      [requestId],
    )

    expect(result.rows).toEqual([
      {
        schema_version: 2,
        category: 'SECURITY',
        action: 'AUTH_LOGIN_FAILED',
        outcome: 'FAILURE',
        severity: 'WARN',
        actor_type: 'ANONYMOUS',
        actor_user_id: null,
        request_id: requestId,
        operation: 'AUTH_LOGIN',
        http_method: 'POST',
        http_route: '/api/auth/login',
        http_status: 401,
        reason_code: 'INVALID_CREDENTIALS',
        error_code: null,
        source_ip: '127.0.0.1',
        user_agent: 'schema-test-agent',
      },
    ])
  })

  it('rejects version two events without a request ID', async () => {
    await expect(
      pool.query(`
        INSERT INTO audit_events (
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
          operation,
          http_method,
          http_route,
          http_status,
          source_ip
        )
        VALUES (
          2,
          'SECURITY',
          'AUTH_LOGIN_SUCCEEDED',
          'SUCCESS',
          'INFO',
          'USER',
          1,
          'schema.user',
          'ADMIN',
          'AUTHENTICATION',
          'login',
          'AUTH_LOGIN',
          'POST',
          '/api/auth/login',
          200,
          '127.0.0.1'
        )
      `),
    ).rejects.toMatchObject({
      code: '23514',
      constraint:
        'audit_events_version_two_request_metadata',
    })
  })

  it('rejects rejected events without a reason code', async () => {
    await expect(
      pool.query(`
        INSERT INTO audit_events (
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
          source_ip
        )
        VALUES (
          2,
          'SECURITY',
          'AUTHORIZATION_DENIED',
          'REJECTED',
          'WARN',
          'USER',
          1,
          'schema.user',
          'ADMIN',
          'REQUEST',
          '/api/orders',
          'ec826d14-39f3-4dee-8e24-bfa1ca2d57a5',
          'LIST_ORDERS',
          'GET',
          '/api/orders',
          403,
          '127.0.0.1'
        )
      `),
    ).rejects.toMatchObject({
      code: '23514',
      constraint:
        'audit_events_outcome_code_consistent',
    })
  })

  it('rejects application errors with a non-server status', async () => {
    await expect(
      pool.query(`
        INSERT INTO audit_events (
          schema_version,
          category,
          action,
          outcome,
          severity,
          actor_type,
          target_resource_type,
          target_resource_id,
          request_id,
          operation,
          http_method,
          http_route,
          http_status,
          error_code,
          source_ip
        )
        VALUES (
          2,
          'ERROR',
          'APPLICATION_ERROR',
          'FAILURE',
          'ERROR',
          'SYSTEM',
          'APPLICATION',
          'api',
          '13974f2e-40ba-4fd7-9d90-8196364caa5a',
          'TEST_FAILURE',
          'GET',
          '/api/test-failure',
          400,
          'UNEXPECTED_ERROR',
          '127.0.0.1'
        )
      `),
    ).rejects.toMatchObject({
      code: '23514',
      constraint:
        'audit_events_application_error_server_status',
    })
  })
})