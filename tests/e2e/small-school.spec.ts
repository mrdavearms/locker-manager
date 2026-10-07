import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { answerNextDialog, launchApp, sharedFolder } from './launch'

// A small, simple school: 40 lockers, students bring their own padlocks, students
// typed in by hand, no labels and no letters. This drives the app as that school
// would, using only what exists today, and records where it gets stuck.

test('a small school with no locks, no import and no labels', async () => {
  const share = sharedFolder()
  const l = await launchApp()
  const p = l.page
  await answerNextDialog(l.app, 'save', join(share, 'Locker data.lockers'))
  await p.getByTestId('new-file').click()
  await p.getByLabel('School name').fill('SYNTHETIC Small Primary')
  await p.getByRole('button', { name: 'Choose where to save…' }).click()
  await expect(p.getByText('Set up your school')).toBeVisible()

  // Lockers: one area, one bank, 40 lockers in one tier.
  await p
    .getByRole('list', { name: 'Steps' })
    .getByRole('button', { name: /Lockers/ })
    .click()
  await p.getByTestId('add-area').click()
  await p.getByLabel('Name').fill('Hallway')
  await p.getByRole('button', { name: 'Save' }).click()
  await p.getByTestId('add-bank').click()
  await p.getByLabel('Name').fill('Wall')
  await p.getByRole('button', { name: 'Save' }).click()
  await p.getByTestId('add-lockers').click()
  // SMALL-SCHOOL GAP: the bulk-add form starts at 114 lockers in 3 tiers (a big
  // secondary school); a small school must change the last number and the tiers.
  await p.locator('#ba-to').fill('40')
  await p.locator('#ba-tiers').selectOption('1')
  await expect(p.getByText('40 lockers in 40 columns and 1 row')).toBeVisible()
  await p.getByTestId('bulk-add-confirm').click()

  // Locks: set "No lock" for the bank.
  await p.getByTestId('setup-next').click()
  await expect(p.getByText('Lock for each bank')).toBeVisible()
  // SMALL-SCHOOL GAP: every locker is built with a combination lock by default, so
  // students who bring their own padlocks must change the bank to "No lock" by hand.
  await p.getByRole('button', { name: /Change the lock for this bank/ }).click()
  await p.locator('[id^="lock-"][id$="-type"]').last().selectOption('none')
  await p.getByRole('button', { name: /^Apply to 40 lockers/ }).click()
  await expect(p.getByText('now: No lock')).toBeVisible()

  // Click through the remaining steps and finish.
  for (const text of ['Lock code rules', 'How letters work']) {
    await p.getByTestId('setup-next').click()
    await expect(p.getByText(text).first()).toBeVisible()
  }
  await p.getByTestId('setup-next').click()
  await expect(p.getByTestId('setup-file')).toContainText('Locker data.lockers')
  await p.getByTestId('setup-next').click()
  // The Done step lists what is ticked.
  const done = p.getByTestId('setup-finish').locator('xpath=ancestor::section')
  // "School details" is ticked once the school has a name, with no logo or colour.
  await expect(done.getByText('School details')).toBeVisible()
  await expect(done.locator('li', { hasText: 'School details' })).not.toContainText(
    'can be done later'
  )
  await p.getByTestId('setup-finish').click()

  // Five students by hand, year level 5, no group.
  await p.getByTestId('nav-students').click()
  const names = [
    ['SYNTHETIC1', 'Ava', 'Syntheticone'],
    ['SYNTHETIC2', 'Ben', 'Synthetictwo'],
    ['SYNTHETIC3', 'Cleo', 'Syntheticthree'],
    ['SYNTHETIC4', 'Dev', 'Syntheticfour'],
    ['SYNTHETIC5', 'Eli', 'Syntheticfive']
  ] as const
  for (const [id, first, last] of names) {
    await p.getByTestId('add-student-open').click()
    // SMALL-SCHOOL GAP: a student ID is required, and a small school with no
    // student system has none, so it has to invent one for each child.
    await p.locator('#add-st-id').fill(id)
    await p.locator('#add-st-first').fill(first)
    await p.locator('#add-st-last').fill(last)
    // The first student types 5 under "Other…"; the rest pick it from the list.
    if (id === names[0][0]) {
      await p.locator('#add-st-year').selectOption('__other')
      await p.getByRole('dialog').getByLabel('Other year level').fill('5')
    } else {
      await p.locator('#add-st-year').selectOption('5')
    }
    await p.getByTestId('add-student-save').click()
    await expect(p.getByTestId('message-strip')).toContainText(`${first} ${last} added`)
  }

  // Give Ava a locker by hand; no code is shown and none is asked for.
  await p.getByTestId('student-search').fill('Ava')
  await p.getByRole('button', { name: /Syntheticone, Ava/ }).click()
  await p.getByTestId('give-locker').click()
  await p.getByTestId('confirm-assign').click()
  await expect(p.getByTestId('issued-dialog')).toContainText('No code to show here')
  await p.getByRole('button', { name: 'Done' }).click()
  // A locker with no lock has no code, so the panel offers no Show code button.
  await expect(p.getByTestId('show-code')).toHaveCount(0)

  // Allocate the other four with the plan the app offers, no edits.
  await p.getByTestId('nav-lockers').click()
  await p.getByTestId('open-allocate').click()
  await p.getByTestId('make-draft').click()
  await expect(p.getByText('4 students placed')).toBeVisible()
  await expect(p.getByTestId('unplaced')).toHaveCount(0)
  // SMALL-SCHOOL GAP: "Issue a code to each locker now" is ticked by default even
  // though no locker has a lock. Harmless, but confusing for a school with no codes.
  await expect(p.getByRole('checkbox', { name: /Issue a code/ })).toBeChecked()
  await p.getByTestId('commit-allocation').click()
  await expect(p.getByTestId('allocation-done')).toContainText('4 lockers given out')
  await p.getByRole('button', { name: /See the lockers/ }).click()

  // The Lockers screen: 5 in use, 35 spare.
  await expect(p.getByText('40 lockers · 5 in use · 35 spare')).toBeVisible()

  // What Home says now.
  await p.getByTestId('nav-home').click()
  const gs = p.getByTestId('getting-started')
  await expect(gs).toBeVisible()
  await expect(gs).toContainText('3 of 5 done')
  // SMALL-SCHOOL GAP: Home still lists "Print locker labels" and "Print the letters" as
  // jobs to do, with no way to say this school does not use them. ("Import your students"
  // ticks itself only because students were added by hand.)
  await expect(gs).toContainText('Print locker labels')
  await expect(gs).toContainText('Print the letters')
  await l.close()
})
