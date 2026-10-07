#!/usr/bin/env bash
# One-time setup, run as ubuntu after install-ubuntu.sh has installed the site.
set -Eeuo pipefail
site_host="${1:-57.129.177.67}"
app_root=/opt/matiane
web_root=/var/www/matiane
if [[ "$EUID" -eq 0 || "$(id -un)" != ubuntu ]]; then
  printf 'Run this script as ubuntu, using sudo when requested.\n' >&2
  exit 1
fi
if [[ ! "$site_host" =~ ^[A-Za-z0-9.-]+$ || ! -d "$app_root/source/.git" || ! -L "$web_root/current" ]]; then
  printf 'First install the Matiane website using install-ubuntu.sh.\n' >&2
  exit 1
fi
source /etc/os-release
[[ "$ID" == ubuntu ]]
command -v flock >/dev/null
sudo -v
for unit in matiane-update.service matiane-update.timer; do
  if [[ -f "/etc/systemd/system/$unit" ]] && ! head -n 1 "/etc/systemd/system/$unit" | grep -qx '# Managed by Matiane auto-update installer'; then
    printf 'An unrelated systemd unit already uses this name. Leaving it unchanged.\n' >&2
    exit 1
  fi
done
if [[ -f /usr/local/bin/matiane-auto-update ]] && ! head -n 2 /usr/local/bin/matiane-auto-update | grep -q 'Runs as ubuntu, without sudo'; then
  printf 'An unrelated updater already uses this name. Leaving it unchanged.\n' >&2
  exit 1
fi
cd "$app_root/source"
if [[ "$(git remote get-url origin)" != https://github.com/emouhvarivahtang-jpg/matiane.git || -n "$(git status --porcelain)" || "$(git branch --show-current)" != main ]]; then
  printf 'The existing checkout has local changes or belongs to another repository.\n' >&2
  exit 1
fi
git fetch origin main
git merge --ff-only origin/main
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  printf 'Local-only commits found; leaving them unchanged.\n' >&2
  exit 1
fi
node_path="$(find "$app_root" -maxdepth 3 -type f -path '*/node-v24.*-linux-*/bin/node' | sort -V | tail -n 1)"
if [[ -z "$node_path" || ! -x "$node_path" ]]; then
  printf 'The installed Node.js 24 runtime was not found.\n' >&2
  exit 1
fi
node_bin="$(dirname "$node_path")"
"$node_path" --version
sudo install -d -m 755 -o ubuntu -g ubuntu "$web_root" "$web_root/releases"
sudo chown -R ubuntu:ubuntu "$web_root/releases"
sudo install -m 755 deploy/auto-update.sh /usr/local/bin/matiane-auto-update
work_dir="$(mktemp -d /tmp/matiane-timer.XXXXXX)"
trap 'rm -rf "$work_dir"' EXIT
cat > "$work_dir/service" <<EOF
# Managed by Matiane auto-update installer
[Unit]
Description=Build, test and publish Matiane updates from GitHub
Wants=network-online.target
After=network-online.target nginx.service

[Service]
Type=oneshot
User=ubuntu
Group=ubuntu
WorkingDirectory=$app_root/source
Environment="PATH=$node_bin:/usr/local/bin:/usr/bin:/bin"
Environment="MATIANE_HOST=$site_host"
Environment="NPM_CONFIG_CACHE=/var/cache/matiane/npm"
Environment="NPM_CONFIG_USERCONFIG=/dev/null"
Environment="GIT_CONFIG_GLOBAL=/dev/null"
ExecStart=/usr/local/bin/matiane-auto-update
TimeoutStartSec=10min
UMask=0022
CacheDirectory=matiane
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=$app_root $web_root /var/cache/matiane
EOF
cat > "$work_dir/timer" <<'EOF'
# Managed by Matiane auto-update installer
[Unit]
Description=Check GitHub for Matiane updates every minute

[Timer]
OnBootSec=1min
OnUnitInactiveSec=1min
RandomizedDelaySec=10s
Unit=matiane-update.service

[Install]
WantedBy=timers.target
EOF
sudo install -m 644 "$work_dir/service" /etc/systemd/system/matiane-update.service
sudo install -m 644 "$work_dir/timer" /etc/systemd/system/matiane-update.timer
sudo systemctl daemon-reload
sudo systemctl enable --now matiane-update.timer
if ! sudo systemctl start matiane-update.service; then
  sudo journalctl -u matiane-update.service -n 35 --no-pager
  printf 'The initial automatic update failed. The site keeps its previous version.\n' >&2
  exit 1
fi
sudo journalctl -u matiane-update.service -n 12 --no-pager
sudo systemctl is-active --quiet matiane-update.timer
printf '\nAutomatic updates are enabled. Updates to main publish after tests and build pass.\n'
printf 'Check http://%s/deploy-info.json for the deployed commit.\n' "$site_host"
