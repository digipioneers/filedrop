# Filedrop — Quick Setup (Windows)

## Prerequisites
- Node.js 20+ installed
- Docker Desktop installed and running

## Step 1 — Start Docker services
```cmd
docker compose up -d
```
Wait 30 seconds for MySQL to initialize.

## Step 2 — Setup Backend
```cmd
cd backend
copy .env.example .env
npm install --legacy-peer-deps
npm install @swc/core @swc/cli --save-dev --legacy-peer-deps
npm run start:dev
```

Wait until you see:
```
🚀 Filedrop API running on http://localhost:3000
```

## Step 3 — Setup Frontend (new Command Prompt)
```cmd
cd frontend
npm install --legacy-peer-deps
npm run dev
```

Wait until you see:
```
VITE ready
Local: http://localhost:5173/
```

## Step 4 — Open browser
- Frontend: http://localhost:5173
- API Docs: http://localhost:3000/api
- Email inbox: http://localhost:8025
- File browser: http://localhost:9001 (login: cfup_minio / cfup_secret)

## Step 5 — Connect to Shopify
1. Install ngrok: https://ngrok.com
2. Run: ngrok http 3000
3. Copy ngrok URL (e.g. https://abc123.ngrok.io)
4. Update backend/.env: APP_URL=https://abc123.ngrok.io
5. Update Shopify Partner Dashboard:
   - App URL: https://abc123.ngrok.io
   - Redirect URL: https://abc123.ngrok.io/auth/callback
6. Restart backend: npm run start:dev

## Services running
| Service | Port | Purpose |
|---------|------|---------|
| Backend (NestJS) | 3000 | API server |
| Frontend (React) | 5173 | Admin dashboard |
| MySQL | 3306 | Database |
| MinIO | 9000/9001 | File storage |
| Redis | 6379 | Rate limiting |
| ClamAV | 3310 | Virus scanning |
| Mailhog | 8025 | Email testing |
