#!/usr/bin/env bash
# Proves the PREVIOUS release finds THIS one on macOS and installs it by itself
# (unsigned copies from 0.11 replace their own app bundle). A previous release
# from before that only offers the download page (SPEC.md 9.2).
set -euo pipefail
NEW="${NEW_TAG#v}"
PREV="${PREV_TAG#v}"
LOG="$HOME/Library/Logs/Locker Manager/main.log"
WORK="$RUNNER_TEMP/update-proof"
mkdir -p "$WORK"

# The workflow puts it there first (fetch-previous.sh); download it only when run by hand.
[ -f "$WORK/Locker-Manager-$PREV-universal.dmg" ] ||
  gh release download "$PREV_TAG" --repo "$GITHUB_REPOSITORY" --pattern "Locker-Manager-$PREV-universal.dmg" --dir "$WORK" --clobber
MNT=$(hdiutil attach "$WORK/Locker-Manager-$PREV-universal.dmg" -nobrowse -readonly | grep -o '/Volumes/.*' | head -1)
ditto "$MNT/Locker Manager.app" "$WORK/Locker Manager.app"
hdiutil detach "$MNT" -quiet

# Start from a copy that has already updated itself once: a real Mac keeps the
# last download (a whole app, app.asar included) and a success note. 0.11.0 to
# 0.11.3 could not delete that folder, so every Mac stopped updating after one
# self-update, and a proof from a fresh install never saw it. Older copies than
# 0.11.4 still have that fault, so the leftover is only planted from 0.11.4 on.
USER_DATA="$HOME/Library/Application Support/Locker Manager"
if [ "$(printf '%s\n' "$PREV" 0.11.4 | sort -V | head -1)" = "0.11.4" ]; then
  mkdir -p "$USER_DATA/pending-update/app"
  ditto "$WORK/Locker Manager.app" "$USER_DATA/pending-update/app/Locker Manager.app"
  printf '{"ok":true,"version":"%s","message":"installed"}\n' "$PREV" > "$USER_DATA/update-result.json"
  LEFTOVER=" after an earlier self-update"
else
  LEFTOVER=""
  echo "::notice::$PREV is older than 0.11.4, so the proof starts from a fresh install"
fi

rm -f "$LOG"
"$WORK/Locker Manager.app/Contents/MacOS/Locker Manager" >/dev/null 2>&1 &
APP=$!
for _ in $(seq 1 60); do
  if grep -q "Found version $NEW" "$LOG" 2>/dev/null; then break; fi
  sleep 3
done
grep -q "Found version $NEW" "$LOG" || { kill "$APP" 2>/dev/null || true; cat "$LOG" || true; echo "::error::$PREV did not find $NEW"; exit 1; }

if grep -q "mac-self-install=yes" "$LOG"; then
  # Since 0.11: the unsigned app downloads the ZIP, replaces itself and restarts
  # into the new version, because no file is open at start-up.
  for _ in $(seq 1 200); do
    if grep -q "Locker Manager $NEW starting" "$LOG" 2>/dev/null; then break; fi
    sleep 3
  done
  echo "----- app log -----"; cat "$LOG" || true
  pkill -f "$WORK/Locker Manager.app/Contents/MacOS/Locker Manager" 2>/dev/null || true
  grep -q "Locker Manager $NEW starting" "$LOG" || { echo "::error::$PREV did not install and restart into $NEW"; exit 1; }
  GOT=$(/usr/bin/plutil -extract CFBundleShortVersionString raw "$WORK/Locker Manager.app/Contents/Info.plist")
  [ "$GOT" = "$NEW" ] || { echo "::error::the app on disk is $GOT, not $NEW"; exit 1; }
  /usr/bin/codesign --verify --deep --strict "$WORK/Locker Manager.app"
  MSG="macOS: unsigned $PREV$LEFTOVER found, downloaded and installed $NEW by itself, and $NEW starts."
else
  kill "$APP" 2>/dev/null || true
  echo "----- app log -----"; cat "$LOG" || true
  grep -q "updates=manual-download" "$LOG" || { echo "::error::$PREV did not start in download-page mode"; exit 1; }
  MSG="macOS: unsigned $PREV (before self-install) found $NEW and offers the download page."
fi
echo "$MSG"
echo "- $MSG" >> "$GITHUB_STEP_SUMMARY"
