#!/bin/sh
# Publish a tested Coolify image to Matiane's existing static Nginx directory.
set -eu
content=/usr/share/nginx/html
revision="${SOURCE_COMMIT:-unknown}"
printf '{"commit":"%s","deployed_at":"%s","manager":"Coolify"}\n' "$revision" "$(date -u +%FT%TZ)" > "$content/deploy-info.json"
root="${MATIANE_PUBLICATION_ROOT:-}"
if [ -z "$root" ]; then exit 0; fi
if ! printf '%s' "$revision" | grep -Eq '^[a-f0-9]{40}$'; then
  printf 'A verified Git commit is required for publication.\n' >&2
  exit 1
fi
if [ ! -d "$root/releases" ] || [ ! -L "$root/current" ]; then
  printf 'The existing Matiane installation was not found.\n' >&2
  exit 1
fi
exec 9>"$root/.coolify-publication-lock"
flock 9
previous="$(readlink -f "$root/current")"
case "$previous" in "$root"/releases/*) ;; *) printf 'Unexpected current website; leaving it unchanged.\n' >&2; exit 1 ;; esac
test -d "$previous"
release="$root/releases/$revision-coolify"
if [ "$previous" = "$release" ]; then exit 0; fi
nginx -t
stage="$(mktemp -d "$root/releases/.coolify.XXXXXX")"
pointer="$root/.current-$$"
switched=0
cleanup() {
  status=$?
  if [ "$status" != 0 ] && [ "$switched" = 1 ]; then
    ln -s "$previous" "$pointer"
    mv -Tf "$pointer" "$root/current"
    printf 'Publication failed; the previous website was restored.\n' >&2
  fi
  rm -rf "$stage"
  rm -f "$pointer"
  trap - EXIT
  exit "$status"
}
trap cleanup EXIT
if [ -d "$previous/assets" ]; then cp -R "$previous/assets" "$stage/assets"; fi
cp -R "$content/." "$stage/"
chmod -R u=rwX,go=rX "$stage"
test -s "$stage/index.html"
test -s "$stage/fonts/NotoSansGeorgian-Regular.ttf"
bundle="$(find "$content/assets" -maxdepth 1 -name 'index-*.js' | head -n 1)"
test -n "$bundle"
if [ -e "$release" ]; then rm -rf "$release"; fi
mv "$stage" "$release"
ln -s "$release" "$pointer"
mv -Tf "$pointer" "$root/current"
switched=1
verify() {
  file="$1"
  wget -q -T 10 -O "$content/.served-file" --header="Host: ${MATIANE_CHECK_HOST:-57.129.177.67}" "${MATIANE_CHECK_URL:-http://host.docker.internal}/$file" || return 1
  cmp -s "$release/$file" "$content/.served-file"
}
verify index.html
verify "assets/$(basename "$bundle")"
verify deploy-info.json
verify fonts/NotoSansGeorgian-Regular.ttf
printf 'Coolify published and verified %s at the existing Matiane address.\n' "$revision"
