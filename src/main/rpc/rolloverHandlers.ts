import { addKeyEvent, keyInfo, setKeyNumber } from '../repos/keys'
import { listProblems } from '../repos/problems'
import { setSetting } from '../repos/settings'
import { lockCodes, privacyView, setAutoHide, setPin, unlockCodes } from '../privacy'
import {
  archiveYear,
  finishRollover,
  promoteStudents,
  recordOnZero,
  rolloverStatus,
  selfResetGroups,
  startRollover
} from '../repos/rollover'
import type { Handlers } from './registry'

type Keys =
  | 'rollover.status'
  | 'rollover.start'
  | 'rollover.selfResetGroups'
  | 'rollover.recordOnZero'
  | 'rollover.archive'
  | 'rollover.promote'
  | 'rollover.finish'
  | 'keys.get'
  | 'keys.setNumber'
  | 'keys.event'
  | 'privacy.get'
  | 'privacy.unlock'
  | 'privacy.lock'
  | 'privacy.setPin'
  | 'privacy.setAutoHide'
  | 'problems.list'
  | 'storage.rules.set'

export const rolloverHandlers: Pick<Handlers, Keys> = {
  'rollover.status': { kind: 'read', run: (db) => rolloverStatus(db) },
  'rollover.start': {
    kind: 'write',
    audit: (_p, r) => ({
      action: 'rollover.started',
      entity: 'school_year',
      after: { to: r.nextYear }
    }),
    run: (db, ctx) => startRollover(db, ctx)
  },
  'rollover.selfResetGroups': { kind: 'read', run: (db) => selfResetGroups(db) },
  'rollover.recordOnZero': {
    kind: 'write',
    audit: (_p, r) => ({ action: 'locks.reset_by_students', entity: 'lock', after: r }),
    run: (db, ctx, p) => ({ recorded: recordOnZero(db, ctx, p.lockIds) })
  },
  'rollover.archive': {
    kind: 'write',
    audit: (_p, r) => ({ action: 'year.archived', entity: 'school_year', after: r }),
    run: (db, ctx, p) => archiveYear(db, ctx, p.typed)
  },
  'rollover.promote': {
    kind: 'write',
    audit: (p, r) => ({
      action: 'students.promoted',
      entity: 'student',
      after: { ...r, lastYearLevel: p.lastYearLevel }
    }),
    run: (db, ctx, p) => promoteStudents(db, ctx, p.lastYearLevel)
  },
  'rollover.finish': {
    kind: 'write',
    audit: () => ({ action: 'rollover.finished', entity: 'school_year' }),
    run: (db) => {
      finishRollover(db)
      return null
    }
  },
  'keys.get': { kind: 'read', run: (db, p) => keyInfo(db, p.lockerId) },
  'keys.setNumber': {
    kind: 'write',
    audit: (p) => ({
      action: 'key.number_set',
      entity: 'lock',
      entityId: p.lockId,
      after: { keyNumber: p.keyNumber }
    }),
    run: (db, ctx, p) => {
      setKeyNumber(db, ctx, p.lockId, p.keyNumber)
      const locker = db.get<{ locker_id: string | null }>(
        'SELECT locker_id FROM lock WHERE id = $id',
        {
          $id: p.lockId
        }
      )?.locker_id
      return locker ? keyInfo(db, locker) : null
    }
  },
  'keys.event': {
    kind: 'write',
    audit: (p) => ({
      action: `key.${p.event}`,
      entity: 'lock',
      entityId: p.lockId,
      after: { amountCents: p.amountCents }
    }),
    run: (db, ctx, p) => {
      addKeyEvent(db, ctx, p)
      return null
    }
  },
  'problems.list': { kind: 'read', run: (db) => listProblems(db) },
  'storage.rules.set': {
    kind: 'write',
    audit: (p) => ({ action: 'storage.rules_set', entity: 'settings', after: p.rules }),
    run: (db, ctx, p) => {
      setSetting(db, ctx, 'storage.backupRules', p.rules)
      return p.rules
    }
  },
  'privacy.get': { kind: 'read', run: (db) => privacyView(db) },
  // Unlocking changes nothing in the file, only this computer's memory.
  'privacy.unlock': { kind: 'read', run: (db, p) => unlockCodes(db, p.pin) },
  'privacy.lock': {
    kind: 'read',
    run: (db) => {
      lockCodes()
      return privacyView(db)
    }
  },
  'privacy.setPin': {
    kind: 'write',
    audit: (p) => ({
      action: p.pin ? 'privacy.pin_set' : 'privacy.pin_removed',
      entity: 'settings'
    }),
    run: (db, ctx, p) => setPin(db, ctx, p.pin, p.currentPin)
  },
  'privacy.setAutoHide': {
    kind: 'write',
    audit: (p) => ({ action: 'privacy.auto_hide_set', entity: 'settings', after: p }),
    run: (db, ctx, p) => setAutoHide(db, ctx, p.seconds)
  }
}
