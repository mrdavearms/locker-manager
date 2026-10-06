# Locker Manager: product and technical specification

Working name: **Locker Manager** (change it in `package.json`, `electron-builder.yml` and `src/shared/brand.ts` before the first public release).
Owner: Dave Armstrong, Principal, Wangaratta High School (WHS), Victoria, Australia.
Version of this spec: 1.0, 6 October 2026.
Language: Australian English everywhere in the app, docs and code comments (colour, organise, licence as a noun, enrol).

---

## 0. How to read this document

This spec was written after building the same workflow by hand for WHS: Excel workbooks, Python scripts, Word mail merge templates and a staff guide for 228 lockers. Section 15 lists what actually went wrong in that real deployment. Treat every item there as a requirement, not as background.

Words used with a fixed meaning:

- **School**: one organisation using the app (one data file).
- **Locker**: a physical locker with a number that never changes.
- **Bank**: a group of lockers (a row, a wall, a corridor, a building wing). Lockers belong to exactly one bank.
- **Area**: a group of banks with a purpose, for example "Year 7 side" or "Senior Centre". Used for allocation rules.
- **Lock**: whatever secures a locker: built-in combination lock, combination padlock, keyed padlock, keyed built-in lock, electronic lock, or none.
- **Code**: the combination for a combination lock. Not every lock has one.
- **Student**: a person who can be given a locker. Comes from an import.
- **Assignment**: a student holding a locker from a start date to an end date.
- **Group**: the school's name for a class grouping (Homeroom, Form, Roll class, Tutor group, Home group, Mentor group). The label is configurable.
- **Year level**: Year 7, Grade 9, Year 12. The label is configurable.
- **Operator**: a staff member using the app.
- **Data file**: the single file that holds one school's data (section 6).

---

## 1. What the app is for

Schools give students lockers, every year and all through the year. The job looks simple and is not. It involves allocating hundreds of lockers fairly and in a sensible order, issuing lock codes that nobody can guess, printing labels that line up on real label sheets, giving each student a letter with their code, and then keeping everything right through the year: new enrolments, students leaving, lost codes, broken lockers, swaps, Homeroom changes. At the end of the year all of it starts again.

Locker Manager does that whole job in one desktop app, for staff with low technical confidence, without any server, account or internet connection (except for updates).

### 1.1 Goals

1. An office staff member who has never seen the app can, with the built-in guide, import students, allocate lockers and print labels and letters within an hour.
2. A Year Level Leader can look up a student's locker and code in under ten seconds.
3. Every school can make it its own: logo, colours, terminology, lock types, code rules, label stock, letter wording, allocation rules.
4. Nothing a user does by mistake can silently corrupt the record. Every change can be undone or traced.
5. Updates arrive by themselves and never touch or endanger a school's data.
6. Student data never leaves the school's own computers and storage.

### 1.2 Not goals for version 1

- No cloud service, user accounts or sync server (section 16 lists this as future work).
- No direct link to a student management system's API. Imports are files.
- No mobile app.
- No billing. The app is free for any school.

### 1.3 Who uses it

| Person | What they do | Technical confidence |
|---|---|---|
| Office staff | Imports, allocations, new and departing students, printing, year rollover | Low to medium. Comfortable with Word and Excel basics |
| Year Level Leaders and other teachers | Look up lockers and codes, request new codes, print one letter | Low. Occasional use, forget steps between uses |
| Business manager or principal | Set-up, settings, approving year rollover | Medium |
| School IT staff | Install, deploy, back up, troubleshoot | High, but don't know locker rules |

Design for the least confident person in the first two rows.

---

## 2. Principles that decide arguments

1. **Plain language.** No jargon in the UI. "Lock code", not "combination credential". Every screen says what it is for in one sentence at the top.
2. **Safe by default.** Destructive actions need confirmation, show exactly what will change, and can be undone. The locker number is never editable after set-up except through a deliberate "Renumber lockers" tool.
3. **The whole student moves, never just the name.** Assignments link to a student record by internal ID. A name can't be typed into a locker on its own (section 15, items 1 and 2).
4. **One record.** One data file per school, never several copies in use. The app actively discourages copies (section 6).
5. **Offline first.** Everything works with no internet.
6. **Configurable, with good defaults.** Every school-specific value lives in settings. The defaults reproduce WHS's working setup so the app is useful out of the box.
7. **Nothing is lost.** Every save keeps a backup, every change goes in the history, and old school years are archived, not deleted.
8. **Privacy.** No telemetry by default. Codes are hidden until asked for, and every reveal is logged.

---

## 3. Data model

Use SQLite (section 8.3). All tables have `id` (UUID text), `created_at`, `updated_at` (ISO 8601 UTC) and `updated_by` (operator display name). Soft-delete with `archived_at` where noted. Never hard-delete students, lockers or assignments through the UI.

### 3.1 School and settings

- `school`: name, short name, logo (PNG/SVG blob plus a mono version), colours (primary, accent, up to three stripe colours), address (optional), timezone (default Australia/Melbourne), locale (default en-AU), terminology map (see 3.9).
- `settings`: key/value JSON, versioned, with a schema in code (Zod). Everything in section 7 lives here.

### 3.2 School years and periods

- `school_year`: label ("2027"), start date, end date, status (planning, active, archived). Exactly one active year.
- Assignments, code sets and imports belong to a school year. Rollover (section 4.10) creates the next year.

### 3.3 Locations

- `area`: name, description, sort order, colour, optional default year levels (for allocation).
- `bank`: name, area, sort order, physical layout (rows and columns, used for "top or bottom" rules and a floor-plan view), notes.
- `locker`: number (text, so "B12" and "007" work, with a numeric sort key), bank, position in the bank (row, column, tier: top, middle, bottom), capacity (default 1; 2 for shared lockers), accessible flag (low height, wide door, near a ramp), status (in service, out of service, reserved), out-of-service reason and date, notes, QR identifier (section 5.6).

### 3.4 Locks

- `lock`: type (see below), serial number, manufacturer and model, number of dials or wheels, positions per dial (for example 10 for 0-9 digit dials, 40 for 0-39 rotary padlocks), owned by (school, student), current locker (nullable, because padlocks move), current code (encrypted, section 8.6), key number (for keyed locks), master or override code (encrypted, optional), status (in use, spare, lost, broken, retired), notes.
- Lock types in v1:
  - `combination_builtin`: combination dial built into the locker door (WHS: Lehmann Dial Lock 59). The code can be reset by staff. Code length 3 to 6.
  - `combination_padlock_settable`: padlock whose code the owner can set.
  - `combination_padlock_fixed`: padlock with a factory code that cannot change (Master Lock style). Codes come from a supplier list or the label on the lock, keyed by serial number. Rotary dials often have 3 numbers from 0 to 39.
  - `keyed_padlock` and `keyed_builtin`: no code. Track key number, number of keys issued, keys returned, master key group.
  - `electronic`: PIN or card. Store PIN if any; otherwise treat as keyless.
  - `none`: the student supplies their own padlock, or the locker is unlocked.
- `code_history`: lock, code (encrypted), from date, to date, reason (issued, reset, compromised, forgotten, year rollover, imported), changed by.
- `key_event`: lock, event (issued, returned, lost, replaced, charged), date, student, notes, optional amount.

### 3.5 Students

- `student`: external ID (the school's student ID: SUSSI ID at WHS, or the CASES21 number, Sentral ID and so on; text, leading zeros kept), first name, preferred name, last name, year level, group, house, gender (optional and hidden by default), additional needs flag (only "needs an accessible locker", no medical detail), email (optional), custom fields (up to 10, named in settings), active flag, source import, first seen date, last seen date.
- Name handling: keep the name exactly as imported in `*_raw` fields, plus the display version after case correction (section 4.2). Operators can override the display version, and an override is never replaced by a later import.
- Students who are no longer in the latest import are not deleted. They show in "Not in the latest import" until an operator confirms they have left.

### 3.6 Assignments

- `assignment`: student, locker, school year, start date, end date (null while current), status (current, ended, pending), end reason (left school, moved locker, year rollover, swap, released by operator), notes.
- Rules enforced in the database layer as well as the UI:
  - A locker cannot hold more current assignments than its capacity.
  - A student cannot hold more than one current assignment unless settings allow it.
  - An out-of-service locker cannot take a new assignment.

### 3.7 Codes

- `code_set`: a named batch of pre-generated codes, for one school year or as spares. Each row: code (encrypted), lock type compatibility (length and range), status (available, assigned, used, void), assigned to lock, assigned date and by whom.
- Generation rules are in settings (section 4.6). Generation is deterministic from a stored seed, so a set can be regenerated identically for checking.

### 3.8 Templates and outputs

- `label_template`: stock (section 5.1), layout elements and positions, fonts, logo placement, which fields, auto-fit rules, printer offset profile.
- `letter_template`: page size, rich-text body with merge fields, images, per lock type variants, per language variants.
- `report_template`: built-in reports with configurable columns.
- `print_job`: what was printed, when, by whom, which records, which template (for audit and reprints).

### 3.9 Terminology map

Every visible noun a school might call something different comes from this map: Locker, Bank, Area, Group (Homeroom), Year level, House, Student ID, Year Level Leader (the person students go to for help), Office. The UI, letters, labels and reports all use it. Default values are the WHS ones.

### 3.10 History

- `audit_log`: timestamp, operator, machine name, action, entity, entity ID, before (JSON), after (JSON), reason text. Append-only.
- `code_reveal_log`: timestamp, operator, student, locker, where it was revealed (screen, letter print, export).

---

## 4. Workflows

Each workflow is a guided screen ("Do a task"), not just a table. Each one ends with a summary of what changed and a suggestion of what to print next.

### 4.1 First-run set-up wizard

1. Welcome, and choose: start a new school file, open an existing file, or try the demo school (synthetic data, clearly marked "DEMO" on every screen and printout).
2. School details: name, logo (PNG or SVG; the app makes a mono version for mono labels and warns if the logo has white lettering that will vanish on white labels, section 15 item 12), colours.
3. Terminology: pick from presets (Victorian government, NSW, Queensland, independent, international) or type your own.
4. Locations: create areas and banks, then lockers in bulk ("Bank A: lockers 1 to 114, 3 tiers, 38 columns"). Import a locker list from CSV or Excel as an alternative.
5. Locks: choose the lock type for each bank (or each locker), code length and dial range. Import lock serials and factory codes for fixed padlocks.
6. Code rules (section 4.6), with a live preview of ten sample codes.
7. Label stock and letter template (pick from the library, adjust later).
8. Where to save the data file (section 6), with a plain explanation of why a shared folder matters.
9. Done: a checklist of next steps (import students, allocate, print).

### 4.2 Importing students

Inputs: CSV (any delimiter, any encoding including UTF-8 with or without BOM and Windows-1252), XLSX, XLS, ODS, and pasting a table from the clipboard. Several files at once (WHS imports one file per year level).

Steps:

1. Choose files. Show the first 20 rows of each.
2. Find the header row automatically (it may not be row 1). Let the operator correct it.
3. Map columns to fields. Offer saved mappings ("import profiles") and built-in presets: Compass "Student Year Level Export" (columns SUSSI ID, Import Identifier, Last Name, First Name, Gender, Campus, Form Group, House), Sentral, SIMON, Xuno, Synergetic, TASS, CASES21, and a generic profile. Detect the preset by header names.
4. Transform:
   - Trim spaces, collapse double spaces, normalise Unicode (NFC). Keep accented letters.
   - Treat IDs as text (keep leading zeros).
   - Name case: if a name is all capitals, convert to name case with rules for Mc (McNair), O' (O'Brien), hyphens (Smith-Jones), particles (de, van, von, da, di, le, la, del, della: kept as the school chooses), and Mac (MacDonald is ambiguous: flag it, don't guess). Flag every two-word or particle surname for a human check.
   - Group codes: map export values to display values ("07A" becomes "7A"). The mapping is editable and saved with the profile.
   - Year level from a column, from the group code ("07A" gives Year 7), or fixed per file ("this file is all Year 8").
5. Validate and show problems before anything is saved: duplicate IDs within and across files, students in a file for the wrong year level (WHS: a Year 8 student in the Year 7 file), blank names, groups not seen before, rows that look like totals or footers.
6. Compare with the existing data and show four lists: new students, students no longer present (possible leavers), students whose details changed (group, year level, name), and unchanged. The operator ticks which changes to apply.
7. Apply in one transaction, with an undo point.

The import never removes an assignment by itself. Students no longer present go to a "Possible leavers" list for an operator to confirm.

### 4.3 Exclusions and special cases

- Exclusion list: students who never get a locker (by ID), with a reason. Also exclusion by group code (WHS: Homeroom ZZZ means "not in a homeroom") and by year level.
- Needs an accessible locker: allocation puts these students in accessible lockers first.
- Reserved lockers: kept out of automatic allocation (staff, sport equipment, damaged).

### 4.4 Allocation

Automatic allocation fills lockers from a list of students using rules the school sets. Rules are saved as an allocation plan that can be reused next year.

Plan settings:

- Which students: by year level, group, house, or a saved filter.
- Which lockers: by area, bank or a range.
- Order of students: by group then last name then first name (the WHS default: Homerooms A to E, then the HUB group last, A to Z by surname within each group), or by last name only, by house, random (with a seed), or keep last year's locker where possible.
- Order of lockers: by number, by bank then number, by column (fills top, middle and bottom of a column before moving on), or tier preference (for example "Year 7 get bottom and middle tiers").
- Gaps: leave N spare lockers at the end of each group or each bank, so later enrolments land near their group.
- Groups sorted last or first (WHS: HUB after the others).
- Accessible lockers first for students who need one.
- Capacity check: if there are more students than lockers, stop and show who misses out, with options (shorten the list, add lockers, allow sharing).

Output is a **draft**. The operator sees a preview grid (by bank, coloured by group), can drag students between lockers, and then commits. A committed allocation creates assignments and an undo point.

Manual tools, each with full history:

- Assign: pick a student, the app suggests the next spare locker in the right area ("first spare on their side" at WHS).
- Release: student leaves. Ends the assignment, marks the lock as needing a new code (section 4.6) and a reset.
- Move: student to another locker. Both lockers' locks are flagged: the old one needs a new code, because the student knows it.
- Swap: two students exchange lockers. Both locks need new codes. The swap moves whole student records, never names.
- Change group or year level: updates the student and offers to move them to their new area.

### 4.5 Lock code operations

- Issue a code when a lock gets a new holder (from the code set for this year, or generated on the spot under the rules).
- Recode: a student thinks someone knows their code. New code, letter, a "reset needed" task for staff.
- Forgotten code: reveal (logged) and offer to reprint the letter.
- Reset done: an operator ticks that the physical lock has been reset. The app tracks "codes waiting for a physical reset" as a to-do list.
- Lock on 0 0 0 0 (reset, no new code yet): a first-class state, not a fake code (section 15 item 3).
- Fixed-code padlocks: the code comes with the lock. "Recode" means swapping the padlock and recording the new serial.
- Keyed locks: issue key, record return, record loss and replacement, optional charge.

### 4.6 Code generation rules (all configurable)

- Length: 3, 4, 5 or 6 positions. Range per position: 0-9 by default, or 0-39 for rotary padlocks, or any range.
- Banned (each switchable, with WHS defaults on):
  - all the same (1111) and three or more of one digit;
  - straight runs up or down (1234, 9876);
  - repeated pairs (1212) and doubled pairs (1122);
  - years (1900 to 2099) and plausible birth dates (DDMM, MMDD);
  - one digit away from the reset code (0001, 1000), because lock makers warn these are insecure;
  - a leading zero (optional);
  - the same code as the lock's previous code, or any code this lock has had in N years;
  - codes in a custom blocklist.
- Uniqueness: unique across the school (default), within an area, or not required.
- Code sets: generate a set for next year in advance (one code per locker, never the same as the locker's code the year before), plus a pool of spare codes for during the year. Show how many valid codes exist under the rules and warn if a set would use more than half of them.
- Use a cryptographically secure random generator, with a stored seed only for reproducible test sets.

### 4.7 Labels

See section 5.1. Workflows: print all, print a group, print a bank, print selected lockers, print changed since the last print, print spare-locker labels. Print to PDF or straight to a printer.

### 4.8 Letters

Letter to each student with their locker, code and how to use their lock type (section 5.2). Workflows match the label workflows, plus "letters for codes issued since the last print". Letters for spare lockers are never produced. Letters for locks waiting on a reset are held back with a warning.

### 4.9 Lists and reports

- Group lists for teachers: student, locker, no codes.
- Master list with codes (restricted, watermarked "CONFIDENTIAL", reveal logged).
- Lockers by bank, with spares and out-of-service lockers.
- Codes waiting for a physical reset (a checklist with tick boxes).
- Key register and outstanding keys.
- Sign-off sheet: students sign that they received their letter.
- End-of-year reset checklist, by group, for supervised self-reset (section 4.10).
- Changes since a date.
- Export any list to CSV or XLSX, and the whole data file to a portable XLSX workbook for archiving.

### 4.10 Year rollover

A guided, reversible, multi-step process, because it is the riskiest moment of the year.

1. Check: everything printed, no locks waiting on reset, backups OK.
2. Archive the current year: assignments end with reason "year rollover", and the year is set read-only.
3. Optionally promote students (Year 7 becomes Year 8) for schools that keep students across years. Otherwise wait for the new import.
4. Import next year's students (section 4.2). In Australia this usually comes after the student system rolls over in late January.
5. Choose the code set for the new year (pre-generated or generate now).
6. Run the allocation plan (section 4.4), preview, commit.
7. Print everything.
8. Track physical lock resets.

Guidance built into the screen, from experience: ask students to reset their own lock to 0 0 0 0 in Homeroom on their last day, because resetting hundreds of locks one by one with an emergency key takes a full day of staff time. The app prints a per-group checklist for this.

### 4.11 Search and lookup

A search box on every screen: name, preferred name, student ID, locker number, lock serial or key number. Results show the locker, group and status. The code is hidden behind a "Show code" button, which is logged. Keyboard shortcut Ctrl+K (Cmd+K on Mac).

### 4.12 Undo, history and recovery

- Undo and redo for the current session (at least 50 steps), covering every data change.
- History screen: who changed what and when, filterable, with "restore this record to how it was".
- Restore from backup: pick a dated backup, preview what differs, and restore as a new current file (the old one is kept).

---

## 5. Outputs

### 5.1 Label designer

- Stock library: Avery A4 L7160 (21), L7161 (18), L7162 (16), L7163 (14), L7165 (8), L7651 (65), J8163, and US Letter 5160, 5163, plus custom stock (page size, label width and height, rows, columns, top and left margins, horizontal and vertical pitch, corner radius).
- **Measured geometry overrides published geometry.** WHS measured its Avery L7163EV sheets as labels 38.0 mm high with the first row 14.0 mm from the top. Avery publishes 38.1 mm and 15.1 mm, and labels printed to the published figures came out low. The stock editor must let a school enter its own measurements, with a "measure your sheet" helper.
- Printer offset profiles: per printer, nudge right and down in 0.1 mm steps. Calibration page: label outlines, 1 mm ticks, a 100 mm scale bar to check the printer is not scaling, and the safe margin drawn in.
- Safe margin inside every label (default 5 mm), so small printer shifts don't cut anything off.
- Elements: logo, student name (first name over last name, or one line), preferred name option, group, year level, locker number, bank or area, the word "LOCKER" (terminology map), a rule line, QR code (section 5.6), custom text. Each element can be moved and resized, with snapping.
- Auto-fit text: names shrink from the maximum size to a minimum, measuring real glyph widths, then wrap to two lines, then flag "name too long" in the preview. Long names happen (WHS: "Kushini Siddi Arachchige").
- Spare locker label variant ("Spare locker" plus the number), and out-of-service variant.
- Mono or colour. Mono uses the mono logo.
- Start position on a part-used sheet is available, with a warning that label makers advise against putting part-used sheets back through a laser printer.
- Output: PDF at exact millimetre geometry. Print with "Actual size" forced, and tell the operator never to choose "Fit to page".
- Preview shows the real sheet with label outlines.

### 5.2 Letter designer

- Page: A4 (default) or US Letter, portrait.
- Body: rich text with merge fields (student name, preferred name, group, year level, locker, bank, area, code split into boxes, lock type, key number, school name, Year Level Leader term, dates), images, simple tables and coloured panels. A school can rebuild the WHS layout (navy header band, colour stripe, name, locker and code panel, "Know your lock", "Set your code", "Every day", "Keep your code secret", help box).
- Per lock type sections: "Set your code" only appears for settable locks; "Your key" appears for keyed locks.
- Lock instruction images: the school uploads its own (from the lock maker's poster). The app ships no third-party images.
- Name auto-fit like labels.
- **No footer credits or source lines by default.** WHS rejected a "Pictures from the ... instructions" footnote on student letters. The school's name is the only sign-off; never a personal name or signature.
- Language variants: the same letter in more than one language. Choose the language per student (custom field) or per print job.
- Wording should not date. The default template avoids "this year's renovations"-style phrases.
- One student per page, guaranteed: the renderer must check page count equals record count and stop if any letter spills onto a second page.
- Output: PDF, or print directly. Colour by default.

### 5.3 Rendering approach

Render labels and letters as HTML with CSS in millimetres, then use Electron's `webContents.printToPDF` with `preferCSSPageSize` and zero margins. Draw page geometry entirely in CSS (`@page { size: A4; margin: 0 }`, absolutely positioned label boxes). Do not depend on Word, mail merge or any other app. Embed fonts (ship an open font such as Inter or Arimo, which is metric-compatible with Arial) so output is identical on Windows and Mac.

### 5.4 Reports

Same renderer as letters, landscape allowed, repeating table headers, page numbers, school name, print date. "CONFIDENTIAL: contains lock codes" banner on any report with codes.

### 5.5 Exports

CSV and XLSX for every list. Full portable export (one XLSX workbook with a sheet per table, human-readable) for archiving and for leaving the app. Import of that same workbook to restore or migrate.

### 5.6 QR codes (optional, off by default)

Each locker has a short random identifier. A QR on the label encodes `lockermanager://locker/<id>` (opens the app) or plain text of the identifier. Never encode student names or codes in a QR. Use: maintenance staff scan a damaged locker, and the app jumps to it.

---

## 6. Storage and several staff using the same data

The school chose: one data file in a shared folder (OneDrive, SharePoint sync, Google Drive for desktop or a network drive), one editor at a time, everyone else read-only.

### 6.1 The data file

- Extension `.lockers`. It is a SQLite database (journal mode DELETE, not WAL, because WAL side-files sync badly).
- The app never edits the shared file in place. It works on a local copy and writes back atomically:
  1. Open: read the whole file into memory (sql.js), check its integrity (`PRAGMA integrity_check`) and its schema version, and record its size, modified time and SHA-256.
  2. Edit: all changes go to the in-memory database.
  3. Save (automatic after each committed change, debounced to 2 seconds, plus on close): check the file on disk still has the same SHA-256 as when last read or written. If it doesn't, someone else changed it: stop and show the conflict screen (6.4). Otherwise write `<name>.lockers.tmp-<random>` in the same folder, flush, verify by reading it back and hashing, then rename over the original. Keep the previous version as a backup (6.5).
- Placeholder and partial-sync detection: on open, read the whole file and check the size is not zero and the SQLite header is valid. If not, tell the operator the file has not finished syncing to this computer and to try again in a minute. (WHS lost time to OneDrive placeholder files that looked present but were empty.)

### 6.2 The edit lock

- When someone opens the file for editing, the app writes `<name>.lockers.lock` beside it: JSON with operator name, computer name, app version, process start time, and a heartbeat timestamp updated every 60 seconds.
- Anyone else who opens the file sees "Being edited by Hannah on OFFICE-PC since 9:12 am. You can look and print, but not change anything." Read-only mode reloads the file when it changes on disk.
- Stale locks: if the heartbeat is older than 10 minutes, offer "Take over editing", with a clear warning, and log it.
- The lock file is advisory: the hash check in 6.1 is the real protection.
- On close, remove the lock file. On crash, the heartbeat goes stale and the lock can be taken over.

### 6.3 Sync-service traps

- OneDrive and Google Drive make conflict copies (`Locker data-OFFICE-PC.lockers`, `Locker data (1).lockers`). On open, look for conflict copies beside the file. If one is found, show it and offer a comparison (6.4).
- Files deleted from a synced folder can come back. Never rely on deleting a temp file: use unique names, and tidy up leftovers older than a day on each open.
- Never write while the file is open in another program.

### 6.4 Conflict screen

Shows both versions side by side as lists of differences (lockers, assignments, codes), using the audit logs inside each file. The operator chooses per change, or keeps one whole version. The other version is saved as a dated backup, never thrown away.

### 6.5 Backups

- Every save keeps the previous version in `<folder>/Locker Manager backups/<name>/` with a timestamp. Keep all from the last 7 days, daily for 3 months, then weekly, up to a size cap (default 500 MB), all configurable.
- A local backup copy also goes into the app's own data folder on each computer, so a mistake in the shared folder can be recovered from any computer that has opened the file.
- Before any schema migration, rollover or restore, take a named backup ("before update to 1.4.0").
- Backups of a file with codes hold codes: the backup folder sits beside the data file and inherits its permissions.

### 6.6 Migrations

- Schema version stored in the file. Migrations are forward-only, written as numbered SQL files, each tested on fixtures of every earlier version.
- An app that finds a file with a newer schema than it knows opens it read-only and tells the operator to update.
- Before migrating a shared file, check no one else holds the edit lock, take a backup, migrate, verify integrity, then save.

---

## 7. Customisation (settings)

Grouped into tabs, each with "Reset to default" and a search box.

1. School: name, logo, mono logo, colours, address, timezone, locale.
2. Terminology (section 3.9).
3. Year levels and groups: list of year levels in use, group code mapping, which groups sort last, excluded group codes.
4. Locations: areas, banks, lockers, layout.
5. Locks: types per bank or locker, dial counts and ranges, master codes, key groups.
6. Codes: rules (4.6), uniqueness, code sets, spare pool size and warning level.
7. Allocation plans (4.4).
8. Imports: saved profiles and presets.
9. Labels: stock, templates, printer offsets.
10. Letters: templates, languages, images.
11. Reports: which columns, default sort.
12. Privacy and access: who can see codes (everyone, or only after a PIN), PIN for settings, auto-hide codes after N seconds, redact codes from exports unless ticked.
13. Storage: data file location, backup policy, lock heartbeat interval, stale lock time.
14. Updates: channel (stable or beta), check frequency, allow automatic install, managed-mode settings (section 9.5).
15. Appearance: light, dark or follow the system; text size; high contrast.

Settings are exportable as a `.lockersettings` JSON file, so a school can share its set-up with another school or keep a copy, without any student data.

---

## 8. Technical design

### 8.1 Stack

- Electron (current stable), TypeScript strict mode, React 18 or later, Vite through `electron-vite`.
- UI: Radix primitives with Tailwind (or shadcn/ui), accessible by default. Icons: Lucide.
- State: Zustand for UI state, TanStack Query for data access through IPC.
- Database: `sql.js` (SQLite compiled to WebAssembly) running in the main process. No native modules, so Windows and Mac builds need no native rebuilds. The whole database lives in memory, which fits the open-copy, atomic-save model in section 6.
- Validation: Zod for settings, IPC payloads and import rows.
- Imports: `papaparse` for CSV, `exceljs` for XLSX (MIT licence). For XLS and ODS, use SheetJS Community Edition from the official SheetJS CDN tarball (not the stale npm package), or convert via a small worker.
- PDF: HTML and CSS rendered in a hidden BrowserWindow, then `printToPDF`. QR: `qrcode`. PDF page counting for checks: `pdf-lib`.
- Encoding detection: `chardet` plus `iconv-lite`.
- i18n: `i18next` (UI strings in en-AU first, ready for others). Terminology map layered on top.
- Logging: `electron-log` to the app data folder, rotated, no student data in logs (IDs hashed).
- Auto-update: `electron-updater` with the GitHub Releases provider (section 9).
- Packaging: `electron-builder`.

### 8.2 Process layout and security

- Main process: database, file I/O, locking, updates, printing.
- Renderer: React UI only. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict Content Security Policy, no remote content.
- Preload exposes a typed API (`window.api`) generated from one shared contract file. Every IPC call is validated with Zod in the main process.
- Single-instance lock (one copy of the app per computer). Opening a second `.lockers` file focuses the running app.
- Register the `.lockers` file type and the `lockermanager://` protocol.

### 8.3 Repository layout

```
/
  SPEC.md                 this document
  CLAUDE.md               working notes for Claude Code (kept up to date)
  README.md               for schools: what it is, download, install, privacy
  CHANGELOG.md            generated from conventional commits
  LICENSE                 see section 13
  electron-builder.yml
  package.json
  src/
    main/                 Electron main process
      db/                 sql.js wrapper, migrations/, repositories
      file/               open, save, lock file, hash check, backups, conflict detection
      import/             parsers, presets, transforms, validation
      allocate/           allocation engine (pure functions)
      codes/              code rules and generation (pure functions)
      render/             label, letter and report HTML builders, PDF
      update/             electron-updater wiring, managed mode
      ipc/                handlers
    preload/
    renderer/             React app
    shared/               types, Zod schemas, IPC contract, brand.ts, terminology
  resources/              icons, fonts, sample logo, demo data generator
  tests/
    unit/                 Vitest
    e2e/                  Playwright for Electron
    fixtures/             synthetic data files only
    golden/               reference PDFs rendered to PNG for visual comparison
  .github/workflows/      ci.yml, release.yml
  docs/                   user guide (Markdown, also built into the app), IT guide
```

### 8.4 Pure core

Allocation, code generation, name case, group mapping, import validation and diffing are pure TypeScript functions with no Electron dependency. They have the most tests.

### 8.5 Performance targets

- Open a file with 3,000 students and 3,000 lockers in under 2 seconds.
- Allocate 1,000 students in under 1 second.
- Render 300 letters to PDF in under 30 seconds, with a progress bar and cancel.

### 8.6 Codes at rest

- Codes are stored encrypted (AES-256-GCM) with a key held inside the data file, wrapped by a school passphrase only if the school turns on "Protect codes with a passphrase". This is protection against casual viewing of the file in a database tool, not against a determined attacker, and the settings screen says so plainly.
- If the passphrase option is on and the passphrase is lost, codes cannot be recovered. The app makes the school confirm a recovery copy before turning it on.

### 8.7 Identity of the operator

No accounts. The operator name defaults to the OS user's full name, with a "This is me" confirmation on first use per computer. It is recorded in audit entries and lock files.

---

## 9. Updates, builds and releases

### 9.1 Release pipeline (GitHub Actions)

- `ci.yml` on every push and pull request: install, lint (ESLint, Prettier), type-check, unit tests, build, Playwright end-to-end tests on Windows and Mac runners, golden PDF comparison.
- `release.yml` on a tag `v*.*.*`:
  - Matrix: `windows-latest` builds an NSIS installer (x64 and arm64); `macos-latest` builds a universal DMG and ZIP (x64 plus arm64). The ZIP is needed by the Mac updater.
  - electron-builder publishes to a **draft** GitHub Release with `latest.yml`, `latest-mac.yml` and blockmaps (for small differential downloads).
  - A final job checks every expected file is present and the version numbers match, then publishes the release. A missing `latest-mac.yml` breaks Mac updates silently, so this check is required.
- Version numbers: semantic versioning. Pre-releases (`1.3.0-beta.2`) go to the beta channel.
- Public repository, so the updater needs no token.

### 9.2 Code signing (not available yet, designed in now)

- Signing is not set up at first. The pipeline must build unsigned when the secrets are missing and signed when they are present, with no code change:
  - Mac: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (Developer ID certificate and notarisation).
  - Windows: Azure Trusted Signing variables (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, endpoint, account and profile name), or `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` for a certificate.
- Consequences to handle in the app while unsigned:
  - Windows: installs and auto-updates work, but first install shows "Windows protected your PC". The README and the download page explain "More info, then Run anyway".
  - Mac: the Mac updater only installs signed apps. While unsigned, the app checks for updates, shows "Version 1.4.0 is available", and opens the download page. It also explains how to open an unsigned app the first time: on macOS 15 and later, try to open it once, then go to System Settings > Privacy & Security and click Open Anyway. Builds must be ad-hoc signed (electron-builder does this when no certificate is present) or Apple silicon Macs will report the app as damaged. Once signed builds exist, the full auto-update path switches on by itself (detect at runtime whether the running app is signed).

### 9.3 Update behaviour

- Check on launch (after 30 seconds) and every 4 hours. Manual "Check for updates" in Help.
- Download in the background. Show "Update ready: restart now or when you next close the app". Never restart while a save, print or import is running, and never with unsaved changes.
- Release notes shown in the app (from the GitHub Release body, written in plain language for school staff).
- Staged rollout: support `stagingPercentage` so a release can go to 20% first.
- Channels: stable (default) and beta (opt-in in settings).
- Safety: before installing, the app saves and closes the data file and releases the edit lock. After an update, the first launch runs migrations only with a backup (6.6). If the new version fails to start twice in a row, show a recovery screen with "Open the download page for the previous version" and a link to the backups.
- The updater never reads or sends school data. Update checks send only what the GitHub API needs.

### 9.4 Proxies and school networks

School networks often have proxies and filtering. electron-updater uses Electron's network stack, which follows the system proxy. Test it behind an authenticating proxy, and make failure quiet: an update check that fails is logged, not shown as an error, unless the user asked manually.

### 9.5 Managed environments (school IT)

- Per-user install by default (no admin rights needed), because school staff often can't install for everyone.
- Per-machine silent install for IT: `Locker-Manager-Setup.exe /S /allusers`.
- Managed settings file (`managed.json` in a documented machine-wide location on each platform, or registry keys on Windows) that can: turn off auto-update, fix the update channel, set a default data file path, turn off the demo school, require a PIN to show codes. Managed settings appear locked in the UI with "Set by your IT team".
- An IT guide in `docs/` covers deployment, managed settings, backup locations and firewall needs (GitHub domains for updates).

---

## 10. User experience

- Home screen: "What do you want to do?" with big task buttons matching the workflows: Find a student, New student, Student has left, New code, Move or swap, Print labels, Print letters, Import students, Start next year. Below that: a status panel (lockers in use per area, spares, codes waiting on a reset, problems to fix, last backup).
- Problems panel: everything that needs attention (duplicate codes, students without lockers, possible leavers, locks waiting on reset, low spare codes, name spellings to check, conflicting copies of the file found), each with a "Fix" button.
- Every destructive or bulk action shows a plain summary first ("This will end 218 assignments and give 228 lockers new codes. A backup will be kept.") and needs a typed confirmation for the biggest ones (rollover).
- Built-in guide: the user guide from `docs/` rendered in the app, searchable, with a "Show me" button on each task that opens the right screen.
- Tooltips on every control. No icon without a text label on the main screens.
- Keyboard: everything reachable, visible focus, Ctrl+K search, Ctrl+Z undo.
- Accessibility: WCAG 2.1 AA contrast, screen-reader labels, text size setting, works at 200% zoom.
- Training: the demo school with synthetic students, and a "Practice mode" copy of the real file that can't be saved back.
- Language: short sentences, no jargon, Australian spelling, dates as 6 Oct 2026.

---

## 11. Privacy and security

- All data stays in the school's chosen folder and the app's local folder. No telemetry by default. Optional crash reports (opt-in) contain no student data, names or codes.
- Codes hidden by default everywhere. Reveal is logged. Optional PIN.
- Exports with codes need a tick box and are marked CONFIDENTIAL.
- Logs never contain names or codes.
- Synthetic data only in the repository. A `.gitignore` and a pre-commit check refuse `*.lockers`, `*.csv` and `*.xlsx` outside `tests/fixtures/` and `resources/demo/`. Fixture files carry a `SYNTHETIC` marker that the check looks for.
- The README states plainly what data is stored and where, to help schools with their privacy assessments (in Victoria, the Department's privacy requirements for schools apply).

---

## 12. Testing and quality

- Unit tests for every pure function, aiming for 90% coverage of `allocate/`, `codes/`, `import/`.
- Property tests (fast-check) for code generation: every generated code obeys every enabled rule; sets are unique; no locker repeats last year's code.
- Golden tests:
  - Allocation: a synthetic fixture shaped like the WHS case (2 year levels, groups A to E plus a group sorted last, an excluded group, 228 lockers split 114/114) must give a known, checked allocation.
  - Labels: render the calibration page and a label sheet to PDF, rasterise, and compare with a stored PNG within a small tolerance. Check element positions in millimetres from the PDF directly.
  - Letters: page count equals record count; no text outside the page.
- Import tests: every preset with a synthetic sample, files with BOM, Windows-1252, semicolon delimiters, header not on row 1, trailing total rows, all-capitals surnames, IDs with leading zeros, the wrong year level in a file.
- File safety tests: two app instances on the same file (lock respected), file changed on disk during an edit (conflict screen), zero-byte placeholder, conflict-copy detection, crash during save (original intact), migration from every earlier schema version.
- End-to-end tests (Playwright for Electron) of each home-screen task.
- Manual release checklist in `docs/release-checklist.md`, including printing a real label sheet on a laser printer before each minor release.

---

## 13. Licence and distribution

- Free for any school. Recommended licence: MIT (simplest for schools and IT departments to approve). Alternative if Dave wants changes shared back: GPL-3.0. Decide before the first public release.
- Public GitHub repository and Releases page as the download location. A simple landing page later (GitHub Pages) with plain-language install steps for Windows and Mac.
- Name and logo for the app itself: original, not any school's and not any lock maker's.

---

## 14. Milestones

Each milestone ends with a tagged pre-release and working auto-update from the previous one.

- **M0: skeleton and pipeline.** Electron, React, TypeScript, lint, tests, CI on Windows and Mac, release workflow, auto-update proven end to end from v0.0.1 to v0.0.2 on Windows, and the "update available, download" fallback on unsigned Mac. Empty app with About and Check for updates.
- **M1: data file and safety.** `.lockers` format, migrations, open and atomic save, edit lock, read-only mode, backups, conflict detection, demo school generator.
- **M2: set-up and locations.** Wizard, school profile, terminology, areas, banks, lockers, lock types.
- **M3: import.** Parsers, presets including Compass, mapping UI, transforms, validation, diff and apply.
- **M4: codes and allocation.** Code rules and sets, allocation engine and preview, manual assign, release, move and swap, history and undo.
- **M5: labels.** Stock library, measured geometry, printer offsets, calibration page, designer, auto-fit, PDF and print.
- **M6: letters and reports.** Letter designer, lock-type sections, languages, reports, exports.
- **M7: year rollover and keys.** Rollover wizard, reset tracking, key register.
- **M8: polish and release 1.0.** In-app guide, accessibility pass, managed mode, IT guide, README, landing page, signing slotted in if available.

---

## 15. Lessons from the real WHS deployment (requirements)

These all happened at WHS in September and October 2026. Each one is a requirement.

1. **A staff member typed over a locker number** to "move" a student (102 to 113). That left one locker missing and another listed twice. Locker numbers must not be editable in normal use; moving is a separate action.
2. **Two students' names were swapped between lockers, but not their student IDs**, so each row then had one student's name and another's ID. Names must never be edited apart from the student record, and a swap must move whole records. The app must flag any name that no longer matches the latest import for that ID.
3. **A code was typed as 0000** to mean "the lock has been reset and has no code yet". That is a real state and needs its own status, a to-do item and a letter once a code is issued.
4. **Compass gives surnames in capitals.** Mc, O' and hyphens can be fixed automatically. MacDonald, De La Rue, Van Bergen and two-word surnames need a human check.
5. **A Year 7 student appeared in the Year 8 list**, and a name given by hand didn't match the export spelling. Check every file's year level, and match by ID, not by name.
6. **Some students never get a locker** (Homeroom ZZZ; some students in the Hub group). Both exclusion by group and exclusion by individual are needed, with reasons.
7. **Published label geometry was wrong for the actual stock** (Avery L7163EV measured 38.0 mm by 14.0 mm, against 38.1 mm and 15.1 mm published). Measured values must override, and a calibration page must exist.
8. **Long names** don't fit at the normal size. Auto-fit must measure real text width, not count letters.
9. **Word mail merge** needed the data file synced locally, a sheet chosen by hand, and broke in confusing ways when the wrong sheet was chosen. The app renders its own PDFs and has no mail merge.
10. **Word's Compatibility Mode shifted tables** and joined two adjacent tables into one, so a colour stripe ran past the header. The app's renderer uses CSS in millimetres, with a visual golden test.
11. **OneDrive restored a deleted temporary folder**, showed placeholder files that looked present but were empty, and opened a cloud copy instead of the local file. See section 6.
12. **The school's colour logo had white lettering** that vanished on white labels. The app needs a mono logo for labels and should warn about light-on-transparent logos.
13. **The principal deleted a source credit footnote** from the student letters: "These are student letters. I don't need that sort of nonsense on there." No credits or footnotes on student letters by default.
14. **Letter text dated quickly** ("part of this year's renovations"). Default templates use wording that doesn't date.
15. **Resetting every lock at year end** takes a day with the emergency key. Support supervised self-reset by students, with checklists.
16. **Part-used label sheets** are a laser printer risk. Warn rather than encourage.
17. **Two people worked on the same script and one undid the other's fix** without knowing. The shared data file needs the edit lock and hash check in section 6.
18. **Codes must follow rules the lock maker recommends**: not one digit away from 0 0 0 0, not all the same digit.

---

## 16. Future work (not version 1)

- Optional cloud sync for schools that want simultaneous editing (would need privacy approval in most systems).
- Direct import from student system APIs (Compass, Sentral).
- Label printer support (Brother, Dymo rolls).
- A phone companion that scans locker QR codes for maintenance.
- Translated UI (the code is ready through i18next).
- Fees and deposits for keys and padlocks.
- A floor-plan view of banks with drag-and-drop allocation.

---

## 17. Open decisions for Dave

1. App name (working name Locker Manager).
2. Licence: MIT (recommended) or GPL-3.0.
3. When to buy signing (Apple Developer Program, about A$150 a year, and Azure Trusted Signing, from about A$15 a month). Mac auto-update needs the Apple one.
4. Whether WHS's own setup ships as a preset ("Victorian government secondary school, Compass") or only as the default values.
5. Whether to offer a passphrase for codes at rest (section 8.6) in 1.0 or later.
