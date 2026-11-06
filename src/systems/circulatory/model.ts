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

/** The source's formula is an adult estimate, so it is not shown for anyone younger. */
export function maxHeartRateText(ageYears: number): string {
  return ageYears >= 18 ? `${maxHeartRate(Math.round(ageYears))} bpm` : 'Adult estimate only'
}

/** Keeps systolic above diastolic while a slider moves. The 1 mm Hg gap is only the sliders' step, not a sourced limit. */
export function limitSystolic(systolic: number, diastolic: number): number {
  return Math.max(systolic, diastolic + 1)
}

export function limitDiastolic(diastolic: number, systolic: number): number {
  return Math.min(diastolic, systolic - 1)
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
  /** Times in seconds, measured from the moment the SA node fires, scaled to the current heart rate. */
  atrialStart: number
  atrialEnd: number
  ventricularStart: number
  ventricularEnd: number
  /** Durations in seconds. Ventricular diastole is all the time outside systole, except atrial systole. */
  atrialSystole: number
  ventricularSystole: number
  ventricularDiastole: number
  period: number
}

/**
 * The beat's timeline, from sourced values. The atria start contracting shortly after the SA node fires. The ventricles
 * depolarize later, after the AV node's delay, and then contract. These times fit the source's phase lengths exactly:
 * 100 ms atrial systole, 270 ms ventricular systole, and 430 ms of remaining ventricular diastole make one 800 ms beat.
 * All times stretch evenly with heart rate, which is a simplification.
 */
export function cyclePhases(heartRate: number): CyclePhases {
  const atrial = factNumber('atrial-systole') / 1000
  const ventricular = factNumber('ventricular-systole') / 1000
  const diastole = factNumber('ventricular-diastole') / 1000
  const period = 60 / heartRate
  const scale = period / (atrial + ventricular + diastole)
  const atrialStart = (factNumber('atria-contract-after-p') / 1000) * scale
  const ventricularStart = (factNumber('conduction-sa-to-ventricles') / 1000) * scale
  return {
    atrialStart,
    atrialEnd: atrialStart + atrial * scale,
    ventricularStart,
    ventricularEnd: ventricularStart + ventricular * scale,
    atrialSystole: atrial * scale,
    ventricularSystole: ventricular * scale,
    ventricularDiastole: diastole * scale,
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
 * A stylised ECG trace, with each wave at its sourced electrical event: the P wave as the atria depolarize, and the QRS
 * complex as the ventricles depolarize. The T wave is placed late in ventricular systole. Wave heights and widths are
 * illustrative.
 */
export function ecgAt(secondsIntoBeat: number, phases: CyclePhases): number {
  const scale = phases.period / 0.8
  const t = secondsIntoBeat / scale
  const qrs = factNumber('conduction-sa-to-ventricles') / 1000
  const ventricularEnd = phases.ventricularEnd / scale
  const p = 0.16 * bump(t, 0.05, 0.03)
  const q = -0.12 * bump(t, qrs - 0.018, 0.009)
  const r = 1.0 * bump(t, qrs, 0.012)
  const s = -0.22 * bump(t, qrs + 0.02, 0.011)
  const wave = 0.28 * bump(t, ventricularEnd - 0.05, 0.05)
  return p + q + r + s + wave
}

/**
 * The state of the heart at a moment in the beat. Each beat ejects exactly `strokeVolume`. At rest, the sourced end-diastolic
 * volume and resting stroke volume give an end-systolic volume within the sourced range. The source gives no end volumes
 * during exercise, so that end-systolic volume is held and the extra stroke volume is added to filling, which is illustrative.
 *
 * The source's isovolumic phases, when all four valves are shut, have no sourced durations, so they are not modelled: the
 * valves switch directly between open and shut.
 */
export function heartAt(timeSeconds: number, heartRate: number, systolic: number, diastolic: number, strokeVolume = factNumber('stroke-volume-rest')): HeartState {
  const phases = cyclePhases(heartRate)
  const inBeat = ((timeSeconds % phases.period) + phases.period) % phases.period
  const esv = factNumber('end-diastolic-volume') - factNumber('stroke-volume-rest')
  const edv = esv + strokeVolume
  const emptied = esv / edv
  // Most filling is passive. Atrial contraction adds the rest, using the middle of the sourced range.
  const passiveFill = emptied + (1 - emptied) * (1 - factNumber('atrial-filling-share') / 100)

  let phase: Phase
  let atria: number
  let ventricles: number
  let pressure: number
  if (inBeat >= phases.ventricularStart && inBeat < phases.ventricularEnd) {
    const t = (inBeat - phases.ventricularStart) / phases.ventricularSystole
    phase = 'ventricular-systole'
    atria = lerp(0.55, 0.85, t)
    ventricles = lerp(1, emptied, Math.sin((t * Math.PI) / 2))
    pressure = Math.max(lerp(diastolic, systolic, Math.sin(Math.min(1, t * 1.15) * Math.PI)), diastolic + (systolic - diastolic) * 0.25 * t)
  } else if (inBeat >= phases.atrialStart && inBeat < phases.atrialEnd) {
    const t = (inBeat - phases.atrialStart) / phases.atrialSystole
    phase = 'atrial-systole'
    atria = 1 - 0.45 * Math.sin((t * Math.PI) / 2)
    ventricles = lerp(passiveFill, 1, t)
    pressure = diastolic
  } else if (inBeat >= phases.atrialEnd && inBeat < phases.ventricularStart) {
    // The impulse is delayed at the AV node, so the ventricles are full and waiting.
    phase = 'diastole'
    atria = 0.55
    ventricles = 1
    pressure = diastolic
  } else {
    const sinceSystole = inBeat >= phases.ventricularEnd ? inBeat - phases.ventricularEnd : inBeat + phases.period - phases.ventricularEnd
    const t = sinceSystole / (phases.period - phases.ventricularEnd + phases.atrialStart)
    phase = 'diastole'
    atria = lerp(0.85, 1, t)
    ventricles = lerp(emptied, passiveFill, Math.min(1, t * 1.4))
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
