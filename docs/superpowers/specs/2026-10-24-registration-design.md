# Registration: design

_Written 24 October 2026 for Dave Armstrong. Approved by Dave 25 October 2026, with no grace period, keys sent from dave@dandsarmstrong.com, and the school's state on the form._

## 1. What this is and why

From the next feature release, a school must register Locker Manager before it can use the app
on its own data. Registration asks for three things: the person's name, their school, and an
email address. Dave is told about each registration, checks that it is a real school, and
approves it. The school then receives a registration key by email. They paste the key into the
app once, and the app works fully from then on.

Dave's reasons, in his words: "I just want to make sure that that's being used by schools, and I
suppose ultimately I would then consider monetising the app."

So the feature has two jobs:

1. Now: know who is using the app, and make sure they are schools.
2. Later: make it possible to charge, without rebuilding the feature.

## 2. Decisions Dave made (24 October 2026)

| Question | Dave's answer |
|---|---|
| Must schools already using the app register? | Yes, straight away, with no grace period (changed 25 October 2026). After updating, an unregistered copy can look at the school's file but not change it until a key is entered. |
| Who approves a registration? | Dave approves each one. |
| What can someone do before they have a key? | Try the app with the built-in demo school only. |
| Is a small online service acceptable? | Yes, small and cheap, on Google Cloud like his other apps. |
| Which address sends keys? | dave@dandsarmstrong.com (25 October 2026). |
| Ask for the school's state? | Yes, a drop-down (25 October 2026). |

## 3. Goals

1. A school can register in under two minutes, from inside the app or from the Locker Manager website.
2. Dave gets an email for each registration with the name, school and email, and approves it with two clicks.
3. The school gets its key by email within a minute of Dave approving.
4. One key covers the whole school. Every computer that opens that school's data file is covered without anyone pasting the key again.
5. The app checks the key with no internet connection. It never "phones home".
6. Keys can carry an expiry date and a plan name, so paid plans can come later with no change to the app.

## 4. Non-goals (not in this build)

- Taking payment. No billing, invoices or price list.
- Revoking a key that has been issued. A key, once issued, works until its expiry date (none for now).
- Stopping a determined person from removing the check. See section 11.
- User accounts, passwords or sign-in of any kind.
- Counting computers or limiting how many computers use a key.

## 5. Anti-goals (would make this a failure even if it works)

1. **A school locked out of its own data.** A school mid-allocation, on a busy day, must never find it cannot see who has which locker. Whatever happens with keys, the school can always open its file to look, print lists and export (section 7.4).
2. **Registration that stops updates.** Nothing about registration may stop the app updating itself. Fixes must keep reaching unregistered copies. (This follows the rule in CLAUDE.md: nothing may stop the next update.)
3. **Telemetry by the back door.** The app sends registration details only when a person presses Send on the registration form. It never sends anything to check a key, count launches or report usage. The README promise "no telemetry" stays true.
4. **Student data leaving the school.** The registration form carries staff details only. Never a student name, never anything from the data file.
5. **Nagging small schools.** A registered school sees nothing about registration again, apart from one line in About. (Decision 23: small schools are first class.)

## 6. How it works, end to end

### 6.1 Registering

A person can register two ways. Both send the same details to the same place.

1. **In the app.** The first screen of an unregistered copy has a "Register this school" button. It opens a short form: your name, your school, your email, your role (optional), and a tick box agreeing to the short privacy note. Pressing Send posts the form to the registration service.
2. **On the website.** A new page on the Locker Manager site (`site/register/`) has the same form. This is for schools whose network blocks the app's request, and for IT staff who want a key before installing.

If the in-app send fails (no internet, a school proxy blocks it), the app says so plainly and offers two ways out: open the website form, or open an email to Dave already filled in with the details.

After a successful send, the person sees: "Thanks. Dave Armstrong checks each registration by hand, usually within a day. Your key will come to [email]." They also get an automatic email saying the same thing.

### 6.2 Dave is told

The registration service emails Dave at dave@dandsarmstrong.com:

> New Locker Manager registration
> Name: Hannah Smith
> School: Example Secondary College
> Email: hsmith@example.vic.edu.au
> Role: Business manager
> Sent from: the app, version 0.13.0
> [Approve] [Reject]

Dave clicks Approve. A web page opens showing the details again with one "Approve and send key" button. Dave presses it. (Two steps on purpose: Outlook and Gmail sometimes open links in emails by themselves to check them for viruses. A link alone must never approve anything. Only pressing the button on the page does.)

Reject works the same way and can send a short polite email, or send nothing. Dave chooses on the page.

Every registration is also kept in a list Dave can look at (section 8.3), so he can see every school that has registered and when.

### 6.3 The school gets its key

On approval the service makes a key and emails it to the registrant:

> Your Locker Manager registration key for Example Secondary College
>
> 1. Open Locker Manager.
> 2. Choose "I have a key" (or Help, then Registration).
> 3. Paste this key and press Register:
>
> LM1.eyJ2IjoxLCJpZCI6IlItMDAwMTIi....Qm9vZ3Vz

The person pastes the key. The app checks it on the spot, with no internet, and shows "Registered to Example Secondary College". Done.

### 6.4 What a key is

A key is a short block of text in two parts: the registration details, and a digital signature of those details.

The signature is made with a private key that only the registration service holds (kept in Google Secret Manager, Google Cloud's store for passwords and keys). The app contains the matching public key. The public key can check a signature but cannot make one. So anyone can read a key, but nobody can make a new one or change the school name in one without breaking the signature.

The method is Ed25519, a standard digital signature method built into Node.js and Electron. No extra library is needed.

What a key holds:

| Field | Example | Why |
|---|---|---|
| `v` | 1 | Format version, so the format can change later. |
| `id` | R-00012 | Registration number. Matches Dave's list. |
| `school` | Example Secondary College | Shown in the app: "Registered to ...". |
| `email` | hsmith@example.vic.edu.au | Who registered. Shown in About so IT can see who to ask. |
| `issued` | 2026-11-02 | When Dave approved it. |
| `plan` | free | Room for paid plans later. Only "free" exists now. |
| `expires` | null | Room for yearly keys later. None expire now. |

The text form is `LM1.` followed by the details and the signature, each in base64url (letters, digits, `-` and `_`, so the key survives copying out of an email). It is about 300 characters. Nobody types it; they paste it.

### 6.5 Where the app keeps the key

The key is kept in two places, so a school pastes it once:

1. **In the school's data file.** The key is written into the file's `meta` table (key `registration_v1`). Every computer that opens the file is covered. This is the main place.
2. **On the computer.** A copy goes into this computer's `preferences.json`. This lets the computer create a new data file, or open a file that has lost its key (for example, a backup from before registering).

When a covered computer opens a file that has no key, and it is editing, it writes its key into the file. This shows in History as "Registration added to this file".

When a computer that has no key of its own opens a file that has a key, it copies the key to its own preferences.

Rules for when keys disagree:

- A computer never replaces a valid key already in a file. It writes its key only into a file with no valid key.
- A computer never replaces its own valid key with a file's key.
- A key is not tied to one file. The app does not compare the key's school name with the file's school name, because schools write their names in different ways ("Wangaratta HS", "Wangaratta High School") and a mismatch would lock out a real school. Section 11 explains what this means.

`preferences.json` belongs to the Windows or Mac user account, not to the whole computer. A second staff member who logs in to the same computer has no key of their own until they open the school's file (which carries the key) or IT places the `registration.key` file. That is enough; no machine-wide key is needed.

School IT can also place the key on every computer in one go, as a file named `registration.key` in the same folder as `managed.json` (the managed settings file, docs/it-guide.md). It is a separate file on purpose: `managed.json` is checked strictly, and an older copy of the app that met an unknown setting in it would ignore every managed setting IT had chosen.

## 7. What the app does in each state

### 7.1 The states

| State | How a copy gets here |
|---|---|
| **Registered** | A valid key is on the computer, in the managed `registration.key` file, or in the open data file. |
| **Unregistered** | No valid key anywhere. A new install, and every existing install that updates to 0.13.0 without a key. |

A key whose `expires` date has passed counts as no key. None expire yet.

### 7.2 Registered

Everything works as now. About shows "Registered to Example Secondary College (R-00012)". Nothing else changes.

### 7.3 Schools already using the app

There is no grace period (Dave, 25 October 2026). When a school's computer updates to 0.13.0 and has no key, it is unregistered. It opens the school's file read-only, with the message in 7.4, until someone enters a key. Because Dave approves each registration by hand, a school can be look-only for up to a day. The release notes, the website and the in-app message say this plainly, and say how to register before updating.

### 7.4 Unregistered

What still works:

- The demo school (unless IT has turned it off, in which case the first screen says registration is needed to start).
- Registering, and entering a key.
- Opening an existing school file **read-only**: look up students and lockers, print lists, export without codes. This is the guarantee in anti-goal 1. The read-only banner says "This copy is not registered, so you can look but not change anything. [Register] [I have a key]".
- Updates.

"Open a backup…" on the first screen does not work until a key is entered. It writes the backup over the school's file, which is a change, so it follows the same rule as other changes. The screen says why and offers Register and I have a key.

What does not work until a key is entered:

- Creating a new school file.
- Making changes to a school file.
- Showing, printing or exporting codes. (Codes already need edit mode, decision 22, so this follows from read-only.)
- Practice copies of a school file.

Read-only for an unregistered copy uses the read-only mode the app already has, with a new reason, `unregistered`. This means every screen already knows how to behave. Codes stay locked for the same reason they do on any read-only computer.

### 7.5 Copies that have not updated

A computer still running 0.12.1 or older knows nothing about registration and keeps working. It also leaves the key in the file alone, since it never touches that `meta` row. Those copies update themselves unless IT has turned updates off. This is accepted.

The key can still drop out of a file in three ways: an older copy restores a backup from before registration, someone uses Undo on "Registration added to this file", or a conflict merge leaves that change out. In each case the next registered computer to open the file in edit mode puts the key back. A school with no registered computer left would need to paste the key again. This is accepted.

## 8. The registration service

### 8.1 Shape

A small Firebase project on Google Cloud, the same pattern as Hunt 1000 Tracker's email functions:

- **Cloud Functions** (small pieces of server code that run only when called), Node.js 22, region `australia-southeast1` (Sydney), so staff details stay in Australia.
- **Firestore** (Google's document database) for the list of registrations.
- **Secret Manager** for the signing private key and the email password.
- **Email** sent through Gmail with an app password using Nodemailer (a Node.js email library), exactly as Hunt 1000 does.

Four functions:

| Function | Called by | Does |
|---|---|---|
| `register` | the app and the website form (POST) | Checks the fields, stores the registration as "waiting", emails Dave, emails the registrant a "received" note. |
| `review` | Dave, from the link in his email (GET) | Shows the details with Approve and Reject buttons. Changes nothing. |
| `decide` | the buttons on the review page (POST) | Approves (makes the key, emails it, marks "approved") or rejects. |
| `list` | Dave (GET, with his secret link) | A plain page listing every registration, newest first, with a CSV download. |

### 8.2 Security of the service

- Each review link holds a long random token stored with the registration. The token works once for a decision. Without the token the page shows nothing.
- The `list` page needs a separate admin token kept in Secret Manager. Dave keeps the link in his bookmarks. (Adding Google sign-in is possible later; it is more set-up for little gain while Dave is the only reviewer.)
- Spam: a hidden field that people cannot see but form-filling robots fill in, a limit of 5 registrations an hour from one internet address, and length limits on every field. Dave approves by hand anyway, so a spam registration costs him one click on Reject.
- The service never receives anything from the data file.
- CORS (the browser rule about which websites may call a service) allows the Locker Manager site. The app calls from its main process, which CORS does not affect.

### 8.3 Dave's view of registrations

The `list` page gives a table of every registration: number, date, name, school, email, role, status, and when approved. A CSV download lets Dave open it in Excel. This is the answer to "who is using it". If Dave later wants it in a Google Sheet, the CSV pastes straight in.

### 8.4 Running cost

Firebase needs the Blaze (pay-as-you-go) plan to run Cloud Functions, but use at this size stays inside the free allowance. Secret Manager charges about US$0.06 a month per secret; three secrets is about A$0.30 a month. Expect under A$1 a month in total. A budget alert at A$5 a month goes on the project so a surprise is caught early.

### 8.5 If the service is down

Dave can make a key on his Mac with one command, `npm run registration:make-key`, which reads the private key from Secret Manager using his `dave@dandsarmstrong.com` account and prints the key. He can then email it by hand. The same command adds the registration to Firestore so the list stays complete.

## 9. Privacy

The registration form collects a staff member's name, school, email and optional role. That is personal information, so:

- A short collection notice sits on both forms: what is collected, why (to issue a key and to contact the school about Locker Manager), where it is stored (Google Cloud, Sydney), who sees it (Dave Armstrong only), and how to ask for it to be removed (email Dave).
- The README, the website's "Your data stays at school" section and the IT guide add one sentence each: registration sends the staff details above, once, when someone presses Send; the app never sends anything to check a key.
- The IT guide's firewall table gains the registration service's address, marked as needed only for in-app registration.

## 10. Changes to the app's written promises

SPEC.md says, in 1.2, "No cloud service, user accounts or sync server" and "No billing. The app is free for any school". Registration is not an account and not billing, but it is a cloud service. The builder records this as a new decision 30 in CLAUDE.md and adds a short note under SPEC.md 1.2, rather than editing the original wording. The README and website say "free, registration required" from this release.

## 11. Things Dave should know before approving

1. **The check can be removed by anyone who can build the app.** Locker Manager is MIT-licensed and the source is public. A capable person can delete the check and build their own copy. Registration stops ordinary schools using the app without telling Dave. It does not stop someone determined. That is the right level for "make sure it's schools". It is not strong copy protection, and no design that keeps the source public can be.
2. **Charging later and the MIT licence.** Versions already released under MIT stay MIT forever. Dave owns all the code, so he can choose a different licence for future versions if he decides to charge, for example a licence that lets schools read the code but not sell or rebuild it. That decision is not needed now. The key format already has room for plans and expiry dates.
3. **Selling software to schools as a serving principal.** If Dave charges Victorian government schools, the Department of Education's conflict of interest and outside employment policies are likely to apply. Worth checking before any price is set. Free registration raises no such question.
4. **One key works in any copy.** If a school forwards its key to another school, the second school is registered too, and Dave would not hear about it. The key still shows the first school's name in About, so this is easy to spot if it matters. Tying a key to one school's file is possible later. It is left out now because a mismatch would lock out real schools.

## 12. Questions Dave answered (25 October 2026)

1. Grace period: none.
2. Keys are sent from `dave@dandsarmstrong.com`, using a Gmail app password for that account (2-Step Verification must be on and the Workspace admin setting must allow app passwords).
3. The form asks for the school's state, as a drop-down: ACT, NSW, NT, QLD, SA, TAS, VIC, WA, Outside Australia.

## 13. Calls I made (Dave may change any of these)

- One key per school, stored in the data file, rather than per computer.
- Unregistered copies open school files read-only rather than not at all.
- Two-step approval (link, then button) to stop email virus scanners approving by accident.
- Firebase with Gmail app-password email, copying Hunt 1000, rather than a paid email service.
- A separate `registration.key` file for IT, not a field in `managed.json`.
- A key is not tied to one school's file, and a valid key already in a file or on a computer is never replaced (section 6.5).
- "Open a backup…" needs a key, because it changes the school's file.
- No key revocation in this build. A revocation list could later be a small file on the website that the app reads alongside its update check, sending nothing.
- The release that adds registration is 0.13.0. It goes out like every other release: full release, update proof, no pre-release.

## 14. Left to the builder

- Exact screen layout and wording, inside the app's existing style and the Plain English rules in CLAUDE.md.
- The project ID for the new Firebase project (suggested: `locker-manager-reg`), created under `dave@dandsarmstrong.com`.
- Field length limits and rate limit numbers, within section 8.2.
- Test structure, inside the repo's conventions (Vitest unit tests, Playwright end-to-end tests).
