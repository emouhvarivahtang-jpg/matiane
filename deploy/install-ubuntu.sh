#!/usr/bin/env bash
# Run as your regular sudo-enabled Ubuntu user, inside an SSH terminal.
set -Eeuo pipefail
trap 'printf "\nInstallation stopped at line %s. Send the last error message for diagnosis.\n" "$LINENO" >&2' ERR

site_host="${1:-57.129.177.67}"
app_root=/opt/matiane
web_root=/var/www/matiane
repository=https://github.com/emouhvarivahtang-jpg/matiane.git
config_file=/etc/nginx/sites-available/matiane

if [[ ! "$site_host" =~ ^[A-Za-z0-9.-]+$ ]]; then
  printf 'Invalid site hostname.\n' >&2
  exit 1
fi
if [[ "$EUID" -eq 0 ]]; then
  printf 'Run this script as ubuntu, using sudo when requested.\n' >&2
  exit 1
fi
source /etc/os-release
if [[ "$ID" != ubuntu ]]; then
  printf 'This installer is for Ubuntu.\n' >&2
  exit 1
fi
case "$(uname -m)" in
  x86_64) node_arch=x64 ;;
  aarch64) node_arch=arm64 ;;
  *) printf 'Unsupported CPU architecture.\n' >&2; exit 1 ;;
esac

printf '1/5 Checking administrator access and installing the web server...\n'
sudo -v
if [[ -e "$config_file" ]] && ! sudo head -n 1 "$config_file" | grep -qx '# Managed by Matiane installer'; then
  printf 'An existing unmanaged Matiane configuration was found. Leaving it unchanged.\n' >&2
  exit 1
fi
if [[ -e "$app_root/source" && ! -d "$app_root/source/.git" ]]; then
  printf 'The source directory already contains other files. Leaving it unchanged.\n' >&2
  exit 1
fi
if [[ -e "$web_root/current" && ! -L "$web_root/current" ]]; then
  printf 'The web root already contains another installation. Leaving it unchanged.\n' >&2
  exit 1
fi
if [[ -L /etc/nginx/sites-enabled/matiane ]] && [[ "$(readlink /etc/nginx/sites-enabled/matiane)" != "$config_file" ]]; then
  printf 'An enabled site with this name points to another configuration. Leaving it unchanged.\n' >&2
  exit 1
fi
sudo apt-get update
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y nginx git curl ca-certificates xz-utils
sudo install -d -m 755 -o "$(id -un)" -g "$(id -gn)" "$app_root"
work_dir="$(mktemp -d /tmp/matiane-install.XXXXXX)"
trap 'rm -rf "$work_dir"' EXIT

printf '2/5 Installing the official Node.js 24 runtime with SHA-256 verification...\n'
node_url=https://nodejs.org/dist/latest-v24.x
curl --proto '=https' --tlsv1.2 --fail --location --silent --show-error "$node_url/SHASUMS256.txt" -o "$work_dir/SHASUMS256.txt"
checksum_line="$(awk -v arch="$node_arch" '$2 ~ "^node-v24\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$" { print; exit }' "$work_dir/SHASUMS256.txt")"
if [[ -z "$checksum_line" ]]; then
  printf 'No verified Node.js archive was found.\n' >&2
  exit 1
fi
read -r checksum archive_name <<< "$checksum_line"
node_directory="${archive_name%.tar.xz}"
curl --proto '=https' --tlsv1.2 --fail --location --show-error "$node_url/$archive_name" -o "$work_dir/$archive_name"
printf '%s\n' "$checksum_line" > "$work_dir/selected-checksum.txt"
(cd "$work_dir" && sha256sum --check selected-checksum.txt)
tar --extract --xz --file "$work_dir/$archive_name" --directory "$work_dir" --no-same-owner
if [[ -e "$app_root/$node_directory" ]]; then
  if ! diff -qr "$work_dir/$node_directory" "$app_root/$node_directory" >/dev/null; then
    printf 'An existing Node runtime differs from the verified archive. Leaving it unchanged.\n' >&2
    exit 1
  fi
else
  mv "$work_dir/$node_directory" "$app_root/$node_directory"
fi
export PATH="$app_root/$node_directory/bin:$PATH"
node --version
npm --version

printf '3/5 Downloading and building Matiane...\n'
if [[ ! -d "$app_root/source/.git" ]]; then
  git clone --branch main --single-branch "$repository" "$app_root/source"
else
  if [[ "$(git -C "$app_root/source" remote get-url origin)" != "$repository" ]]; then
    printf 'The existing checkout belongs to another repository.\n' >&2
    exit 1
  fi
  if [[ -n "$(git -C "$app_root/source" status --porcelain)" ]]; then
    printf 'The existing checkout has local changes. Leaving them unchanged.\n' >&2
    exit 1
  fi
  git -C "$app_root/source" fetch origin main
  git -C "$app_root/source" merge --ff-only origin/main
fi
cd "$app_root/source"
npm ci --no-audit --no-fund
npm run build
release_id="$(git rev-parse HEAD)"
release_dir="$web_root/releases/$release_id"
sudo install -d -m 755 "$release_dir"
sudo cp -a dist/. "$release_dir/"
sudo chmod -R u=rwX,go=rX "$release_dir"

printf '4/5 Configuring Nginx...\n'
cat > "$work_dir/nginx-site" <<'NGINX'
# Managed by Matiane installer
server {
    listen 80;
    listen [::]:80;
    server_name MATIANE_HOST;
    root /var/www/matiane/current;
    index index.html;
    add_header X-Content-Type-Options nosniff always;
    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    location /fonts/ { try_files $uri =404; }
    location /photos/ { try_files $uri =404; }
    location / { try_files $uri $uri/ /index.html; }
}
NGINX
sed -i "s/MATIANE_HOST/$site_host/" "$work_dir/nginx-site"
previous_release="$(readlink "$web_root/current" || true)"
if sudo test -f "$config_file"; then
  sudo cp "$config_file" "$work_dir/previous-nginx-site"
fi
if [[ -e /etc/nginx/sites-enabled/matiane && ! -L /etc/nginx/sites-enabled/matiane ]]; then
  printf 'An unmanaged enabled site exists. Leaving it unchanged.\n' >&2
  exit 1
fi
sudo cp "$work_dir/nginx-site" "$config_file"
sudo ln -sfn "$config_file" /etc/nginx/sites-enabled/matiane
if ! sudo nginx -t; then
  if [[ -f "$work_dir/previous-nginx-site" ]]; then
    sudo cp "$work_dir/previous-nginx-site" "$config_file"
  else
    sudo rm -f /etc/nginx/sites-enabled/matiane "$config_file"
  fi
  printf 'Nginx configuration failed; the previous configuration was restored.\n' >&2
  exit 1
fi
sudo ln -sfn "$release_dir" "$web_root/current"
sudo systemctl enable --now nginx
sudo systemctl reload nginx
if command -v ufw >/dev/null && sudo ufw status | grep -q '^Status: active'; then
  sudo ufw allow 80/tcp
fi

printf '5/5 Checking the served page, application bundle, and Georgian font...\n'
verify_file() {
  local path="$1"
  curl --fail --silent --show-error -H "Host: $site_host" "http://127.0.0.1/$path" -o "$work_dir/served-file"
  cmp -s "dist/$path" "$work_dir/served-file"
}
if ! (
  verify_file index.html &&
  verify_file "$(find dist/assets -maxdepth 1 -name 'index-*.js' -printf '%P\n' | head -n 1 | sed 's|^|assets/|')" &&
  verify_file fonts/NotoSansGeorgian-Regular.ttf
); then
  if [[ -n "$previous_release" ]]; then
    sudo ln -sfn "$previous_release" "$web_root/current"
    sudo systemctl reload nginx
  fi
  printf 'The served files did not pass verification.\n' >&2
  exit 1
fi
printf '\nMatiane is installed. Open http://%s in your browser.\n' "$site_host"
printf 'This is HTTP for testing by IP. Configure HTTPS before wider use.\n'
