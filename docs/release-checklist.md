# Release checklist

One release is one version tag. The tag starts the Release workflow, which builds the
Windows and Mac installers, checks every file is present, writes the release notes and
publishes. Milestone builds (0.x) are published as pre-releases.

## Before tagging

1. `main` is green on the Actions page: https://github.com/mrdavearms/locker-manager/actions
2. Decide the version number. Patch (`0.0.2`) for fixes, minor (`0.1.0`) for a milestone,
   major (`1.0.0`) for the first full release.
3. From the project folder, set the version in `package.json` and `package-lock.json`
   in one go (replace the number):

   ```bash
   npm version 0.0.2 --no-git-tag-version
   ```

4. Optional: write two or three plain-English sentences for school staff in
   `docs/release-highlights/v0.0.2.md`. They appear at the top of the release notes,
   above the generated list of changes.
5. Commit and push:

   ```bash
   git add package.json package-lock.json docs/release-highlights && git commit -m "chore(release): v0.0.2" && git push
   ```

6. Wait for CI on that commit to go green.

## Tag

```bash
git tag v0.0.2 && git push origin v0.0.2
```

Watch the Release workflow on the Actions page. It takes about 10 to 15 minutes. If a
job fails, fix the cause, delete the tag and the draft release, and tag again:

```bash
git tag -d v0.0.2 && git push origin :refs/tags/v0.0.2
```

(The draft release is deleted on the Releases page with the bin icon.)

## After publishing

1. Open https://github.com/mrdavearms/locker-manager/releases and read the notes as a
   school office worker would.
2. On a Windows PC with the previous version installed: open the app, wait 30 seconds,
   and confirm it reports the new version, downloads it, and installs on restart.
3. On a Mac with the previous version installed: confirm it reports the new version and
   that "Open the download page" opens this release (until signing exists).
4. From M5 onwards, before any minor release: print one real label sheet on a laser
   printer and check it against the calibration page.
5. Note anything learned in CLAUDE.md.
