import { describe, expect, it } from 'vitest'
import { setMeta } from '../../src/main/db/context'
import { prepareLabels } from '../../src/main/render/prepare'
import { prepareLetters } from '../../src/main/render/prepareLetters'
import { buildReportHtml, reportFooter } from '../../src/main/render/report'
import { buildReport } from '../../src/main/reports/build'
import { allocatedDemo } from './fixtures'

// SPEC.md 4.1: the demo school is marked DEMO on every screen and printout, so a
// demo letter with real-looking codes is never handed out by mistake (spec audit gap 8).
// Every school here is SYNTHETIC.

const MARK = 'class="demo-mark"'

async function files() {
  const demo = (await allocatedDemo()).db
  const real = (await allocatedDemo()).db
  setMeta(real, 'demo', '0')
  return { demo, real }
}

describe('the DEMO mark on printouts', () => {
  it('is on every demo label, and on no label from a real school', async () => {
    const { demo, real } = await files()
    const opts = { selection: { mode: 'all' }, startAt: 1, printer: null, outlines: false } as const
    const d = prepareLabels(demo, opts)
    expect(d.html.split(MARK).length - 1).toBe(d.records.length)
    expect(prepareLabels(real, opts).html).not.toContain(MARK)
  })

  it('is on every demo letter, and on no letter from a real school', async () => {
    const { demo, real } = await files()
    const opts = {
      selection: { mode: 'all' },
      language: { kind: 'each' },
      masked: true,
      preview: false
    } as const
    const d = prepareLetters(demo, opts)
    expect(d.items.length).toBeGreaterThan(0)
    expect(d.html.split(MARK).length - 1).toBe(d.items.length)
    expect(prepareLetters(real, opts).html).not.toContain(MARK)
  })

  it('is on demo reports, page and footer', async () => {
    const { demo } = await files()
    const report = buildReport(demo, {
      id: 'changes',
      group: null,
      since: '2020-01-01',
      includeCodes: false
    })
    const page = { school: 'SYNTHETIC', printedAt: new Date(), preview: false }
    expect(buildReportHtml(report, { ...page, demo: true })).toContain(MARK)
    expect(reportFooter(report, { ...page, demo: true })).toContain('DEMO')
    expect(buildReportHtml(report, page)).not.toContain(MARK)
    expect(reportFooter(report, page)).not.toContain('DEMO')
  })
})
