# Locker Manager

A free, open-source desktop app for schools to manage student lockers, lock codes, locker
labels and welcome letters. Windows and macOS. No server, no accounts, no internet
connection needed except for updates.

**Status: in development.** The current pre-release is an empty app that exists to
prove installing and updating work. Locker features arrive milestone by milestone.

## Download

Get the newest installer from the **[Releases page](https://github.com/mrdavearms/locker-manager/releases)**:
`Locker-Manager-Setup-<version>.exe` for Windows, `Locker-Manager-<version>-universal.dmg`
for Mac. Every release page carries the exact first-time steps for the one-off security
warning on each platform. Once installed, the app updates itself.

## What it will do

- Import students from your student management system export (Compass, Sentral and others).
- Allocate lockers by year level and group, with spares left where new enrolments land.
- Issue lock codes that follow the lock maker's rules, and keep every code's history.
- Print labels at exact millimetre geometry on real Avery stock, and a welcome letter for
  each student.
- Handle the year: new students, leavers, lost codes, moves and swaps, then the rollover.

## Your data

Everything stays in one data file in a folder your school chooses, plus backups beside it
and a local copy on each computer that opens it. Nothing is sent anywhere. The app
contacts GitHub only to check for updates.

## Licence

MIT. See [LICENSE](LICENSE). The full specification is in [SPEC.md](SPEC.md).
