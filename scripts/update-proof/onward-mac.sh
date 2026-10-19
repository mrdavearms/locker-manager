#!/usr/bin/env bash
# Proves a freshly built Mac app can update ITSELF to a later version, before it is
# published. 0.11.0 to 0.11.3 shipped able to install themselves but not the release
# after, and nothing noticed until every school had them
# (docs/audits/2026-10-20-stability-audit.md, finding 4).
#
# Usage: onward-mac.sh "<path to the built Locker Manager.app>"
#
# 1. Copies the built app, as a copy that has already updated itself once (the last
#    download and a success note left in its data folder, as on a real Mac).
# 2. Makes the "next" version from the same app with the version raised by one, signs
#    it ad-hoc, zips it, and serves it with latest-mac.yml from a web server on this
#    computer only.
# 3. Points the copy at that server, starts it, and waits for it to download the next
#    version, replace itself, restart into it and pass its self-test.
# Nothing touches GitHub, and the copy uses its own data folder.
set -euo pipefail
BUILT="$1"
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/onward-mac.XXXXXX")"
APP="$WORK/Applications/Locker Manager.app"
NEXT_APP="$WORK/next/Locker Manager.app"
USER_DATA="$WORK/user-data"
LOG="$USER_DATA/logs/main.log"
PORT="${ONWARD_PORT:-8765}"
SERVER=""
cleanup() {
  [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null || true
  pkill -f "$WORK/Applications/Locker Manager.app/Contents/MacOS/Locker Manager" 2>/dev/null || true
}
trap cleanup EXIT

NEW=$(/usr/bin/plutil -extract CFBundleShortVersionString raw "$BUILT/Contents/Info.plist")
IFS=. read -r MAJOR MINOR PATCH <<< "${NEW%%-*}"
NEXT="$MAJOR.$MINOR.$((PATCH + 1))"
echo "Proving $NEW updates itself to $NEXT"

# 1. The copy under test, already updated once.
mkdir -p "$WORK/Applications" "$WORK/next" "$WORK/feed" "$USER_DATA/pending-update/app"
ditto "$BUILT" "$APP"
ditto "$BUILT" "$USER_DATA/pending-update/app/Locker Manager.app"
printf '{"ok":true,"version":"%s","message":"installed"}\n' "$NEW" > "$USER_DATA/update-result.json"
printf 'provider: generic\nurl: http://127.0.0.1:%s/\nupdaterCacheDirName: locker-manager-onward-proof\n' "$PORT" \
  > "$APP/Contents/Resources/app-update.yml"
codesign --force --deep -s - "$APP"

# 2. The next version: version raised in Info.plist and in the packaged package.json.
ditto "$BUILT" "$NEXT_APP"
/usr/bin/plutil -replace CFBundleShortVersionString -string "$NEXT" "$NEXT_APP/Contents/Info.plist"
/usr/bin/plutil -replace CFBundleVersion -string "$NEXT" "$NEXT_APP/Contents/Info.plist"
ASAR="$NEXT_APP/Contents/Resources/app.asar"
"$HERE/node_modules/.bin/asar" extract "$ASAR" "$WORK/asar"
node -e '
  const fs = require("fs"); const p = process.argv[1]
  const pkg = JSON.parse(fs.readFileSync(p, "utf8")); pkg.version = process.argv[2]
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2))' "$WORK/asar/package.json" "$NEXT"
rm -f "$ASAR"
"$HERE/node_modules/.bin/asar" pack "$WORK/asar" "$ASAR" --unpack "*.node"
codesign --force --deep -s - "$NEXT_APP"
(cd "$WORK/next" && ditto -c -k --keepParent "Locker Manager.app" "$WORK/feed/next.zip")
SHA=$(openssl dgst -sha512 -binary "$WORK/feed/next.zip" | base64 | tr -d '\n')
SIZE=$(stat -f %z "$WORK/feed/next.zip")
cat > "$WORK/feed/latest-mac.yml" <<EOF
version: $NEXT
files:
  - url: http://127.0.0.1:$PORT/next.zip
    sha512: $SHA
    size: $SIZE
path: http://127.0.0.1:$PORT/next.zip
sha512: $SHA
releaseDate: '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'
EOF
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$WORK/feed" >/dev/null 2>&1 &
SERVER=$!
sleep 1

# 3. Start it and wait for it to restart into the next version.
"$APP/Contents/MacOS/Locker Manager" --user-data-dir="$USER_DATA" >/dev/null 2>&1 &
for _ in $(seq 1 100); do
  if grep -q "Locker Manager $NEXT starting" "$LOG" 2>/dev/null; then break; fi
  sleep 3
done
echo "----- app log -----"; cat "$LOG" 2>/dev/null || true
grep -q "mac-self-install=yes" "$LOG" || { echo "::error::$NEW did not start in self-install mode"; exit 1; }
grep -q "Locker Manager $NEXT starting" "$LOG" || { echo "::error::$NEW did not install and restart into $NEXT"; exit 1; }
GOT=$(/usr/bin/plutil -extract CFBundleShortVersionString raw "$APP/Contents/Info.plist")
[ "$GOT" = "$NEXT" ] || { echo "::error::the app on disk is $GOT, not $NEXT"; exit 1; }
pkill -f "$APP/Contents/MacOS/Locker Manager" 2>/dev/null || true
sleep 2
"$APP/Contents/MacOS/Locker Manager" --self-test --user-data-dir="$USER_DATA" ||
  { echo "::error::$NEXT failed its self-test after updating"; exit 1; }
MSG="macOS: $NEW, after an earlier self-update, updated itself to $NEXT and passed its self-test."
echo "$MSG"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "- $MSG" >> "$GITHUB_STEP_SUMMARY"
exit 0
