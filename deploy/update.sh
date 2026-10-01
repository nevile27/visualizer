#!/usr/bin/env bash
# Met à jour une installation Hallplan déjà en place.
#   cd /var/www/visualizer && sudo bash deploy/update.sh
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Lancez cette mise à jour avec sudo." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ROOT=/var/www/hallplan

git -C "$ROOT" -c safe.directory="$ROOT" pull --ff-only origin main
if [[ -z "${HALLPLAN_REEXEC:-}" ]]; then
  export HALLPLAN_REEXEC=1
  exec bash "$ROOT/deploy/update.sh"
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

if systemctl is-active --quiet apache2 && [[ -f /etc/apache2/sites-available/hallplan.conf ]]; then
  restart_apache=0
  if ! apache2ctl -M 2>/dev/null | grep -q "proxy_module"; then
    a2enmod proxy
    restart_apache=1
  fi
  if ! apache2ctl -M 2>/dev/null | grep -q "proxy_http_module"; then
    a2enmod proxy_http
    restart_apache=1
  fi
  if ! apache2ctl -M 2>/dev/null | grep -q "rewrite_module"; then
    a2enmod rewrite
    restart_apache=1
  fi
  cp "$ROOT/deploy/apache.conf" /etc/apache2/sites-available/hallplan.conf
  apache2ctl configtest
  if [[ "$restart_apache" -eq 1 ]]; then
    systemctl restart apache2
  else
    systemctl reload apache2
  fi
elif [[ -f /etc/nginx/sites-available/hallplan ]]; then
  SERVER_NAME="$(awk '/server_name/ { print $2; exit }' /etc/nginx/sites-available/hallplan | tr -d ';')"
  sed "s/__SERVER_NAME__/${SERVER_NAME:-_}/" "$ROOT/deploy/nginx.conf" > /etc/nginx/sites-available/hallplan
  nginx -t
  systemctl reload nginx
fi

echo "Mise à jour terminée. Rechargez la page avec Ctrl+F5."
