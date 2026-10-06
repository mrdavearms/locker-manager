# Code signing: what to buy, and the exact steps

_Written 6 October 2026. Nothing here is set up yet. The release workflow is already
built to use these secrets the moment they exist; no code changes are needed._

## Why sign at all

| | Unsigned (now) | Signed |
|---|---|---|
| Windows first install | Blue "Windows protected your PC" screen; staff click More info, Run anyway | Installs with no warning |
| Windows updates | Install themselves | Install themselves |
| Mac first install | "Cannot be opened"; staff use System Settings > Privacy & Security > Open Anyway | Opens normally |
| Mac updates | App says "new version available" and opens the download page | Install themselves |

So signing removes the scary first-run screen on both platforms, and on the Mac it is the
only way to get self-installing updates.

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
**Digital Signatures** tab lists the organisation. The blue SmartScreen screen disappears
after Microsoft has seen enough installs, usually within days for a cloud-signed app.

Set a reminder for the client secret's expiry (24 months): make a new secret in Part D
step 3 and replace `AZURE_CLIENT_SECRET`.

## Windows: the other way, a certificate file

If a traditional code-signing certificate is bought from a certificate authority instead,
it now arrives on a hardware token, which a cloud build cannot use. Only use this route if
the authority provides a cloud signing service that can export a `.pfx`, in which case set
`WIN_CSC_LINK` (base64 of the `.pfx`, made the same way as Part C for the Mac) and
`WIN_CSC_KEY_PASSWORD`. The workflow prefers Azure when both are present.

## Removing signing

Delete the secrets. The next release builds unsigned again, with no other change.
