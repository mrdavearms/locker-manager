# Code signing: what to buy, and the exact steps

_Written 6 October 2026. Nothing here is set up yet. The release workflow is already
built to use these secrets the moment they exist; no code changes are needed._

## Why sign at all

| | Unsigned (now) | Signed |
|---|---|---|
| Windows first install | Blue "Windows protected your PC" screen; staff click More info, Run anyway | Installs with no warning |
| Windows updates | Install themselves, checked only against GitHub | Install themselves; refused if the publisher differs |
| Mac first install | "Cannot be opened"; staff use System Settings > Privacy & Security > Open Anyway | Opens normally |
| Mac updates | Install themselves (since 0.11.0), checked only against GitHub | Install themselves through Apple's updater, which refuses an app signed by anyone else |

So signing removes the scary first-run screen on both platforms, and it is the only way to
make updates prove they came from you rather than from whoever controls the GitHub
repository (see "GitHub settings only Dave can switch on" below).

## Costs

| Item | Price | Buys |
|---|---|---|
| Apple Developer Program | US$99 a year, about A$149 | Developer ID certificate and notarisation for the Mac build |
| Azure Artifact Signing (Basic) | About US$10 a month, about A$15 | Windows signing certificate kept in Microsoft's cloud, used by the build |

Azure Artifact Signing is the new name for Azure Trusted Signing. As of October 2026
Microsoft's documentation lists Australia among the countries whose organisations can be
validated. The validation is of an organisation, not a person. Individuals can only be
validated in the United States and Canada, so the account would be in the school's name
(ABN and legal name), or in the name of another organisation you can act for.

## How a secret gets into GitHub

Every value below is added the same way. Never put any of them in a file in the repository.

1. Open https://github.com/mrdavearms/locker-manager/settings/secrets/actions
2. Click **New repository secret**.
3. Type the **Name** exactly as shown below (capitals and underscores matter).
4. Paste the value into **Secret** and click **Add secret**.

A secret can never be read back, only replaced. If you lose the original value, make a
new one and replace the secret.

## Mac: Apple Developer Program

### Part A: enrol

1. Go to https://developer.apple.com/programs/enroll/ and sign in with the Apple ID you
   want to own this (a personal Apple ID is fine; the certificate carries your name).
2. Choose **Individual** and pay. Approval takes from a few hours to two days.
3. When approved, open https://developer.apple.com/account and note the **Team ID**
   under Membership details (ten characters, like `AB12CD34EF`). This is `APPLE_TEAM_ID`.

### Part B: make the certificate (on this Mac)

1. Open **Keychain Access** (in Applications > Utilities).
2. Menu **Keychain Access > Certificate Assistant > Request a Certificate From a
   Certificate Authority…**
3. Type your email, a common name like "Dave Armstrong", leave CA Email empty, choose
   **Saved to disk**, click Continue, and save the `.certSigningRequest` file to the Desktop.
4. Go to https://developer.apple.com/account/resources/certificates/add
5. Choose **Developer ID Application**, Continue, upload the request file, Continue,
   then **Download** the certificate (`developerID_application.cer`).
6. Double-click the downloaded `.cer` so Keychain Access installs it in the **login** keychain.
7. In Keychain Access, choose the **login** keychain and the **My Certificates** category.
   Find **Developer ID Application: Dave Armstrong (TEAMID)**. Right-click it and choose
   **Export…**. Save as `locker-manager-signing.p12` and set a strong password when asked.
   Do not save it inside the repository folder.

### Part C: turn the certificate into text for GitHub

In Terminal (Applications > Utilities), run this one line. It prints the file as a long
block of letters and copies it to the clipboard.

```bash
base64 -i ~/Desktop/locker-manager-signing.p12 | pbcopy
```

### Part D: an app-specific password for notarisation

Notarisation is Apple scanning the app and recording that it is safe. The build does it
automatically with these details.

1. Go to https://account.apple.com/account/manage and sign in.
2. Under **Sign-In and Security**, open **App-Specific Passwords**, click **+**, name it
   "Locker Manager notarisation", and copy the password it shows (format `abcd-efgh-ijkl-mnop`).

### Part E: add the five secrets

| Name | Value |
|---|---|
| `CSC_LINK` | Paste from the clipboard after Part C (the base64 text) |
| `CSC_KEY_PASSWORD` | The password you set when exporting the `.p12` |
| `APPLE_ID` | The Apple ID email used in Part A |
| `APPLE_APP_SPECIFIC_PASSWORD` | The password from Part D |
| `APPLE_TEAM_ID` | The Team ID from Part A |

### Part F: check it worked

Tag the next release (docs/release-checklist.md). In the Actions log for "Build macOS"
you should see "Developer ID certificate found" and lines from `notarytool`. On any Mac
with the new version installed:

```bash
codesign -dv --verbose=2 "/Applications/Locker Manager.app" 2>&1 | grep Authority
```

The first line should read `Authority=Developer ID Application: Dave Armstrong (TEAMID)`.
Inside the app, **About** shows **Signed: Yes**, and from then on Mac updates install
themselves. Delete `locker-manager-signing.p12` from the Desktop once the secret is in.

The certificate lasts five years. Renew it by repeating Parts B, C and E.

## Windows: Azure Artifact Signing

### Part A: Azure account and the signing account

1. Sign in at https://portal.azure.com with a Microsoft account (create one if needed) and
   create a subscription with a credit card.
2. In the search bar type **Artifact Signing** (older portals still say **Trusted Signing**)
   and open it. Click **Create**.
3. Choose a resource group (create "locker-manager"), a name for the account such as
   `lockermanager-signing`, the region **East US** or **West Europe** (these are the two
   regions with signing endpoints), and the **Basic** pricing tier. Create it.
4. Note the account name (`AZURE_CODE_SIGNING_NAME`) and the endpoint for the region:
   East US is `https://eus.codesigning.azure.net/`, West Europe is
   `https://weu.codesigning.azure.net/` (`AZURE_ENDPOINT`).

### Part B: identity validation (the slow part)

1. In the signing account, open **Identity validations** and click **New identity**.
2. Choose **Organization** (Public Trust). Enter the organisation's legal name, ABN or
   registration number, address, and a contact email at that organisation.
3. Microsoft's validation partner may email or phone to confirm. Allow one to two weeks.
   The organisation must have existed for three years or more.

### Part C: certificate profile

1. In the signing account, open **Certificate profiles**, click **Create**, choose
   **Public Trust**, pick the validated identity, and name the profile
   `locker-manager` (`AZURE_CERT_PROFILE_NAME`).
2. After it is created, open it and copy the **Subject** line. It looks like
   `CN=Wangaratta High School, O=Wangaratta High School, L=Wangaratta, S=Victoria, C=AU`.
   This exact text is `AZURE_PUBLISHER_NAME`.

### Part D: a login for the build

The build signs as an "app registration", a robot identity with its own secret.

1. In the portal search for **App registrations**, click **New registration**, name it
   `locker-manager-github`, leave the defaults, Register.
2. On its Overview page copy **Application (client) ID** (`AZURE_CLIENT_ID`) and
   **Directory (tenant) ID** (`AZURE_TENANT_ID`).
3. Open **Certificates & secrets**, **New client secret**, description "GitHub Actions",
   expiry 24 months, Add. Copy the **Value** column immediately (`AZURE_CLIENT_SECRET`).
   It is shown once.
4. Go back to the signing account, open **Access control (IAM)**, **Add role assignment**,
   choose the role **Trusted Signing Certificate Profile Signer**, then **Select members**
   and pick `locker-manager-github`. Review and assign.

### Part E: add the seven secrets

| Name | Value |
|---|---|
| `AZURE_TENANT_ID` | From Part D step 2 |
| `AZURE_CLIENT_ID` | From Part D step 2 |
| `AZURE_CLIENT_SECRET` | From Part D step 3 |
| `AZURE_ENDPOINT` | From Part A step 4, with the trailing slash |
| `AZURE_CODE_SIGNING_NAME` | The signing account name from Part A |
| `AZURE_CERT_PROFILE_NAME` | `locker-manager` from Part C |
| `AZURE_PUBLISHER_NAME` | The Subject line from Part C |

### Part F: check it worked

Tag the next release. The "Build Windows" log should say "Azure Artifact Signing secrets
found". On a Windows PC, right-click the downloaded installer, **Properties**, and the
**Digital Signatures** tab lists the organisation. Once installed, the app's **About** shows
**Signed: Yes** (it reads the signature from its own program file). The blue SmartScreen screen disappears
after Microsoft has seen enough installs, usually within days for a cloud-signed app.

Set a reminder for the client secret's expiry (24 months): make a new secret in Part D
step 3 and replace `AZURE_CLIENT_SECRET`.

## Windows: the other way, a certificate file

If a traditional code-signing certificate is bought from a certificate authority instead,
it now arrives on a hardware token, which a cloud build cannot use. Only use this route if
the authority provides a cloud signing service that can export a `.pfx`, in which case set
`WIN_CSC_LINK` (base64 of the `.pfx`, made the same way as Part C for the Mac) and
`WIN_CSC_KEY_PASSWORD`. The workflow prefers Azure when both are present.

## GitHub settings only Dave can switch on

_Written 9 October 2026, after the security review (finding H1) and v0.11.0._

### Why this matters now

Since v0.11.0, Windows and Mac copies both download and install updates by themselves.
Neither build is signed yet, so the app has only one way to tell a real update from a fake
one: the file's SHA-512 (a fingerprint of the file) listed in `latest.yml` or
`latest-mac.yml`. Those lists sit on the same GitHub Release as the installers. Anyone who
can change the release can change both, and the app will accept the result.

So today, **whoever controls the GitHub repository controls the code running on every
school computer that has Locker Manager**, within about four hours (the update check
interval). That includes someone with a phished GitHub password, a leaked token from this
Mac, or a bad npm package running inside a build. The data file with every student name
and code is within reach of that code.

The release workflow has been tightened (commit `ci: release builds can no longer change a
release`): builds that run npm packages now get a read-only token, and only two small jobs
can write. The settings below close the doors the workflow cannot close by itself. Do them
in this order. Each one takes a few minutes.

### 1. Immutable releases

Once a release is published, nobody can replace its files, move its tag or delete its
tag, not even you. A stolen login can still publish a new release, but cannot quietly
swap the installer inside one that schools already trust.

1. Open https://github.com/mrdavearms/locker-manager/settings (Settings tab, General).
2. Scroll to the **Releases** section.
3. Tick **Enable release immutability** and confirm.

It applies to releases published from then on. Drafts can still be changed, which is what
the release workflow needs: it fills the draft, checks it, then publishes it.

The cost: the **Rollout percentage** workflow (staged rollout) works by replacing
`latest.yml` and `latest-mac.yml` on a published release, so it stops working on any
release published after this. That is the right trade while builds are unsigned. If
staged rollout is ever needed, it would have to be set on the draft before publishing.

### 2. Tag protection for `v*`

A version tag starts the release. This makes sure only you can create, move or delete one.

1. Open https://github.com/mrdavearms/locker-manager/settings/rules (Settings, Rules,
   Rulesets).
2. Click **New ruleset**, then **New tag ruleset**.
3. **Ruleset name**: `Release tags`. **Enforcement status**: Active.
4. **Bypass list**: click **Add bypass**, choose **Repository admin**. You are the
   repository admin, so `scripts/release.sh` keeps working for you.
5. **Target tags**: **Add target**, **Include by pattern**, type `v*`.
6. Under **Rules**, tick **Restrict creations**, **Restrict updates**,
   **Restrict deletions** and **Block force pushes**.
7. Click **Create**.

From then on, a workflow token or any account without admin rights cannot make a `v` tag.
Your own login still can, which is why the next two steps matter.

### 3. The `release` environment with you as required reviewer

The workflow's **Upload, verify and publish** job and the **Rollout percentage** workflow
both name an environment called `release`. Until the environment has a reviewer, they run
straight through as before. With a reviewer, each one stops and waits until you approve it.
Nothing is uploaded to the release before that point, so a tag pushed by someone else
builds installers that go nowhere.

1. Open https://github.com/mrdavearms/locker-manager/settings/environments (Settings,
   Environments).
2. Click **New environment**, name it exactly `release`, click **Configure environment**.
3. Tick **Required reviewers**, type `mrdavearms` and pick yourself.
4. Leave **Prevent self-review** unticked. You are the only maintainer and you start the
   release yourself, so ticking it would mean nobody could ever approve.
5. Under **Deployment branches and tags**, choose **Selected branches and tags**, then
   **Add deployment branch or tag rule**: add a **Tag** rule `v*.*.*`, and a **Branch**
   rule `main` (the rollout workflow is started from `main`).
6. Click **Save protection rules**.

What a release then looks like: run `scripts/release.sh` as usual. About 10 to 15 minutes
later GitHub emails you, and the run on the Actions page shows **Review deployments**.
Check that both build jobs are green and that the tag is one you made, tick `release`, and
click **Approve and deploy**. The upload, the file check, the notes and publishing follow
by themselves, then the update proof runs.

If the signing secrets are added later, you can move them from repository secrets to
**Environment secrets** on this page so only an approved job can read them. That needs the
build jobs to name the environment too, which means one more approval per release; it is
not set up that way now.

### 4. Main branch: protect against deletion and force pushes only

You commit straight to `main`, and `scripts/release.sh` pushes the version commit there.
A ruleset that **requires a pull request** or **requires status checks** would block both,
and as the only maintainer you cannot approve your own pull request. So do not turn those
on. A light ruleset still helps: it stops anyone (including a stolen token) rewriting or
deleting `main`'s history.

1. Open https://github.com/mrdavearms/locker-manager/settings/rules, **New ruleset**,
   **New branch ruleset**.
2. **Ruleset name**: `Main`. **Enforcement status**: Active. Leave the bypass list empty.
3. **Target branches**: **Add target**, **Include default branch**.
4. Under **Rules**, leave **Restrict deletions** and **Block force pushes** ticked (they
   are on by default). Untick everything else.
5. Click **Create**.

### 5. Two quick account and Actions checks

- **Your GitHub login**: https://github.com/settings/security. Use a passkey or a hardware
  security key for two-factor sign-in. A one-time code from an app can be phished; a
  passkey cannot.
- **Tokens**: https://github.com/settings/tokens and
  https://github.com/settings/personal-access-tokens. Delete any you do not use. On this
  Mac, `gh auth status` shows the token the `gh` command uses; it can do anything you can.
- **Default workflow token**: https://github.com/mrdavearms/locker-manager/settings/actions
  (Settings, Actions, General), under **Workflow permissions**, choose **Read repository
  contents and packages permissions** and untick **Allow GitHub Actions to create and
  approve pull requests**. Every workflow already asks for what it needs, so this changes
  nothing today; it protects any workflow added later.

### What these settings do not fix

They make an attack harder and noisier, but your own GitHub login still has the power to
publish an update to every school. Only code signing moves that power off GitHub:

- **Windows: Azure Artifact Signing, about A$15 a month.** Once the first signed release
  is out, electron-updater compares the publisher on each new installer with the one in
  the installed app and refuses any other. An attacker would need the Azure account as
  well as GitHub. After the first signed release, check that the installed app's
  `resources\app-update.yml` has a `publisherName` line; without it the check is skipped.
- **Mac: Apple Developer Program, about A$150 a year.** A signed copy updates through
  Apple's own updater (Squirrel.Mac), which refuses an app signed by anyone else. The
  app's own installer (`src/main/update/macInstaller.ts`) is then used only by older
  unsigned copies.

### What the app can and cannot check by itself

Without signing, everything the app downloads comes from one place, and anyone who
controls that place controls everything the app could check against.

- **It does check now**: the SHA-512 against the release's update list (catches a broken
  or cut-off download, not a deliberate swap); on a Mac, that the new app has the same
  bundle identifier and the expected version, and that its ad-hoc code signature is intact
  (again: not altered after it was built, but says nothing about who built it).
- **It cannot check who uploaded a file.** GitHub's API does show an `uploader` for each
  file, and with the new workflow that is always `github-actions[bot]`. But an attacker
  with write access can run a workflow too, and every school computer asking GitHub's API
  would share a limit of 60 requests an hour per school internet address. Not worth it.
- **One free option that would work: sign the update list with a key that never touches
  GitHub.** You would keep a private key on this Mac (or a hardware key), and the app
  would carry the matching public key. At release time, after approving, you would sign
  `latest.yml` and `latest-mac.yml` locally and upload the two small signature files. The
  app would refuse an update whose list is not signed by your key. A GitHub break-in alone
  could then not push an update; the attacker would also need your Mac. The cost is about
  a day of work (Node's built-in Ed25519, a check before installing on both platforms, a
  `sign-release` script, tests) and one extra step in every release. Losing the key means
  shipping one release that schools install by hand. Worth doing only if signing is more
  than a few months away.

## Removing signing

Delete the secrets. The next release builds unsigned again, with no other change.
