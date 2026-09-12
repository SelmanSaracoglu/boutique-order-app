import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import {
  listAuditEvents,
} from '../src/audit/auditReadRepository.js'
import {
  parseAuditReadQuery,
} from '../src/audit/auditReadQuery.js'
import { pool } from '../src/db.js'

const OCCURRED_AT =
  '2026-09-12T10:30:00.000Z'

const SENSITIVE_CONTEXT = {
  token: 'super-secret-token',
  cookie: 'super-secret-cookie',
  sessionId: 'super-secret-session',
  requestBody: {
    customerName: 'Sensitive Customer',
  },
  sql: 'SELECT sensitive_data',
  stack: 'Sensitive stack trace',
}

describe('Audit read repository', () => {
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE audit_events RESTART IDENTITY',
    )

    await pool.query(
      `
        INSERT INTO audit_events (
          schema_version,
          occurred_at,
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
          source_ip,
          user_agent,
          context
        )
        VALUES
          (
            2,
            $1,
            'SECURITY',
            'AUDIT_LOG_VIEWED',
            'SUCCESS',
            'INFO',
            'USER',
            1,
            E'admin\\r\\nspoofed',
            'ADMIN',
            'AUDIT_LOG',
            E'audit-events-1\\r\\nspoofed',
            '00000000-0000-4000-8000-000000000001',
            'VIEW_AUDIT_LOG',
            'GET',
            '/api/audit-events/',
            200,
            '192.0.2.1',
            'cookie=super-secret-cookie',
            $2::jsonb
          ),
          (
            2,
            $1,
            'SECURITY',
            'AUDIT_LOG_VIEWED',
            'SUCCESS',
            'INFO',
            'USER',
            1,
            E'admin\\r\\nspoofed',
            'ADMIN',
            'AUDIT_LOG',
            E'audit-events-2\\r\\nspoofed',
            '00000000-0000-4000-8000-000000000002',
            'VIEW_AUDIT_LOG',
            'GET',
            '/api/audit-events/',
            200,
            '192.0.2.2',
            'cookie=super-secret-cookie',
            $2::jsonb
          ),
          (
            2,
            $1,
            'SECURITY',
            'AUDIT_LOG_VIEWED',
            'SUCCESS',
            'INFO',
            'USER',
            1,
            E'admin\\r\\nspoofed',
            'ADMIN',
            'AUDIT_LOG',
            E'audit-events-3\\r\\nspoofed',
            '00000000-0000-4000-8000-000000000003',
            'VIEW_AUDIT_LOG',
            'GET',
            '/api/audit-events/',
            200,
            '192.0.2.3',
            'cookie=super-secret-cookie',
            $2::jsonb
          )
      `,
      [
        OCCURRED_AT,
        JSON.stringify(SENSITIVE_CONTEXT),
      ],
    )
  })

  afterAll(async () => {
    await pool.end()
  })

  it('returns deterministic cursor pages without sensitive fields', async () => {
    const client = await pool.connect()

    try {
      const firstQuery =
        parseAuditReadQuery({
          limit: '2',
        })

      if (firstQuery === null) {
        throw new Error(
          'Expected a valid first-page query',
        )
      }

      const firstPage =
        await listAuditEvents(
          client,
          firstQuery,
        )

      expect(
        firstPage.items.map(
          (event) => event.id,
        ),
      ).toEqual(['3', '2'])

      expect(firstPage.nextCursor).not.toBeNull()

      expect(firstPage.items[0]).toEqual({
        id: '3',
        occurredAt: OCCURRED_AT,
        category: 'SECURITY',
        action: 'AUDIT_LOG_VIEWED',
        outcome: 'SUCCESS',
        severity: 'INFO',
        actor: {
          type: 'USER',
          username: 'admin spoofed',
          role: 'ADMIN',
        },
        target: {
          resourceType: 'AUDIT_LOG',
          resourceId:
            'audit-events-3 spoofed',
        },
        requestId:
          '00000000-0000-4000-8000-000000000003',
      })

      expect(
        firstPage.items[0],
      ).not.toHaveProperty('context')

      expect(
        firstPage.items[0],
      ).not.toHaveProperty('sourceIp')

      expect(
        firstPage.items[0],
      ).not.toHaveProperty('userAgent')

      expect(
        firstPage.items[0]?.actor,
      ).not.toHaveProperty('userId')

      const serializedFirstPage =
        JSON.stringify(firstPage)

      expect(
        serializedFirstPage,
      ).not.toContain('super-secret')

      expect(
        serializedFirstPage,
      ).not.toContain('Sensitive Customer')

      expect(
        serializedFirstPage,
      ).not.toContain('SELECT sensitive_data')

      expect(
        serializedFirstPage,
      ).not.toContain('Sensitive stack trace')

      if (firstPage.nextCursor === null) {
        throw new Error(
          'Expected a next-page cursor',
        )
      }

      const secondQuery =
        parseAuditReadQuery({
          limit: '2',
          cursor: firstPage.nextCursor,
        })

      if (secondQuery === null) {
        throw new Error(
          'Expected a valid second-page query',
        )
      }

      const secondPage =
        await listAuditEvents(
          client,
          secondQuery,
        )

      expect(
        secondPage.items.map(
          (event) => event.id,
        ),
      ).toEqual(['1'])

      expect(
        secondPage.nextCursor,
      ).toBeNull()
    } finally {
      client.release()
    }
  })
})