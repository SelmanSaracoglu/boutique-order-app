import 'dotenv/config'

process.env.SESSION_SECRET =
  'test-only-session-secret-that-is-at-least-32-bytes'

const testDatabaseUrl = process.env.TEST_DATABASE_URL

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for integration tests')
}

process.env.DATABASE_URL = testDatabaseUrl