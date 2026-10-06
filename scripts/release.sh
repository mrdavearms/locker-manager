#!/usr/bin/env bash
# Releases one version: bump, commit, push, wait for CI on THAT commit, tag it.
#   scripts/release.sh 0.2.0
# The tag starts the Release workflow, and the Update proof workflow follows it.
set -euo pipefail
VERSION="$1"
REPO="mrdavearms/locker-manager"
cd "$(dirname "$0")/.."
npm version "$VERSION" --no-git-tag-version >/dev/null
git add package.json package-lock.json
git -c user.name=mrdavearms -c user.email=dave@dandsarmstrong.com commit -q -m "chore(release): v$VERSION"
SHA=$(git rev-parse HEAD)
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
