# Custom File Upload Pro — Shopify App

A production-ready Shopify app for collecting customer files during product purchases. Comparable to Uploadery. Built for Shopify compliant.

## Architecture

```
Shopify Storefront (product page)
        │  upload widget (Liquid theme extension)
        ▼
     Caddy (HTTPS, static files, reverse proxy)
        │
        ▼
  NestJS Backend :3000
  ┌──────────┬──────────┬──────────┬───────────┐
  │  Auth    │ Uploads  │  Orders  │  Billing  │
  │ Webhooks │ Security │Dashboard │ Analytics │
  └────┬─────┴────┬─────┴──────────┴───────────┘
       │           │
  MySQL :3306   MinIO :9000
  (database)  (file storage)

ClamAV :3310  (virus scanning, localhost only)
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20, NestJS 10, TypeScript 5 |
| Frontend | React 18, Shopify Polaris 12, App Bridge 3 |
| Database | MySQL 8.0 |
| File storage | MinIO (self-hosted, S3-compatible) |
| Web server | Caddy (automatic HTTPS) |
| Process manager | PM2 |
| Virus scanning | ClamAV |
| Auth | Shopify OAuth 2.0 |
| CI/CD | GitHub Actions → SSH deploy |

## Quick start (local development)

```bash
# 1. Install dependencies
cd backend  && npm install
cd ../frontend && npm install

# 2. Start local services
brew services start mysql          # or: sudo systemctl start mysql
minio server ~/minio-data          # file storage
clamd                              # virus scanner (optional in dev)

# 3. Set up database
mysql -u root -p < database/init.sql
cd backend && npm run migration:run

# 4. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your Shopify API keys and ngrok URL

# 5. Start the app
cd backend  && npm run start:dev   # backend on :3000
cd frontend && npm run dev          # frontend on :5173

# 6. Expose for Shopify OAuth
npx ngrok http 3000
# Update APP_URL in backend/.env with the ngrok URL
```

## Production deploy (VPS, one command)

```bash
# On your Ubuntu 22.04 VPS:
cd /opt/cfup
sudo bash deploy/deploy.sh
```

Installs Node.js, PM2, MySQL, Caddy, ClamAV, MinIO. Configures HTTPS automatically. See `DEPLOY.md` for details.

## Running tests

```bash
cd backend  && npm test             # Jest unit tests
cd frontend && npm test             # Vitest component tests

cd backend  && npm run test:coverage
cd frontend && npm run test:coverage
```

## Project structure

```
filedrop/
├── backend/               NestJS API
│   ├── src/
│   │   ├── auth/          Shopify OAuth
│   │   ├── uploads/       Upload fields + file handling
│   │   ├── orders/        Order integration
│   │   ├── billing/       Shopify Billing API
│   │   ├── webhooks/      Shopify webhooks
│   │   ├── analytics/     Time-series analytics
│   │   ├── notifications/ In-app notifications
│   │   ├── products/      Shopify product sync
│   │   ├── security/      Virus scan, MIME validation
│   │   ├── storage/       MinIO file storage
│   │   └── settings/      Merchant settings
│   └── test/              Jest test files
├── frontend/              React + Polaris dashboard
│   └── src/
│       ├── pages/         Dashboard, Fields, Orders, Billing, Settings
│       ├── components/    Reusable UI components
│       ├── hooks/         React Query data hooks
│       └── store/         Zustand global state
├── theme-extension/       Shopify theme app extension
│   └── blocks/            upload-widget.liquid
├── admin-extension/       Shopify admin UI extension
│   └── src/               OrderUploads.tsx (order page panel)
├── database/              MySQL migrations + init.sql
├── deploy/                deploy.sh + Caddyfile
├── docs/                  API, Architecture, ER Diagram, etc.
├── COMMANDS.txt           All commands in one place
└── DEPLOY.md              Production deploy walkthrough
```

## Docs

- `COMMANDS.txt` — all commands for development, testing, and deployment
- `DEPLOY.md` — step-by-step production deploy guide
- `docs/API.md` — REST API reference
- `docs/ARCHITECTURE_DIAGRAMS.md` — system + sequence diagrams
- `docs/ER_DIAGRAM.md` — database entity relationship diagram
- `docs/APP_STORE_SCREENSHOTS.md` — screenshot specs for App Store submission
