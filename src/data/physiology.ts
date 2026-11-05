import raw from './physiology.json'

export type Confidence = 'high' | 'approximate' | 'illustrative'
export type DataSex = 'all' | 'female' | 'male'

export interface Source {
  title: string
  url: string
}

/** The schema for every physiological number in the app. */
export interface PhysiologyEntry {
  id: string
  label: string
  /** null means the source gives only a range, so no single value is claimed. */
  value: number | null
  unit: string
  range: [number, number] | null
  ageGroup: string
  sex: DataSex
  source: Source
  confidence: Confidence
  note?: string
}

export const physiology = raw as unknown as PhysiologyEntry[]

const byId = new Map(physiology.map((entry) => [entry.id, entry]))

export function getFact(id: string): PhysiologyEntry {
  const entry = byId.get(id)
  if (!entry) throw new Error(`Unknown physiology entry: ${id}`)
  return entry
}

export function formatFact(entry: PhysiologyEntry): string {
  const { value, range, unit } = entry
  if (value !== null && range) return `${value} ${unit} (range ${range[0]}–${range[1]})`
  if (value !== null) return `${value} ${unit}`
  if (range) return `${range[0]}–${range[1]} ${unit}`
  return unit
}

const CONFIDENCE: Confidence[] = ['high', 'approximate', 'illustrative']
const SEX: DataSex[] = ['all', 'female', 'male']

/** Returns every schema problem found, so a test can report them all at once. */
export function validatePhysiology(entries: PhysiologyEntry[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    const at = entry.id || '(missing id)'
    if (!entry.id) errors.push(`${at}: missing id`)
    if (seen.has(entry.id)) errors.push(`${at}: duplicate id`)
    seen.add(entry.id)
    if (!entry.label) errors.push(`${at}: missing label`)
    if (!entry.unit) errors.push(`${at}: missing unit`)
    if (!entry.ageGroup) errors.push(`${at}: missing ageGroup`)
    if (!SEX.includes(entry.sex)) errors.push(`${at}: invalid sex`)
    if (!CONFIDENCE.includes(entry.confidence)) errors.push(`${at}: invalid confidence`)
    if (!entry.source?.title) errors.push(`${at}: missing source title`)
    if (!entry.source?.url?.startsWith('https://')) errors.push(`${at}: source url must be https`)
    if (entry.value === null && !entry.range) errors.push(`${at}: needs a value or a range`)
    if (entry.range) {
      const [min, max] = entry.range
      if (min > max) errors.push(`${at}: range is reversed`)
      if (entry.value !== null && (entry.value < min || entry.value > max)) {
        errors.push(`${at}: value is outside its range`)
      }
    }
  }
  return errors
}
