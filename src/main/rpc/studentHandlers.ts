import { z } from 'zod'
import type { FileSettings, ImportOptions } from '@shared/importTypes'
import type { LockerDb } from '../db/db'
import { analyseImport, buildStudents } from '../import/analyse'
import { applyImport } from '../import/apply'
import {
  discardImport,
  headersFor,
  loadImport,
  pendingFiles,
  savedMappingKey
} from '../import/session'
import { getSetting, setSetting } from '../repos/settings'
import {
  addExclusion,
  confirmLeft,
  createStudent,
  getStudent,
  groupMap,
  listExclusions,
  listGroups,
  listStudents,
  markStillHere,
  removeExclusion,
  setGroupDisplay,
  setGroupSortLast,
  studentCounts,
  updateStudent
} from '../repos/students'
import type { Handlers } from './registry'

const StoredOptions = z.object({
  particles: z.enum(['lower', 'capital']),
  wholeSchool: z.boolean()
})
const SavedMappings = z.record(z.string(), z.record(z.string(), z.number()))

// The import screen keeps mappings it has seen before, keyed by the header row,
// so the second import of the same export needs no matching (SPEC.md 4.2 step 3).
// Loading happens before the data file is touched, so the saved mappings are read
// at load time through this hook, set by the file service.
let readSavedMappings: () => Record<string, Partial<FileSettings['mapping']>> = () => ({})
export function setSavedMappingsReader(
  fn: () => Record<string, Partial<FileSettings['mapping']>>
): void {
  readSavedMappings = fn
}

export function savedMappings(db: LockerDb): Record<string, Partial<FileSettings['mapping']>> {
  return getSetting(db, 'import.savedMappings', SavedMappings, {}) as Record<
    string,
    Partial<FileSettings['mapping']>
  >
}

function importOptions(db: LockerDb): ImportOptions {
  const stored = getSetting(db, 'import.options', StoredOptions, {
    particles: 'capital',
    wholeSchool: false
  })
  return { ...stored, groupMap: groupMap(db) }
}

function strip<T extends object>(o: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>
  }
}

type StudentKeys =
  | 'import.load'
  | 'import.options.get'
  | 'import.analyse'
  | 'import.apply'
  | 'import.discard'
  | 'students.list'
  | 'students.counts'
  | 'student.get'
  | 'student.create'
  | 'student.update'
  | 'student.stillHere'
  | 'student.confirmLeft'
  | 'exclusions.list'
  | 'exclusion.add'
  | 'exclusion.remove'
  | 'groups.list'
  | 'group.setDisplay'
  | 'group.setSortLast'

export const studentHandlers: Pick<Handlers, StudentKeys> = {
  'import.load': { kind: 'pure', run: (p) => loadImport(p.files, p.pasted, readSavedMappings()) },
  'import.options.get': { kind: 'read', run: (db) => importOptions(db) },
  'import.analyse': {
    kind: 'read',
    run: (db, p) =>
      analyseImport(
        db,
        buildStudents(pendingFiles(p.importId), p.files as FileSettings[], p.options),
        p.options
      )
  },
  'import.apply': {
    kind: 'write',
    audit: (p, r) => ({
      action: 'students.imported',
      entity: 'student',
      after: { ...r, profile: p.profile }
    }),
    run: (db, ctx, p) => {
      const files = pendingFiles(p.importId)
      // Analysed again against the file as it is now, so nothing applies to stale data.
      const analysis = analyseImport(
        db,
        buildStudents(files, p.files as FileSettings[], p.options),
        p.options
      )
      const result = applyImport(db, ctx, analysis, p.selections, {
        files: files.map((f) => f.fileName),
        profile: p.profile
      })
      setSetting(db, ctx, 'import.options', {
        particles: p.options.particles,
        wholeSchool: p.options.wholeSchool
      })
      setSetting(db, ctx, 'groups.displayMap', { ...groupMap(db), ...p.options.groupMap })
      const saved = { ...savedMappings(db) }
      headersFor(p.importId, p.files as FileSettings[]).forEach((headers, i) => {
        const mapping = p.files[i]?.mapping
        if (headers.length > 0 && mapping) saved[savedMappingKey(headers)] = mapping
      })
      setSetting(db, ctx, 'import.savedMappings', saved)
      discardImport(p.importId)
      return result
    }
  },
  'import.discard': {
    kind: 'pure',
    run: (p) => {
      discardImport(p.importId)
      return null
    }
  },
  'students.list': { kind: 'read', run: (db, p) => listStudents(db, strip(p)) },
  'students.counts': { kind: 'read', run: (db) => studentCounts(db) },
  'student.get': { kind: 'read', run: (db, p) => getStudent(db, p.id) },
  'student.create': {
    kind: 'write',
    audit: (p, s) => ({ action: 'student.added', entity: 'student', entityId: s.id, after: p }),
    run: (db, ctx, p) => getStudent(db, createStudent(db, ctx, p))!
  },
  'student.update': {
    kind: 'write',
    audit: (p) => ({
      action: p.confirmName ? 'student.name_confirmed' : 'student.updated',
      entity: 'student',
      entityId: p.id,
      after: p
    }),
    run: (db, ctx, { id, ...patch }) => updateStudent(db, ctx, id, strip(patch))
  },
  'student.stillHere': {
    kind: 'write',
    audit: (p) => ({ action: 'student.still_enrolled', entity: 'student', entityId: p.id }),
    run: (db, ctx, p) => {
      markStillHere(db, ctx, p.id)
      return null
    }
  },
  'student.confirmLeft': {
    kind: 'write',
    audit: (p) => ({ action: 'student.left', entity: 'student', entityId: p.id }),
    run: (db, ctx, p) => {
      confirmLeft(db, ctx, p.id)
      return null
    }
  },
  'exclusions.list': { kind: 'read', run: (db) => listExclusions(db) },
  'exclusion.add': {
    kind: 'write',
    audit: (p, id) => ({
      action: 'exclusion.added',
      entity: 'exclusion',
      entityId: id,
      after: p,
      reason: p.reason
    }),
    run: (db, ctx, p) => addExclusion(db, ctx, p.kind, p.value, p.reason)
  },
  'exclusion.remove': {
    kind: 'write',
    audit: (p) => ({ action: 'exclusion.removed', entity: 'exclusion', entityId: p.id }),
    run: (db, _ctx, p) => {
      removeExclusion(db, p.id)
      return null
    }
  },
  'groups.list': { kind: 'read', run: (db) => listGroups(db) },
  'group.setDisplay': {
    kind: 'write',
    audit: (p) => ({ action: 'group.display_set', entity: 'group', entityId: p.code, after: p }),
    run: (db, ctx, p) => {
      setGroupDisplay(db, ctx, p.code, p.display)
      return null
    }
  },
  'group.setSortLast': {
    kind: 'write',
    audit: (p) => ({ action: 'group.sort_last_set', entity: 'group', entityId: p.code, after: p }),
    run: (db, ctx, p) => {
      setGroupSortLast(db, ctx, p.code, p.sortLast)
      return null
    }
  }
}
