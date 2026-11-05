import { factNumber, factRange } from '../../data/physiology'

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'vigorous'

/** Share of the way from resting toward vigorous breathing. These shares are illustrative. */
const ACTIVITY_DEMAND: Record<ActivityLevel, number> = { sedentary: 0, light: 0.2, moderate: 0.5, vigorous: 1 }

export interface BreathingOutput {
  rate: number
  tidalVolume: number
  minuteVentilation: number
  periodSeconds: number
}

/**
 * Breathing rate and depth rise with activity. The starting values are sourced. The source gives no numbers for
 * breathing during exercise, so the upper limits (twice the top resting rate, and the vital capacity share) are illustrative.
 */
export function breathing(level: ActivityLevel): BreathingOutput {
  const demand = ACTIVITY_DEMAND[level]
  const [low, high] = factRange('breathing-rate-adolescent-adult')
  const restRate = (low + high) / 2
  const rate = restRate + (high * 2 - restRate) * demand
  const restVolume = factNumber('tidal-volume')
  const tidalVolume = restVolume + (factNumber('vital-capacity') * 0.5 - restVolume) * demand
  return { rate, tidalVolume, minuteVentilation: (rate * tidalVolume) / 1000, periodSeconds: 60 / rate }
}

export interface BreathState {
  /** Lung air above the resting level, in mL. */
  volume: number
  /** Share of a full tidal breath, from 0 to 1. */
  fill: number
  inhaling: boolean
}

/** Breathing in takes a shorter share of the breath than breathing out. The one-third split is illustrative. */
export function breathAt(timeSeconds: number, output: BreathingOutput): BreathState {
  const inBreath = ((timeSeconds % output.periodSeconds) + output.periodSeconds) % output.periodSeconds
  const inhaleTime = output.periodSeconds / 3
  const inhaling = inBreath < inhaleTime
  const fill = inhaling
    ? 0.5 - 0.5 * Math.cos((inBreath / inhaleTime) * Math.PI)
    : 0.5 + 0.5 * Math.cos(((inBreath - inhaleTime) / (output.periodSeconds - inhaleTime)) * Math.PI)
  return { volume: fill * output.tidalVolume, fill, inhaling }
}

export interface GasExchange {
  oxygenGradient: number
  carbonDioxideGradient: number
}

/** The pressure differences that drive diffusion across the alveolar wall. */
export function gasGradients(): GasExchange {
  return {
    oxygenGradient: factNumber('alveolar-po2') - factNumber('returning-po2'),
    carbonDioxideGradient: factNumber('returning-pco2') - factNumber('alveolar-pco2'),
  }
}

/** How blood gases approach the alveolar pressures along a capillary. The curve's shape is illustrative. */
export function capillaryGas(share: number): { oxygen: number; carbonDioxide: number } {
  const approach = 1 - Math.exp(-share * 5)
  return {
    oxygen: factNumber('returning-po2') + (factNumber('alveolar-po2') - factNumber('returning-po2')) * approach,
    carbonDioxide: factNumber('returning-pco2') - (factNumber('returning-pco2') - factNumber('alveolar-pco2')) * approach,
  }
}
