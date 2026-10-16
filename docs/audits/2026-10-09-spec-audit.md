# Spec audit: Locker Manager against SPEC.md

Date: 9 October 2026. Code at commit `ae0f6f8` (main, after the simple-schools merge).
Scope: SPEC.md sections 3 to 12 and every item in section 15, read against `src/`, `tests/` and `docs/`.
Method: two independent read-only passes over each section, merged here. Where the two passes disagreed, the weaker status is used and the reason is noted. The ten top gaps were checked a third time by reading the code lines named. Nothing in the repo was changed.

## Status, 16 October 2026

The ten top gaps below, as of branch `fix/spec-audit-gaps` (from main at v0.11.2). Each fix
has a test that failed before it.

| Gap | Status | Where |
|---|---|---|
| 1. Closing loses unsaved changes | Fixed 9 Oct | commit e5920c6 |
| 2. Spare code can match a live code | Fixed 9 Oct | commit 8eb2c70 |
| 3. Direct printing not recorded first | Fixed 9 Oct | commit 3e1378f |
| 4. History "Put back" skips safety checks | Fixed | `restoreProblem` in `src/main/restoreRecord.ts`; the dialog says why and Put it back is greyed out. Test: `tests/unit/restoreRecord.test.ts` |
| 5. Labels "changed since the last print" | Fixed | Per locker: each printed label's words are remembered (setting `labels.printed`) and compared. Lockers printed before this fall back to their own last label print. Test: `tests/unit/labels.test.ts` |
| 6. Hand-corrected name flagged once, then lost | Fixed | `apply.ts` adds the name check `import_differs`. Test: `tests/unit/import.test.ts` |
| 7. Held lock on 0 0 0 0 has no to-do item | Fixed | Listed under Locks to reset with an Issue a code button (`codes.issue`), and on Home's problems. The printed reset checklist leaves it out, since nothing is done at the lock. Test: `tests/unit/noCodeTasks.test.ts` |
| 8. Demo printouts not marked DEMO | Fixed | Pale diagonal DEMO on every demo label, letter and report page; report footers say DEMO. Test: `tests/unit/demoMark.test.ts` |
| 9. Printout tests weaker than they look | Partly fixed | The label reference image now fails when missing (UPDATE_GOLDEN=1 makes it). Measured label sizes now have a save, read-back and print test. Still open: the label golden image is of the preview, not the PDF, and macOS only; letters have no golden image; the real letter-overflow measurer is only tested with a mock. |
| 10. "More than half the codes" warning wrong before the first set | Fixed | `codes.rules.preview` now reads the file and returns `overHalf`, worked out as Make the code set does. Test: `tests/unit/codesOverHalf.test.ts` |

The "close behind these" list was not part of this pass.

## Status meanings

- **PROVEN**: built, and a named test would fail if it broke.
- **UNTESTED**: built, but no test guards it (short for "IMPLEMENTED, UNTESTED").
- **PARTIAL**: some of it is missing; the note says what.
- **MISSING**: not built, and no CLAUDE.md decision covers it.
- **DECISION**: CLAUDE.md records a deliberate change (decision number given).

## Summary

| Status | Rows |
|---|---|
| PROVEN | 265 |
| UNTESTED | 109 |
| PARTIAL | 86 |
| MISSING | 27 |
| DECISION | 13 |
| **Total** | **500** |

The core of the app is in good shape. The data file safety work (section 6), the code rules (4.6), the import transforms (4.2) and the hard lessons in section 15 are mostly proven by real tests. The weak spots are not in the main happy path. They are in edge paths: closing with unsaved changes, spare codes, printing straight to a printer, and putting back a record from History. These are the paths that hurt a school most when they go wrong.

### Top 10 gaps, ranked by risk to a school

Each gap was confirmed by reading the code lines named.

1. **Data loss: closing can silently throw away unsaved changes.** `close()` (`src/main/file/session.ts:1145-1163`) calls `flush()`, and then always closes the in-memory database. In three cases the changes are never written and no backup is kept:
   - the final save fails (the error is caught at `session.ts:~640` and only raised as a problem);
   - the final save finds that someone else changed the file;
   - a sync-copy comparison is open. `save()` returns early at `session.ts:598` whenever any conflict is set, including `reason: 'copy'`.
   This runs on window close, on quit, before an update installs, and when another file is opened. Only the "conflict already showing" case has a test (session.test > "closing with an unresolved conflict keeps this computer's changes as a backup").
2. **Code leak: a spare code can be a code another student is using right now.** `generateYearSet` removes every current lock code from the list of taken codes (`src/main/repos/codes.ts:419-420`). The spare branch of `nextCodeFor` (`codes.ts:171-176`) never checks the codes in use again. One pass ran a throwaway test on the allocated demo school: 7 of 100 spares matched a live code. A student given such a spare knows a classmate's code. No test covers this.
3. **Code leak with no record: printing straight to a printer.** For letters, the code-reveal log is written only after the printer accepts the job. If that write fails, the only result is a `log.warn` (`src/main/documentService.ts:239-240`). Reports printed straight to a printer do the same (`documentService.ts:~278`). Saving to PDF records first, as decision 15 intends. Direct printing has no test.
4. **Wrong locker or student: History "Put back" skips every safety check.** `restoreRecord` (`src/main/restoreRecord.ts:117-133`) writes the old locker capacity and status, and the old student active flag, with a plain `UPDATE`. No database rule guards those columns; the only triggers on `locker` protect the number. This can leave a student holding an out-of-service locker, a locker over capacity, or a "left" student who still holds a locker.
5. **Wrong printout: labels "changed since the last print" misses lockers.** It measures from the last label print of any kind (`src/main/repos/labels.ts:227-253`). After printing one group or one locker, earlier unprinted changes in other groups drop off the list. It also ignores a student's name, preferred name or group changing, because it only counts history lines for lockers. There is no test. Letters do this correctly, per locker.
6. **Wrong name: a hand-corrected name that disagrees with a later import is flagged once, then lost.** The difference shows only in the import comparison screen (`src/main/import/analyse.ts:252`, `ImportWizard.tsx:616`). `apply.ts:70-90` stores the new spelling without setting `name_check`, so the Students screen and Problems never show it again. This breaks section 15 item 2 ("flag any name that no longer matches the latest import"). No test covers it.
7. **Confusing workflow: a held lock on 0 0 0 0 has no to-do item.** `resetTasks` (`codes.ts:373`) and Problems (`problems.ts:91`) list only `needs_new_code` and `awaiting_physical_reset`. A held locker left on 0 0 0 0 after allocating without "Issue a code now" sits on no to-do list. The Letters screen points staff to "Locks to reset", which does not list it (`LettersScreen.tsx:354`). The only fix is "Issue a new code". That dialog is worded for a leaked code and saves the reason as `compromised`. This breaks section 15 item 3.
8. **Wrong printout: demo printouts are not marked DEMO.** SPEC.md 4.1 says "DEMO" on every screen and printout. Screens have the badge. A search finds no demo check in `src/main/render/`, `src/main/reports/`, `documentService.ts` or `renderService.ts`. A demo letter carrying real-looking codes can be printed and handed out by mistake.
9. **Wrong printout goes uncaught: the printout tests are weaker than they look.**
   - The label golden test compares a screenshot of the on-screen preview, not the PDF. It runs on macOS only, and writes a new reference image instead of failing if the file is missing (`tests/e2e/labels.spec.ts:74-76`).
   - Letters, where the WHS stripe fault happened (section 15 item 10), have no golden image.
   - The real letter-overflow measurer (`pdf.ts`, `overflowingLetters`) is only tested with a mock.
   - Saving and reading back a school's measured label sizes (`repos/labels.ts:28-64`) has no test. Losing the measured 14.0 mm top would print every sheet low with no test failing.
10. **Code safety: the "more than half the codes" warning is wrong before the first set.** The warning counts lockers from the existing year set, which is 0 before the first set is made (`CodesForm.tsx:41, 200`). The server's own `overHalf` result is never shown. A school with short codes can make an easily guessed first set with no warning.

Close behind these:
- Fixed-code padlocks cannot be recorded from any screen. `codes.setFixed` has no caller in the window, yet Recode tells staff to "record the new one".
- A fixed year level typed in import ("Year 8") and a year-level exclusion typed as "Year 12" are not cut down to the plain number the app stores, so they silently match nothing.
- A failed migration or failed backups inside `open()` are not caught after the lock is written (`session.ts:350-361`).
- Release notes are fetched but never shown in the app.
- Ctrl+Z after printing undoes the print record, not the last real change.

## Section 3: Data model

### 3 (general)

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Every table has id, created_at, updated_at, updated_by | UNTESTED | `src/main/db/migrations/001_initial.sql` (every table) | `meta` is a plain key/value table, which is fine. |
| Soft delete with archived_at | PARTIAL | 001: area, bank, locker, student | `assignment` ends rather than archives. |
| Never hard-delete students, lockers or assignments | UNTESTED | no `DELETE FROM student/locker/assignment` in `src/main` | No database rule refuses a delete. |

### 3.1 School and settings

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Name, short name | PROVEN | schema.test > "has a school, one active year, an id and a history entry" | |
| Logo plus mono version | PROVEN | locations.test > "stores a logo and its mono version" | |
| Colours: primary, accent, up to 3 stripes | PROVEN | locations.test > "updates colours and checks they are colours" | |
| Address | UNTESTED | 001 `address`; SchoolForm.tsx | |
| Timezone, locale | PARTIAL | 001 column defaults only | Nothing reads or sets them. |
| Terminology map | PROVEN | locations.test > "keeps terminology, falling back to defaults" | |
| Settings: key/value JSON, versioned, Zod | PROVEN | `src/main/repos/settings.ts`; storage.test > "uses the usual rules until the school changes them" | |

### 3.2 School years

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Label, dates, status (planning, active, archived) | PROVEN | 001:48-57; schema.test | |
| Exactly one active year | PARTIAL | 001:59 unique partial index | A second active year is refused; having none is not. No test tries a second. |
| Assignments belong to a year | PROVEN | `assignments.ts:24`; rollover tests | |
| Code sets belong to a year | PROVEN | rollover.test > "is not used by new students mid-year, and moves to the new year at the rollover" | |
| Imports belong to a year | PARTIAL | `src/main/import/apply.ts:27` | `import_batch.school_year_id` is never filled. |
| Rollover creates the next year | PROVEN | rollover.test > "records students resetting their own locks, then archives the year…" | |

### 3.3 Locations

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Area fields incl. default year levels | UNTESTED | 001:61-72 | |
| Bank fields incl. rows and columns | UNTESTED | 001:74-86 | No floor-plan view (section 16 lists it as future work). |
| Locker number as text with sort key | PROVEN | locations.test > "sort the way people expect", "sort keys order any two numbers consistently (property)" | |
| Row, column, tier | PROVEN | locations.test > "plan a bank of 114 lockers in 3 tiers…" | |
| Capacity, shared lockers | PROVEN | schema.test > "a shared locker takes two" | |
| Accessible flag | PROVEN | allocation.test > "gives accessible lockers to students who need one first" | |
| Status, out-of-service reason and date | PROVEN | locations.test > "out of service needs a reason, and capacity cannot drop below the holders" | |
| QR identifier | PROVEN | e2e history.spec > "a label QR link opens its locker (SPEC.md 5.6)" | |

### 3.4 Locks

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Seven lock types | UNTESTED | 001 CHECK list | |
| Serial, maker, model, dials, positions | PROVEN | codes.test > "handles rotary padlocks with 3 numbers from 0 to 39" | |
| Owned by school or student | PARTIAL | 001:124 | Column only; nothing reads or writes it. |
| Current locker (nullable) | UNTESTED | `lock.locker_id` | |
| Current code encrypted | PROVEN | codes.test > "are encrypted with a key kept in the file, and read back" | |
| Key number | PROVEN | rollover.test > "records key numbers and keys given out and returned" | |
| Master or override code (encrypted) | MISSING | `master_code_cipher` column only | Never read or written. |
| Lock status (in use, spare, lost, broken, retired) | UNTESTED | 001 CHECK | |
| Keys issued, returned, master key group | PARTIAL | `src/main/repos/keys.ts:9-42` | Counts come from key events. No master key group field. |
| code_history with reasons and changed_by | PROVEN | allocation.test > "a compromised code gets a new one and waits for the physical reset…" | |
| key_event | PROVEN | rollover.test > "records key numbers and keys given out and returned" | |
| On 0 0 0 0 as a real state | PROVEN | schema.test > "has a real state for on 0 0 0 0 with no code yet" | |

### 3.5 Students

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| External ID as text, leading zeros kept | PROVEN | import.test > "keeps IDs with leading zeros as text" | |
| Names, year level, group, house | PROVEN | students.test > "adds them with tidied names…" | |
| Gender optional and hidden | UNTESTED | 001 `gender` | |
| Accessible-only needs flag | PROVEN | allocation.test (accessible first) | |
| Email, up to 10 named custom fields | PARTIAL | `student.custom` JSON | No setting names custom fields; only `custom.language` is used. |
| Active, source import, first and last seen | UNTESTED | 001; `apply.ts` | |
| Raw names kept; hand correction never replaced by import | PROVEN | import.test > "lists new, changed, possible leavers… applies only what is ticked" | |
| Missing students stay until confirmed as left | PROVEN | migration 002 `not_in_import_since`; same import test | |

### 3.6 Assignments

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Fields and end reasons | UNTESTED | 001:213-227 | Status `pending` exists but is never used. |
| Database rule: capacity | PROVEN | triggers 001:353-364; schema.test > "a locker cannot hold more current assignments than its capacity", "moving a current assignment into a full locker is refused" | Lowering a locker's capacity is checked only in the repository, and History "Put back" bypasses it (gap 4). |
| Database rule: one current per student unless settings allow | PARTIAL | triggers 001:366-379; schema.test > "a student cannot hold two current lockers unless settings allow it" | `assignStudent` (`assignments.ts:110`) always refuses, and no screen sets `assignments.allowMoreThanOnePerStudent`. |
| Database rule: out of service takes no new assignment | PROVEN | triggers 001:381-389; schema.test > "an out-of-service or reserved locker cannot take a new assignment" | Also blocks reserved lockers for manual assign, which is stricter than SPEC.md 4.3. |

### 3.7 Codes

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| code_set entries: encrypted, status, lock, date, by whom | PROVEN | allocation.test > "commits the draft and issues a unique, valid code to every lock" | |
| Lock type compatibility (length and range) | PARTIAL | `code_length` per entry; range in set `rules` JSON | |
| Generation deterministic from a stored seed, can be regenerated | PARTIAL | `repos/codes.ts:416`; codes.test > "is identical for the same seed…" | Screens always send `seed: null` (`CodesForm.tsx:222`, `RolloverScreen.tsx:357`). There is no regenerate action, and output depends on codes already in the file. No decision covers this. |

### 3.8 Templates and outputs

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| label_template | UNTESTED | `src/main/repos/labels.ts` | |
| letter_template with rich text | DECISION 14 | setting `letters.template` | Built from sections. |
| report_template with configurable columns | MISSING | 001:289 table unused | Reports are fixed in `src/main/reports/build.ts`. |
| print_job audit | PROVEN | letters.test > "brings back a held-back letter under 'changed'…" (per locker, from `print_job.records`) | |

### 3.9 and 3.10 Terminology and history

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| All nine nouns from the map, defaults from WHS | PROVEN | `src/shared/terminology.ts:40-48`; locations.test | Decision 2: labelled as defaults. Quick find breaks the rule (see 4.11). |
| audit_log fields, append-only | PROVEN | triggers 001:343-346; schema.test > "the history cannot be edited or deleted" | |
| code_reveal_log fields | PROVEN | allocation.test > "…showing a code is logged" | |

## Section 4: Workflows

### 4.1 First-run set-up wizard

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Welcome: new, open, demo | PROVEN | `WelcomeScreen.tsx:45-63`; e2e setup.spec, datafile.spec > "the demo school is marked DEMO and has 228 lockers" | |
| Demo marked DEMO on every screen | PROVEN | same e2e test (`demo-badge`) | |
| Demo marked DEMO on every printout | MISSING | no demo check in render, reports or print services | Gap 8. |
| School name | PROVEN | setupSchoolDetails.test | |
| Logo PNG or SVG | UNTESTED | `SchoolForm.tsx:255,262` | Only PNG storage is tested. |
| Mono logo and white-lettering warning | PROVEN | logo.test > "warns about white lettering on a transparent background" | |
| Colours | PROVEN | locations.test > "updates colours…" | |
| Terminology presets or own words | UNTESTED | `src/shared/terminology.ts:51-97` | The test checks storage, not the presets. |
| Areas, banks, lockers in bulk | PROVEN | e2e setup.spec > "set up a school: an area, a bank, 114 lockers in 3 tiers" | Quick start is decision 23 (quickStartLockers.test). |
| Import a locker list from CSV or Excel | MISSING | no rpc method | |
| Lock type per bank | PROVEN | locations.test > "change a bank to keyed padlocks, clearing any code" | |
| Lock type per locker | MISSING | only `locks.setForBank` (`rpc.ts:153`) | |
| Code length and dial range | UNTESTED | `LocksForm.tsx:42-63` | |
| Import lock serials and factory codes | MISSING | `codes.setFixed` has a handler but no caller in the window | |
| Code rules with ten sample codes | UNTESTED | `rulesSummary` `repos/codes.ts:30`; `CodesForm.tsx:146-160` | |
| Label stock and letter template step | PARTIAL | `SetupWizard.tsx:46-60` | One letter template only, no library. |
| Where to save, with explanation | PROVEN | `FileStep.tsx`; e2e setup.spec (`setup-file`) | |
| Done: next-steps checklist | DECISION 20 | Home getting-started list; e2e setup.spec "1 of 5 done" | |

### 4.2 Importing students

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| CSV, any delimiter | PROVEN | import.test > "reads semicolon-separated files" | |
| UTF-8 with BOM | PROVEN | import.test > "reads UTF-8 with a byte-order mark" | |
| Windows-1252 | PROVEN | import.test > "reads Windows-1252 (Excel on Windows), keeping accents" | |
| UTF-16 | PROVEN | import.test > "reads UTF-16 with a byte-order mark" | |
| XLSX | PROVEN | import.test > "reads XLSX, keeping IDs with leading zeros…" | |
| XLS and ODS | PROVEN | import.test > "reads XLS and ODS through SheetJS" | |
| Pasted table | PROVEN | import.test > "reads a table pasted from Excel" | |
| Several files at once | PROVEN | e2e import.spec > "import two Compass exports, check, compare and apply" | |
| First 20 rows shown | UNTESTED | `session.ts:45`, `ImportWizard.tsx:224` | Shows 25. |
| Header row found automatically | PROVEN | import.test > "finds the header row when it is not row 1" | |
| Operator corrects header row | UNTESTED | `ImportWizard.tsx:186-232` | |
| Saved import profiles | PARTIAL | `studentHandlers.ts:123-131` | Remembered by header names. No named profiles to pick. |
| Group mapping saved with the profile | PARTIAL | `studentHandlers.ts:120` | Saved school-wide in `groups.displayMap`. |
| Compass preset | PROVEN | import.test > "recognises Compass by its headers and maps every column" | |
| Sentral, SIMON, Xuno, Synergetic, TASS, CASES21 | PARTIAL | import.test > "maps a synthetic %s export to ID and names" | Only ID and names are checked, not year or group columns. Not confirmed against real exports. |
| Generic preset | PROVEN | import.test > "falls back to matching columns by name" | |
| Preset detected by header names | PROVEN | same tests | |
| Trim, collapse spaces, NFC, keep accents | PARTIAL | `nameCase.ts:31-33`; import.test > "keeps accents…" | Collapsing spaces and NFC are not tested. |
| IDs as text | PROVEN | import.test > "keeps IDs with leading zeros as text" | |
| Mc, O', hyphens | PROVEN | import.test > "fixes capitals, Mc, O' and hyphens by rule" | |
| Mac flagged, not guessed | PROVEN | import.test > "does not guess Mac, and flags it" | |
| Particles, school's choice, flagged | PROVEN | import.test > "flags particles and follows the school's choice" | |
| Two-word surnames flagged | PROVEN | import.test > "flags two-word surnames for a human check" | |
| Group code to display | PROVEN | import.test > "turn export codes into display groups and year levels" | |
| Year level from column, group or file | PARTIAL | same test; `analyse.ts:126-127` | A fixed year typed as "Year 8" is stored as typed, not as "8". |
| Duplicate IDs within and across files | PROVEN | import.test > "skips totals and blank IDs, refuses duplicates within and across files, and spots the wrong year" | |
| Wrong year level in a file | PROVEN | same test; e2e import.spec | |
| Blank names | UNTESTED | `analyse.ts:87-96` | The test row hits blank ID, not blank name. |
| Groups not seen before | UNTESTED | `analyse.ts:313-323` | |
| Totals and footer rows | PROVEN | same test (`footer_row`) | |
| Four lists with ticks | PROVEN | import.test > "lists new, changed, possible leavers… applies only what is ticked" | |
| One transaction with undo point | UNTESTED | `import.apply` is a session write | No test undoes an import. |
| Never removes an assignment | PARTIAL | `apply.ts` never touches `assignment` | Safe by construction; the test checks the student, not the assignment. |
| Possible leavers listed for confirmation | PROVEN | same import test | |

### 4.3 Exclusions and special cases

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Exclude by group (ZZZ) | PROVEN | allocation.test golden > "…ZZZ never" | |
| Exclude by student, with reason | UNTESTED | `students.ts:275-298`; `assignments.ts:214` | |
| Exclude by year level | PARTIAL | same SQL; `StudentsScreen.tsx:466` | "Year 12" typed in silently excludes nobody. Untested. |
| Accessible first | PROVEN | allocation.test > "gives accessible lockers to students who need one first" | |
| Reserved lockers kept out of allocation | PROVEN | schema.test > "an out-of-service or reserved locker cannot take a new assignment" | |

### 4.4 Allocation

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Plan saved and reused | PROVEN | e2e allocate.spec > "a line with its own order… kept for next time" | |
| Students by year level, group | PROVEN | golden allocation test | |
| Students by house or saved filter | MISSING | `AllocationRuleSchema` | |
| Lockers by area, bank | PROVEN | golden test | |
| Lockers by number range | MISSING | `engine.ts:165-170` | |
| Order: group, surname, first name | PROVEN | golden test | |
| Order: surname only, house | UNTESTED | `engine.ts:70-73` | |
| Order: random with seed | PARTIAL | allocation.test > "a random order is the same for the same seed" | No seed field in the window, so "random" is the same order every year. |
| Order: keep last year's locker | PROVEN | allocation.test > "keeps last year's locker where possible" | |
| Lockers by number, bank then number | UNTESTED | `engine.ts:99-104` | Order not asserted. |
| Lockers by column | UNTESTED | `engine.ts:105-114` | |
| Tier preference | PARTIAL | allocation.test > "Year 7 fills middle and bottom first…" | The window offers one fixed tier order. |
| Gap after each group | PROVEN | allocation.test > "leaves spare lockers after each group when asked" | |
| Gap at end of each bank | UNTESTED | `engine.ts:126-136` | |
| Groups sorted last | PROVEN | golden test (HUB last) | |
| Groups sorted first | MISSING | `engine.ts:50-56` | |
| Accessible first | PROVEN | allocation.test | |
| Capacity check lists who misses out | PROVEN | allocation.test > "stops and lists who misses out…" | |
| Capacity options as actions | PARTIAL | `AllocateScreen.tsx:550-562` | Advice text, no buttons. |
| Draft preview by bank, coloured by group | UNTESTED | `AllocateScreen.tsx:308-427` | |
| Drag students between lockers | PARTIAL | `AllocateScreen.tsx:331-347` | Click-to-swap, not drag. Swapping a shared locker into a single one fails the whole commit with "already full". Untested. |
| Commit creates assignments and undo point | PROVEN | allocation.test > "commits the draft and issues a unique, valid code to every lock" | Undo is the generic session undo. |
| Each line its own order | DECISION 21 | allocation.test "each line can have its own order" block | |
| Assign suggests first spare in area | PROVEN | allocation.test > "a new student gets the first spare in their area and a code" | |
| Release flags new code and reset | PROVEN | allocation.test > "a student who leaves frees the locker and puts its lock on the reset list" | |
| Move flags old lock | PROVEN | allocation.test > "a move flags the old lock and gives the new one a code" | |
| Swap moves whole records, both codes | PROVEN | allocation.test > "a swap moves whole records and changes both codes"; e2e allocate.spec | |
| Change group or year, offer to move | PROVEN | e2e student-group.spec > "change a Year 7 student to Year 8 and take the offer…" | |

### 4.5 Lock code operations

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Issue on new holder from set or generated | PROVEN | allocation.test > "commits the draft and issues…" | |
| Recode with reset task | PROVEN | allocation.test > "a compromised code gets a new one and waits for the physical reset…" | |
| Forgotten: reveal, logged | PROVEN | same test; e2e allocate.spec "show-code" | |
| Forgotten: offer to reprint letter | PARTIAL | `LockerActions.tsx:54-55` | No offer after a reveal; the button is just there. |
| Reset done and to-do list | PROVEN | e2e resets.spec > "tick two locks to reset and mark them both at once" | |
| 0 0 0 0 a first-class state | PROVEN | schema.test; e2e setup.spec "no code issued yet" | See 15.3 for the missing to-do. |
| Fixed padlock: recode by swapping and recording serial | MISSING | `codes.ts:253-258` tells staff to record it; `setFixedCode` has no screen | |
| Keyed: issue, return | PROVEN | rollover.test > "records key numbers and keys given out and returned" | |
| Keyed: loss, replacement, charge | UNTESTED | `keys.ts:79-92`; `KeyPanel.tsx` | Only "a charge needs an amount" is checked. |
| Codes locked on read-only computer | DECISION 22 | e2e datafile.spec > "read-only copy says who is editing and why codes and letters are locked…" | |

### 4.6 Code generation rules

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Length 3 to 6 | PROVEN | codes.test property test and rotary test | |
| Range per dial | PARTIAL | `src/shared/codes.ts:7-9` | Always starts at 0. |
| Ban all same, three of one digit | PROVEN | codes.test > "refuses %s (%s)" (1111, 1511) | |
| Ban runs up and down | PROVEN | same (1234, 9876) | |
| Ban repeated and doubled pairs | PROVEN | same (1212, 1122) | |
| Ban years 1900 to 2099 | PROVEN | same (1987, 2026) | 4-dial 0-9 locks only. |
| Ban DDMM and MMDD dates | PARTIAL | codes.test > "refuses birthdays only when that rule is on" | Off by default (`shared/codes.ts:40`); the spec says the defaults are on. |
| Ban one digit from reset | PROVEN | same (1000, 0001) | |
| Ban leading zero | PROVEN | same (0472) | |
| Ban previous code | PROVEN | codes.test > "refuses a lock's own previous code, and the blocklist" | |
| Ban any code in N years | PARTIAL | `repos/codes.ts:113-131` | `historyYears: 0` acts as 1 year. Untested. |
| Custom blocklist | PROVEN | same test | |
| Each rule switchable | PROVEN | codes.test > "every generated code obeys every enabled rule, and a set never repeats" | |
| Unique across school | PARTIAL | allocation.test > "commits the draft and issues a unique…" | Spares can repeat a live code (gap 2). |
| Unique within area, or not required | UNTESTED | `takenCodes` `codes.ts:85-98` | Year sets ignore area (stricter). |
| Year set: one per locker, never last year's | PROVEN | codes.test > "no locker repeats last year's code"; allocation.test > "next year's set never gives a locker the same code again" | |
| Spare pool | PARTIAL | `codes.ts:460-473` | Spares may match live codes. Next year's spares can be spent this year because the reserved list is not checked for spares (`codes.ts:171`). |
| Count of valid codes | PROVEN | codes.test > "counts the codes the WHS-style rules allow" | |
| Warn above half | PARTIAL | `CodesForm.tsx:41, 200` | Wrong before the first set (gap 10). |
| Secure random | PROVEN | codes.test > "is identical for the same seed… and different for the secure source" | |
| Seed only for test sets; regenerate from stored seed | PARTIAL | `code_set.seed` | No regenerate action (see 3.7). |

### 4.7 Labels workflows

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Print all | PROVEN | e2e labels.spec > "labels: a real PDF at exact millimetres…" (228 labels) | |
| Print a group | UNTESTED | `repos/labels.ts:210-217` | |
| Print a bank | UNTESTED | `repos/labels.ts:213-220` | |
| Print selected lockers | PROVEN | labels.spec (fills "1-14", expects 14) | |
| Changed since last print | PARTIAL | `repos/labels.ts:227-253` | Gap 5. |
| Spare-locker labels | UNTESTED | `repos/labels.ts:224` | Reserved lockers print as "Spare locker" when printing all (`labels.ts:263-267`). |
| PDF | PROVEN | labels.spec; page count checked in `renderService.ts:84` | |
| Straight to printer | UNTESTED | `renderService.ts:111`; `pdf.ts:59` | |

### 4.8 Letters

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Locker, code and lock instructions | PROVEN | letters.test > "prints the code in boxes, or dots on screen" | |
| All, group, one student | PROVEN | letters.test > "chooses one group, one student, or the letters changed since the last print" | |
| Bank, chosen lockers | UNTESTED | `repos/letters.ts:246-256` | |
| Codes issued since last print | PROVEN | letters.test > "brings back a held-back letter under 'changed'…" | |
| Never for spare lockers | PROVEN | letters.test > "gives every allocated student a letter and never a spare locker" | |
| Held back while waiting on reset | PROVEN | letters.test > "holds back a letter whose lock needs a new code" | |
| PDF | PROVEN | e2e letters.spec (page count equals letters) | |
| Print directly | PARTIAL | `documentService.ts:224-243` | Reveal recorded after printing (gap 3). No page-count check on this path. Untested. |
| Codes print only in edit mode | DECISION 15, 22 | `documentService.ts:36-42`; e2e datafile.spec | Main-process refusal itself is untested. |

### 4.9 Lists and reports

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Group lists, no codes | PROVEN | reports.test > "group lists: each group on its own page, every current student, no codes" | |
| Master list with codes, CONFIDENTIAL, logged | PROVEN | reports.test > "master list: every code, recorded as revealed, and hidden on screen" | |
| Lockers by bank with spares and out of service | PARTIAL | reports.test > "lockers by bank lists every locker, spares included" | Out-of-service wording not asserted. |
| Locks to reset with tick boxes | PROVEN | reports.test > "locks to reset: a tick list, with the new code only when asked" | Omits held locks on 0 0 0 0 (gap 7). |
| Key register and outstanding keys | UNTESTED | `build.ts:404-457` | Only "builds every report without error". |
| Sign-off sheet | UNTESTED | `build.ts:360-402` | Same. |
| End-of-year reset checklist by group | UNTESTED | `build.ts:528` | Same. |
| Changes since a date | PROVEN | reports.test > "changes since a date lists what happened, oldest first" | |
| Export any list to CSV or XLSX | PARTIAL | reports.test export tests | Reports only. The Students and Lockers screens have no export. |
| Whole file to portable XLSX | PROVEN | portable.test > "round-trips the whole file with codes, pictures and history" | |

### 4.10 Year rollover

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Guided steps, progress kept in file | PROVEN | e2e rollover.spec > "start next year: self-reset, archive, codes, allocate again" | |
| Reversible | PROVEN | e2e checks the named backup exists | Undo of an archive is not tested. |
| Check: everything printed | PARTIAL | `rollover.ts:56-76` | Letters only, not labels. |
| Check: no locks waiting on reset | PARTIAL | `RolloverScreen.tsx:211` | Shows locks on a student's code, not locks already waiting. |
| Check: backups OK | PARTIAL | `RolloverScreen.tsx:216` | A fixed tick saying a backup will be made (it is forced at line 255). Backup health is not checked. |
| Archive: assignments end "year rollover" | PROVEN | rollover.test > "…archives the year with a typed confirmation" | |
| Archived year read-only | PARTIAL | `rollover.ts:213` | Status set; nothing enforces it. |
| Promote students | PROVEN | rollover.test > "moves students up a year level, and the last year level leaves" | |
| Import next year | UNTESTED | `RolloverScreen.tsx:323` (link) | |
| Choose code set | PROVEN | rollover.test > "gives next year codes that differ from last year's…" | |
| Allocate, preview, commit | PROVEN | e2e rollover.spec | |
| Print everything | UNTESTED | `RolloverScreen.tsx:380-387` (links) | |
| Track physical resets | PROVEN | e2e resets.spec | |
| Self-reset guidance and per-group checklist | PARTIAL | rollover.test (recording); e2e self-reset-07A | Printed sheet content untested. |

### 4.11 Search

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Search on every screen | UNTESTED | `App.tsx:248`; `QuickFind.tsx` | |
| Ctrl+K / Cmd+K | UNTESTED | `App.tsx:191-200` | e2e clicks the button only. |
| Name, preferred name | PROVEN | e2e datafile.spec, allocate.spec | No unit test of `quickSearch`. |
| Student ID | UNTESTED | `history.ts:80` | |
| Locker number | PROVEN | e2e history.spec, privacy.spec | |
| Lock serial, key number | UNTESTED | `history.ts:112` | Exact match only. |
| Results show locker, group, status | PARTIAL | `history.ts:88-123` | Raw group code ("07A"); "Year" and "Locker" hard-coded; out-of-service lockers show "Spare". |
| Code behind logged Show code | PROVEN | e2e allocate.spec; allocation.test | |

### 4.12 Undo, history, recovery

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Undo and redo, 50 steps | PROVEN | session.test > "undoes and redoes changes, keeping every history line, up to 50 steps" | |
| Covers every data change | UNTESTED | every write via `session.write` | Prints are undo steps too; Ctrl+Z after a print removes the print record. |
| History: who, what, when | PROVEN | e2e letters.spec, rollover.spec | |
| History filterable | PARTIAL | `HistoryScreen.tsx:14-65` | One text box matching internal action names; no date or person filter. |
| Restore this record | PARTIAL | e2e history.spec > "a locker is put back to how it was before a change" | Students untested; no safety checks (gap 4); looks at 8 backups at most. |
| Restore from backup with preview, old kept | PROVEN | session.test > "previews what a restore undoes, restores, and keeps the current version"; e2e datafile.spec > "a backup can be previewed and restored" | |

## Section 5: Outputs

### 5.1 Label designer

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| L7160, L7161, L7162, L7163, L7165, L7651, 5160, 5163 | PROVEN | labels.test > "every built-in stock fits its page without overlaps" | |
| J8163 | UNTESTED | `stocks.ts:14` | Shares the L7163 entry. |
| Custom stock (page, rows, columns, radius…) | PARTIAL | `repos/labels.ts:47`; `LabelsForm.tsx:36-43` | The screen edits 6 fields of a built-in stock only; it cannot create one. |
| Measured values override published | PARTIAL | labels.test > "measured values override published ones (section 15, item 7)" | Maths proven; saving and reading back untested. |
| "Measure your sheet" helper | UNTESTED | `LabelsForm.tsx:114-158` | |
| Printer nudges, 0.1 mm, per printer | PARTIAL | labels.test > "put each label at exact millimetres, with printer offsets" | Screen untested. |
| Calibration page | PROVEN | labels.test > "draws every label, the clear edge, rulers and a 100 mm bar" | 1 mm ticks not asserted. |
| Safe margin 5 mm | PROVEN | labels.test > "keep every element inside the 5 mm clear edge" | Small stocks use 1.5 mm. |
| Elements: name, number, LOCKER word | PROVEN | labels.test | |
| Elements: logo, area, bank, year, rule, QR, custom text, preferred name | UNTESTED | `labelSheet.ts:56-140` | |
| Move, resize, snap | UNTESTED | `LabelsForm.tsx:324-482` | |
| Auto-fit stages | PROVEN | labels.test > "shrinks a long name…", "wraps to two lines, then flags…" | |
| Spare and out-of-service variants | PROVEN | labels.test > "print spare and out-of-service labels without a name" | |
| Mono uses mono logo | UNTESTED | `labelSheet.ts:65-71` | |
| Start position | PROVEN | labels.test > "start part-way down a used sheet" | |
| Part-used warning | UNTESTED | `PrintLabelsScreen.tsx:186-191` | |
| PDF at exact mm | PROVEN | e2e labels.spec (pdf.js positions, page within 0.15 mm) | |
| "Actual size" instruction | PROVEN | labels.test (calibration text) | Print screen wording untested. |
| Preview with outlines | PARTIAL | e2e golden (macOS) | Gap 9. |

### 5.2 Letter designer

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| A4 or US Letter | UNTESTED | `shared/letters.ts:67` | |
| Rich text, tables | DECISION 14 | sections, no tables | |
| Merge fields | PROVEN | letters.test > "fills merge fields, escapes them…" | |
| Code in boxes | PROVEN | letters.test > "prints the code in boxes, or dots on screen" | |
| Images, coloured panels | PROVEN | letters.test > "keeps pictures in the file…" | |
| WHS layout can be rebuilt | DECISION 2 | `letters/defaultTemplate.ts` | Default, not a named preset. |
| Per lock type sections | PROVEN | letters.test > "shows 'Set your code' only for settable locks and 'Your key' only for keyed ones" | |
| School's own lock images, none shipped | PROVEN | letters.test; `resources/` holds none | |
| Name auto-fit | PROVEN | letters.test > "flags a name too long for the panel" | |
| No footer credits | PROVEN | letters.test > "has no footer, credit or source line, and no wording that dates" | |
| Language per student | PROVEN | letters.test > "uses each student's own language when asked" | |
| Language per print job | UNTESTED | `repos/letters.ts:331` | |
| Wording does not date | PROVEN | same test as credits | |
| One page per student, stop if not | PROVEN | letters.test > "stops at the checking stage and names letters that run onto a second page"; `documentService.ts:207-214` | PDF path only. |
| PDF or print, colour default | PARTIAL | e2e letters.spec (PDF) | Direct print and colour default untested. |

### 5.3 to 5.6 Rendering, reports, exports, QR

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| HTML in mm, printToPDF, zero margins | PROVEN | labels.test checks `@page`; e2e page size | |
| No Word or mail merge | PROVEN | e2e letters.spec reads the app's own PDFs | |
| Embedded Arimo | PARTIAL | labels.test > "measures accented names with the Latin Extended font" | Latin subsets only; Vietnamese or Chinese letters fall back to a system font. |
| Reports: same renderer, landscape | UNTESTED | `render/report.ts` | |
| Repeating table headers | UNTESTED | `report.ts:78` | |
| Page numbers | PARTIAL | `report.ts:100` | Missing when printed straight to a printer (`pdf.ts:116-138`), which also always uses A4. |
| School name, print date | UNTESTED | `report.ts:89-97` | |
| CONFIDENTIAL banner | PROVEN | reports.test (master, Excel cell A1) | CSV marked in the file name only. |
| CSV and XLSX for every list | PARTIAL | reports.test | Reports only. |
| Full portable workbook and its import | PROVEN | portable.test > "round-trips the whole file…" | |
| Codes left out unless asked | PROVEN | portable.test > "leaves codes out unless asked…" | |
| QR off by default | UNTESTED | default layouts have no QR | |
| Short random ID per locker | UNTESTED | `lockerNumbers.ts:92` | |
| QR encodes link; plain-text option | PARTIAL | `qr.ts:16` | Link form only. Untested on a label. |
| Never names or codes in QR | UNTESTED | `prepare.ts:24` passes only the ID | Safe by construction. |
| Scan opens the locker | PROVEN | e2e history.spec > "a label QR link opens its locker (SPEC.md 5.6)" | |

## Section 6: Storage

### 6.1 The data file

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| `.lockers` extension | UNTESTED | `electron-builder.yml:28-32` | |
| Journal mode DELETE | UNTESTED | `db.ts:43` | No test checks the file header. |
| Whole file into memory | PROVEN | readDataFile.test > "reads a good file with its hash" | |
| integrity_check on open | UNTESTED | `session.ts:287-294` | No test opens a damaged file. |
| Schema version check | PROVEN | session.test > "opens a file from a newer version read-only and leaves it alone" | |
| Size, modified time, SHA-256 | PROVEN | readDataFile.test > "reads a good file with its hash" | |
| Save debounced 2 seconds | UNTESTED | `session.ts:539` | The 2000 ms value is never asserted. |
| Save on close | PARTIAL | session.test > "saves unsaved changes on close and releases the lock" | Failure paths lose data (gap 1). |
| Hash check before save | PROVEN | atomicSave.test > "reports a conflict, and writes nothing, when someone else changed the file" | |
| Temp name in same folder | PROVEN | atomicSave.test > "replaces the file and returns the new hash" | |
| Flush to disk | UNTESTED | `fsPort.ts:36` | The crash test kills the process, not the power. |
| Verify by read-back and hash | PROVEN | atomicSave.test > "does not use a temporary file that reads back wrong" | |
| Rename over original | PROVEN | atomicSave.test > "never damages the original, whichever call fails (property test)"; crash.test > "never leaves a torn or empty data file (50 random kills)" | |
| Previous version kept as backup | PROVEN | atomicSave.test > "keeps the previous version through backupPrevious" | Decision 12: save goes ahead if the backup fails. |
| Placeholder detection with plain message | PROVEN | readDataFile.test > "calls a zero-byte or all-zero file empty"; e2e datafile.spec > "a placeholder that has not synced is explained, not opened" | |

### 6.2 to 6.4 Edit lock, sync traps, conflict screen

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Lock file JSON contents | PROVEN | lockFile.test > "is taken when free and names the editor" | |
| Heartbeat 60 s, stale 10 min, fixed | DECISION 18 | `lockFile.ts:20-21` | |
| "Being edited by…" read-only | PROVEN | e2e datafile.spec > "a file held by someone on another computer opens read-only with their name" | |
| Read-only reloads on change | PROVEN | session.test > "the read-only copy reloads when the editor saves" | |
| Stale: takeover with warning, logged | PROVEN | session.test > "offers takeover only after 10 minutes of silence, logs it, and the old editor follows" | The old editor's unsaved changes are backed up with errors swallowed (`session.ts:977-990`). |
| Advisory; hash is the protection | PROVEN | atomicSave conflict tests | |
| Lock removed on close, stale after crash | PROVEN | lockFile.test > "is offered for takeover once the heartbeat is stale, and only then" | |
| Two instances respect the lock | PROVEN | lockFile.test > "is respected while someone else holds it (two instances, one file)" | |
| Conflict copies found and compared | PROVEN | siblings.test > "finds every kind of sync and Finder copy"; e2e > "a sync copy beside the file is found, compared and set aside" | |
| Unique temp names; tidy leftovers over a day | PROVEN | session.test > "tidies temporary files older than a day, and only those" | Temp files inside the backups folder are not tidied. |
| Never write while open in another program | PARTIAL | atomicSave.test > "retries a rename that OneDrive or antivirus briefly blocks" | No detection beforehand. |
| Conflict: differences from both histories | PROVEN | session.test > "stops the save and shows both versions with what each side did" | No e2e of the screen. |
| Conflict: choose per change | PROVEN | session.test > "merge: keeps theirs and adds my chosen changes one by one…" | |
| Conflict: keep one whole, other as dated backup | PROVEN | session.test > "keep mine…", "keep theirs…" | |

### 6.5 and 6.6 Backups and migrations

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Every save backs up beside the file | PROVEN | session.test > "saves a change, keeps the previous version in both backup places" | |
| Keep rules and 500 MB cap, configurable | PROVEN | backups.test > "keeps all of the last 7 days, one a day to 3 months, then one a week", "obeys the size cap…"; storage.test | |
| Local copy in app data folder | PROVEN | same session test | |
| Named backup before migration | UNTESTED | `session.ts:353` | |
| Named backup before rollover | PROVEN | e2e rollover.spec (backup "Before starting…") | Triggered by the window, not by `rollover.archive`. |
| Named backup before restore | PROVEN | session.test > "previews what a restore undoes, restores…" | |
| Backups inherit the folder's permissions | UNTESTED | `backups.ts:23` | True by location. |
| Schema version in file | PROVEN | schema.test > "bring an empty database to the newest schema, with integrity intact" | |
| Forward-only numbered SQL | PROVEN | schema.test > "are numbered 1, 2, 3 with no gaps" | |
| Tested on every earlier version | PROVEN | fixtures.test > "%s opens, migrates to the newest schema and keeps its data" | Newest fixture is written if missing. |
| Newer schema opens read-only | PROVEN | session.test; schema.test > "recognise a file from a newer version and refuse to migrate it" | |
| Lock check, backup, migrate, verify, save | PARTIAL | `session.ts:350-366` | Untested. Failures after the lock is written are not caught. Keep-theirs and backup loads migrate with no named backup. |

## Section 7: Customisation

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| 15 tabs | PARTIAL | `SettingsScreen.tsx:38-50` | 11 tabs. Allocation plans, Imports, Reports and Updates are not tabs. |
| Reset to default on each tab | PARTIAL | Codes, Storage, Labels, Letters, Terms | None on School, Groups, Locks, Privacy, This computer. Untested. |
| Search box | PARTIAL | `SettingsScreen.tsx:51-95` | One box for the whole screen. Untested. |
| School: name, logo, colours, address | UNTESTED | `SchoolForm.tsx` | |
| School: timezone, locale | MISSING | | |
| Terminology | PROVEN | e2e setup.spec | |
| Year levels and groups: mapping, sort last | UNTESTED | `GroupsForm.tsx:12-43` | |
| Year levels list; excluded codes edited here | PARTIAL | `GroupsForm.tsx:48-52` | Exclusions edited on Students. |
| Locations | PROVEN | locations.test; e2e setup.spec | |
| Locks: type per bank, dials | UNTESTED | `LocksForm.tsx` | |
| Locks: master codes, key groups | MISSING | | |
| Codes: rules, uniqueness, sets, pool size | PROVEN | codes.test | |
| Codes: spare warning level | PARTIAL | `problems.ts:107` | Worked out, not set. |
| Allocation plans | PARTIAL | Allocate screen | Not in Settings. |
| Imports: saved profiles | PARTIAL | `import.savedMappings` | Cannot be viewed or deleted. |
| Labels | PROVEN | labels.test; e2e labels.spec | |
| Letters | PROVEN | letters.test; e2e letters.spec | |
| Reports: columns, sort | MISSING | `shared/reports.ts:99-109` | |
| Privacy: PIN before codes | DECISION 16 | privacy.test > "locks codes until the PIN is entered…"; e2e privacy.spec | |
| Privacy: PIN for settings | MISSING | | Decision 16 covers codes only. |
| Privacy: auto-hide after N seconds | UNTESTED | `privacy.ts:18, 131` | |
| Privacy: codes left out of exports unless ticked | PROVEN | portable.test > "leaves codes out unless asked…" | |
| Storage: location, backup policy | PROVEN | storage.test; backups.test | |
| Storage: heartbeat and stale time | DECISION 18 | `StorageForm.tsx:132` | |
| Updates: channel, auto-install | UNTESTED | `ComputerForm.tsx:107-119` | |
| Updates: check frequency | MISSING | `policy.ts:71` fixed at 4 hours | |
| Appearance | PARTIAL | e2e accessibility.spec (light and dark) | Text size and high contrast untested. |
| `.lockersettings` export | PROVEN | settingsFile.test > "carries the set-up to another school with no student data, PIN or codes" | |

## Section 8: Technical design

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Electron, TS strict, React 18+, electron-vite | UNTESTED | `package.json` | Type-check in CI covers strict mode. |
| Radix, Tailwind, Lucide | UNTESTED | `package.json` | |
| Zustand and TanStack Query | MISSING | | Replaced by `useRpc` and `call`. Not a numbered decision; harmless. |
| sql.js in main | PROVEN | schema.test > "keeps foreign keys switched on after export" (decision 13) | |
| Zod for settings, IPC, import | PROVEN | ipc-contract.test | |
| papaparse, exceljs, SheetJS | PROVEN | import.test | |
| printToPDF, qrcode, pdf-lib | UNTESTED | `pdf.ts`; `documentService.ts:209` | |
| chardet and iconv-lite | MISSING | `src/main/import/decode.ts` | Hand-written decoder, well tested; reason in CLAUDE.md Gotchas. |
| i18next | MISSING | | UI text not externalised. |
| electron-log, rotated, no student data | UNTESTED | `index.ts:29` | `fileService.ts:122` logs part of an error message. |
| electron-updater, electron-builder | PROVEN | update-policy.test | |
| contextIsolation, no Node, sandbox | PROVEN | e2e smoke.spec > "the renderer has no Node access" | |
| Strict CSP, no remote content | UNTESTED | `window.ts:19-44, 75` | |
| Typed API from one contract, Zod on every call | PARTIAL | `src/shared/rpc.ts`; `registry.ts:48` | Data calls are generated; about 30 other preload functions are hand-written. |
| Single instance, second file focuses app | UNTESTED | `index.ts:36-55` | |
| Register `.lockers` and `lockermanager://` | PROVEN | e2e history.spec (link opens locker) | File association untested. |
| Repository layout | UNTESTED | | No CHANGELOG.md; handlers in `rpc/` not `ipc/`. |
| Pure core has no Electron imports | UNTESTED | grep | No lint rule enforces it. |
| Open 3,000 and 3,000 in under 2 s | MISSING | | No performance test. |
| Allocate 1,000 in under 1 s | MISSING | | No performance test. |
| 300 letters in under 30 s, progress, cancel | PARTIAL | e2e letters.spec > "Cancel stops the letters…" | Demo school (228), timing not a hard check. |
| AES-256-GCM, key in file | PROVEN | codes.test > "are encrypted with a key kept in the file, and read back" | |
| Passphrase and recovery copy | DECISION 16 | `privacy.ts` | |
| Settings say it is casual protection only | UNTESTED | `PrivacyForm.tsx:41`; `docs/it-guide.md:212` | |
| Operator defaults to OS full name, confirmed once | PARTIAL | e2e datafile.spec > "first run asks who is using the computer, and remembers" | Windows gets the login name (`preferences.ts:105`). |

## Section 9: Updates, builds and releases

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| ci.yml on every push and pull request | PARTIAL | `ci.yml:5-8` | Pushes to `main` and pull requests only. |
| Lint, Prettier, type-check, unit, build | PROVEN | `ci.yml:26-34` | |
| e2e on Windows and Mac | PROVEN | `ci.yml:37-56` | |
| Golden PDF comparison | PARTIAL | `labels.spec.ts:73-80` | Gap 9. |
| release.yml on tag | PROVEN | `release.yml:16-19` | |
| NSIS x64+arm64, universal DMG and ZIP | PROVEN | `electron-builder.yml`; `verify-release-assets.mjs` | Decision 8. |
| Draft release with yml files and blockmaps | PROVEN | `release.yml:43-60` | |
| Final job checks files and versions, publishes | PROVEN | `release.yml:145-203`; version check `release.yml:25-40` | |
| Semver; pre-releases to beta | PROVEN | update-policy.test > "follows the beta channel when the running version is itself a beta" | Decision 5. |
| Public repo, no token | UNTESTED | decision 4 | |
| Signed or unsigned with no code change | UNTESTED | `release.yml:86-142` | Never run with real secrets. |
| Secret names | UNTESTED | `release.yml:11-14, 90-125` | Azure names as per decision 6. |
| Ad-hoc Mac signing | UNTESTED | `release.yml:104` | Proven in practice by released builds. |
| Unsigned Mac: notify and open download page | PROVEN | update-policy.test > "only notifies on an unsigned Mac" | |
| Detect signing at runtime | PROVEN | update-policy.test (isDeveloperIdSigned) | |
| "Run anyway" and "Open Anyway" steps | PARTIAL | `.github/release-notes-template.md:17-24`; user guide | README only links to Releases. |
| Check 30 s after launch, then every 4 h | UNTESTED | `policy.ts:70-71` | |
| Manual check in Help | PROVEN | e2e smoke.spec > "a manual update check in a development build reports plainly" | |
| Background download, restart prompt | UNTESTED | `UpdateBanner.tsx` | |
| Never restart during save, print, import, unsaved | PROVEN | update-policy.test (installBlockedReason, whileBusy) | |
| Release notes shown in app | MISSING | `updater.ts:103-121` | Fetched, never shown. |
| Staged rollout | DECISION 19 | `rollout.yml` | |
| Stable and beta channels | UNTESTED | `updater.ts:36` | |
| Save, close, release lock before install | PARTIAL | `updater.ts:170-193` | Relies on `close()`, which can lose changes (gap 1). |
| Migrations only with a backup | PARTIAL | `session.ts:350-361` | Backup step untested. |
| Recovery screen after two failed starts | UNTESTED | `recovery.ts` | |
| Updater sends no school data | UNTESTED | `updater.ts` | |
| System proxy | UNTESTED | it-guide.md:60 | |
| Tested behind authenticating proxy | MISSING | | Not even on the release checklist. |
| Failed check quiet unless asked | UNTESTED | `updater.ts:127-131` | |
| Per-user install by default | UNTESTED | `electron-builder.yml` `perMachine: false` | |
| Silent `/S /allusers` | UNTESTED | it-guide.md:21; release checklist | |
| managed.json | PROVEN | privacy.test > "reads the known keys and refuses anything else" | No registry option (spec says "or"). |
| Managed: auto-update off, fixed channel, data path, no demo | UNTESTED | `computerService.ts:27-39`; `WelcomeScreen.tsx:66`; `fileService.ts:244` | |
| Managed: require PIN | PROVEN | privacy.test > "a managed PIN requirement blocks codes until a PIN is set…" | |
| "Set by your IT team" lock in UI | UNTESTED | `ComputerForm.tsx:29`; `PrivacyForm.tsx:45` | |
| IT guide | UNTESTED | `docs/it-guide.md` | Present and complete. |

## Section 10: User experience

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Home "What do you want to do?" with 9 tasks | UNTESTED | `TaskGrid.tsx:16-24` | |
| Tasks driven by e2e: New student, Student has left, Move or swap, Import, Start next year | PROVEN | add-student.spec, allocate.spec, resets.spec, import.spec, rollover.spec | |
| Tasks not driven from Home: Find, New code, Print labels, Print letters | PARTIAL | | Reached by other buttons in e2e; New code is unit-tested only. |
| Status: lockers in use per area | MISSING | `HomeScreen.tsx:101-106` | Whole-school totals only. |
| Status: spares | PARTIAL | low-spares problem only | |
| Status: codes waiting on reset | PROVEN | e2e resets.spec | |
| Status: problems | PROVEN | e2e privacy.spec (`problem-no-locker`) | |
| Status: last backup | PARTIAL | `StatusBar.tsx:51` | Hidden in narrow windows and at large text. |
| Problems: duplicate codes | UNTESTED | `problems.ts:23-45` | Fix opens Lockers without naming the locks. |
| Problems: students without lockers | PROVEN | e2e privacy.spec | |
| Problems: possible leavers, names to check, low spares | UNTESTED | `problems.ts:72-115` | No unit test of `problems.ts`. |
| Problems: locks waiting on reset | PARTIAL | `problems.ts:93-100` | No Fix button; omits held locks on 0 0 0 0. |
| Problems: conflicting copies | PARTIAL | `HomeScreen.tsx:160-185` | A banner, not in the panel; logic tested. |
| Plain summary before destructive actions | PARTIAL | rollover, allocate, import | Not consistent everywhere. |
| Typed confirmation for rollover | PROVEN | e2e rollover.spec (`rollover-confirm`) | |
| Guide in app | PROVEN | markdown.test > "reads the whole user guide into sections" | |
| Guide searchable | UNTESTED | `HelpScreen.tsx:157-164` | |
| Show me | PROVEN | markdown.test > "links every screen and Show me button to a section that exists"; e2e history.spec | |
| Tooltips on every control | PARTIAL | about 65 `title=` against 277 buttons | |
| No icon without text label | UNTESTED | NavRail, TaskGrid | |
| Keyboard: Ctrl+K, Ctrl+Z, visible focus | UNTESTED | `App.tsx:191-214`; `styles.css:156` | |
| WCAG 2.1 AA, screen-reader labels | PROVEN | e2e accessibility.spec > "every main screen passes the automatic WCAG 2.1 AA checks" | |
| Text size, 200% zoom | PARTIAL | `computer.ts` | No test at 200%; hand check in release checklist. |
| Demo school | PROVEN | demo.test; e2e datafile.spec | Not marked on printouts (gap 8). |
| Practice copy cannot be saved back | PARTIAL | e2e privacy.spec > "…practice copies never touch the real file" | One pass found the test checks badges only. |
| Dates as 6 Oct 2026 | UNTESTED | `lib/format.ts:5` | |

## Section 11: Privacy and security

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Data stays local; no telemetry | UNTESTED | no network code except the updater | |
| Opt-in crash reports with no student data | MISSING | | Acceptable: nothing is sent at all. |
| Codes hidden; reveal logged | PROVEN | reports.test > "master list… hidden on screen"; letters.test > "renders the preview of one letter with every code hidden" | Direct printing records late (gap 3). |
| Optional PIN | DECISION 16 | privacy.test; e2e privacy.spec | |
| Code exports need a tick, marked CONFIDENTIAL | PROVEN | reports.test > "exports Excel with the CONFIDENTIAL line…" | |
| Logs never contain names or codes | UNTESTED | log calls checked by hand | `fileService.ts:122` logs part of an error message. |
| Synthetic data only; .gitignore; pre-commit check | PROVEN | `scripts/check-no-student-data.mjs`; `ci.yml:26-28` | |
| README states what is stored and where | UNTESTED | `README.md:41-55` | Present. |

## Section 12: Testing and quality

| Requirement | Status | Evidence | Note |
|---|---|---|---|
| Unit tests for pure functions | PROVEN | tests/unit | |
| 90% coverage of allocate, codes, import | MISSING | `vitest.config.ts` | No thresholds, no coverage package, not in CI. |
| Property: codes obey rules, sets unique | PROVEN | codes.test > "every generated code obeys every enabled rule, and a set never repeats" | |
| Property: no locker repeats last year's code | PROVEN | codes.test > "no locker repeats last year's code" | |
| Golden allocation | PROVEN | allocation.test > "fills Year 7 into 1 to 114 and Year 8 into 115 to 228…" (snapshot) | |
| Golden labels: rasterised PDF against PNG | PARTIAL | `labels.spec.ts:73-80` | Gap 9. |
| Labels: mm positions from the PDF | PROVEN | `labels.spec.ts:109` | |
| Letters: page count equals record count | PROVEN | e2e letters.spec | |
| Letters: no text outside the page | PARTIAL | letters.test (mocked measurer) | Real measurer untested. |
| Import: every preset with sample | PARTIAL | import.test > "maps a synthetic %s export…" | Headers only for non-Compass presets. |
| Import: BOM, 1252, semicolons, header row | PROVEN | import.test | |
| Import: totals, capitals, zeros, wrong year | PROVEN | import.test | |
| File safety: two instances | PROVEN | lockFile.test; e2e datafile.spec > "two copies of the app on one file…" | |
| File safety: changed on disk | PROVEN | session.test > "the heartbeat notices a change on disk before any save" | |
| File safety: zero-byte placeholder | PROVEN | readDataFile.test; e2e datafile.spec | |
| File safety: conflict copies | PROVEN | siblings.test | |
| File safety: crash during save | PROVEN | crash.test > "never leaves a torn or empty data file (50 random kills)" | |
| File safety: migration from every version | PROVEN | fixtures.test | |
| File safety: failed save at close | MISSING | | Gap 1; not in the spec's list, but the obvious next case. |
| e2e of each home task | PARTIAL | see section 10 | 4 of 9 not driven from Home. |
| Release checklist with real laser print | PROVEN | `docs/release-checklist.md:59` | Exists as a document. |

## Section 15: Lessons from the real WHS deployment

| Item | Requirement | Status | Evidence | Note |
|---|---|---|---|---|
| 1 | Locker number not editable in normal use | PROVEN | trigger `locker_number_fixed` (001:394); schema.test > "cannot be typed over", "can change only inside the Renumber tool" | |
| 1 | Renumber is separate, needs a reason, refuses a used number | PROVEN | locations.test > "renumber only through the Renumber tool, and never onto another locker" | |
| 1 | Moving is a separate action | PROVEN | allocation.test > "a move flags the old lock and gives the new one a code" | |
| 2 | No name on locker or assignment; link by ID | PROVEN | 001 `assignment` has no name column | |
| 2 | Swap moves whole records | PROVEN | allocation.test > "a swap moves whole records and changes both codes (SPEC.md section 15, item 2)" | |
| 2 | Flag a name that no longer matches the import | PARTIAL | `analyse.ts:249-256`; `apply.ts:70-90` | Gap 6. |
| 3 | 0 0 0 0 has its own status | PROVEN | schema.test > "has a real state for on 0 0 0 0 with no code yet" | |
| 3 | A to-do item | MISSING | `codes.ts:373`; `problems.ts:91` | Gap 7. |
| 3 | A letter once a code is issued | PROVEN | letters.test > "brings back a held-back letter under 'changed' once its lock is sorted out" | |
| 4 | Mc, O', hyphens automatic | PROVEN | import.test > "fixes capitals, Mc, O' and hyphens by rule" | |
| 4 | Mac, particles, two-word flagged | PROVEN | import.test > "does not guess Mac, and flags it", "flags particles…", "flags two-word surnames…" | |
| 5 | Year level checked per file | PROVEN | import.test > "…spots the wrong year" | Needs a year column or group code to compare. |
| 5 | Match by ID, not name | PROVEN | students.test > "a later import matches them by student ID, not as a new student" | Decision 24. |
| 6 | Exclusion by group with reason | PROVEN | allocation.test golden ("ZZZ never") | |
| 6 | Exclusion by individual with reason | UNTESTED | `students.ts:275`; `assignments.ts:214` | |
| 7 | Measured overrides published | PARTIAL | labels.test > "measured values override published ones (section 15, item 7)" | Saving untested (gap 9). |
| 7 | Calibration page | PROVEN | labels.test > "draws every label, the clear edge, rulers and a 100 mm bar" | |
| 8 | Real glyph widths | PROVEN | labels.test > "measures real widths: a W is wider than an i" | Kerning ignored. |
| 9 | Own PDFs, no mail merge | PROVEN | e2e labels.spec, letters.spec | |
| 10 | CSS in mm | PROVEN | labels.test > "put each label at exact millimetres, with printer offsets" | |
| 10 | Visual golden test in CI | PARTIAL | `labels.spec.ts:74-82` | Labels only, macOS only, writes if missing (gap 9). |
| 11 | Placeholder detection | PROVEN | session.test > "explains an unsynced placeholder instead of opening it" | |
| 11 | Unique temp names | UNTESTED | `fileService.ts:95` (`randomBytes(6)`) | Tests inject the suffix. |
| 11 | Tidy leftovers over a day | PROVEN | session.test > "tidies temporary files older than a day, and only those" | |
| 11 | Cloud copy and wrong-copy detection | PROVEN | siblings.test > "warns about Downloads, temporary folders and email attachments" | |
| 12 | Mono logo | PROVEN | logo.test > "turns a transparent logo into a black silhouette" | Use on labels untested. |
| 12 | Light-on-transparent warning | PROVEN | logo.test > "warns about white lettering on a transparent background" | Screen text untested. |
| 13 | No credits on letters | PROVEN | letters.test > "has no footer, credit or source line, and no wording that dates" | |
| 14 | Wording does not date | PROVEN | same test; default text read by hand | |
| 15 | Self-reset recorded by group | PROVEN | rollover.test > "records students resetting their own locks…" | |
| 15 | Printed per-group checklist | UNTESTED | `reports/build.ts:528` | Content not checked. |
| 16 | Part-used sheet warning | UNTESTED | `PrintLabelsScreen.tsx:186-191` | The field hint "Use a later one for a part-used sheet" (line 171) leans towards encouraging it. |
| 17 | Edit lock | PROVEN | lockFile.test > "is respected while someone else holds it (two instances, one file)" | |
| 17 | Hash check before save | PROVEN | atomicSave.test > "reports a conflict, and writes nothing…" | |
| 18 | Not one digit from 0000, not all same, on by default | PROVEN | codes.test > "refuses %s (%s)" run on `DEFAULT_CODE_RULES` | |
