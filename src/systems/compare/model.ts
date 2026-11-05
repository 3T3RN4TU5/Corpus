import { factNumber, factRange, formatFact, getFact } from '../../data/physiology'
import { organReserve } from '../body/model'
import { breathing } from '../respiratory/model'
import { circulation, maxHeartRate } from '../circulatory/model'
import { thermoregulation } from '../skin/model'

export interface CompareRow {
  label: string
  a: string
  b: string
  /** How the row was produced, shown under the table. */
  basis: 'sourced' | 'calculated' | 'illustrative'
}

export interface Comparison {
  id: string
  name: string
  a: string
  b: string
  rows: CompareRow[]
}

export function restVsExercise(age: number): Comparison {
  const input = { ageYears: age, restingRate: factNumber('heart-rate-rest-adult'), systolic: factNumber('bp-systolic'), diastolic: factNumber('bp-diastolic'), stenosis: 0 }
  const rest = circulation({ ...input, exercise: 0 })
  const active = circulation({ ...input, exercise: 1 })
  const breathRest = breathing('sedentary')
  const breathActive = breathing('vigorous')
  const coolRest = thermoregulation({ ambient: 22, activity: 0 })
  const coolActive = thermoregulation({ ambient: 22, activity: 1 })
  return {
    id: 'exercise',
    name: 'Rest and exercise',
    a: 'Rest',
    b: 'Exercise',
    rows: [
      { label: 'Heart rate', a: `${Math.round(rest.heartRate)} bpm`, b: `${Math.round(active.heartRate)} bpm`, basis: 'sourced' },
      { label: 'Stroke volume', a: `${Math.round(rest.strokeVolume)} mL`, b: `${Math.round(active.strokeVolume)} mL`, basis: 'sourced' },
      { label: 'Cardiac output', a: `${rest.cardiacOutput.toFixed(1)} L/min`, b: `${active.cardiacOutput.toFixed(1)} L/min`, basis: 'calculated' },
      { label: 'Breathing rate', a: `${breathRest.rate.toFixed(0)} per min`, b: `${breathActive.rate.toFixed(0)} per min`, basis: 'illustrative' },
      { label: 'Tidal volume', a: `${Math.round(breathRest.tidalVolume)} mL`, b: `${Math.round(breathActive.tidalVolume)} mL`, basis: 'illustrative' },
      { label: 'Sweat', a: `${coolRest.sweat.toFixed(2)} L/h`, b: `${coolActive.sweat.toFixed(2)} L/h`, basis: 'illustrative' },
    ],
  }
}

export function youngVsOld(youngAge: number, oldAge: number): Comparison {
  const boneYoung = youngAge <= factNumber('bone-density-peak') ? 'Rising toward its peak' : 'Past its peak'
  const boneOld = oldAge <= factNumber('bone-density-peak') ? 'Rising toward its peak' : 'Past its peak, falling'
  const sleepFor = (age: number) => (age >= 65 ? 'sleep-older' : age >= 18 ? 'sleep-adult' : 'sleep-teen')
  const sleepLabel = (age: number) => {
    const [low, high] = factRange(sleepFor(age))
    return low === high ? `${low} or more hours` : `${low} to ${high} hours`
  }
  return {
    id: 'age',
    name: 'Younger and older adult',
    a: `Age ${youngAge}`,
    b: `Age ${oldAge}`,
    rows: [
      { label: 'Estimated maximum heart rate', a: `${maxHeartRate(youngAge)} bpm`, b: `${maxHeartRate(oldAge)} bpm`, basis: 'calculated' },
      { label: 'Resting heart rate range', a: formatFact(getFact('pulse-10-plus')), b: formatFact(getFact('pulse-10-plus')), basis: 'sourced' },
      { label: 'Organ reserve, on average', a: `${Math.round(organReserve(youngAge) * 100)}%`, b: `${Math.round(organReserve(oldAge) * 100)}%`, basis: 'calculated' },
      { label: 'Bone density', a: boneYoung, b: boneOld, basis: 'sourced' },
      { label: 'Recommended sleep', a: sleepLabel(youngAge), b: sleepLabel(oldAge), basis: 'sourced' },
    ],
  }
}
