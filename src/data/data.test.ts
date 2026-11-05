import { describe, expect, it } from 'vitest'
import { factsForPart, PARTS, partsForProfile, searchParts, SYSTEM_SOURCES } from './anatomy'
import { formatFact, getFact, physiology, validatePhysiology } from './physiology'
import { DEFAULT_CUSTOM, resolveProfile, SEX_PROFILES } from './sexProfiles'
import { BUILDERS, DETAIL, landmarks } from '../scene/bodyGeometry'
import { partAppearance, type AppearanceInput } from '../scene/appearance'

const part = (id: string) => PARTS.find((candidate) => candidate.id === id)!
const profile = (id: string) => resolveProfile(id, DEFAULT_CUSTOM)

describe('physiology.json', () => {
  it('meets the schema', () => {
    expect(validatePhysiology(physiology)).toEqual([])
  })

  it('catches a number with no source', () => {
    const bad = { ...physiology[0], source: { title: '', url: 'http://x' } }
    expect(validatePhysiology([bad])).toEqual(
      expect.arrayContaining([expect.stringContaining('source title'), expect.stringContaining('https')]),
    )
  })

  it('catches a value outside its range', () => {
    const bad = { ...getFact('heart-rate-rest-adult'), value: 300 }
    expect(validatePhysiology([bad])).toEqual([expect.stringContaining('outside its range')])
  })

  it('formats values and ranges without inventing a midpoint', () => {
    expect(formatFact(getFact('heart-rate-rest-adult'))).toBe('75 bpm (range 60–100)')
    expect(formatFact(getFact('blood-volume-female'))).toBe('4–5 L')
    expect(formatFact(getFact('bones-adult-total'))).toBe('206 bones')
  })
})

describe('anatomy catalog', () => {
  it('has unique ids, and every fact id resolves', () => {
    const ids = PARTS.map((candidate) => candidate.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const candidate of PARTS) {
      expect(() => factsForPart(candidate, profile('female'))).not.toThrow()
    }
  })

  it('has a source for every system', () => {
    for (const candidate of PARTS) expect(SYSTEM_SOURCES[candidate.system].length).toBeGreaterThan(0)
  })

  it('matches the geometry builders one to one', () => {
    expect(Object.keys(BUILDERS).sort()).toEqual(PARTS.map((candidate) => candidate.id).sort())
  })

  it('builds valid geometry for every part at every quality', () => {
    const options = { frame: 0.5, testesPosition: 'internal' as const, ovaryScale: 1, testesScale: 1 }
    for (const detail of Object.values(DETAIL)) {
      for (const [id, build] of Object.entries(BUILDERS)) {
        const geometry = build(landmarks(options.frame), detail, options)
        const positions = geometry.getAttribute('position')
        expect(positions.count, id).toBeGreaterThan(0)
        expect(Array.from(positions.array).every(Number.isFinite), id).toBe(true)
      }
    }
  })
})

describe('sex profiles', () => {
  it('shows only the structures each profile has', () => {
    const names = (id: string) => partsForProfile(profile(id)).map((candidate) => candidate.id)
    expect(names('female')).toEqual(expect.arrayContaining(['uterus', 'ovaries']))
    expect(names('female')).not.toContain('testes')
    expect(names('male')).toEqual(expect.arrayContaining(['testes', 'prostate']))
    expect(names('male')).not.toContain('uterus')
    expect(names('cais')).toContain('testes')
    expect(names('cais')).not.toContain('uterus')
  })

  it('lets a custom profile combine any structures', () => {
    const custom = resolveProfile('custom', { ...DEFAULT_CUSTOM, structures: ['uterus', 'prostate'] })
    const ids = partsForProfile(custom).map((candidate) => candidate.id)
    expect(ids).toEqual(expect.arrayContaining(['uterus', 'prostate']))
    expect(ids).not.toContain('ovaries')
  })

  it('uses the matching range for female and male profiles', () => {
    const female = factsForPart(part('aorta'), profile('female'))
    expect(female.facts.map((fact) => fact.id)).toContain('hematocrit-female')
    expect(female.facts.map((fact) => fact.id)).not.toContain('hematocrit-male')
    expect(female.showsBothSexes).toBe(false)
  })

  it('shows both ranges and says so when no separate range is reported', () => {
    for (const { id } of SEX_PROFILES.filter((candidate) => candidate.group === 'variation')) {
      const result = factsForPart(part('aorta'), profile(id))
      expect(result.facts.map((fact) => fact.id)).toEqual(expect.arrayContaining(['hematocrit-female', 'hematocrit-male']))
      expect(result.showsBothSexes).toBe(true)
    }
  })

  it('gives every variation a source and a prevalence entry', () => {
    for (const candidate of SEX_PROFILES.filter((item) => item.group === 'variation')) {
      expect(candidate.source?.url).toMatch(/^https:/)
      expect(() => getFact(candidate.prevalenceFactId!)).not.toThrow()
    }
  })
})

describe('search', () => {
  const all = partsForProfile(resolveProfile('custom', { ...DEFAULT_CUSTOM, structures: ['ovaries', 'uterus', 'testes', 'prostate'] }))

  it('ranks a name match above an alias match', () => {
    expect(searchParts('heart', all)[0].id).toBe('heart')
  })

  it('finds parts by common name', () => {
    expect(searchParts('collarbone', all)[0].id).toBe('clavicle')
    expect(searchParts('windpipe', all)[0].id).toBe('trachea')
  })

  it('returns nothing for an empty query', () => {
    expect(searchParts('   ', all)).toEqual([])
  })

  it('leaves out structures the profile does not have', () => {
    expect(searchParts('uterus', partsForProfile(profile('male')))).toEqual([])
  })
})

describe('part appearance', () => {
  const base: AppearanceInput = {
    layers: {
      skin: { visible: true, opacity: 0.2 },
      fat: { visible: false, opacity: 0.5 },
      muscle: { visible: true, opacity: 1 },
      skeleton: { visible: true, opacity: 1 },
      organs: { visible: true, opacity: 1 },
      vessels: { visible: true, opacity: 1 },
      nerves: { visible: true, opacity: 1 },
      lymph: { visible: true, opacity: 1 },
    },
    xray: false,
    isolate: false,
    selectedId: null,
  }

  it('hides parts in a layer that is switched off', () => {
    expect(partAppearance(part('subcutaneous-fat'), base).visible).toBe(false)
  })

  it('makes faint layers click-through', () => {
    const skin = partAppearance(part('skin'), base)
    expect(skin.visible).toBe(true)
    expect(skin.pickable).toBe(false)
    expect(partAppearance(part('heart'), base).pickable).toBe(true)
  })

  it('isolates the selected part, keeping only a faint body outline', () => {
    const input = { ...base, isolate: true, selectedId: 'heart' }
    expect(partAppearance(part('heart'), input)).toMatchObject({ visible: true, opacity: 1, pickable: true })
    expect(partAppearance(part('liver'), input).visible).toBe(false)
    expect(partAppearance(part('skin'), input)).toMatchObject({ visible: true, pickable: false })
  })

  it('makes soft tissue click-through in x-ray mode', () => {
    const input = { ...base, xray: true }
    expect(partAppearance(part('deltoid'), input).pickable).toBe(false)
    expect(partAppearance(part('femur'), input).pickable).toBe(true)
  })
})
