# Boutique Order App

Boutique Order App is a full-stack application for capturing and managing boutique orders received through Instagram or WhatsApp.

The application currently supports:

- customer and order source capture,
- multiple order items,
- input validation,
- operational notes,
- PostgreSQL-backed order persistence,
- order listing and filtering,
- full order detail retrieval,
- calculated order totals,
- server-validated order lifecycle updates,
- cancellation confirmation,
- synchronized order status and Dashboard counts,
- local username and password authentication,
- trusted CLI-based user provisioning,
- Argon2id password hashing,
- PostgreSQL-backed server sessions,
- HttpOnly session cookies,
- login rate limiting,
- session fixation protection,
- CSRF protection for authenticated mutations,
- session restoration when the application starts,
- disabled-user and session-version invalidation,
- secure server-side logout,
- server-authoritative role-based access control,
- role-aware frontend actions and protected routes,
- customer payment reporting and reservation,
- payment confirmation with preserved payment methods,
- payment-confirmed processing gate for new orders,
- automated API integration testing against PostgreSQL,
- authenticated full-stack browser testing.

## Technology

### Web

- React
- TypeScript
- React Router
- Vite
- Vitest
- Cypress Component Testing
- Cypress End-to-End Testing

### API

- Node.js
- TypeScript
- Express
- Zod
- PostgreSQL
- `pg`
- Argon2id
- PostgreSQL-backed Express sessions
- Supertest
- Vitest

### Engineering

- npm workspaces
- Docker Compose
- ESLint
- versioned SQL migrations
- Chrome-based headless browser testing

## Repository Structure

```text
boutique-order-app/
├── apps/
│   ├── api/
│   │   ├── db/
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   └── scripts/
│   │   ├── test/
│   │   ├── .env.example
│   │   └── package.json
│   └── web/
│       ├── cypress/
│       │   ├── component/
│       │   ├── e2e/
│       │   └── support/
│       ├── src/
│       │   └── features/
│       │       ├── auth/
│       │       ├── order-entry/
│       │       └── orders/
│       ├── cypress.env.example.json
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
- Google Chrome for Cypress component and end-to-end tests

## Setup

Install dependencies from the repository root:

```bash
npm install
```

Create the local API environment file:

```bash
cp apps/api/.env.example apps/api/.env
```

On Windows PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
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
SESSION_SECRET
```

`SESSION_SECRET` must contain a strong local secret and must not be committed.

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

Stop PostgreSQL:

```bash
npm run db:down
```

The Docker volume is preserved by this command.

## User Provisioning

Application users are created through a trusted local CLI. The application does not provide public registration or browser-based user administration.

Apply the development database migrations before provisioning a user:

```bash
npm run db:migrate
```

Provision a named user by providing a username and one supported role:

```bash
npm run user:provision -- --username example.user --role ORDER_OPERATOR
```

Supported roles are:

```text
ADMIN
ORDER_OPERATOR
PAYMENT_OPERATOR
FULFILLMENT_OPERATOR
```

The CLI requests the password and confirmation through masked terminal prompts. Passwords are never accepted as command-line arguments and are stored only as salted Argon2id hashes.

The local provisioning policy accepts passwords between 12 and 128 characters. Passphrases and spaces are supported without additional composition requirements.

Usernames are normalized to lowercase before persistence. Leading and trailing whitespace is removed, and duplicate canonical usernames are rejected.

New users begin with:

```text
status: ACTIVE
session_version: 1
```

## Authentication and Sessions

The application uses local username and password authentication.

After successful login:

- the session identifier is regenerated,
- the authenticated session is stored in PostgreSQL,
- the browser receives an HttpOnly session cookie,
- the frontend receives the authenticated user and a CSRF token,
- the current role is resolved from PostgreSQL on authenticated requests.

The application restores the current session through:

```text
GET /api/auth/session
```

Sessions are rejected when:

- the session does not exist,
- the user has been disabled,
- the stored session version no longer matches the user,
- the referenced user no longer exists.

Logout destroys the server-side session and clears the browser cookie.

Order mutations require the CSRF token returned by login or session restoration.

## Role-Based Access Control

Order permissions are enforced server-side.

| Operation               | `ADMIN`   | `ORDER_OPERATOR` | `PAYMENT_OPERATOR` | `FULFILLMENT_OPERATOR` |
| ----------------------- | --------- | ---------------- | ------------------ | ---------------------- |
| List and view orders    | Allowed   | Allowed          | Allowed            | Allowed                |
| Create orders           | Allowed   | Allowed          | Forbidden          | Forbidden              |
| Update order status     | Allowed   | Allowed          | Forbidden          | Allowed                |
| Report customer payment | Forbidden | Allowed          | Allowed            | Forbidden              |
| Confirm payment         | Forbidden | Forbidden        | Allowed            | Forbidden              |

The frontend reflects this matrix by hiding unavailable actions and redirecting users away from protected routes.

Frontend visibility is not treated as a security boundary. The API remains authoritative and returns `403 Forbidden` when an authenticated user lacks the required permission.

## Development

Start the API:

```bash
npm run dev:api
```

Start the web application in a separate terminal:

```bash
npm run dev:web
```

The default API port is:

```text
3001
```

The Vite development server proxies `/api` requests to the API.

## API

The API exposes:

```text
POST  /api/auth/login
GET   /api/auth/session
POST  /api/auth/logout

POST  /api/orders
GET   /api/orders
GET   /api/orders/:orderId
PATCH /api/orders/:orderId/status

POST  /api/orders/:orderId/payment-report
POST  /api/orders/:orderId/payment-confirmation

```

All order endpoints require an authenticated session.

Requests without a valid session receive:

```text
401 Unauthorized
```

Authenticated users without the required permission receive:

```text
403 Forbidden
```

### Login

```text
POST /api/auth/login
```

Authenticates an active local user.

Successful authentication:

- regenerates the session identifier,
- stores the authenticated session in PostgreSQL,
- creates an HttpOnly session cookie,
- returns the current user and CSRF token.

Invalid credentials receive a generic `401 Unauthorized` response without revealing whether the username exists.

Repeated failed login attempts are rate limited and receive a controlled `429 Too Many Requests` response.

### Current Session

```text
GET /api/auth/session
```

Returns the current authenticated user, current PostgreSQL role, and CSRF token.

Anonymous or invalid sessions receive `401 Unauthorized`.

### Logout

```text
POST /api/auth/logout
```

Requires:

- an authenticated session,
- a valid CSRF token.

Successful logout:

- destroys the PostgreSQL-backed session,
- clears the browser session cookie,
- returns `204 No Content`.

### Create Order

```text
POST /api/orders
```

Requires the `ORDER_CREATE` permission and a valid CSRF token.

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

Requires the `ORDER_READ` permission.

Returns order summaries sorted by creation time in descending order.

Order totals are calculated from persisted item quantity and unit price values rather than stored as redundant data.

### Get Order Detail

```text
GET /api/orders/:orderId
```

Requires the `ORDER_READ` permission.

Returns the full persisted order and its items.

A valid but unknown order ID returns `404`.

A malformed order ID returns `400`.

### Update Order Status

```text
PATCH /api/orders/:orderId/status
```

Requires the `ORDER_STATUS_UPDATE` permission and a valid CSRF token.

The endpoint accepts a strict request body:

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
- `409`  when the requested transition conflicts with the persisted status or payment state,
- controlled `500` JSON when persistence fails unexpectedly.

Status decisions and updates run in a PostgreSQL transaction with row-level locking so concurrent requests are evaluated against the latest persisted status.

The `NEW -> IN_PROGRESS` transition additionally requires the persisted payment status to be `CONFIRMED`. Payment reporting alone does not unlock processing, and payment confirmation does not automatically change the order status.

Cancellation remains available for `NEW` orders regardless of payment status.

## Testing

### API and Unit Tests

Run the repository test suites:

```bash
npm test
```

API integration tests use:

- Supertest,
- Vitest,
- a real PostgreSQL test database.

The automated suites verify:

- order validation and persistence,
- transaction atomicity,
- order listing and detail retrieval,
- calculated totals,
- lifecycle transition enforcement,
- concurrent mutation serialization,
- username normalization,
- user provisioning,
- Argon2id password hashing,
- successful and rejected login,
- login rate limiting,
- PostgreSQL-backed sessions,
- session fixation protection,
- disabled-user invalidation,
- session-version invalidation,
- CSRF enforcement,
- anonymous `401 Unauthorized`,
- role-specific permissions,
- controlled `403 Forbidden`.

### Component Tests

Run Cypress component tests:

```bash
npm run test:component
```

The component suite runs headlessly in Google Chrome and verifies:

- session bootstrap,
- login success and controlled failures,
- logout success and controlled failures,
- role-aware action visibility,
- protected route redirection,
- CSRF headers on order mutations,
- order capture,
- Dashboard behaviour,
- Order Detail behaviour,
- order lifecycle actions,
- payment reporting and confirmation actions.

### Full-Stack E2E

Full-stack E2E tests use:

- Google Chrome,
- the real React application,
- the running Express API,
- PostgreSQL-backed users, orders, and sessions.


Provision the required development users:

```bash
npm run user:provision -- --username e2e.order.operator --role ORDER_OPERATOR
npm run user:provision -- --username e2e.payment.operator --role PAYMENT_OPERATOR
```

Create a local credential file by copying:

```text
apps/web/cypress.env.example.json
```

to:

```text
apps/web/cypress.env.json
```

On Windows PowerShell:

```powershell
Copy-Item apps/web/cypress.env.example.json apps/web/cypress.env.json
```

Replace the example password values with the passwords used during local provisioning.

`apps/web/cypress.env.json` is ignored by Git and must not be committed.

Start the API and web application in separate terminals:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Run the authenticated full-stack E2E suite:

```bash
npm run test:e2e
```

The E2E suite verifies:

- browser login,
- server-side session establishment,
- session restoration after reload,
- CSRF-protected order creation,
- order lifecycle completion,
- role-aware frontend actions,
- protected route redirection,
- controlled `403 Forbidden` API responses,
- logout,
- server-side session destruction.
- payment reporting and confirmation,
- payment-confirmed processing enforcement,

## Verification

Run the complete repository verification from the repository root:

```bash
npm run db:migrate
npm run db:migrate:test
npm run typecheck
npm test
npm run test:component
npm run test:e2e
npm run lint
npm run build
npm audit --omit=dev
```

Check formatting and whitespace errors:

```bash
git diff --check
```

## Preview

Preview the production web build locally:

```bash
npm run preview
```
