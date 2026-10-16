#!/usr/bin/env bash
# Releases one version: bump, commit, push, wait for CI on THAT commit, tag it.
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
