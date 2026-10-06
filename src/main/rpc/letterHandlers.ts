import type { LetterPreview } from '@shared/letters'
import {
  addImage,
  deleteImage,
  letterTemplate,
  listImages,
  resetLetterTemplate,
  saveLetterTemplate,
  setStudentLanguage
} from '../repos/letters'
import { getSchoolProfile } from '../repos/school'
import { buildReport, maskCodes } from '../reports/build'
import { buildReportHtml } from '../render/report'
import { prepareLetters } from '../render/prepareLetters'
import type { Handlers } from './registry'

type Keys =
  | 'letters.template.get'
  | 'letters.template.set'
  | 'letters.template.reset'
  | 'letters.images.list'
  | 'letters.images.add'
  | 'letters.images.delete'
  | 'letters.preview'
  | 'students.setLanguage'
  | 'reports.preview'

export const letterHandlers: Pick<Handlers, Keys> = {
  'letters.template.get': { kind: 'read', run: (db) => letterTemplate(db) },
  'letters.template.set': {
    kind: 'write',
    audit: () => ({
      action: 'letters.template_set',
      entity: 'letter_template',
      entityId: 'default'
    }),
    run: (db, ctx, p) => saveLetterTemplate(db, ctx, p.template)
  },
  'letters.template.reset': {
    kind: 'write',
    audit: () => ({
      action: 'letters.template_reset',
      entity: 'letter_template',
      entityId: 'default'
    }),
    run: (db, ctx) => resetLetterTemplate(db, ctx)
  },
  'letters.images.list': { kind: 'read', run: (db) => listImages(db) },
  'letters.images.add': {
    kind: 'write',
    audit: (p) => ({
      action: 'letters.image_added',
      entity: 'image',
      after: { name: p.name, bytes: p.bytes.byteLength }
    }),
    run: (db, ctx, p) => {
      addImage(db, ctx, p)
      return listImages(db)
    }
  },
  'letters.images.delete': {
    kind: 'write',
    audit: (p) => ({ action: 'letters.image_removed', entity: 'image', entityId: p.id }),
    run: (db, ctx, p) => {
      deleteImage(db, ctx, p.id)
      return listImages(db)
    }
  },
  'letters.preview': {
    kind: 'read',
    run: (db, p): LetterPreview => {
      const out = prepareLetters(db, {
        selection: p.selection,
        language: p.language,
        template: p.template,
        masked: true,
        preview: true,
        index: p.index
      })
      return {
        html: out.html,
        index: Math.min(p.index, Math.max(0, out.items.length - 1)),
        letters: out.items.length,
        heldBack: out.heldBack,
        pageWidth: out.page.width,
        pageHeight: out.page.height,
        tooLong: out.tooLong
      }
    }
  },
  'students.setLanguage': {
    kind: 'write',
    audit: (p) => ({
      action: 'student.language_set',
      entity: 'student',
      entityId: p.studentId,
      after: { language: p.code }
    }),
    run: (db, ctx, p) => {
      setStudentLanguage(db, ctx, p.studentId, p.code)
      return null
    }
  },
  'reports.preview': {
    kind: 'read',
    run: (db, p) => {
      const report = maskCodes(buildReport(db, p.request))
      return {
        html: buildReportHtml(report, {
          school: getSchoolProfile(db).name,
          printedAt: new Date(),
          preview: true
        }),
        rows: report.rows,
        confidential: report.confidential
      }
    }
  }
}
