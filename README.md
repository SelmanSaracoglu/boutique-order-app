# Boutique Order App

Boutique Order App is a small full-stack application for capturing and managing boutique orders received through Instagram or WhatsApp.

The application currently supports:

- customer and order source capture,
- multiple order items,
- input validation,
- operational notes,
- PostgreSQL-backed order persistence,
- order listing,
- full order detail retrieval,
- calculated order totals,
- server-validated order lifecycle status updates,
- automated API integration testing against a real PostgreSQL test database.

## Technology

### Web

- React
- TypeScript
- Vite
- Vitest
- Cypress Component Testing

### API

- Node.js
- TypeScript
- Express
- Zod
- PostgreSQL
- `pg`
- Supertest
- Vitest

### Engineering

- npm workspaces
- Docker Compose
- ESLint
- versioned SQL migrations

## Repository Structure

```text
boutique-order-app/
├── apps/
│   ├── api/
│   │   ├── db/
│   │   │   └── migrations/
│   │   ├── src/
│   │   ├── test/
│   │   ├── .env.example
│   │   └── package.json
│   └── web/
│       ├── src/
│       ├── cypress/
│       └── package.json
├── compose.yaml
├── package.json
└── package-lock.json
```

## Prerequisites

Install the following tools before starting:

- Node.js
- npm
- Docker with Docker Compose

## Setup

Install dependencies from the repository root:

```bash
npm install
```

Create the local API environment file:

```bash
cp apps/api/.env.example apps/api/.env
```

Update the local values in `apps/api/.env` if necessary.

The environment file must provide:

```text
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
PORT
DATABASE_URL
TEST_DATABASE_URL
```

## PostgreSQL

Start PostgreSQL:

```bash
npm run db:up
```

The development database is created by the PostgreSQL container configuration.

Create the integration test database once:

```bash
docker compose exec postgres \
  createdb -U boutique_app boutique_orders_test
```

Apply development database migrations:

```bash
npm run db:migrate
```

Apply test database migrations:

```bash
npm run db:migrate:test
```

Migration files are stored in:

```text
apps/api/db/migrations
```

Applied migrations are tracked in the `schema_migrations` table.

Stop the PostgreSQL container:

```bash
npm run db:down
```

The Docker volume is preserved by this command.

## Development

Start the web application:

```bash
npm run dev:web
```

Start the API:

```bash
npm run dev:api
```

The default API port is:

```text
3001
```

## API

The current API exposes:

```text
POST /api/orders
GET  /api/orders
GET  /api/orders/:orderId
PATCH /api/orders/:orderId/status
```

### Create Order

```text
POST /api/orders
```

Creates an order and its items in a single PostgreSQL transaction.

The server controls:

- order ID,
- creation timestamp,
- initial order status.

New orders always begin with:

```text
NEW
```

### List Orders

```text
GET /api/orders
```

Returns order summaries sorted by creation time in descending order.

Order totals are calculated from persisted item quantity and unit price values rather than stored as redundant data.

### Get Order Detail

```text
GET /api/orders/:orderId
```

Returns the full persisted order and its items.

A valid but unknown order ID returns `404`.

A malformed order ID returns `400`.

## Testing

Run the repository test suites:

```bash
npm test
```

API integration tests use:

- Supertest,
- Vitest,
- a real PostgreSQL test database.

The integration suite verifies persistence behaviour including:

- valid order creation,
- generated IDs and timestamps,
- default `NEW` status,
- multiple order items,
- optional fields,
- invalid request rejection,
- absence of persistence after rejected input,
- order summary listing,
- calculated totals,
- newest-first ordering,
- full order retrieval,
- missing-order handling,
- malformed IDs,
- server-owned fields,
- transaction atomicity,
- lifecycle transition enforcement,
- persisted status consistency,
- idempotent repeated status requests,
- concurrent status mutation serialization,
- status update rollback behaviour.

Run Cypress component tests:

```bash
npm run test:component
```

### Update Order Status

```text
PATCH /api/orders/:orderId/status
```

Updates an order's persisted lifecycle status using a strict request body:

```json
{
  "status": "IN_PROGRESS"
}
```

The server permits these transitions:

```text
NEW -> IN_PROGRESS
NEW -> CANCELLED
IN_PROGRESS -> COMPLETED
IN_PROGRESS -> CANCELLED
```

`COMPLETED` and `CANCELLED` are terminal statuses. Repeating the current status is treated as an idempotent success.

The endpoint returns:

- `400` for an invalid order ID or request body,
- `404` when the order does not exist,
- `409` when the requested transition conflicts with the persisted status,
- controlled `500` JSON when persistence fails unexpectedly.

Status decisions and updates run in a PostgreSQL transaction with row-level locking so concurrent requests are evaluated against the latest persisted status.

## Verification

Run the full repository verification commands from the repository root:

```bash
npm run typecheck
npm test
npm run test:component
npm run lint
npm run build
```

## Preview

Preview the production web build locally:

```bash
npm run preview
```
