#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# deploy.sh — One-command deploy to Ubuntu 22.04 / 24.04 VPS
# No AWS. No Docker. Uses Node.js + PM2 + Caddy + MySQL + MinIO.
#
# Usage: sudo bash deploy/deploy.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[CFUP]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   Custom File Upload Pro — VPS Deploy                ║"
echo "║   Node.js + PM2 + Caddy + MySQL + MinIO              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

[[ "$OSTYPE" != "linux-gnu"* ]] && err "Linux (Ubuntu 22.04/24.04) required"
[[ $EUID -ne 0 ]] && err "Run as root: sudo bash deploy/deploy.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"
log "Project directory: $PROJECT_DIR"

# ── System packages ────────────────────────────────────────────
log "Installing system packages..."
apt-get update -qq
apt-get install -y -qq curl git build-essential ufw unzip lsb-release gnupg2

# ── Node.js 20 ─────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
  log "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
log "Node.js $(node -v) ready"

# ── PM2 ────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  log "Installing PM2..."
  npm install -g pm2
fi
log "PM2 $(pm2 -v) ready"

# ── MySQL 8 ────────────────────────────────────────────────────
if ! command -v mysql &>/dev/null; then
  log "Installing MySQL 8..."
  apt-get install -y mysql-server
  systemctl enable --now mysql
fi
log "MySQL ready"

# ── Caddy (web server + automatic HTTPS) ───────────────────────
if ! command -v caddy &>/dev/null; then
  log "Installing Caddy..."
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y caddy
fi
log "Caddy ready"

# ── ClamAV ─────────────────────────────────────────────────────
if ! command -v clamd &>/dev/null; then
  log "Installing ClamAV (virus scanner)..."
  apt-get install -y clamav clamav-daemon
  systemctl enable clamav-freshclam
  freshclam &
fi
log "ClamAV ready"

# ── MinIO (S3-compatible file storage) ─────────────────────────
if ! command -v minio &>/dev/null; then
  log "Installing MinIO..."
  curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o /usr/local/bin/minio
  chmod +x /usr/local/bin/minio
  mkdir -p /var/lib/minio/data
  useradd -r -s /sbin/nologin minio-user 2>/dev/null || true
  chown -R minio-user: /var/lib/minio
fi
log "MinIO ready"

# ── Check/create .env.prod ─────────────────────────────────────
if [[ ! -f ".env.prod" ]]; then
  if [[ -f ".env.prod.example" ]]; then
    warn ".env.prod not found."
    echo ""
    echo "  Option A (Interactive): node scripts/setup.js"
    echo "  Option B (Manual):      cp .env.prod.example .env.prod && nano .env.prod"
    echo ""
    read -rp "Run interactive setup now? (y/n): " DO_SETUP
    if [[ "$DO_SETUP" == "y" ]]; then
      node scripts/setup.js
    else
      cp .env.prod.example .env.prod
      echo ""; warn "Edit .env.prod now, then re-run this script."; exit 0
    fi
  else
    err ".env.prod not found. Create it from .env.prod.example"
  fi
fi

# ── Load and validate env ──────────────────────────────────────
set -a; source .env.prod; set +a

MISSING=()
for v in APP_DOMAIN SHOPIFY_API_KEY SHOPIFY_API_SECRET DB_PASSWORD JWT_SECRET; do
  if [[ -z "${!v:-}" ]] || [[ "${!v}" =~ CHANGE_THIS|your_|YOUR_ ]]; then
    MISSING+=("$v")
  fi
done
[[ ${#MISSING[@]} -gt 0 ]] && err "Fix these in .env.prod: ${MISSING[*]}"
log "Config validated"

# ── MySQL database setup ───────────────────────────────────────
log "Setting up database..."
mysql -u root <<SQL
CREATE DATABASE IF NOT EXISTS cfup_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'cfup_user'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON cfup_db.* TO 'cfup_user'@'localhost';
FLUSH PRIVILEGES;
SQL
log "Database ready"

# ── MinIO systemd service ──────────────────────────────────────
cat > /etc/systemd/system/minio.service << UNIT
[Unit]
Description=MinIO object storage
After=network.target

[Service]
User=minio-user
Group=minio-user
WorkingDirectory=/var/lib/minio
Environment="MINIO_ROOT_USER=${MINIO_ROOT_USER:-cfup_minio}"
Environment="MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD:-cfup_secret}"
ExecStart=/usr/local/bin/minio server /var/lib/minio/data --console-address :9001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now minio
log "MinIO service running"

# ── Install app dependencies ───────────────────────────────────
log "Installing backend dependencies..."
npm ci --prefix backend

log "Building backend..."
npm run build --prefix backend

log "Installing frontend dependencies..."
npm ci --prefix frontend

log "Building frontend..."
VITE_API_URL="https://${APP_DOMAIN}/api/v1" npm run build --prefix frontend

# ── Run database migrations ────────────────────────────────────
log "Running database migrations..."
cd backend && NODE_ENV=production npm run migration:run && cd ..

# ── Caddy config ───────────────────────────────────────────────
log "Configuring Caddy (automatic HTTPS)..."
cat > /etc/caddy/Caddyfile << CADDY
${APP_DOMAIN} {
    handle /api/* {
        reverse_proxy localhost:3000
    }
    handle /auth/* {
        reverse_proxy localhost:3000
    }
    handle /webhooks/* {
        reverse_proxy localhost:3000
    }
    handle /health* {
        reverse_proxy localhost:3000
    }
    handle {
        root * ${PROJECT_DIR}/frontend/dist
        try_files {path} /index.html
        file_server
    }
    encode gzip
    header {
        X-Frame-Options SAMEORIGIN
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }
}
CADDY
systemctl restart caddy
log "Caddy configured (will auto-obtain SSL certificate)"

# ── PM2 ecosystem file ─────────────────────────────────────────
cat > ecosystem.config.js << ECOSYSTEM
module.exports = {
  apps: [{
    name: 'cfup-backend',
    script: 'backend/dist/main.js',
    cwd: '${PROJECT_DIR}',
    env_file: '.env.prod',
    instances: 2,
    exec_mode: 'cluster',
    max_memory_restart: '512M',
    error_file: '/var/log/cfup/error.log',
    out_file: '/var/log/cfup/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    restart_delay: 3000,
    autorestart: true,
  }],
};
ECOSYSTEM

mkdir -p /var/log/cfup

# ── Start app with PM2 ─────────────────────────────────────────
log "Starting app with PM2..."
pm2 startOrRestart ecosystem.config.js --env production
pm2 save
pm2 startup systemd -u root --hp /root | bash || true
log "PM2 auto-start on reboot configured"

# ── Firewall ───────────────────────────────────────────────────
ufw allow 22/tcp >/dev/null 2>&1 || true
ufw allow 80/tcp >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true
log "Firewall configured"

# ── Health check ───────────────────────────────────────────────
sleep 8
CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3000/api/v1/health" --max-time 10 2>/dev/null || echo "000")
if [[ "$CODE" == "200" ]]; then
  log "Backend health check passed"
else
  warn "Backend health check returned HTTP $CODE — check logs: pm2 logs cfup-backend"
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   Deployed!                                          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  App:        https://${APP_DOMAIN}"
echo "  Health:     https://${APP_DOMAIN}/api/v1/health"
echo "  MinIO UI:   http://YOUR-SERVER-IP:9001  (file browser)"
echo ""
echo "  Update Shopify Partner Dashboard:"
echo "    App URL:      https://${APP_DOMAIN}"
echo "    Redirect URL: https://${APP_DOMAIN}/auth/callback"
echo ""
echo "  Useful commands:"
echo "    pm2 logs cfup-backend          — live logs"
echo "    pm2 restart cfup-backend       — restart app"
echo "    pm2 monit                      — CPU/memory monitor"
echo "    caddy reload --config /etc/caddy/Caddyfile"
echo "    mysql -u cfup_user -p cfup_db  — database shell"
echo ""
