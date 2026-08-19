# Boutique Order App

Boutique Order App is a small web application for manually capturing boutique orders received through Instagram or WhatsApp.

The current product supports Core Order Capture, including customer/source information, multiple order items, validation, operational notes, and a submission summary.

## Technology

- React
- TypeScript
- Vite
- Vitest
- Cypress Component Testing
- ESLint
- npm workspaces

## Repository Structure

```text
boutique-order-app/
├── apps/
│   └── web/
│       ├── src/
│       ├── cypress/
│       └── package.json
├── package.json
└── package-lock.json
```

## Setup

Install dependencies from the repository root:

```bash
npm install
```

## Development

Start the web application from the repository root:

```bash
npm run dev
```

## Verification

Run the repository verification commands from the repository root:

```bash
npm run typecheck
npm test
npm run test:component
npm run lint
npm run build
```

## Preview

Preview the production build locally:

```bash
npm run preview
```
