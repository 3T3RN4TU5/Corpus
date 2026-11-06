import { factNumber, factRange } from '../../data/physiology'

export interface GlucoseState {
  /** Blood glucose, in mg/dL. */
  glucose: number
  /** Relative hormone signals from 0 to 1. They are not concentrations. */
  insulin: number
  glucagon: number
  /** Glucose still to be absorbed from food, in mg/dL equivalent. */
  gut: number
  /** Extra glucose use from exercise, from 0 to 1. */
  exercise: number
}

export function initialGlucose(): GlucoseState {
  return { glucose: factNumber('glucose-fasting'), insulin: 0.1, glucagon: 0.1, gut: 0, exercise: 0 }
}

/**
 * A simple feedback loop: raised glucose brings insulin, which moves glucose into cells, and low glucose brings glucagon,
 * which releases stored glucose. The direction of each effect is from the source. All the rate constants are illustrative,
 * chosen so that glucose returns to its normal range over a few hours.
 */
export function stepGlucose(state: GlucoseState, dtSeconds: number): GlucoseState {
  const setPoint = factNumber('glucose-fasting')
  let { glucose, insulin, glucagon, gut, exercise } = state
  const steps = Math.max(1, Math.ceil(dtSeconds / 30))
  const dt = dtSeconds / steps / 60 // Minutes.
  for (let i = 0; i < steps; i++) {
    const absorbed = gut * 0.025 * dt
    gut -= absorbed
    const targetInsulin = Math.max(0, Math.min(1, 0.1 + (glucose - setPoint) / 70))
    const targetGlucagon = Math.max(0, Math.min(1, 0.1 + (setPoint - glucose) / 18))
    insulin += (targetInsulin - insulin) * 0.08 * dt
    glucagon += (targetGlucagon - glucagon) * 0.12 * dt
    const uptake = (insulin * 1.6 + exercise * 0.5) * dt
    const release = (glucagon * 1.1 + 0.16) * dt
    glucose += absorbed - uptake + release
    exercise = Math.max(0, exercise - (dt / 60) * 1)
  }
  return { glucose, insulin, glucagon, gut, exercise }
}

/** A meal's carbohydrate, in grams, becomes a pool of glucose to absorb. The conversion is illustrative. */
export function eat(state: GlucoseState, carbohydrateGrams: number): GlucoseState {
  return { ...state, gut: state.gut + carbohydrateGrams * 1.1 }
}

export function exercise(state: GlucoseState): GlucoseState {
  return { ...state, exercise: 1 }
}

export type GlucoseBand = 'low' | 'normal' | 'raised'

export function glucoseBand(glucose: number): GlucoseBand {
  const [low, high] = factRange('glucose-normal-textbook')
  if (glucose < low) return 'low'
  if (glucose > high) return 'raised'
  return 'normal'
}

export interface Gland {
  name: string
  hormones: string
  role: string
}

export const GLANDS: Gland[] = [
  { name: 'Pancreas', hormones: 'Insulin, glucagon', role: 'Regulates blood glucose.' },
  { name: 'Pituitary', hormones: 'Growth hormone, ADH, oxytocin and others', role: 'Directs many other glands.' },
  { name: 'Thyroid', hormones: 'T3, T4', role: 'Sets the pace of metabolism.' },
  { name: 'Adrenal glands', hormones: 'Cortisol, aldosterone, epinephrine', role: 'Respond to stress and balance salt and water.' },
  { name: 'Ovaries', hormones: 'Estrogen, progesterone', role: 'Regulate reproductive cycles and development.' },
  { name: 'Testes', hormones: 'Testosterone', role: 'Regulate sperm production and development.' },
  { name: 'Thymus', hormones: 'Thymosins', role: 'Supports T cell maturation.' },
]
