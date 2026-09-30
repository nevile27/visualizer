#!/usr/bin/env bash
# Installe Hallplan sur Ubuntu : build statique servi par Nginx.
# Usage, depuis le dépôt, sur le serveur :
#   sudo ./deploy/install-ubuntu.sh
#   sudo ./deploy/install-ubuntu.sh --domain hallplan.exemple.fr --email admin@exemple.fr
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Lancez ce script avec sudo." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ROOT=/var/www/hallplan
SITE=/etc/nginx/sites-available/hallplan
DOMAIN="_"
EMAIL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    *) echo "Option inconnue : $1" >&2; exit 1 ;;
  esac
done

if [[ "$DOMAIN" != "_" && -z "$EMAIL" ]]; then
  echo "Avec --domain, indiquez aussi --email pour le certificat HTTPS." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg nginx

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  node -e 'const [maj,min]=process.versions.node.split(".").map(Number); process.exit((maj>22||(maj===22&&min>=12)||(maj===20&&min>=19))?0:1)'
}

if ! node_ok; then
  mkdir -p /etc/apt/keyrings
  rm -f /etc/apt/keyrings/nodesource.gpg
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi

BUILD_USER="${SUDO_USER:-root}"
sudo -u "$BUILD_USER" -H bash -lc "cd '$ROOT' && npm ci && npm run build"

install -d -m 755 "$WEB_ROOT"
find "$WEB_ROOT" -mindepth 1 -delete
cp -a "$ROOT/dist/." "$WEB_ROOT/"
find "$WEB_ROOT" -type d -exec chmod 755 {} +
find "$WEB_ROOT" -type f -exec chmod 644 {} +

SERVER_NAME="$DOMAIN"
if [[ "$DOMAIN" == "_" ]]; then
  SERVER_NAME="_"
fi
sed "s/__SERVER_NAME__/${SERVER_NAME}/" "$ROOT/deploy/nginx.conf" > "$SITE"
if [[ "$DOMAIN" == "_" ]]; then
  sed -i 's/listen 80;/listen 80 default_server;/; s/listen \[::\]:80;/listen [::]:80 default_server;/' "$SITE"
fi
ln -sfn "$SITE" /etc/nginx/sites-enabled/hallplan
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 'Nginx Full'
fi

if [[ "$DOMAIN" != "_" ]]; then
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" --redirect
fi

echo "Hallplan est servi depuis ${WEB_ROOT}."
if [[ "$DOMAIN" == "_" ]]; then
  echo "Ouvrez http://$(hostname -I | awk '{print $1}')/"
else
  echo "Ouvrez https://${DOMAIN}/"
fi
