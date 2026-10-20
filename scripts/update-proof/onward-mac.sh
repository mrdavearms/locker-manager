#!/usr/bin/env bash
# Proves a freshly built Mac app can update ITSELF to a later version, before it is
# published. 0.11.0 to 0.11.3 shipped able to install themselves but not the release
# after, and nothing noticed until every school had them
# (docs/audits/2026-10-20-stability-audit.md, finding 4).
#
# Usage: onward-mac.sh "<path to the built Locker Manager.app>"
#        onward-mac.sh --two-updates ["<path to the built app>"]
#
# Default (release.yml on GitHub): the copy starts as one that has already updated itself
# once (the last download and a success note planted in its data folder, as on a real
# Mac), then updates itself to the next version.
#
# --two-updates (npm run proof:mac, and scripts/release.sh before tagging): the copy starts
# fresh and makes two real updates in a row, version N to N+1, then N+1 to N+2, with
# whatever the first update left on disk still there. Without a path it uses the newest
# app under release/ (npm run dist:dir).
#
# Each next version is the same app with its version raised, signed ad-hoc, zipped and
# served with latest-mac.yml from a web server on this computer only. Every copy is
# pointed at that server, and after each update the app on disk must be the new version
# and pass --self-test. Nothing touches GitHub, and the copy uses its own data folder.
set -euo pipefail
TWO=0
if [ "${1:-}" = "--two-updates" ]; then TWO=1; shift; fi
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
BUILT="${1:-}"
if [ -z "$BUILT" ]; then
  BUILT=$(ls -td "$HERE"/release/mac*/"Locker Manager.app" 2>/dev/null | head -1 || true)
  [ -n "$BUILT" ] || { echo "No built app under release/. Run npm run dist:dir first." >&2; exit 1; }
fi
# The real path: the install script reopens the app by it (/private/var, not /var), and
# stopping the app matches on that path.
WORK="$(cd "$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/onward-mac.XXXXXX")" && pwd -P)"
APP="$WORK/Applications/Locker Manager.app"
EXE="$APP/Contents/MacOS/Locker Manager"
USER_DATA="$WORK/user-data"
LOG="$USER_DATA/logs/main.log"
PORT="${ONWARD_PORT:-8765}"
SERVER=""
cleanup() {
  [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null || true
  pkill -f "$EXE" 2>/dev/null || true
}
trap cleanup EXIT
fail() {
  echo "----- app log -----"; cat "$LOG" 2>/dev/null || true
  echo "::error::$1"; exit 1
}

NEW=$(/usr/bin/plutil -extract CFBundleShortVersionString raw "$BUILT/Contents/Info.plist")
IFS=. read -r MAJOR MINOR PATCH <<< "${NEW%%-*}"
NEXT="$MAJOR.$MINOR.$((PATCH + 1))"
AFTER="$MAJOR.$MINOR.$((PATCH + 2))"
if [ "$TWO" = 1 ]; then echo "Proving $NEW updates itself to $NEXT, then to $AFTER"
else echo "Proving $NEW updates itself to $NEXT"; fi
mkdir -p "$WORK/Applications" "$WORK/feed" "$USER_DATA"

point_at_feed() {
  printf 'provider: generic\nurl: http://127.0.0.1:%s/\nupdaterCacheDirName: locker-manager-onward-proof\n' "$PORT" \
    > "$1/Contents/Resources/app-update.yml"
}

# make_version <version>: the built app with its version raised in Info.plist and in the
# packaged package.json, pointed at the local server, zipped into the feed.
make_version() {
  local v="$1" dir="$WORK/v$1"
  local app="$dir/Locker Manager.app"
  mkdir -p "$dir"
  ditto "$BUILT" "$app"
  /usr/bin/plutil -replace CFBundleShortVersionString -string "$v" "$app/Contents/Info.plist"
  /usr/bin/plutil -replace CFBundleVersion -string "$v" "$app/Contents/Info.plist"
  local asar="$app/Contents/Resources/app.asar"
  "$HERE/node_modules/.bin/asar" extract "$asar" "$dir/asar"
  node -e '
    const fs = require("fs"); const p = process.argv[1]
    const pkg = JSON.parse(fs.readFileSync(p, "utf8")); pkg.version = process.argv[2]
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2))' "$dir/asar/package.json" "$v"
  rm -f "$asar"
  "$HERE/node_modules/.bin/asar" pack "$dir/asar" "$asar" --unpack "*.node"
  point_at_feed "$app"
  codesign --force --deep -s - "$app"
  (cd "$dir" && ditto -c -k --keepParent "Locker Manager.app" "$WORK/feed/$v.zip")
}

# offer <version>: latest-mac.yml now offers that version's zip.
offer() {
  local v="$1" zip="$WORK/feed/$1.zip"
  local sha size
  sha=$(openssl dgst -sha512 -binary "$zip" | base64 | tr -d '\n')
  size=$(stat -f %z "$zip")
  cat > "$WORK/feed/latest-mac.yml" <<EOF
version: $v
files:
  - url: http://127.0.0.1:$PORT/$v.zip
    sha512: $sha
    size: $size
path: http://127.0.0.1:$PORT/$v.zip
sha512: $sha
releaseDate: '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'
EOF
}

stop_app() {
  pkill -f "$EXE" 2>/dev/null || true
  for _ in $(seq 1 20); do pgrep -f "$EXE" >/dev/null || return 0; sleep 1; done
  pkill -9 -f "$EXE" 2>/dev/null || true
  sleep 1
}

# update_to <from> <to>: start the copy, wait for it to replace itself and restart as
# <to>, then stop it and check the app on disk and its self-test.
update_to() {
  local from="$1" to="$2"
  "$EXE" --user-data-dir="$USER_DATA" >/dev/null 2>&1 &
  for _ in $(seq 1 100); do
    if grep -q "Locker Manager $to starting" "$LOG" 2>/dev/null; then break; fi
    sleep 3
  done
  grep -q "Locker Manager $to starting" "$LOG" 2>/dev/null || fail "$from did not install and restart into $to"
  # Let the new version finish its own start-up and update check before stopping it.
  sleep 8
  stop_app
  local got
  got=$(/usr/bin/plutil -extract CFBundleShortVersionString raw "$APP/Contents/Info.plist")
  [ "$got" = "$to" ] || fail "the app on disk is $got, not $to"
  "$EXE" --self-test --user-data-dir="$USER_DATA" || fail "$to failed its self-test after updating"
  echo "Updated: $from to $to, and $to passed its self-test."
}

ditto "$BUILT" "$APP"
point_at_feed "$APP"
codesign --force --deep -s - "$APP"
make_version "$NEXT"
[ "$TWO" = 1 ] && make_version "$AFTER"
offer "$NEXT"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$WORK/feed" >/dev/null 2>&1 &
SERVER=$!
sleep 1

if [ "$TWO" = 1 ]; then
  "$EXE" --self-test --user-data-dir="$WORK/self-test" || fail "$NEW failed its self-test"
  update_to "$NEW" "$NEXT"
  # The second update starts from whatever the first one left in the data folder.
  offer "$AFTER"
  update_to "$NEXT" "$AFTER"
  [ "$(grep -c "mac-self-install=yes" "$LOG")" -ge 3 ] || fail "a copy did not start in self-install mode"
  MSG="macOS: $NEW updated itself to $NEXT, then $NEXT updated itself to $AFTER, each passing its self-test."
else
  # A copy that has already updated itself once, as on a real Mac.
  mkdir -p "$USER_DATA/pending-update/app"
  ditto "$BUILT" "$USER_DATA/pending-update/app/Locker Manager.app"
  printf '{"ok":true,"version":"%s","message":"installed"}\n' "$NEW" > "$USER_DATA/update-result.json"
  update_to "$NEW" "$NEXT"
  grep -q "Locker Manager $NEW starting.*mac-self-install=yes" "$LOG" || fail "$NEW did not start in self-install mode"
  MSG="macOS: $NEW, after an earlier self-update, updated itself to $NEXT and passed its self-test."
fi
echo "----- app log -----"; cat "$LOG"
echo "$MSG"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "- $MSG" >> "$GITHUB_STEP_SUMMARY"
exit 0
