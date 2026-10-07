import { z } from 'zod'
import { DEFAULT_LOCK, LockDefaultsSchema } from '@shared/locks'
import type { SetupStatus } from '@shared/rpc'
import type { LockerDb } from '../db/db'
import type { OperatorContext } from '../db/context'
import { duplicateNumbers, planBulkLockers } from '../locations/lockerNumbers'
import {
  addLockers,
  archiveArea,
  archiveBank,
  archiveLocker,
  createArea,
  createBank,
  existingLockerNumbers,
  listAreas,
  listLockers,
  renumberLocker,
  setBankLocks,
  updateArea,
  updateBank,
  updateLocker
} from '../repos/locations'
import { getSchoolProfile, getTerms, setLogo, setTerms, updateSchoolProfile } from '../repos/school'
import { getSetting, setSetting } from '../repos/settings'
import type { Handlers } from './registry'
import { labelHandlers } from './labelHandlers'
import { letterHandlers } from './letterHandlers'
import { rolloverHandlers } from './rolloverHandlers'
import { lockerHandlers } from './lockerHandlers'
import { studentHandlers } from './studentHandlers'

const NotUsedSchema = z.array(z.enum(['labels', 'letters']))

function setupStatus(db: LockerDb): SetupStatus {
  const school = getSchoolProfile(db)
  const lockers = Number(
    db.get<{ n: number }>('SELECT COUNT(*) AS n FROM locker WHERE archived_at IS NULL')?.n ?? 0
  )
  const without = Number(
    db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM locker l WHERE l.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM lock k WHERE k.locker_id = l.id AND k.status IN ('in_use','spare'))"
    )?.n ?? 0
  )
  const printed = (kind: 'labels' | 'letters'): boolean =>
    db.get('SELECT 1 AS x FROM print_job WHERE kind = $k LIMIT 1', { $k: kind }) !== undefined
  return {
    completed: getSetting(db, 'setup.completedAt', z.string(), '') !== '',
    hasSchoolDetails: school.hasLogo || school.colourPrimary !== null,
    hasTerms: getSetting(db, 'terminology.updated', z.string(), '') !== '',
    lockers,
    lockersWithoutLock: without,
    labelsPrinted: printed('labels'),
    lettersPrinted: printed('letters'),
    notUsed: getSetting(db, 'setup.notUsed', NotUsedSchema, [])
  }
}

function lockDefaults(db: LockerDb) {
  return getSetting(db, 'locks.defaults', LockDefaultsSchema, DEFAULT_LOCK)
}

export const handlers: Handlers = {
  ...studentHandlers,
  ...lockerHandlers,
  ...labelHandlers,
  ...letterHandlers,
  ...rolloverHandlers,
  'school.get': { kind: 'read', run: (db) => getSchoolProfile(db) },
  'school.update': {
    kind: 'write',
    audit: (p) => ({ action: 'school.updated', entity: 'school', after: p }),
    run: (db, ctx, p) => updateSchoolProfile(db, ctx, stripUndefined(p))
  },
  'school.setLogo': {
    kind: 'write',
    audit: (p) => ({
      action: p.bytes ? 'school.logo_set' : 'school.logo_removed',
      entity: 'school',
      after: { which: p.which, type: p.type, bytes: p.bytes?.byteLength ?? 0 }
    }),
    run: (db, ctx, p) => {
      setLogo(db, ctx, p.which, p.bytes, p.type)
      return getSchoolProfile(db)
    }
  },
  'terms.get': { kind: 'read', run: (db) => getTerms(db) },
  'terms.set': {
    kind: 'write',
    audit: (p) => ({ action: 'terms.updated', entity: 'school', after: p.terms }),
    run: (db, ctx, p) => {
      setTerms(db, ctx, p.terms)
      return getTerms(db)
    }
  },
  'locations.list': { kind: 'read', run: (db) => listAreas(db) },
  'area.create': {
    kind: 'write',
    audit: (p, id) => ({ action: 'area.created', entity: 'area', entityId: id, after: p }),
    run: (db, ctx, p) => createArea(db, ctx, stripUndefined(p))
  },
  'area.update': {
    kind: 'write',
    audit: (p) => ({ action: 'area.updated', entity: 'area', entityId: p.id, after: p }),
    run: (db, ctx, { id, ...patch }) => {
      updateArea(db, ctx, id, stripUndefined(patch))
      return null
    }
  },
  'area.archive': {
    kind: 'write',
    audit: (p) => ({ action: 'area.removed', entity: 'area', entityId: p.id }),
    run: (db, ctx, p) => {
      archiveArea(db, ctx, p.id)
      return null
    }
  },
  'bank.create': {
    kind: 'write',
    audit: (p, id) => ({ action: 'bank.created', entity: 'bank', entityId: id, after: p }),
    run: (db, ctx, p) => createBank(db, ctx, stripUndefined(p))
  },
  'bank.update': {
    kind: 'write',
    audit: (p) => ({ action: 'bank.updated', entity: 'bank', entityId: p.id, after: p }),
    run: (db, ctx, { id, ...patch }) => {
      updateBank(db, ctx, id, stripUndefined(patch))
      return null
    }
  },
  'bank.archive': {
    kind: 'write',
    audit: (p) => ({ action: 'bank.removed', entity: 'bank', entityId: p.id }),
    run: (db, ctx, p) => {
      archiveBank(db, ctx, p.id)
      return null
    }
  },
  'lockers.list': { kind: 'read', run: (db, p) => listLockers(db, stripUndefined(p)) },
  'lockers.planBulk': {
    kind: 'read',
    run: (db, p) => {
      const planned = planBulkLockers(p.input)
      return {
        planned,
        duplicates: duplicateNumbers(
          planned.map((x) => x.number),
          existingLockerNumbers(db)
        )
      }
    }
  },
  'lockers.addBulk': {
    kind: 'write',
    audit: (p, n) => ({
      action: 'lockers.added',
      entity: 'bank',
      entityId: p.bankId,
      after: { ...p.input, count: n, lock: p.lock?.type ?? 'none' }
    }),
    run: (db, ctx, p) =>
      addLockers(db, ctx, {
        bankId: p.bankId,
        planned: planBulkLockers(p.input),
        capacity: p.capacity,
        lock: p.lock
      })
  },
  'locker.update': {
    kind: 'write',
    audit: (p) => ({ action: 'locker.updated', entity: 'locker', entityId: p.id, after: p }),
    run: (db, ctx, { id, ...patch }) => {
      updateLocker(db, ctx, id, stripUndefined(patch))
      return null
    }
  },
  'locker.renumber': {
    kind: 'write',
    audit: (p, r) => ({
      action: 'locker.renumbered',
      entity: 'locker',
      entityId: p.id,
      before: { number: r.from },
      after: { number: r.to },
      reason: p.reason
    }),
    run: (db, ctx, p) => renumberLocker(db, ctx, p.id, p.number)
  },
  'locker.archive': {
    kind: 'write',
    audit: (p) => ({
      action: 'locker.removed',
      entity: 'locker',
      entityId: p.id,
      reason: p.reason
    }),
    run: (db, ctx, p) => {
      archiveLocker(db, ctx, p.id)
      return null
    }
  },
  'locks.setForBank': {
    kind: 'write',
    audit: (p, n) => ({
      action: 'locks.set_for_bank',
      entity: 'bank',
      entityId: p.bankId,
      after: { ...p.lock, lockers: n }
    }),
    run: (db, ctx, p) => setBankLocks(db, ctx, p.bankId, stripUndefined(p.lock))
  },
  'locks.defaults.get': { kind: 'read', run: (db) => lockDefaults(db) },
  'locks.defaults.set': {
    kind: 'write',
    audit: (p) => ({ action: 'locks.defaults_set', entity: 'settings', after: p.lock }),
    run: (db, ctx, p) => {
      setSetting(db, ctx, 'locks.defaults', p.lock)
      return lockDefaults(db)
    }
  },
  'setup.status': { kind: 'read', run: (db) => setupStatus(db) },
  'setup.complete': {
    kind: 'write',
    audit: (p) => ({ action: p.done ? 'setup.completed' : 'setup.reopened', entity: 'settings' }),
    run: (db, ctx: OperatorContext, p) => {
      setSetting(db, ctx, 'setup.completedAt', p.done ? ctx.now().toISOString() : '')
      return setupStatus(db)
    }
  },
  'setup.notUsed': {
    kind: 'write',
    audit: (p) => ({
      action: p.notUsed ? 'setup.item_not_used' : 'setup.item_used',
      entity: 'settings',
      after: p.item
    }),
    run: (db, ctx: OperatorContext, p) => {
      const rest = getSetting(db, 'setup.notUsed', NotUsedSchema, []).filter((i) => i !== p.item)
      setSetting(db, ctx, 'setup.notUsed', p.notUsed ? [...rest, p.item] : rest)
      return setupStatus(db)
    }
  }
}

/** Zod gives `undefined` for absent optional keys; the repositories want them absent. */
function stripUndefined<T extends object>(o: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>
  }
}
