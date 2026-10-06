#!/usr/bin/env bash
# Proves the PREVIOUS release finds THIS one on macOS and, while unsigned,
# offers the download page (SPEC.md 9.2). Run by release.yml after publishing.
set -euo pipefail
NEW="${NEW_TAG#v}"
PREV="${PREV_TAG#v}"
LOG="$HOME/Library/Logs/Locker Manager/main.log"
WORK="$RUNNER_TEMP/update-proof"
mkdir -p "$WORK"

gh release download "$PREV_TAG" --repo "$GITHUB_REPOSITORY" --pattern "Locker-Manager-$PREV-universal.dmg" --dir "$WORK" --clobber
MNT=$(hdiutil attach "$WORK/Locker-Manager-$PREV-universal.dmg" -nobrowse -readonly | grep -o '/Volumes/.*' | head -1)
ditto "$MNT/Locker Manager.app" "$WORK/Locker Manager.app"
hdiutil detach "$MNT" -quiet

rm -f "$LOG"
"$WORK/Locker Manager.app/Contents/MacOS/Locker Manager" >/dev/null 2>&1 &
APP=$!
for _ in $(seq 1 60); do
  if grep -q "Found version $NEW" "$LOG" 2>/dev/null; then break; fi
  sleep 3
done
kill "$APP" 2>/dev/null || true
echo "----- app log -----"; cat "$LOG" || true
grep -q "updates=manual-download" "$LOG" || { echo "::error::$PREV did not start in download-page mode"; exit 1; }
grep -q "Found version $NEW" "$LOG" || { echo "::error::$PREV did not find $NEW"; exit 1; }
MSG="macOS: unsigned $PREV found $NEW and offers the download page."
echo "$MSG"
echo "- $MSG" >> "$GITHUB_STEP_SUMMARY"
