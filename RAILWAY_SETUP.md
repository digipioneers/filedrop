# Railway Deployment — Step by Step

## What you need
- GitHub account (github.com)
- Railway account (railway.app — sign up with GitHub)  
- Shopify API Key + Secret (from partners.shopify.com → your app)

---

## Step 1 — Push project to GitHub

Open Command Prompt on Windows:

```
cd filedrop
git init
git add .
git commit -m "Initial commit"
```

Go to **github.com** → **+** → **New repository** → name it `filedrop` → **Create**

```
git remote add origin https://github.com/YOUR-USERNAME/filedrop.git
git push -u origin main
```

---

## Step 2 — Create Railway project

1. Go to **railway.app** → **New Project** → **Deploy from GitHub repo**
2. Select your `filedrop` repository
3. Railway creates one service — **do not deploy yet**

---

## Step 3 — Set Root Directory (MOST IMPORTANT STEP)

Click the **filedrop** service → **Settings** tab:

| Setting | Value |
|---------|-------|
| **Root Directory** | `backend` |
| **Build Command** | `npm install --ignore-scripts && npm rebuild sharp --update-binary \|\| true && npx nest build` |
| **Start Command** | `node dist/main` |

**Save each one.**

---

## Step 4 — Add MySQL database

1. In Railway project → **+ New** → **Database** → **MySQL**
2. Wait for MySQL to start (green dot)

---

## Step 5 — Add environment variables

Click **filedrop service** → **Variables** tab → add these:

### Copy MySQL URL from Railway (easiest method)

Click **+ New Variable** and set:

```
MYSQL_URL = ${{MySQL.MYSQL_URL}}
```

> Railway will auto-fill the full connection string from your MySQL service.
> This is the easiest way — one variable instead of five.

### App settings

```
NODE_ENV          = production
PORT              = 3000
SHOPIFY_API_KEY   = paste_from_partners_dashboard
SHOPIFY_API_SECRET = paste_from_partners_dashboard
SHOPIFY_SCOPES    = read_products,read_orders,write_orders,read_customers,write_metafields,read_metafields
JWT_SECRET        = paste_any_long_random_string_here
STORAGE_PROVIDER  = minio
```

### Get your backend URL first (for APP_URL)

After first deploy, click **Settings** → **Networking** → **Generate Domain**
Copy it, then add:

```
APP_URL      = https://YOUR-DOMAIN.up.railway.app
FRONTEND_URL = https://YOUR-DOMAIN.up.railway.app
```

---

## Step 6 — Add MinIO (file storage)

1. Railway project → **+ New** → **Template** → search **MinIO Single Service**
2. Set variables on the MinIO service:
   ```
   MINIO_ROOT_USER     = cfup_minio
   MINIO_ROOT_PASSWORD = pick_a_strong_password
   ```
3. MinIO service → **Settings** → **Networking** → **Generate Domain** → copy URL
4. Add to **filedrop service** variables:
   ```
   MINIO_ENDPOINT      = https://minio-xxxx.up.railway.app
   MINIO_ROOT_USER     = cfup_minio
   MINIO_ROOT_PASSWORD = pick_a_strong_password
   MINIO_BUCKET        = cfup-uploads
   ```

**Or use Cloudflare R2 instead (free 10 GB, no extra Railway service needed):**
```
STORAGE_PROVIDER     = r2
R2_ACCOUNT_ID        = your_cloudflare_account_id
R2_ACCESS_KEY_ID     = your_r2_key
R2_SECRET_ACCESS_KEY = your_r2_secret
R2_BUCKET            = cfup-uploads
```

---

## Step 7 — Deploy

Click the **filedrop** service → **Deploy**

Watch **Build Logs**. You should see:
```
Successfully compiled: XX files with swc
```

Then watch **Deploy Logs**. You should see:
```
🚀 Filedrop API listening on port 3000
```

---

## Complete variable list (copy all at once)

```
NODE_ENV=production
PORT=3000
MYSQL_URL=${{MySQL.MYSQL_URL}}
SHOPIFY_API_KEY=your_key_here
SHOPIFY_API_SECRET=your_secret_here
SHOPIFY_SCOPES=read_products,read_orders,write_orders,read_customers,write_metafields,read_metafields
JWT_SECRET=any_random_64_character_string_paste_here
APP_URL=https://your-app.up.railway.app
FRONTEND_URL=https://your-app.up.railway.app
STORAGE_PROVIDER=minio
MINIO_ENDPOINT=https://your-minio.up.railway.app
MINIO_ROOT_USER=cfup_minio
MINIO_ROOT_PASSWORD=your_minio_password
MINIO_BUCKET=cfup-uploads
```

---

## Troubleshooting

### "service unavailable" on health check
→ Click **Deploy Logs** (not Build Logs) — look for red error lines  
→ Most common: `MYSQL_URL` not set. Add `MYSQL_URL = ${{MySQL.MYSQL_URL}}`

### "nest: not found"  
→ Root Directory is not set to `backend`. Fix in Settings tab.

### App crashes immediately
→ Deploy Logs → find the error → it's almost always a missing env variable

### How to check Deploy Logs
1. Click your service
2. Click the **Deploy Logs** tab (next to Build Logs)
3. Look for lines in red — that's the crash reason
