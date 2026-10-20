#!/usr/bin/env bash
# Releases one version: bump, commit, prove the Mac build updates twice (on a Mac),
# push, wait for CI on THAT commit, tag it.
#   scripts/release.sh 0.2.0
# The tag starts the Release workflow, and the Update proof workflow follows it.
set -euo pipefail
VERSION="$1"
REPO="mrdavearms/locker-manager"
cd "$(dirname "$0")/.."
# If an earlier attempt already bumped the version (and CI then failed), carry on
# from the current commit instead of bumping again.
if [ "$(node -p 'require("./package.json").version')" != "$VERSION" ]; then
  npm version "$VERSION" --no-git-tag-version >/dev/null
  # The README and the website always describe the current version (Dave, 17 Oct 2026).
  perl -pi -e "s/\*\*Version [0-9]+\.[0-9]+\.[0-9]+/**Version $VERSION/" README.md
  perl -pi -e "s#<strong>Version [0-9]+\.[0-9]+\.[0-9]+</strong>#<strong>Version $VERSION</strong>#" site/index.html
  grep -q "\*\*Version $VERSION" README.md && grep -q "<strong>Version $VERSION</strong>" site/index.html \
    || { echo "README.md or site/index.html does not show Version $VERSION; fix it first." >&2; exit 1; }
  git add package.json package-lock.json README.md site/index.html
  git -c user.name=mrdavearms -c user.email=dave@dandsarmstrong.com commit -q -m "chore(release): v$VERSION"
fi
SHA=$(git rev-parse HEAD)
# On a Mac, prove this build updates itself twice in a row before anything is pushed
# (0.11.0 to 0.11.3 could update once but not again). Output goes to a file, not a pipe,
# so a failure stops the release.
if [ "$(uname)" = Darwin ]; then
  PROOF_LOG="$(mktemp "${TMPDIR:-/tmp}/proof-mac.XXXXXX")"
  echo "Proving the Mac build updates itself twice (npm run proof:mac, log: $PROOF_LOG)"
  if ! npm run proof:mac > "$PROOF_LOG" 2>&1; then
    tail -n 40 "$PROOF_LOG" >&2
    echo "The Mac update proof failed; nothing was pushed or tagged. Full log: $PROOF_LOG" >&2
    exit 1
  fi
  grep "^Updated: \|^macOS: " "$PROOF_LOG"
fi
git push -q origin HEAD:main
echo "Waiting for CI on $SHA"
for i in $(seq 1 60); do
  RUN=$(gh run list --repo "$REPO" --workflow ci.yml --commit "$SHA" --limit 1 --json databaseId -q '.[0].databaseId' || true)
  [ -n "$RUN" ] && break
  sleep 5
done
gh run watch "$RUN" --repo "$REPO" --exit-status >/dev/null
git tag -a "v$VERSION" -m "Locker Manager $VERSION" "$SHA"
git push -q origin "v$VERSION"
echo "Tagged v$VERSION at $SHA; Release workflow started."
