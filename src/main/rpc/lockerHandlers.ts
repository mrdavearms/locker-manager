import {
  rulesSummary,
  codeRules,
  setCodeRules,
  generateYearSet,
  reserveSetForNextYear,
  listCodeSets,
  resetTasks,
  markResetDone,
  revealCode,
  issueCode,
  lockForLocker,
  setFixedCode,
  activeYearId
} from '../repos/codes'
import {
  assignStudent,
  commitDraft,
  draftAllocation,
  moveStudent,
  releaseStudent,
  savedPlan,
  savePlan,
  suggestLocker,
  swapStudents
} from '../repos/assignments'
import { listHistory, quickSearch } from '../repos/history'
import type { LockerDb } from '../db/db'
import type { Handlers } from './registry'
import { assertCodesAllowed, shownCode } from '../privacy'

type Keys =
  | 'codes.rules.get'
  | 'codes.rules.set'
  | 'codes.rules.preview'
  | 'codes.sets.list'
  | 'codes.sets.generate'
  | 'codes.resetTasks'
  | 'codes.resetDone'
  | 'codes.reveal'
  | 'codes.recode'
  | 'codes.setFixed'
  | 'allocation.plan.get'
  | 'allocation.plan.set'
  | 'allocation.draft'
  | 'allocation.commit'
  | 'locker.suggest'
  | 'student.assign'
  | 'student.release'
  | 'student.move'
  | 'student.swap'
  | 'history.list'
  | 'search.quick'

function lockerNumber(db: LockerDb, id: string): string {
  return (
    db.get<{ number: string }>('SELECT number FROM locker WHERE id = $id', { $id: id })?.number ??
    ''
  )
}

function requireLock(db: LockerDb, lockerId: string): string {
  const lock = lockForLocker(db, lockerId)
  if (!lock) throw new Error('This locker has no lock recorded.')
  return lock.id
}

export const lockerHandlers: Pick<Handlers, Keys> = {
  'codes.rules.get': { kind: 'read', run: (db) => codeRules(db) },
  'codes.rules.set': {
    kind: 'write',
    audit: (p) => ({ action: 'codes.rules_set', entity: 'settings', after: p.rules }),
    run: (db, ctx, p) => {
      setCodeRules(db, ctx, p.rules)
      return codeRules(db)
    }
  },
  'codes.rules.preview': { kind: 'pure', run: (p) => rulesSummary(p.rules) },
  'codes.sets.list': { kind: 'read', run: (db) => listCodeSets(db) },
  'codes.sets.generate': {
    kind: 'write',
    audit: (p, r) => ({
      action: 'codes.set_generated',
      entity: 'code_set',
      after: { name: p.name, seeded: p.seed !== null, codes: r.codes, spares: r.spares }
    }),
    run: (db, ctx, p) => {
      const r = generateYearSet(db, ctx, {
        name: p.name,
        schoolYearId: activeYearId(db),
        seed: p.seed
      })
      // Lockers already given out: this set is for next year, kept until the rollover.
      const out = db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM assignment WHERE status = 'current'"
      )?.n
      if (Number(out ?? 0) > 0) reserveSetForNextYear(db, ctx, r.set)
      return { codes: r.codes, spares: r.spares, validCount: r.validCount, overHalf: r.overHalf }
    }
  },
  'codes.resetTasks': { kind: 'read', run: (db) => resetTasks(db) },
  'codes.resetDone': {
    kind: 'write',
    audit: (p) => ({ action: 'lock.reset_done', entity: 'lock', entityId: p.lockId }),
    run: (db, ctx, p) => {
      markResetDone(db, ctx, p.lockId)
      return null
    }
  },
  'codes.reveal': {
    kind: 'write',
    // The code itself never goes in the history; code_reveal_log records the reveal.
    audit: (p) => ({ action: 'code.shown', entity: 'locker', entityId: p.lockerId }),
    run: (db, ctx, p) => {
      assertCodesAllowed(db)
      return { code: revealCode(db, ctx, p.lockerId, 'screen') }
    }
  },
  'codes.recode': {
    kind: 'write',
    audit: (p) => ({
      action: 'code.changed',
      entity: 'locker',
      entityId: p.lockerId,
      reason: p.reason
    }),
    run: (db, ctx, p) => ({
      code: shownCode(
        db,
        ctx,
        p.lockerId,
        issueCode(db, ctx, requireLock(db, p.lockerId), 'compromised')
      )
    })
  },
  'codes.setFixed': {
    kind: 'write',
    audit: (p) => ({
      action: 'code.fixed_recorded',
      entity: 'locker',
      entityId: p.lockerId,
      after: { serial: p.serial }
    }),
    run: (db, ctx, p) => {
      setFixedCode(db, ctx, requireLock(db, p.lockerId), p.code, p.serial)
      return null
    }
  },
  'allocation.plan.get': { kind: 'read', run: (db) => savedPlan(db) },
  'allocation.plan.set': {
    kind: 'write',
    audit: (p) => ({ action: 'allocation.plan_saved', entity: 'settings', after: p.plan }),
    run: (db, ctx, p) => {
      savePlan(db, ctx, p.plan)
      return savedPlan(db)
    }
  },
  'allocation.draft': { kind: 'read', run: (db, p) => draftAllocation(db, p.plan) },
  'allocation.commit': {
    kind: 'write',
    audit: (_p, r) => ({ action: 'allocation.committed', entity: 'assignment', after: r }),
    run: (db, ctx, p) => commitDraft(db, ctx, p.assignments, { issueCodes: p.issueCodes })
  },
  'locker.suggest': { kind: 'read', run: (db, p) => suggestLocker(db, p.studentId) },
  'student.assign': {
    kind: 'write',
    audit: (p) => ({
      action: 'student.assigned',
      entity: 'student',
      entityId: p.studentId,
      after: { lockerId: p.lockerId }
    }),
    run: (db, ctx, p) => ({
      code: shownCode(db, ctx, p.lockerId, assignStudent(db, ctx, p.studentId, p.lockerId).code),
      lockerNumber: lockerNumber(db, p.lockerId)
    })
  },
  'student.release': {
    kind: 'write',
    audit: (p) => ({
      action: p.left ? 'student.left' : 'student.released',
      entity: 'student',
      entityId: p.studentId,
      reason: p.reason ?? null
    }),
    run: (db, ctx, p) => {
      releaseStudent(db, ctx, p.studentId, { left: p.left })
      return null
    }
  },
  'student.move': {
    kind: 'write',
    audit: (p) => ({
      action: 'student.moved',
      entity: 'student',
      entityId: p.studentId,
      after: { lockerId: p.lockerId },
      reason: p.reason ?? null
    }),
    run: (db, ctx, p) => ({
      code: shownCode(db, ctx, p.lockerId, moveStudent(db, ctx, p.studentId, p.lockerId).code),
      lockerNumber: lockerNumber(db, p.lockerId)
    })
  },
  'student.swap': {
    kind: 'write',
    audit: (p) => ({
      action: 'students.swapped',
      entity: 'student',
      entityId: p.studentId,
      after: { with: p.otherStudentId },
      reason: p.reason ?? null
    }),
    run: (db, ctx, p) => {
      swapStudents(db, ctx, p.studentId, p.otherStudentId)
      return null
    }
  },
  'history.list': {
    kind: 'read',
    run: (db, p) =>
      listHistory(db, {
        limit: p.limit,
        ...(p.search ? { search: p.search } : {}),
        ...(p.before ? { before: p.before } : {})
      })
  },
  'search.quick': { kind: 'read', run: (db, p) => quickSearch(db, p.q) }
}
