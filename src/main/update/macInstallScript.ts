// The shell script that swaps the app bundle after Locker Manager quits (macOS).
// Kept apart from macInstaller.ts, which needs Electron, so a unit test can run it.
//
// Arguments: pid of the app, app to replace, new app, 1 to open afterwards,
// result file, version. Everything is quoted; nothing is built from strings.
export const macInstallScript = `#!/bin/bash
PID="$1"; TARGET="$2"; NEW="$3"; RELAUNCH="$4"; RESULT="$5"; VERSION="$6"
DIR=$(dirname "$TARGET"); BASE=$(basename "$TARGET")
TMP="$DIR/.$BASE.updating"; OLD="$DIR/.$BASE.previous"
result() { printf '{"ok":%s,"version":"%s","message":"%s"}' "$1" "$VERSION" "$2" > "$RESULT"; }
reopen() { if [ "$RELAUNCH" = 1 ]; then /usr/bin/open "$TARGET"; fi; }
for _ in $(seq 1 300); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
if kill -0 "$PID" 2>/dev/null; then result false "the app did not quit"; exit 1; fi
rm -rf "$TMP" "$OLD"
if ! /usr/bin/ditto "$NEW" "$TMP"; then
  rm -rf "$TMP"; result false "the new version could not be copied next to the old one"; reopen; exit 1
fi
/usr/bin/xattr -dr com.apple.quarantine "$TMP" 2>/dev/null
if ! mv "$TARGET" "$OLD"; then
  rm -rf "$TMP"; result false "macOS did not allow the old version to be moved"; reopen; exit 1
fi
if ! mv "$TMP" "$TARGET"; then
  mv "$OLD" "$TARGET"; rm -rf "$TMP"; result false "macOS did not allow the new version to be put in place"; reopen; exit 1
fi
rm -rf "$OLD"
result true "installed"
reopen
`
