import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'

const useTestDatabase = process.argv.includes('--test')

const connectionString = useTestDatabase
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    useTestDatabase
      ? 'TEST_DATABASE_URL is required'
      : 'DATABASE_URL is required',
  )
}

const migrationsDirectory = fileURLToPath(
  new URL('../../db/migrations/', import.meta.url),
)

const pool = new Pool({ connectionString })

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const appliedResult = await pool.query<{ name: string }>(
    'SELECT name FROM schema_migrations',
  )

  const appliedMigrations = new Set(
    appliedResult.rows.map((row) => row.name),
  )

  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort()

  for (const fileName of migrationFiles) {
    if (appliedMigrations.has(fileName)) {
      continue
    }

    const sql = await readFile(
      new URL(`../../db/migrations/${fileName}`, import.meta.url),
      'utf8',
    )

    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query(
        'INSERT INTO schema_migrations (name) VALUES ($1)',
        [fileName],
      )
      await client.query('COMMIT')

      console.log(`Applied migration: ${fileName}`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  console.log('Database migrations are up to date.')
} finally {
  await pool.end()
}