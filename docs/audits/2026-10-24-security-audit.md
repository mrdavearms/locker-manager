# Security audit, 24 October 2026

_Reviewed at commit `8b4f14a` (v0.12.1, main) with the security-audit skill, quick profile. The
full run (coverage ledger, findings, reports) is kept outside the repository. This file records
what was found and what was done._

## How it was done

- 4 mapping agents, 9 hunters, 1 coverage critic and 7 independent checkers read the source.
  The audit itself ran no code: no sandbox on this Mac enforced every control the method needs.
- Every lead was then turned into a unit test. Each one was run against the code as it was
  before the fix (to show the problem is real) and after it.
- Scope: src/main, src/preload, src/shared, src/renderer, electron-builder.yml, the update
  code and the release workflows and scripts. Not hunted (quick profile): the edit lock and
  save hash check, who can write IT's `managed.json`, and the rest of the repository.

## Leads and status

| # | Lead | Shown by | Status |
|---|---|---|---|
| 1 | Updates are trusted on the GitHub release's word alone: unsigned Mac self-install checks a hash from the same release and an ad-hoc signature anyone can make; Windows has no `publisherName`. Repeats 9 Oct H1, and widens it to the Mac. | Source; not reproduced (needs a packaged build) | **Open, needs Dave.** IT guide now says both platforms trust GitHub alone. |
| 2 | Triggers planted in the shared data file were kept and ran inside every later change, by every staff member, and went into backups. | Test fails on old code (`file changed outside the app`) | Fixed: `repairSchemaObjects` on open and reload |
| 3 | Restoring a backup put back the PIN state from when it was made (a pre-PIN backup removed the PIN) and dropped later history and code-reveal lines. "Open a backup…" did the same. | Test fails on old code (`a restore keeps the current PIN`) | Fixed: `carryForward.ts` on both routes |
| 4 | Change PIN checked the current PIN with no wrong-try limit, so it worked as a PIN-guessing route. Related to 9 Oct M3 (still open) but a different cause. | Test fails on old code | Fixed: one limit for both checks |
| 5 | School colours read from the file or a portable workbook went unchecked into the letter style sheet, so markup could be added to letters. Sibling of 9 Oct M1. | Test fails on old code | Fixed: colours checked when read |
| 6 | Signing secrets would reach the build job, which runs the tagged commit's npm packages before the `release` approval. Repeats the unfixed part of 9 Oct M2. | Source; no secrets exist yet | **Open, needs Dave before signing is added** |
| 7 | A file of under 1 KB declaring a huge sheet ran the main process out of memory before the 20,000-row cap. Repeats 9 Oct L6 (only byte caps had been added). | Old parser: heap out of memory at 1 GB | Fixed: rows and columns limited while parsing |
| - | A compressed backup could unzip without limit (raised by a hunter, not hunted). | Test | Fixed: 512 MB limit |
| - | An installed copy loaded its window from `ELECTRON_RENDERER_URL`. | Source | Fixed |

## Still open from earlier reviews

- 9 Oct H1 (lead 1), M3 (PIN counter resets on restart, 4-digit PINs), L5 (Mac entitlements),
  L9 (Electron fuses), N6 (no IPC sender check). All need either signing or Dave's decision.
- Hardening noted and not done: `renderRequestAllowed` allows any `file:` URL in the hidden
  print windows; the main window has no subframe navigation guard; `check-no-student-data`
  misses some file types (.tsv, .xlsm, .docx, .db, .sqlite, .zip) and matches SYNTHETIC
  anywhere in the path; the portable export without codes still carries the PIN hash.
