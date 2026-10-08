# Locker Manager

A free, open-source desktop app for schools to manage student lockers, lock codes, locker
labels and welcome letters. Windows and macOS. No server, no accounts, no internet
connection needed except for updates.

**Website: [mrdavearms.github.io/locker-manager](https://mrdavearms.github.io/locker-manager/)**

**Status: pre-release (0.x).** Every feature in the specification is built. Version 1.0
follows once a school has checked printing on real label sheets and printers.

## Download

Get the newest installer from the **[Releases page](https://github.com/mrdavearms/locker-manager/releases)**:
`Locker-Manager-Setup-<version>.exe` for Windows, `Locker-Manager-<version>-universal.dmg`
for Mac. Every release page carries the exact first-time steps for the one-off security
warning on each platform. Once installed, the app updates itself on Windows and on a Mac
(on a Mac, keep it in the Applications folder).

## What it does

- **Imports students** from your student system's export: Compass, Sentral, SIMON, Xuno,
  Synergetic, TASS, CASES21 or any spreadsheet. Fixes capitals in surnames and asks a person
  to check the tricky ones.
- **Allocates lockers** by your rules (year level to area, group order, surname, groups
  placed last, accessible lockers first), with a draft you check before anything changes.
- **Issues lock codes** that follow the lock makers' advice, never repeating a locker's old
  code, and keeps every code's history. Codes are hidden until asked for, and every code
  shown, printed or exported is recorded.
- **Prints labels** at exact millimetre positions on Avery sheets, with your own
  measurements, a calibration page and printer nudges.
- **Prints letters**: one page per student, with only the sections that suit their lock,
  in more than one language if you need.
- **Reports and exports**: group lists, a confidential master list, lockers by bank, reset
  checklists, sign-off sheets, a key register and changes since a date, as PDF, Excel or CSV.
- **Through the year**: new students, leavers, moves, swaps, new codes, locks to reset, undo,
  and a full history of who changed what.
- **Start next year**: a guided rollover, with students resetting their own locks on their
  last day.

## Your data (for privacy assessments)

- **Where it lives**: one data file (`.lockers`) in a folder your school chooses, such as a
  shared drive or OneDrive. Backups are kept in a `Locker Manager backups` folder beside it,
  and a second copy of the backups on each computer that opens it.
- **What it holds**: students' names, preferred names, student ID, year level and group;
  house, gender and email only if your import includes those columns; a tick for "needs an accessible locker" (no medical detail); lockers and locks; lock codes,
  encrypted; history of changes with the staff member's name and computer name.
- **What leaves the computer**: nothing. The app has no server and sends no data anywhere.
  It contacts GitHub only to check for updates, and sends nothing about the school.
- **Logs** on each computer record actions and errors, never names or codes.
- **Who can see codes**: anyone with the file open can ask to see a code, unless the school
  sets a PIN. Every code shown, printed or exported is recorded with who and when.
- In Victoria, the Department's privacy requirements for schools apply to how a school
  stores and shares the data file.

## For school IT

See the [IT guide](docs/it-guide.md): installing per user or per machine, managed settings
(`managed.json`), network needs for updates, backup locations and the security model.

## Help

The [user guide](docs/user-guide.md) is also inside the app: click **Guide**.

## Licence

MIT. See [LICENSE](LICENSE). The full specification is in [SPEC.md](SPEC.md). Labels and
letters use the Arimo typeface under the SIL Open Font Licence.
