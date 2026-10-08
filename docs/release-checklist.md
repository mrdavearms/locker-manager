# Release checklist

One release is one version tag. The tag starts the Release workflow, which builds the
Windows and Mac installers, checks every file is present, writes the release notes and
publishes. Milestone builds (0.x) are published as pre-releases.

## The quick way

`scripts/release.sh 0.8.0` does the steps below in order: sets the version, commits, pushes,
waits for CI on that commit, then tags it. It stops if CI fails, and can be run again with
the same number once the fault is fixed. The Update proof workflow then runs by itself.

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
2. On a Windows PC with the previous version installed: open the app and do not open a
   file. Confirm it reports the new version, downloads it and restarts into it by itself.
3. On a Mac with the previous version (0.11.0 or later) in Applications: the same as
   Windows. A Mac copy of 0.10.0 or older only offers the download page.
4. From M5 onwards, before any minor release: print one real label sheet on a laser
   printer and check it against the calibration page.
5. Note anything learned in CLAUDE.md.

## Staged rollout (optional)

To offer a release to some schools' computers first (SPEC.md 9.3):

1. Publish the release as usual.
2. On the Actions page, open **Rollout percentage**, click **Run workflow**, type the tag
   (for example `v1.0.1`) and a percentage (for example `20`).
3. If no problems are reported after a few days, run it again with `100`.

Each computer keeps the same random number, so a computer that already has the update keeps
it, and raising the share only adds computers. Run it with `100` straight away to undo a
mistake. The automatic update test runs before you set a share, so it is not affected.

## Hand checks before 1.0

Automated tests cannot do these. Each needs a person, real paper or a real computer.

1. **Labels**: print the calibration page on plain paper at Actual size. The bar measures
   exactly 100 mm. Hold it over a real sheet of Avery L7163 against a window; save a nudge.
   Print a full sheet of real labels and check every name sits inside its label.
2. **Letters**: print five letters on the school printer. One student per page, nothing cut
   off at the edges, the code boxes clear, the school colours right.
3. **Reports**: print the master list and check CONFIDENTIAL shows on every page with page
   numbers.
4. **Windows install**: install on a school PC from the release page, including the "More
   info, Run anyway" step; check a per-machine silent install (`/S /allusers`) if IT will use it.
5. **Shared folder**: open the file from the real shared folder on two computers at once;
   the second shows who is editing.
6. **Managed settings**: put a `managed.json` on one PC (IT guide) and check the locked
   settings show "Set by your IT team".
7. **Text size**: set 200% and use every screen.
8. **Real export**: import a real Compass export on a school computer (never commit it).
