#!/usr/bin/env bash
# Runs as ubuntu, without sudo. Only publishes this application's static files.
set -Eeuo pipefail
app_root="${MATIANE_APP_ROOT:-/opt/matiane}"
web_root="${MATIANE_WEB_ROOT:-/var/www/matiane}"
repository="${MATIANE_REPOSITORY:-https://github.com/emouhvarivahtang-jpg/matiane.git}"
site_host="${MATIANE_HOST:-57.129.177.67}"
check_url="${MATIANE_CHECK_URL:-http://127.0.0.1}"
source_dir="$app_root/source"

exec 9>"$app_root/deploy.lock"
flock -n 9 || exit 0
if [[ ! -d "$source_dir/.git" || "$(git -C "$source_dir" remote get-url origin)" != "$repository" ]]; then
  printf 'Unexpected repository; no changes made.\n' >&2
  exit 1
fi
git -C "$source_dir" fetch --quiet origin main
revision="$(git -C "$source_dir" rev-parse origin/main)"
if [[ ! "$revision" =~ ^[a-f0-9]{40}$ ]]; then exit 1; fi
# Distinguish automatic releases from a manual installation of the same commit.
release_dir="$web_root/releases/${revision}-auto"
previous_release="$(readlink -e "$web_root/current" || true)"
if [[ -n "$previous_release" && "$previous_release" != "$web_root/releases/"* ]]; then
  printf 'An unrelated website occupies the current path; no changes made.\n' >&2
  exit 1
fi
if [[ "$previous_release" == "$release_dir" ]]; then
  printf 'Already serving %s\n' "$revision"
  exit 0
fi
if [[ -n "$(git -C "$source_dir" status --porcelain)" || "$(git -C "$source_dir" branch --show-current)" != main ]]; then
  printf 'The checkout has local changes or a different branch; no changes made.\n' >&2
  exit 1
fi
git -C "$source_dir" merge --ff-only origin/main
if [[ "$(git -C "$source_dir" rev-parse HEAD)" != "$revision" ]]; then
  printf 'Local-only commits found; no deployment performed.\n' >&2
  exit 1
fi
cd "$source_dir"
npm ci --cache "${NPM_CONFIG_CACHE:-$app_root/.npm-cache}" --no-audit --no-fund
npm test
npm run build

stage="$(mktemp -d "$web_root/releases/.build.XXXXXX")"
pointer="$web_root/.current-$$"
trap 'rm -rf "$stage"; rm -f "$pointer"' EXIT
cp -R dist/. "$stage/"
printf '{"commit":"%s","deployed_at":"%s"}\n' "$revision" "$(date -u +%FT%TZ)" > "$stage/deploy-info.json"
# Retain immutable chunks so books open in an older browser tab can still export PDFs.
if [[ -d "$previous_release/assets" ]]; then
  cp -rn "$previous_release/assets/." "$stage/assets/"
fi
chmod -R u=rwX,go=rX "$stage"
if [[ -e "$release_dir" ]]; then rm -rf "$release_dir"; fi
mv "$stage" "$release_dir"
ln -s "$release_dir" "$pointer"
mv -Tf "$pointer" "$web_root/current"

verify_file() {
  local path="$1"
  curl --fail --silent --show-error --max-time 15 -H "Host: $site_host" "$check_url/$path" -o "$app_root/.served-file" || return 1
  cmp -s "$release_dir/$path" "$app_root/.served-file"
}
bundle="$(find dist/assets -maxdepth 1 -name 'index-*.js' -printf '%P\n' | head -n 1)"
if ! (verify_file index.html && verify_file "assets/$bundle" && verify_file fonts/NotoSansGeorgian-Regular.ttf && verify_file deploy-info.json); then
  if [[ -n "$previous_release" ]]; then
    ln -s "$previous_release" "$pointer"
    mv -Tf "$pointer" "$web_root/current"
  else
    rm -f "$web_root/current"
  fi
  printf 'HTTP checks failed; the previous site was restored.\n' >&2
  exit 1
fi
printf 'Deployed and verified %s\n' "$revision"
