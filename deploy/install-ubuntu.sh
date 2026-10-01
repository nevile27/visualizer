#!/usr/bin/env bash
# Première installation de Hallplan sur Ubuntu.
# Pour une installation déjà en place, utilisez deploy/update.sh.
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
apt-get install -y ca-certificates curl gnupg
if ! systemctl is-active --quiet apache2; then
  apt-get install -y nginx
fi

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

if [[ -n "${SUDO_USER:-}" ]] && sudo -u "$SUDO_USER" test -w "$ROOT"; then
  sudo -u "$SUDO_USER" -H bash -lc "cd '$ROOT' && npm ci && npm run build"
else
  (cd "$ROOT" && npm ci && npm run build)
fi

install -d -m 755 "$WEB_ROOT"
find "$WEB_ROOT" -mindepth 1 -delete
cp -a "$ROOT/dist/." "$WEB_ROOT/"
find "$WEB_ROOT" -type d -exec chmod 755 {} +
find "$WEB_ROOT" -type f -exec chmod 644 {} +

if ! id hallplan >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin hallplan
fi
install -d -o hallplan -g hallplan -m 750 /var/lib/hallplan
NODE_BIN="$(command -v node)"
sed -e "s|__NODE__|${NODE_BIN}|" -e "s|__ROOT__|${ROOT}|" "$ROOT/deploy/hallplan-api.service" > /etc/systemd/system/hallplan-api.service
systemctl daemon-reload
systemctl enable hallplan-api
systemctl restart hallplan-api

if systemctl is-active --quiet apache2; then
  if systemctl is-active --quiet nginx; then
    systemctl disable --now nginx
  fi
  a2enmod proxy proxy_http rewrite
  grep -qE '^Listen 8080$' /etc/apache2/ports.conf || echo 'Listen 8080' >> /etc/apache2/ports.conf
  cp "$ROOT/deploy/apache.conf" /etc/apache2/sites-available/hallplan.conf
  a2ensite hallplan
  apache2ctl configtest
  systemctl restart apache2
  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    ufw allow 8080/tcp
  fi
  echo "Apache occupe déjà le port 80. Hallplan est sur le port 8080."
  echo "Ouvrez http://$(hostname -I | awk '{print $1}'):8080/"
else
  SERVER_NAME="$DOMAIN"
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
fi
