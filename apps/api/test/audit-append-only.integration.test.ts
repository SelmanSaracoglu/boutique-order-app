import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import {
  pool,
} from '../src/db.js';

const RUNTIME_ROLE =
  'boutique_app_runtime';

const RETENTION_ROLE =
  'boutique_audit_retention';

describe('Audit append-only role boundary', () => {
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE audit_events RESTART IDENTITY',
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('grants only the required audit privileges to application and retention roles', async () => {
    const result = await pool.query(
      `
        SELECT
          has_table_privilege(
            $1,
            'audit_events',
            'SELECT'
          ) AS runtime_can_select,
          has_table_privilege(
            $1,
            'audit_events',
            'INSERT'
          ) AS runtime_can_insert,
          has_table_privilege(
            $1,
            'audit_events',
            'UPDATE'
          ) AS runtime_can_update,
          has_table_privilege(
            $1,
            'audit_events',
            'DELETE'
          ) AS runtime_can_delete,
          has_table_privilege(
            $2,
            'audit_events',
            'INSERT'
          ) AS retention_can_insert,
          has_table_privilege(
            $2,
            'audit_events',
            'UPDATE'
          ) AS retention_can_update,
          has_table_privilege(
            $2,
            'audit_events',
            'DELETE'
          ) AS retention_can_delete,
          has_column_privilege(
            $2,
            'audit_events',
            'occurred_at',
            'SELECT'
          ) AS retention_can_read_cutoff_column
      `,
      [
        RUNTIME_ROLE,
        RETENTION_ROLE,
      ],
    );

    expect(result.rows).toEqual([
      {
        runtime_can_select: true,
        runtime_can_insert: true,
        runtime_can_update: false,
        runtime_can_delete: false,
        retention_can_insert: true,
        retention_can_update: false,
        retention_can_delete: true,
        retention_can_read_cutoff_column:
          true,
      },
    ]);
  });

  it('allows runtime inserts and reads but rejects updates and deletes', async () => {
    const client = await pool.connect();

    try {
      await client.query(
        `SET ROLE ${RUNTIME_ROLE}`,
      );

      await client.query(`
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
          context
        )
        VALUES (
          1,
          'PRODUCT',
          'ORDER_CREATED',
          'SUCCESS',
          'INFO',
          'USER',
          1,
          'admin',
          'ADMIN',
          'ORDER',
          '42',
          '{}'::jsonb
        )
      `);

      const readResult =
        await client.query(`
          SELECT
            action,
            target_resource_id
          FROM audit_events
        `);

      expect(readResult.rows).toEqual([
        {
          action: 'ORDER_CREATED',
          target_resource_id: '42',
        },
      ]);

      await expect(
        client.query(`
          UPDATE audit_events
          SET severity = 'WARN'
          WHERE id = 1
        `),
      ).rejects.toMatchObject({
        code: '42501',
      });

      await expect(
        client.query(`
          DELETE FROM audit_events
          WHERE id = 1
        `),
      ).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }

    const persistedResult =
      await pool.query(`
        SELECT
          action,
          outcome,
          severity
        FROM audit_events
      `);

    expect(persistedResult.rows).toEqual([
      {
        action: 'ORDER_CREATED',
        outcome: 'SUCCESS',
        severity: 'INFO',
      },
    ]);
  });
});