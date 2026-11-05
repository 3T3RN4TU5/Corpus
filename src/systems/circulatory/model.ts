import { factNumber } from '../../data/physiology'

export interface CirculatoryInput {
  ageYears: number
  /** Resting heart rate chosen by the person, in beats per minute. */
  restingRate: number
  /** Systolic and diastolic pressure at rest, in mm Hg. */
  systolic: number
  diastolic: number
  /** Exercise level from 0 (rest) to 1 (the source's exercise values). */
  exercise: number
  /** Share of a vessel's radius lost to plaque, from 0 to 0.9. Illustrative. */
  stenosis: number
}

export interface CirculatoryOutput {
  heartRate: number
  maxHeartRate: number
  strokeVolume: number
  cardiacOutput: number
  meanArterialPressure: number
  pulsePressure: number
  /** Flow through a narrowed vessel as a share of normal, at the same pressure. Illustrative. */
  vesselFlowShare: number
  resistanceMultiple: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function maxHeartRate(ageYears: number): number {
  return factNumber('max-hr-base') - ageYears
}

/** Heart rate and stroke volume rise toward the source's exercise values, up to the age-based maximum. */
export function circulation(input: CirculatoryInput): CirculatoryOutput {
  const max = maxHeartRate(input.ageYears)
  const heartRate = Math.min(max, lerp(input.restingRate, factNumber('exercise-hr'), input.exercise))
  const strokeVolume = lerp(factNumber('stroke-volume-rest'), factNumber('exercise-sv'), input.exercise)
  const radius = 1 - input.stenosis
  return {
    heartRate,
    maxHeartRate: max,
    strokeVolume,
    cardiacOutput: (heartRate * strokeVolume) / 1000,
    meanArterialPressure: input.diastolic + (input.systolic - input.diastolic) / 3,
    pulsePressure: input.systolic - input.diastolic,
    vesselFlowShare: radius ** 4,
    resistanceMultiple: 1 / radius ** 4,
  }
}

export interface CyclePhases {
  /** Durations in seconds for one beat, which add up to the beat's length. */
  atrialSystole: number
  ventricularSystole: number
  ventricularDiastole: number
  period: number
}

/** The source's phase durations, stretched or shrunk evenly to match the current heart rate. */
export function cyclePhases(heartRate: number): CyclePhases {
  const atrial = factNumber('atrial-systole')
  const ventricular = factNumber('ventricular-systole')
  const diastole = factNumber('ventricular-diastole')
  const period = 60 / heartRate
  const scale = period / ((atrial + ventricular + diastole) / 1000)
  return {
    atrialSystole: (atrial / 1000) * scale,
    ventricularSystole: (ventricular / 1000) * scale,
    ventricularDiastole: (diastole / 1000) * scale,
    period,
  }
}

export type Phase = 'atrial-systole' | 'ventricular-systole' | 'diastole'

export interface HeartState {
  phase: Phase
  /** Position within the beat, from 0 to 1. */
  beat: number
  /** Chamber volumes as a share of their full size, from 0 to 1. */
  atria: number
  ventricles: number
  /** Atrioventricular valves (tricuspid, mitral) and semilunar valves (pulmonary, aortic). */
  avOpen: boolean
  semilunarOpen: boolean
  leftVentricleMl: number
  arterialPressure: number
  ecg: number
}

const bump = (t: number, centre: number, width: number) => Math.exp(-(((t - centre) / width) ** 2))

/**
 * A stylised ECG trace, timed to the beat. The timing follows the conduction times in the data file,
 * and the wave heights are illustrative.
 */
export function ecgAt(secondsIntoBeat: number, phases: CyclePhases): number {
  const scale = phases.period / 0.8
  const t = secondsIntoBeat / scale
  const toVentricles =
    (factNumber('conduction-sa-to-av') + factNumber('conduction-av-delay') + factNumber('conduction-bundle') + factNumber('conduction-purkinje')) / 1000
  const p = 0.16 * bump(t, 0.05, 0.03)
  const q = -0.12 * bump(t, toVentricles - 0.018, 0.009)
  const r = 1.0 * bump(t, toVentricles, 0.012)
  const s = -0.22 * bump(t, toVentricles + 0.02, 0.011)
  const wave = 0.28 * bump(t, toVentricles + 0.26, 0.05)
  return p + q + r + s + wave
}

export function heartAt(timeSeconds: number, heartRate: number, systolic: number, diastolic: number): HeartState {
  const phases = cyclePhases(heartRate)
  const inBeat = ((timeSeconds % phases.period) + phases.period) % phases.period
  const edv = factNumber('end-diastolic-volume')
  const esv = factNumber('end-systolic-volume')
  const emptied = esv / edv

  let phase: Phase
  let atria: number
  let ventricles: number
  let pressure: number
  if (inBeat < phases.atrialSystole) {
    const t = inBeat / phases.atrialSystole
    phase = 'atrial-systole'
    atria = 1 - 0.5 * Math.sin((t * Math.PI) / 2)
    // The atria add the last part of filling. The share is illustrative within the source's 20 to 30 percent.
    ventricles = lerp(0.75 + 0.25 * emptied, 1, t)
    pressure = diastolic
  } else if (inBeat < phases.atrialSystole + phases.ventricularSystole) {
    const t = (inBeat - phases.atrialSystole) / phases.ventricularSystole
    phase = 'ventricular-systole'
    atria = lerp(0.5, 0.85, t)
    ventricles = lerp(1, emptied, Math.sin((t * Math.PI) / 2))
    pressure = lerp(diastolic, systolic, Math.sin(t * Math.PI))
  } else {
    const t = (inBeat - phases.atrialSystole - phases.ventricularSystole) / phases.ventricularDiastole
    phase = 'diastole'
    atria = lerp(0.85, 1, t)
    ventricles = lerp(emptied, 0.75 + 0.25 * emptied, Math.min(1, t * 1.4))
    pressure = lerp(diastolic + (systolic - diastolic) * 0.25, diastolic, t)
  }

  return {
    phase,
    beat: inBeat / phases.period,
    atria,
    ventricles,
    avOpen: phase !== 'ventricular-systole',
    semilunarOpen: phase === 'ventricular-systole',
    leftVentricleMl: ventricles * edv,
    arterialPressure: pressure,
    ecg: ecgAt(inBeat, phases),
  }
}
