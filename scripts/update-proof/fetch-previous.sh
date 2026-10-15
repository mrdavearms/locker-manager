#!/usr/bin/env bash
# Puts the PREVIOUS release's installer in a folder for the update proof, without
# downloading it from the public release where possible.
#
#   fetch-previous.sh <installer file name> <folder> <artifact name>
#
# Every download from a GitHub Release counts in that file's public download
# total, and that total is the only measure of how many schools install the app
# (github.com/mrdavearms/repo-stats). So the proof takes the installer from the
# Release workflow run that published it (the workflow artifact the build job
# handed to the publish job, kept 90 days). That is the same file: before using
# it, its SHA-256 is checked against the digest GitHub records for the release
# asset (reading the digest is not a download). Only if the artifact has expired
# or cannot be found does it fall back to the public download, and it says so.
#
# Needs GH_TOKEN (with actions: read), GITHUB_REPOSITORY and PREV_TAG.
set -euo pipefail
NAME="$1"
OUT="$2"
ARTIFACT="$3"
REPO="$GITHUB_REPOSITORY"

[[ "$PREV_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]] || { echo "::error::Not a release tag: $PREV_TAG"; exit 1; }
mkdir -p "$OUT"

sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }

from_release() {
  echo "::notice::Downloading $NAME from the public release. This adds one to its public download count."
  gh release download "$PREV_TAG" --repo "$REPO" --pattern "$NAME" --dir "$OUT" --clobber
}

# The newest successful Release run for the tag (a tag push sets headBranch to the tag).
RUN=$(gh run list --repo "$REPO" --workflow release.yml --event push --status success --limit 100 \
  --json databaseId,headBranch | jq -r --arg t "$PREV_TAG" '[.[] | select(.headBranch == $t)][0].databaseId // empty')
if [ -z "$RUN" ]; then
  echo "No successful Release run found for $PREV_TAG."
  from_release
  exit 0
fi

TMP=$(mktemp -d)
if ! gh run download "$RUN" --repo "$REPO" --name "$ARTIFACT" --dir "$TMP" || [ ! -f "$TMP/$NAME" ]; then
  echo "Release run $RUN has no $NAME in $ARTIFACT (artifacts are kept 90 days)."
  rm -rf "$TMP"
  from_release
  exit 0
fi

WANT=$(gh api "repos/$REPO/releases/tags/$PREV_TAG" | jq -r --arg n "$NAME" '.assets[] | select(.name == $n) | .digest // empty')
GOT="sha256:$(sha256 "$TMP/$NAME")"
if [ -z "$WANT" ]; then
  echo "::notice::GitHub records no digest for $NAME on $PREV_TAG, so the artifact could not be compared with it."
elif [ "$WANT" != "$GOT" ]; then
  echo "::error::$NAME from Release run $RUN ($GOT) is not the file published on $PREV_TAG ($WANT)."
  exit 1
fi
mv "$TMP/$NAME" "$OUT/$NAME"
rm -rf "$TMP"
echo "Took $NAME from Release run $RUN (not counted as a public download)."
