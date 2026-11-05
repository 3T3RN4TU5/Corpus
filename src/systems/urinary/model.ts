import { factNumber, factRange } from '../../data/physiology'
import type { SexProfile } from '../../data/sexProfiles'

/** Urine per day from hydration (0 is low, 1 is high). It runs from the sourced minimum to the top of the normal range. */
export function urinePerDay(hydration: number): number {
  const minimum = factNumber('urine-minimum') / 1000
  const [, high] = factRange('urine-daily')
  return minimum + (high - minimum) * Math.max(0, Math.min(1, hydration))
}

export interface FiltrationFigures {
  gfr: string
  filtrate: string
  /** Mid value used by the simulation, in mL per minute. */
  gfrValue: number
  note: string | null
}

/** Sources report separate values for females and males only. Other profiles show both rather than implying a value. */
export function filtration(profile: Pick<SexProfile, 'referenceSex'>): FiltrationFigures {
  const female = factNumber('gfr-female')
  const male = factNumber('gfr-male')
  if (profile.referenceSex === 'female') return { gfr: `${female} mL/min`, filtrate: `${factNumber('filtrate-female')} L/day`, gfrValue: female, note: null }
  if (profile.referenceSex === 'male') return { gfr: `${male} mL/min`, filtrate: `${factNumber('filtrate-male')} L/day`, gfrValue: male, note: null }
  return {
    gfr: `${female} to ${male} mL/min`,
    filtrate: `${factNumber('filtrate-female')} to ${factNumber('filtrate-male')} L/day`,
    gfrValue: (female + male) / 2,
    note: 'The source gives female and male values only, so both are shown.',
  }
}

export interface BladderState {
  volume: number
  urge: boolean
  voids: number
}

/** Advances the bladder by `dt` seconds. It empties once it passes the volume chosen for voiding. */
export function stepBladder(state: BladderState, dt: number, hydration: number, voidAt: number): BladderState {
  const mlPerSecond = (urinePerDay(hydration) * 1000) / 86400
  const volume = state.volume + mlPerSecond * dt
  if (volume >= voidAt) return { volume: 0, urge: false, voids: state.voids + 1 }
  return { volume, urge: volume >= factNumber('bladder-urge'), voids: state.voids }
}

export interface NephronStage {
  id: string
  name: string
  action: 'filtration' | 'reabsorption' | 'secretion' | 'concentration'
  text: string
}

export const NEPHRON_STAGES: NephronStage[] = [
  { id: 'glomerulus', name: 'Glomerulus', action: 'filtration', text: 'Blood pressure pushes water and small solutes out of the blood into the nephron. Blood cells and most proteins stay behind.' },
  { id: 'pct', name: 'Proximal tubule', action: 'reabsorption', text: `About ${factNumber('reabsorb-pct-water')} percent of the water and almost all the glucose return to the blood. The tubule also secretes some wastes into the fluid.` },
  { id: 'loop', name: 'Loop of Henle', action: 'reabsorption', text: `The descending limb takes back up to ${factNumber('reabsorb-loop-water')} percent of the water, and the ascending limb takes back salts.` },
  { id: 'dct', name: 'Distal tubule', action: 'secretion', text: 'Salts are reabsorbed, and ions such as potassium are secreted to balance the blood.' },
  { id: 'duct', name: 'Collecting duct', action: 'concentration', text: 'The hormone ADH sets how much more water returns to the blood, which decides how concentrated urine becomes.' },
]

/** Illustrative: share of the filtered water still in the tubule after each stage, built from sourced percentages. */
export function waterRemaining(hydration: number): number[] {
  const afterPct = 1 - factNumber('reabsorb-pct-water') / 100
  const afterLoop = afterPct - factNumber('reabsorb-loop-water') / 100
  const finalShare = (urinePerDay(hydration) / factNumber('filtrate-male')) * 1
  return [1, afterPct, afterLoop, Math.max(afterLoop * 0.6, finalShare), finalShare]
}
