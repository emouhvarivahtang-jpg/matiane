#!/usr/bin/env bash
# Run once as root through the already connected Coolify server.
set -Eeuo pipefail
hostname=matiane.57.129.177.67.sslip.io
config=/etc/nginx/sites-available/matiane-secure
enabled=/etc/nginx/sites-enabled/matiane-secure
marker='# Managed by Matiane secure studio'
work_dir=$(mktemp -d /tmp/matiane-gateway.XXXXXX)
original=0
was_enabled=0
changed=0
command -v nginx >/dev/null
command -v certbot >/dev/null
[[ $EUID -eq 0 ]]
curl --noproxy '*' -fsS --max-time 10 http://127.0.0.1:3001/api/health >/dev/null
getent ahostsv4 "$hostname" | awk '$1 == "57.129.177.67" { found=1 } END { exit !found }'
if [[ -e $config ]]; then
  [[ $(head -n 1 "$config") == "$marker" ]] || { printf 'Unrelated Nginx configuration; stopped.\n' >&2; exit 1; }
  cp -a "$config" "$work_dir/original"
  original=1
fi
if [[ -e $enabled || -L $enabled ]]; then
  [[ -L $enabled && $(readlink "$enabled") == "$config" ]] || { printf 'Unrelated enabled site; stopped.\n' >&2; exit 1; }
  was_enabled=1
fi
trap 'code=$?; if [[ $changed == 1 && $code != 0 ]]; then if [[ $original == 1 ]]; then cp -a "$work_dir/original" "$config"; else rm -f "$config"; fi; if [[ $was_enabled == 0 ]]; then rm -f "$enabled"; fi; nginx -t && systemctl reload nginx; fi; rm -rf "$work_dir"; exit "$code"' EXIT
render() {
 cat <<NGINX
$marker
server {
    listen 80;
    listen [::]:80;
    server_name $hostname;
    location ^~ /.well-known/acme-challenge/ {
        root /var/lib/coolify-codex-acme;
        try_files \$uri =404;
    }
    location / { return 301 https://\$host\$request_uri; }
}
NGINX
 if [[ $1 == tls ]]; then
 cat <<NGINX
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $hostname;
    ssl_certificate /etc/letsencrypt/live/$hostname/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$hostname/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:MatianeSSL:10m;
    root /var/www/matiane/current;
    index index.html;
    client_max_body_size 32m;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy same-origin always;
    add_header X-Frame-Options DENY always;
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        proxy_buffering off;
    }
    location /assets/ {
        try_files \$uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    location = /index.html { add_header Cache-Control "no-store"; }
    location = /deploy-info.json { add_header Cache-Control "no-store"; }
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX
 fi
}
install -d -m 755 /var/lib/coolify-codex-acme/.well-known/acme-challenge
if [[ -f /etc/letsencrypt/live/$hostname/fullchain.pem ]]; then render tls > "$work_dir/site"; else render http > "$work_dir/site"; fi
install -m 644 "$work_dir/site" "$config"
changed=1
ln -sfn "$config" "$enabled"
nginx -t
systemctl reload nginx
certbot certonly --webroot -w /var/lib/coolify-codex-acme --non-interactive --agree-tos --register-unsafely-without-email --cert-name "$hostname" -d "$hostname" --keep-until-expiring
render tls > "$work_dir/site"
install -m 644 "$work_dir/site" "$config"
nginx -t
systemctl reload nginx
curl --noproxy '*' -fsS --max-time 15 --resolve "$hostname:443:127.0.0.1" "https://$hostname/api/health" >/dev/null
systemctl enable --now certbot.timer >/dev/null
printf 'Matiane HTTPS gateway ready.\n'
