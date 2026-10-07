#!/usr/bin/env bash
# One-time HTTPS/API connection, run as ubuntu on the already configured VPS.
set -Eeuo pipefail

render_coolify_nginx() {
  local hostname="$1" mode="$2" panel="${3:-127.0.0.1:8000}" realtime="${4:-127.0.0.1:6001}" terminal="${5:-127.0.0.1:6002}"
  cat <<EOF
# Managed by Matiane Coolify connection installer
map \$http_upgrade \$coolify_codex_connection {
    default upgrade;
    '' close;
}
server {
    listen 80;
    listen [::]:80;
    server_name $hostname;
    location ^~ /.well-known/acme-challenge/ {
        root /var/lib/coolify-codex-acme;
        try_files \$uri =404;
    }
EOF
  if [[ "$mode" == tls ]]; then
    cat <<EOF
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $hostname;
    ssl_certificate /etc/letsencrypt/live/$hostname/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$hostname/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:CoolifyCodexSSL:10m;
EOF
  fi
  cat <<EOF
    client_max_body_size 32m;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$coolify_codex_connection;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    location /app/ { proxy_pass http://$realtime; }
    location /terminal/ { proxy_pass http://$terminal; }
    location / { proxy_pass http://$panel; }
}
EOF
}

connect_coolify() {
  local hostname="${1:-coolify.57.129.177.67.sslip.io}" email="${2:-}"
  local config=/etc/nginx/sites-available/coolify-codex enabled=/etc/nginx/sites-enabled/coolify-codex
  local marker='# Managed by Matiane Coolify connection installer'
  local hook=/etc/letsencrypt/renewal-hooks/deploy/coolify-codex-nginx
  if [[ "$EUID" -eq 0 || "$(id -un)" != ubuntu || ! "$hostname" =~ ^[A-Za-z0-9.-]+$ ]]; then
    printf 'Run as ubuntu with sudo access and a valid hostname.\n' >&2
    return 1
  fi
  command -v nginx >/dev/null
  command -v docker >/dev/null
  curl --noproxy '*' --fail --silent --show-error --max-time 10 http://127.0.0.1:8000/api/health >/dev/null
  getent ahostsv4 "$hostname" | awk '$1 == "57.129.177.67" { found=1 } END { exit !found }'
  sudo -v
  if [[ -e "$config" ]] && ! sudo head -n 1 "$config" | grep -qx "$marker"; then
    printf 'An unrelated Nginx site uses this name; leaving it unchanged.\n' >&2
    return 1
  fi
  if [[ -e "$enabled" || -L "$enabled" ]] && [[ ! -L "$enabled" || "$(readlink "$enabled")" != "$config" ]]; then
    printf 'An unrelated enabled site uses this name; leaving it unchanged.\n' >&2
    return 1
  fi
  if [[ -e "$hook" ]] && ! sudo head -n 2 "$hook" | grep -qx "$marker"; then
    printf 'An unrelated renewal hook uses this name; leaving it unchanged.\n' >&2
    return 1
  fi

  sudo apt-get update
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y certbot
  local work_dir original=0 was_enabled=0 changed=0
  work_dir="$(mktemp -d /tmp/coolify-codex-connect.XXXXXX)"
  [[ ! -f "$config" ]] || { sudo cp -a "$config" "$work_dir/original"; original=1; }
  [[ ! -L "$enabled" ]] || was_enabled=1
  # Roll back this installer's Nginx changes if certificate/setup checks fail.
  trap 'code=$?; if [[ "$changed" == 1 && "$code" != 0 ]]; then if [[ "$original" == 1 ]]; then sudo cp -a "$work_dir/original" "$config"; else sudo rm -f "$config"; fi; if [[ "$was_enabled" == 0 ]]; then sudo rm -f "$enabled"; fi; sudo nginx -t && sudo systemctl reload nginx; fi; rm -rf "$work_dir"; exit "$code"' EXIT

  sudo install -d -m 755 /var/lib/coolify-codex-acme /var/lib/coolify-codex-acme/.well-known /var/lib/coolify-codex-acme/.well-known/acme-challenge
  local certificate="/etc/letsencrypt/live/$hostname/fullchain.pem"
  if sudo test -f "$certificate"; then
    render_coolify_nginx "$hostname" tls > "$work_dir/site"
  else
    render_coolify_nginx "$hostname" http > "$work_dir/site"
  fi
  sudo install -m 644 "$work_dir/site" "$config"
  changed=1
  sudo ln -sfn "$config" "$enabled"
  sudo nginx -t
  sudo systemctl reload nginx
  if command -v ufw >/dev/null && sudo ufw status | grep -q '^Status: active'; then
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
  fi
  local -a contact
  if [[ -n "$email" ]]; then contact=(--email "$email"); else contact=(--register-unsafely-without-email); fi
  # "without-email" affects ACME contact information, never TLS verification.
  sudo certbot certonly --webroot -w /var/lib/coolify-codex-acme \
    --non-interactive --agree-tos "${contact[@]}" --cert-name "$hostname" -d "$hostname" --keep-until-expiring
  render_coolify_nginx "$hostname" tls > "$work_dir/site"
  sudo install -m 644 "$work_dir/site" "$config"
  sudo nginx -t
  sudo systemctl reload nginx

  # Verify the certificate chain, hostname, and backend response locally.
  curl --noproxy '*' --fail --silent --show-error --max-time 15 \
    --resolve "$hostname:443:127.0.0.1" "https://$hostname/api/health" >/dev/null
  cat > "$work_dir/renew-hook" <<'HOOK'
#!/usr/bin/env bash
# Managed by Matiane Coolify connection installer
set -euo pipefail
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx
HOOK
  sudo install -m 755 "$work_dir/renew-hook" "$hook"
  sudo systemctl enable --now certbot.timer
  # Public settings only. No passwords, keys or API tokens are read or printed.
  sudo docker exec --env "COOLIFY_CODEX_URL=https://$hostname" coolify php -r '
    require "/var/www/html/vendor/autoload.php";
    $app = require "/var/www/html/bootstrap/app.php";
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
    App\Models\InstanceSettings::get()->update([
        "fqdn" => getenv("COOLIFY_CODEX_URL"),
        "is_api_enabled" => true,
    ]);
    echo "Coolify API enabled.\n";
  '
  local status
  status="$(curl --noproxy '*' --silent --show-error --max-time 15 \
    --resolve "$hostname:443:127.0.0.1" -o "$work_dir/api-response" -w '%{http_code}' "https://$hostname/api/v1/version")"
  [[ "$status" == 401 ]]
  changed=0
  printf '\nHTTPS connection ready: https://%s\nAPI is reachable and requires your API token.\n' "$hostname"
  # Successful provisioning also removes the temporary backup.
  rm -rf "$work_dir"
  trap - EXIT
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then connect_coolify "$@"; fi
