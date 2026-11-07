import { describe, expect, it } from 'vitest'
import { factsForPart, PARTS, partsForProfile, searchParts, SYSTEM_SOURCES } from './anatomy'
import { formatFact, getFact, physiology, validatePhysiology } from './physiology'
import { DEFAULT_CUSTOM, resolveProfile, SEX_PROFILES } from './sexProfiles'
import { modelManifest, modelProvenance, partIdFromNodeName } from './models'
import { partAppearance, type AppearanceInput } from '../scene/appearance'
import { pickLabels } from '../scene/labels'

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

  it('never lists a part\'s own system as connected', () => {
    for (const candidate of PARTS) expect(candidate.connected, candidate.id).not.toContain(candidate.system)
  })

  it('has a source for every system', () => {
    for (const candidate of PARTS) expect(SYSTEM_SOURCES[candidate.system].length).toBeGreaterThan(0)
  })

  it('matches the built 3D models one to one, for both bodies', () => {
    const ids = PARTS.map((candidate) => candidate.id).sort()
    for (const body of Object.values(modelManifest.bodies)) {
      expect(Object.keys(body.parts).sort()).toEqual(ids)
    }
  })

  it('puts each part in the model layer the catalog expects', () => {
    for (const body of Object.values(modelManifest.bodies)) {
      for (const candidate of PARTS) expect(body.parts[candidate.id].layer, candidate.id).toBe(candidate.layer)
    }
  })

  it('has both levels of detail for every model file', () => {
    for (const body of Object.values(modelManifest.bodies)) {
      const names = (lod: string) => body.files.filter((file) => file.lod === lod).map((file) => file.file.replace(`-${lod}.glb`, ''))
      expect(names('low').sort()).toEqual(names('high').sort())
    }
  })

  it('reads part ids from exported node names', () => {
    expect(partIdFromNodeName('arm-arteries')).toBe('arm-arteries')
    expect(partIdFromNodeName('arm-arteries.001')).toBe('arm-arteries')
    expect(partIdFromNodeName('arm-arteries001')).toBe('arm-arteries')
  })

  it('states when a shape is hand-placed or not specific to the body', () => {
    expect(modelProvenance('female', 'thoracic-duct')).toContain('Illustrative')
    expect(modelProvenance('female', 'sciatic-nerve')).toContain('Z-Anatomy')
    expect(modelProvenance('female', 'femur')).toContain('not female-specific')
    expect(modelProvenance('female', 'heart')).toContain('NIH')
  })
})

describe('anatomical sanity of the built models', () => {
  for (const [name, body] of Object.entries(modelManifest.bodies)) {
    const c = (id: string) => body.parts[id].centre

    it(`puts asymmetric organs on the correct side in the ${name} body`, () => {
      // The body's left is +x.
      expect(c('heart')[0]).toBeGreaterThan(0)
      expect(c('stomach')[0]).toBeGreaterThan(0)
      expect(c('spleen')[0]).toBeGreaterThan(0)
      expect(c('liver')[0]).toBeLessThan(0.02)
      expect(c('gallbladder')[0]).toBeLessThan(0)
      expect(c('lung-left')[0]).toBeGreaterThan(0)
      expect(c('lung-right')[0]).toBeLessThan(0)
    })

    it(`shows whole organs, not just their blood vessels, in the ${name} body`, () => {
      // These organs were once replaced by files named like Blood_Vasculature_Liver, which have a different size and source.
      expect(body.parts.liver.radius).toBeGreaterThan(body.parts.gallbladder.radius)
      expect(body.parts.liver.triangles).toBeGreaterThan(5000)
      expect(body.parts.heart.radius).toBeLessThan(0.14)
      expect(body.parts['heart-left-ventricle'].triangles).toBeGreaterThan(3000)
      expect(body.parts.spleen.radius).toBeLessThan(0.1)
    })

    it(`includes the eyes inside the head in the ${name} body`, () => {
      expect(body.parts.eyes.centre[1]).toBeGreaterThan(c('mandible')[1])
      expect(body.parts.eyes.centre[1]).toBeLessThan(body.height)
      // Each eye is about 24 mm across, so the pair spans a little more than the distance between the pupils.
      expect(body.parts['eye-pupil'].centre[2]).toBeGreaterThan(body.parts.eyes.centre[2])
      expect(Math.abs(body.parts.eyes.centre[0])).toBeLessThan(0.01)
      expect(body.parts.eyes.centre[2]).toBeGreaterThan(c('brain-occipital')[2])
    })

    it(`has paired muscles and arteries on both sides in the ${name} body`, () => {
      // BodyParts3D has left-side intercostals only, and files foot arteries under names shared with the hand.
      expect(Math.abs(c('chest-wall-muscles')[0])).toBeLessThan(0.012)
      expect(Math.abs(c('arm-arteries')[0])).toBeLessThan(0.012)
      expect(body.parts['arm-arteries'].centre[1]).toBeGreaterThan(body.height * 0.5)
    })

    it(`puts the heart's chambers in their correct places in the ${name} body`, () => {
      // The atria sit above the ventricles, and the left side of the heart is further left than the right side.
      expect(c('heart-left-atrium')[1]).toBeGreaterThan(c('heart-left-ventricle')[1] - 0.01)
      expect(c('heart-right-atrium')[1]).toBeGreaterThan(c('heart-right-ventricle')[1] - 0.01)
      expect(c('heart-left-ventricle')[0]).toBeGreaterThan(c('heart-right-ventricle')[0])
    })

    it(`puts the brain's regions in their correct places in the ${name} body`, () => {
      expect(c('brain-frontal')[2]).toBeGreaterThan(c('brain-occipital')[2])
      expect(c('brain-cerebellum')[1]).toBeLessThan(c('brain-parietal')[1])
      expect(c('brain-brainstem')[1]).toBeLessThan(c('brain-thalamus')[1])
    })

    it(`orders parts from top to bottom in the ${name} body`, () => {
      const y = (id: string) => c(id)[1]
      expect(y('brain-frontal')).toBeGreaterThan(y('lung-left'))
      expect(y('lung-left')).toBeGreaterThan(y('liver'))
      expect(y('liver')).toBeGreaterThan(y('small-intestine'))
      expect(y('small-intestine')).toBeGreaterThan(y('bladder'))
      expect(y('femur')).toBeGreaterThan(y('tibia'))
      expect(y('tibia')).toBeGreaterThan(y('foot-bones'))
    })

    it(`orders parts from front to back in the ${name} body`, () => {
      expect(c('vertebral-column')[2]).toBeLessThan(c('sternum')[2])
      expect(c('patella')[2]).toBeGreaterThan(c('hamstrings')[2])
      expect(c('gluteus-maximus')[2]).toBeLessThan(c('quadriceps')[2])
    })

    it(`keeps every part within the ${name} body's height`, () => {
      for (const part of Object.values(body.parts)) {
        expect(part.centre[1]).toBeGreaterThan(0)
        expect(part.centre[1]).toBeLessThan(body.height)
      }
    })
  }
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

  it('does not imply that the CAIS profile has no vagina, and says the model is a placeholder', () => {
    const cais = profile('cais')
    expect(partsForProfile(cais).map((candidate) => candidate.id)).toContain('vagina')
    expect(cais.modelNote).toContain('placeholder')
    expect(partsForProfile(profile('male')).map((candidate) => candidate.id)).not.toContain('vagina')
    expect(partsForProfile(profile('klinefelter')).map((candidate) => candidate.id)).not.toContain('vagina')
  })

  it('gives a model note to every variation', () => {
    for (const candidate of SEX_PROFILES.filter((item) => item.group === 'variation')) {
      expect(candidate.modelNote, candidate.id).toBeTruthy()
    }
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

  it('keeps the eyes present behind solid skin, even with the organs off', () => {
    const solid = { ...base, layers: { ...base.layers, skin: { visible: true, opacity: 1 }, organs: { visible: false, opacity: 1 } } }
    expect(partAppearance(part('eye-iris'), solid).visible).toBe(true)
    expect(partAppearance(part('liver'), solid).visible).toBe(false)
    const faint = { ...solid, layers: { ...solid.layers, skin: { visible: true, opacity: 0.2 } } }
    expect(partAppearance(part('eye-iris'), faint).visible).toBe(false)
  })

  it('removes a hidden part, even when its layer is on', () => {
    expect(partAppearance(part('heart'), { ...base, hidden: true }).visible).toBe(false)
  })

  it('fades a part in front of the selection and lets clicks through it', () => {
    const faded = partAppearance(part('heart'), { ...base, selectedId: 'liver', faded: true })
    expect(faded.visible).toBe(true)
    expect(faded.opacity).toBeLessThan(0.2)
    expect(faded.pickable).toBe(false)
  })

  it('never brightens a layer that is already fainter than the fade', () => {
    const input = { ...base, layers: { ...base.layers, organs: { visible: true, opacity: 0.05 } }, faded: true }
    expect(partAppearance(part('heart'), input).opacity).toBeCloseTo(0.05)
  })

  it('makes soft tissue click-through in x-ray mode', () => {
    const input = { ...base, xray: true }
    expect(partAppearance(part('deltoid'), input).pickable).toBe(false)
    expect(partAppearance(part('femur'), input).pickable).toBe(true)
  })
})

describe('choosing which part labels to show', () => {
  const label = (id: string, x: number, y: number, radius: number) => ({ id, name: 'Label', x, y, radius })

  it('keeps the larger part when two labels would overlap', () => {
    const placed = pickLabels([label('small', 100, 100, 0.01), label('large', 100, 102, 0.3)], 800, 600)
    expect(placed.map((item) => item.id)).toContain('large')
    expect(placed.filter((item) => item.side === 'right').map((item) => item.id)).toEqual(['large'])
  })

  it('uses the other side when one side is taken', () => {
    const placed = pickLabels([label('first', 100, 100, 0.3), label('second', 100, 100, 0.1)], 800, 600)
    expect(placed.map((item) => item.side)).toEqual(['right', 'left'])
  })

  it('moves a label to the left at the right edge of the screen', () => {
    expect(pickLabels([label('edge', 795, 100, 0.1)], 800, 600)[0].side).toBe('left')
  })

  it('skips parts that are off screen', () => {
    expect(pickLabels([label('gone', -5, 100, 0.1), label('below', 100, 700, 0.1)], 800, 600)).toEqual([])
  })
})
