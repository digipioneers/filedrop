# Deploy Guide — No AWS, No Docker

From zip to live in ~1 hour. Everything runs directly on a Linux VPS.

---

## What you need

| Item | Where to get it | Cost |
|------|----------------|------|
| Ubuntu 22.04 VPS (2 vCPU / 4 GB RAM / 40 GB disk) | Hetzner, DigitalOcean, Vultr | $5–12/mo |
| Domain name | Namecheap, Cloudflare Registrar | ~$10/yr |
| Shopify Partners account | partners.shopify.com | Free |
| Email service | resend.com (3,000 emails/mo free) | Free |

The deploy script installs on the VPS: **Node.js 20, PM2, MySQL 8, Caddy (auto-HTTPS), ClamAV, MinIO**.

---

## Step 1 — Upload the project

```bash
# From your local machine:
scp -r filedrop/ ubuntu@YOUR-SERVER-IP:/opt/cfup
ssh ubuntu@YOUR-SERVER-IP
```

## Step 2 — Run the deploy script

```bash
cd /opt/cfup
sudo bash deploy/deploy.sh
```

The script will prompt you to fill in your credentials (Shopify keys, domain, etc.), then install and configure everything automatically.

## Step 3 — Update Shopify Partner Dashboard

After the script completes, go to **partners.shopify.com → Apps → your app → App setup** and update:

- **App URL**: `https://yourdomain.com`
- **Allowed redirect URLs**: `https://yourdomain.com/auth/callback`

## Step 4 — Register webhooks

```bash
node scripts/register-webhooks.js \
  --shop=YOUR-DEV-STORE.myshopify.com \
  --access-token=shpat_XXXX \
  --app-url=https://yourdomain.com/api/v1
```

---

## What the deploy script installs

```
Node.js 20          — runs the backend (NestJS)
PM2                 — process manager, keeps app alive, auto-restarts
MySQL 8             — database
Caddy               — web server, automatically obtains SSL certificate
ClamAV              — virus scanner for uploaded files
MinIO               — S3-compatible file storage, self-hosted
```

All services are configured to start automatically on server reboot.

---

## Day-to-day management

```bash
pm2 logs cfup-backend          # live logs
pm2 restart cfup-backend       # restart after code change
pm2 monit                      # CPU / memory dashboard
mysql -u cfup_user -p cfup_db  # database shell
```

MinIO file browser: `http://YOUR-SERVER-IP:9001`

---

## Updating the app (after git push)

```bash
ssh ubuntu@YOUR-SERVER-IP
cd /opt/cfup
git pull origin main
npm ci --prefix backend
npm run build --prefix backend
npm run migration:run --prefix backend
pm2 restart cfup-backend
```

Or let CI/CD handle it automatically — see `.github/workflows/deploy.yml`.
