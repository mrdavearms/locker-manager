# Large-school performance audit, 9 October 2026

Locker Manager 0.10.0 (main at `ae0f6f8`), measured against a SYNTHETIC school of
about 2,000 students and 2,500 lockers with five years of history. Every existing
test uses the 228-locker demo school; this is the first look at a big one.


## Status, 18 October 2026

| Finding | Status |
|---|---|
| Backups reach back only hours | Fixed: compressed backups (78610c7) and staged thinning (b6288b4) |
| Index on `code_set_entry (locker_id, status)` | Fixed: migration 004 (358c426) |
| Three copies written per save | Improved to about 1.7 times the file; needs a real network-share test |
| Undo depth and memory | Open: a design choice (snapshots against a change journal) |
| Allocation with codes but no code set | Fixed 24 Oct 2026: a whole allocation reads the codes in use once (`inCodeBatch`) |
| Whole-file export and rebuild are slow with no progress text | Open |
| PDF timings | Not measured: needs `pdf.cjs` run on a school Windows laptop |
| File growth | By design: history is append-only |

## Summary

- **Day-to-day work stays quick.** Opening the file, a routine change (move a student),
  saving, undo, every list screen, imports, reports and the allocation draft all take
  well under a second on the test Mac. On a typical school Windows laptop (three to five
  times slower) they should still be about a second or less.
- **The file gets big and keeps growing.** Five years of use gives a 23.6 MB file. It grows
  by about 4.2 MB a year and never shrinks (twelve years: 53.6 MB). Nothing broke along the
  way, and the code rules never ran out of codes in twelve simulated years.
- **Backups stop reaching back far enough.** Backups have a 500 MB limit per folder. At
  23.6 MB a file, that holds about 21 backups. With 30 saves a school day, the oldest
  backup is only about 4 hours old. The promise of "every save for 7 days, then one a day"
  quietly becomes "this morning only". This is the most important finding.
- **Undo gets shallow and memory-hungry.** One undo step is a full copy of the file
  (22.6 MB), so the 200 MB limit allows 8 steps, not 50, and those steps use about 190 MB
  of memory.
- **Three jobs are slow enough for staff to notice:** giving out lockers with codes when no
  code set was made first (about 5 seconds on the Mac, up to about 25 seconds on Windows),
  the whole-file Excel export (about 7 seconds on the Mac, one run took 23), and
  rebuilding a file from that export (28 to 50 seconds on the Mac).
- **No crashes and no wrong results.** 3,421 simulated moves, releases and new lockers
  across five years, five imports, five allocations and four year rollovers all ran
  without one refused change.
- **Not measured: making the PDFs.** Printing labels, letters and reports needs Chromium
  (Electron's print-to-PDF). It could not run inside this session's sandbox, so the table
  gives the time to build the HTML and its size. A script to time the PDFs is ready to run
  by hand (see Method).

## Machine

Apple M3, 16 GB memory, macOS, Node 22.21.1, internal SSD. School Windows laptops are
typically **three to five times slower** than this, and a shared network or OneDrive
folder is far slower than an internal SSD for the save and backup steps. Read every time
below with that in mind.

## The test school

| Item | Size after five years |
| --- | --- |
| Students in the file (current and past) | 3,532 (about 2,000 current, 333 or 334 per year level, Years 7 to 12) |
| Areas, banks, lockers | 3 areas, 22 banks of up to 120, 2,500 lockers |
| Locks | 2,380 four-dial combination locks, 120 keyed padlocks |
| Assignments (current and past) | 12,552 |
| Code history lines | 11,790 |
| Code set entries | 12,400 (one 2,380-code set and 100 spares each year) |
| Code reveal records | 10,357 (letters printed for everyone each year) |
| History lines | 3,548 (about 690 routine changes a year, plus imports, allocations, rollovers) |
| File size | 23.6 MB |

## Results

Median of 5 runs (3 for the slow ones). "Mac" is the measured time; the Windows column is
the Mac time multiplied by 3 to 5, an estimate, not a measurement.

| Operation | Size | Median time (Mac) | Estimate on Windows | Verdict |
| --- | --- | --- | --- | --- |
| Open the file (read, load, integrity check, edit lock) | 22.5 MB | 153 ms | 0.5 to 0.8 s | Fine |
| of which: integrity check | 22.5 MB | 132 ms | | Fine |
| Routine change: move one student (before saving) | 1 change | 26 ms | 0.1 s | Fine |
| Save after a change, with both backups and tidy-up | 22.5 MB, 3 copies written | 207 ms | 0.6 to 1 s on a local disk; more on a network share | Borderline on a shared folder |
| Save without backups (export and safe write) | 22.5 MB | 102 ms | 0.3 to 0.5 s | Fine |
| One backup into a folder near its 500 MB limit | 22.5 MB | 72 ms (first run 626 ms) | | Fine |
| Undo one change | 22.5 MB snapshot | 103 ms | 0.3 to 0.5 s | Fine |
| File state sent to the window after each change | whole file | 1.4 ms | | Fine |
| Students screen | 1,997 students | 39 ms | 0.2 s | Fine |
| Lockers screen | 2,500 lockers | 34 ms | 0.2 s | Fine |
| History screen, first 200 lines / search | 3,548 lines | 1.2 ms / 5.5 ms | | Fine |
| Quick find (Ctrl+K) | 3,532 students | 6.4 ms | | Fine |
| Problems panel | whole file | 70 ms | 0.2 to 0.35 s | Fine |
| Rollover status (Home) | whole file | 54 ms | 0.2 to 0.3 s | Fine |
| Suggest a locker for one student | 2,500 lockers | 37 ms | 0.2 s | Fine |
| Letters "changed since last print" list | 370 letters | 47 ms | 0.2 s | Fine |
| Allocation engine alone | 1,997 students, 2,500 lockers | 3 ms | | Fine |
| Allocation draft (read file and run engine) | 1,997 placed | 46 ms | 0.2 s | Fine |
| Give out lockers with codes, after making a code set | 1,997 assignments | 648 ms | 2 to 3 s | Fine for a once-a-year job |
| Give out lockers with codes, no code set made first | 1,997 assignments | 5,534 ms | 17 to 28 s | **Slow**, and the window waits |
| Import: read CSV | 2,009 rows, 102 KB | 1.6 ms | | Fine |
| Import: check students | 2,009 rows | 7.3 ms | | Fine |
| Import: compare with the file | 100 new, 210 changed, 208 leavers | 31 ms | 0.1 s | Fine |
| Import: apply (compares again, then writes) | as above | 63 ms | 0.2 to 0.3 s | Fine |
| Letters: build HTML for everyone (whole and in 25-letter chunks) | 1,972 letters, 3.6 MB HTML, 79 chunks | 535 ms | 1.6 to 2.7 s, plus PDF time (not measured) | Fine before PDF |
| Letters screen: preview one letter | builds the whole set first | 38 ms | 0.2 s | Fine |
| Labels: build HTML for every locker | 2,500 labels, 1.8 MB HTML | 904 ms | 2.7 to 4.5 s, plus PDF time (not measured) | Fine before PDF |
| Report: group lists | 1,997 rows, 0.4 MB HTML | 64 ms | | Fine |
| Report: master list with codes | 1,997 rows, 0.4 MB HTML | 39 ms | | Fine |
| Report: lockers by bank | 2,500 rows, 0.4 MB HTML | 50 ms | | Fine |
| Report: locks to reset | 474 rows, 0.2 MB HTML | 4 ms | | Fine |
| Report: self-reset record | 1,877 rows, 0.4 MB HTML | 51 ms | | Fine |
| Report: sign-off sheets | 1,997 rows, 0.4 MB HTML | 50 ms | | Fine |
| Report: key register | 120 rows, 0.2 MB HTML | 25 ms | | Fine |
| Report: changes since 1 Jan 2022 | 3,548 rows, 0.6 MB HTML | 174 ms | 0.5 to 0.9 s | Fine |
| Report: master list as CSV / Excel | 1,997 rows | 4 ms / 68 ms | | Fine |
| Whole-file Excel export, with codes | 4.4 MB XLSX | 6,836 ms (runs: 4.2 s, 6.8 s, 23.5 s) | 20 to 35 s, worse on a bad run | **Slow** |
| Rebuild a file from that Excel export | 4.4 MB XLSX | 30,090 ms (runs: 50 s, 30 s, 28 s) | 1.5 to 4 minutes | **Slow**, but rare (disaster recovery) |

Growth and memory:

| Item | Measured | Verdict |
| --- | --- | --- |
| File size by year (five-year run) | 6.8, 10.9, 15.2, 19.5, 23.6 MB | **Grows without limit**, about 4.2 MB a year |
| File size after twelve years (projection run) | 53.6 MB | **Grows without limit** |
| One undo snapshot | 22.6 MB | |
| Undo steps that fit under the 200 MB limit | 8 (50 promised) | **Shallow**; about 3 at 53 MB |
| Memory held by undo after 55 changes | 190 MB; whole test process went from 0.66 GB to 1.09 GB | **Heavy** on an 8 GB school laptop |
| Backups per folder at the 500 MB limit | 21 copies, 496 MB, in each of two folders (1 GB in all) | Bounded, but large |
| How far back backups reach (30 saves a day) | 4 hours at 23.6 MB; 2 days at 6.8 MB; 67 days at 0.3 MB (demo) | **Breaks the 7-day and 92-day promise** |
| Giving out lockers with a fresh code set, by year | 0.5 s (year 1) rising to 5.4 s (year 12) | **Grows with history** |

## Findings

### 1. Backups only reach back a few hours for a large school (important)

`planPrune` in `src/main/file/backups.ts` keeps every backup for 7 days and one a day for
92 days, then enforces the 500 MB limit (`DEFAULT_POLICY.maxBytes`) by thinning, then by
deleting the oldest. A 23.6 MB file fills 500 MB with 21 backups. In a simulated term with
30 saves a school day (one every 12 minutes of a 6-hour working day), the oldest backup
kept was 4 hours old. A mistake noticed the next morning, or a bad import found a week
later, cannot be undone from a backup. Named backups (before an update, before the
rollover) are deleted too once unnamed ones run out. Nothing tells the operator this is
happening.

Reproduce: `backups.perf.ts` (see Method), output in `out/backups.json`.

Ideas for Dave to choose from, not done: raise or scale the limit with file size; keep the
daily and weekly copies ahead of the recent ones when the limit bites; warn in Settings,
Storage when the limit means backups cover less than a day.

### 2. Every save writes the whole file three times

Each save writes the data file, a backup of the previous version beside it, and a second
backup on this computer: 70 MB of writing for a 23.6 MB file. The test Mac does this in
about 0.2 seconds. On a school network share or a OneDrive folder, two of those three
copies go over the network, so 30 saves a day is about 1.4 GB a day sent to the shared
folder. This was not measured (no network share here); it is arithmetic from the file
size. On a slow share a save could take several seconds, and sync clients may struggle.

### 3. Undo keeps whole copies of the file in memory

`DataFileSession.write` exports the whole database before every change, and
`pushUndo` keeps up to 50 copies or 200 MB (`UNDO_STEPS`, `UNDO_BYTES` in
`src/main/file/session.ts`). At 22.6 MB per copy only 8 steps fit, and they hold 190 MB.
At twelve years (53 MB) only 3 steps fit. The export itself is quick (3 ms), so this is
about memory and depth, not speed. The undo step also copies every history and reveal
line into the snapshot (`stepBack`), which is why one undo takes about 100 ms; that grows
with history but is still fine.

### 4. Giving out lockers is slow without a code set, and slows with age

With a fresh year code set, giving out 1,997 lockers with codes took 0.65 seconds. Without
one, it took 4.3 to 5.5 seconds, because each code falls back to `generateCodes` with
`takenCodes`, which decrypts about 3,300 codes every time (11 ms each, 1,997 times). On
Windows that is up to about 25 seconds in one write, with the window waiting.

Even with a code set, the time grows each year (0.5 s in year 1, 2.5 s in year 5 and 5.4 s
in year 12 in the build runs). The SQL timing in `sqlprofile.perf.ts` shows why: the look-up
of the locker's entry in this year's set (`nextCodeFor` in `src/main/repos/codes.ts`,
`... FROM code_set_entry e JOIN code_set s ... AND e.locker_id = $l AND e.status = 'available'`)
has no index on `code_set_entry.locker_id`, so it reads through entries from every year. It
took 1.5 ms a call at five years and 2.7 ms at twelve. An index on
`code_set_entry (locker_id, status)` would very likely fix this; not tried, as this audit
changes no code.

Old-year code set entries that were never used stay `available` for ever (942 after five
years) and count as taken in `takenCodes`. In twelve simulated years this never caused a
"too few codes" refusal (8,298 valid four-digit codes under the default rules), so it is
noted, not flagged.

### 5. Whole-file Excel export and rebuild are slow

The export (`exportWorkbook` in `src/main/portable/workbook.ts`) took a median of 6.8
seconds and one run took 23.5 seconds; rebuilding a file from it took 28 to 50 seconds. On
Windows the export could pass 30 seconds. Both are rare jobs, but the window should show
that something is happening. The 23.5-second run looks like memory pressure (garbage
collection) rather than steady cost.

### 6. Print jobs: HTML is quick, PDF is unknown

Building all 1,972 letters takes 0.5 seconds (3.6 MB of HTML in 79 chunks) and all 2,500
labels 0.9 seconds (1.8 MB). The real job then opens a hidden Chromium window per letter
chunk twice (fit check, then PDF) and one window for the whole label set. Those PDF steps
are likely to be the bulk of the time and were not measured; see Method for the script.
Printing (not saving as PDF) loads all 1,972 letters into one window at once
(`printHtml`), which deserves a check on a Windows laptop.

### 7. The file grows without limit

About 4.2 MB a year at this size, mostly assignments, code history, code set entries and
code reveal records, each about 300 bytes with its indexes (UUID keys and timestamps).
History is append-only by design (SPEC.md), so this is expected, but it drives findings 1
to 3. Students who left stay in the file (3,532 rows after five years for 2,000 current).

### 8. Small limits noticed on the way

Not problems for this school, but a very large one could meet them: quick start makes at
most 2,000 lockers at once (`rpc.ts` line 134; bulk add allows 5,000); the label and
letter "these lockers" box takes at most 2,000 characters; the History screen fetches at
most 1,000 lines at a time.

### No crashes or wrong results

Five imports, five allocations, four rollovers (self-reset record, archive, promote) and
3,421 routine changes ran without a refused change or an exception. Every year's code set
was made; nothing was left unplaced. 25 letters were held back in the final year, which is
expected (locks waiting for a reset).

## Method

All scripts are in the session scratchpad, not the repository:
`/private/tmp/claude-501/-Users-davidarmstrong-Antigravity-LockerManager/196d396d-083a-4d1f-978b-db0909bf87c7/scratchpad/perf`
(call it `$P`). They import the app's own code from `src/` and run under the repo's
Vitest. `$P/node_modules` is a link to the repo's `node_modules`. Nothing in the
repository was changed except this report. All data is SYNTHETIC (names made from
syllables, IDs `SYN000001` onwards).

| Script | What it does |
| --- | --- |
| `school.ts` | The SYNTHETIC roster (about 2,000 students, Years 7 to 12, yearly churn), the Compass-shaped CSV, and the three areas |
| `build.perf.ts` | Builds the file through five school years with the real functions: `createArea`, `createBank`, `addLockers`, CSV import (`parseFile`, `buildStudents`, `analyseImport`, `applyImport`), `generateYearSet`, `draftAllocation` and `commitDraft` with codes, `logReveal` and `recordPrintJob` for letters, 800 attempted moves, releases and assigns a year (about 690 made) (`suggestLocker`, `moveStudent`, `releaseStudent`, `assignStudent`), `markResetDoneMany`, and the rollover (`startRollover`, `recordOnZero`, `archiveYear`, `promoteStudents`, `finishRollover`). Each change gets one history line, as `session.write` does. Writes `out/large.lockers`, `out/final-year.csv`, `out/build-log.json`. `YEARS=12` makes the twelve-year projection |
| `measure.perf.ts` | Every timing in the Results table. Uses a real `DataFileSession` on a temporary folder for open, change, save with backups and undo. Writes `out/results.json` and the HTML files in `out/html/` |
| `commit.perf.ts` | Giving out lockers with and without a fresh code set, and the cost of `takenCodes` |
| `sqlprofile.perf.ts` | Times every SQL statement during the allocation commit (`FILE=large-12y.lockers` for the twelve-year file) |
| `backups.perf.ts` | A ten-week term of saves through `planPrune` at four file sizes |
| `electron/pdf.cjs` | Times the real PDF steps (letter fit check and PDF per chunk, labels, four reports). Not run: Chromium's helper processes were blocked by the session sandbox |

To rerun, from the repository folder:

```sh
P=/private/tmp/claude-501/-Users-davidarmstrong-Antigravity-LockerManager/196d396d-083a-4d1f-978b-db0909bf87c7/scratchpad/perf
npx vitest run --config $P/vitest.perf.config.ts build        # about 50 s
npx vitest run --config $P/vitest.perf.config.ts measure      # about 3 minutes
npx vitest run --config $P/vitest.perf.config.ts commit
npx vitest run --config $P/vitest.perf.config.ts backups
FILE=large.lockers npx vitest run --config $P/vitest.perf.config.ts sqlprofile --silent=false
YEARS=12 npx vitest run --config $P/vitest.perf.config.ts build   # twelve-year projection
./node_modules/.bin/electron $P/electron/pdf.cjs                  # PDF timings, run in a normal terminal
```

The scratchpad is temporary. To keep the scripts, copy the folder somewhere outside the
repository (they are not tests and should not run in CI). The most useful follow-up is
to run `electron/pdf.cjs`, then the build and measure steps, on a school Windows laptop
with the data file in a shared network folder.
