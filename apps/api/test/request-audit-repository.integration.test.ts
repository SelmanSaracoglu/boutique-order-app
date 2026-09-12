import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { pool } from '../src/db.js'
import {
  tryRecordSecurityAuditEvent,
  type AuditFallbackWriter,
} from '../src/audit/requestAuditRepository.js'
import type { StructuredLogRecord } from '../src/logging/structuredLogger.js'

const FAILURE_CONSTRAINT =
  'security_audit_repository_test_failure'

describe('Request audit repository', () => {
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

  it('persists an allowlisted and sanitized security event', async () => {
    const requestId =
      '0d89b06c-2201-4fd0-a440-84b94a73ff41'

    const fallbackRecords: StructuredLogRecord[] = []

    const writeFallback: AuditFallbackWriter = (
      record,
    ) => {
      fallbackRecords.push(record)
    }

    const recorded =
      await tryRecordSecurityAuditEvent(
        {
          action: 'AUTH_LOGIN_FAILED',
          reasonCode: 'INVALID_CREDENTIALS',
          attemptedUsername:
            'attacker\r\ninjected-entry',
          actor: {
            type: 'ANONYMOUS',
          },
          target: {
            resourceType: 'AUTHENTICATION',
            resourceId: 'login',
          },
          request: {
            requestId,
            operation: 'AUTH_LOGIN',
            method: 'POST',
            route: '/api/auth/login',
            status: 401,
            sourceIp: '127.0.0.1',
            userAgent:
              'security-test-agent\r\ninjected-entry',
          },
        },
        writeFallback,
      )

    expect(recorded).toBe(true)
    expect(fallbackRecords).toEqual([])

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
      `,
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
        actor_username: null,
        actor_role: null,
        target_resource_type: 'AUTHENTICATION',
        target_resource_id: 'login',
        request_id: requestId,
        operation: 'AUTH_LOGIN',
        http_method: 'POST',
        http_route: '/api/auth/login',
        http_status: 401,
        reason_code: 'INVALID_CREDENTIALS',
        error_code: null,
        source_ip: '127.0.0.1',
        user_agent:
          'security-test-agent injected-entry',
        context: {
          attemptedUsername:
            'attacker injected-entry',
        },
      },
    ])
  })

  it('persists an audit log viewed security event', async () => {
    const requestId =
      '9f59bed2-f037-4aa3-bb39-88a9df27bb06'

    const recorded =
      await tryRecordSecurityAuditEvent({
        action: 'AUDIT_LOG_VIEWED',
        actor: {
          type: 'USER',
          user: {
            id: 1,
            username: 'admin',
            role: 'ADMIN',
          },
        },
        target: {
          resourceType: 'AUDIT_LOG',
          resourceId: 'audit-events',
        },
        request: {
          requestId,
          operation: 'VIEW_AUDIT_LOG',
          method: 'GET',
          route: '/api/audit-events/',
          status: 200,
          sourceIp: '127.0.0.1',
          userAgent: 'audit-test-agent',
        },
      })

    expect(recorded).toBe(true)

    const result = await pool.query(
      `
        SELECT
          category,
          action,
          outcome,
          severity,
          actor_type,
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
          context
        FROM audit_events
      `,
    )

    expect(result.rows).toEqual([
      {
        category: 'SECURITY',
        action: 'AUDIT_LOG_VIEWED',
        outcome: 'SUCCESS',
        severity: 'INFO',
        actor_type: 'USER',
        actor_username: 'admin',
        actor_role: 'ADMIN',
        target_resource_type: 'AUDIT_LOG',
        target_resource_id: 'audit-events',
        request_id: requestId,
        operation: 'VIEW_AUDIT_LOG',
        http_method: 'GET',
        http_route: '/api/audit-events/',
        http_status: 200,
        reason_code: null,
        context: {},
      },
    ])
  })

  it('uses a safe fallback record when persistence fails', async () => {
    await pool.query(`
      ALTER TABLE audit_events
      ADD CONSTRAINT ${FAILURE_CONSTRAINT}
      CHECK (action <> 'AUTH_LOGIN_FAILED')
    `)

    const requestId =
      '8c199780-1a1f-4977-a982-3879bcfd669a'

    const fallbackRecords: StructuredLogRecord[] = []

    const recorded =
      await tryRecordSecurityAuditEvent(
        {
          action: 'AUTH_LOGIN_FAILED',
          reasonCode: 'INVALID_CREDENTIALS',
          attemptedUsername: 'attacker',
          actor: {
            type: 'ANONYMOUS',
          },
          target: {
            resourceType: 'AUTHENTICATION',
            resourceId: 'login',
          },
          request: {
            requestId,
            operation: 'AUTH_LOGIN',
            method: 'POST',
            route: '/api/auth/login',
            status: 401,
            sourceIp: '127.0.0.1',
            userAgent: 'security-test-agent',
          },
        },
        (record) => {
          fallbackRecords.push(record)
        },
      )

    expect(recorded).toBe(false)

    const auditResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM audit_events
    `)

    expect(auditResult.rows[0].count).toBe(0)

    expect(fallbackRecords).toHaveLength(1)

    expect(fallbackRecords[0]).toMatchObject({
      requestId,
      eventType: 'AUDIT_PERSISTENCE_FAILED',
      failureCode: 'AUDIT_PERSISTENCE_FAILED',
      service: 'boutique-order-api',
      schemaVersion: 1,
      auditEvent: {
        schemaVersion: 2,
        category: 'SECURITY',
        action: 'AUTH_LOGIN_FAILED',
        outcome: 'FAILURE',
        severity: 'WARN',
        operation: 'AUTH_LOGIN',
        method: 'POST',
        route: '/api/auth/login',
        status: 401,
        actor: {
          type: 'ANONYMOUS',
        },
        target: {
          resourceType: 'AUTHENTICATION',
          resourceId: 'login',
        },
        reasonCode: 'INVALID_CREDENTIALS',
        sourceIp: '127.0.0.1',
        userAgent: 'security-test-agent',
        context: {
          attemptedUsername: 'attacker',
        },
      },
    })

    const serializedFallback =
      JSON.stringify(fallbackRecords[0])

    expect(serializedFallback).not.toContain(
      FAILURE_CONSTRAINT,
    )
    expect(serializedFallback).not.toContain('23514')
    expect(serializedFallback).not.toContain('password')
    expect(serializedFallback).not.toContain('cookie')
    expect(serializedFallback).not.toContain(
      'authorization',
    )
    expect(serializedFallback).not.toContain(
      'csrfToken',
    )
  })
})