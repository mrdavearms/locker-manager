import { describe, expect, it } from 'vitest'
import { contrast, darkenFor, needsLogoTile, textOn } from '../../src/shared/colour'
import type { SchoolProfile } from '../../src/shared/locations'

// Print audit H5 and H6: pale school colours and logos on the letter heading band.

describe('contrast', () => {
  it('matches the published figures', () => {
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 1)
    expect(contrast('#FFFFFF', '#FFD700')).toBeCloseTo(1.4, 1)
    expect(contrast('#FFFFFF', '#1F3A5F')).toBeCloseTo(11.5, 1)
  })
  it('picks black text on gold and sky blue, white on navy and maroon', () => {
    expect(textOn('#FFD700')).toBe('#141414')
    expect(textOn('#87CEEB')).toBe('#141414')
    expect(textOn('#1F3A5F')).toBe('#FFFFFF')
    expect(textOn('#800000')).toBe('#FFFFFF')
  })
  it('darkens a pale colour just enough to read on white and its tints', () => {
    for (const c of ['#FFD700', '#87CEEB', '#FF8C00', '#8BC34A']) {
      const d = darkenFor(c, ['#FFFFFF', '#FFF7CC'])
      expect(contrast(d, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
      expect(contrast(d, '#FFF7CC')).toBeGreaterThanOrEqual(4.5)
    }
    expect(darkenFor('#1F3A5F', ['#FFFFFF'])).toBe('#1F3A5F')
  })
})

describe('needsLogoTile', () => {
  const facts = {
    version: 2,
    width: 600,
    height: 600,
    svg: false,
    lightOnWhite: false,
    opaque: false,
    ink: '#1F3A5F',
    mono: 'auto' as const,
    monoResult: 'ok' as const
  }
  const profile = (over: Partial<SchoolProfile> = {}): SchoolProfile => ({
    name: 'SYNTHETIC',
    shortName: null,
    colourPrimary: '#1F3A5F',
    colourAccent: null,
    colourStripes: [],
    address: null,
    hasLogo: true,
    hasMonoLogo: true,
    logoDataUrl: 'data:image/png;base64,AAAA',
    monoLogoDataUrl: 'data:image/png;base64,AAAA',
    logoFacts: facts,
    ...over
  })
  it('tiles a navy crest on a navy band, not on a gold one', () => {
    expect(needsLogoTile(profile(), '#1F3A5F')).toBe(true)
    expect(needsLogoTile(profile(), '#FFD700')).toBe(false)
  })
  it('tiles a logo with its own background, and a JPEG from an older file', () => {
    expect(needsLogoTile(profile({ logoFacts: { ...facts, opaque: true } }), '#FFD700')).toBe(true)
    expect(
      needsLogoTile(
        profile({ logoFacts: null, logoDataUrl: 'data:image/jpeg;base64,AAAA' }),
        '#1F3A5F'
      )
    ).toBe(true)
    expect(needsLogoTile(profile({ logoFacts: null }), '#1F3A5F')).toBe(false)
  })
  it('tiles a logo with white lettering on a pale band', () => {
    const lettered = { ...facts, lightOnWhite: true }
    expect(needsLogoTile(profile({ logoFacts: lettered }), '#FFD700')).toBe(true)
    expect(needsLogoTile(profile({ logoFacts: { ...lettered, ink: '#FFD700' } }), '#1F3A5F')).toBe(
      false
    )
  })
  it('does not tile a white logo on a dark band', () => {
    expect(needsLogoTile(profile({ logoFacts: { ...facts, ink: '#FFFFFF' } }), '#1F3A5F')).toBe(
      false
    )
  })
})
