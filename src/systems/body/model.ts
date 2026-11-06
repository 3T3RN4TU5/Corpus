import { factNumber, factRange } from '../../data/physiology'
import type { SexProfile } from '../../data/sexProfiles'

export interface LifeStage {
  id: 'newborn' | 'infant' | 'child' | 'adolescent' | 'adult' | 'older-adult'
  name: string
  pulseFact: string
  breathingFact: string | null
  sleepFact: string | null
  note: string
}

export function lifeStage(age: number): LifeStage {
  if (age < 1 / 12) return { id: 'newborn', name: 'Newborn', pulseFact: 'pulse-newborn', breathingFact: 'breathing-rate-under-1', sleepFact: 'sleep-newborn', note: 'At birth, the skull and clavicles are not fully ossified, and the sutures of the skull are open.' }
  if (age < 1) return { id: 'infant', name: 'Infant', pulseFact: 'pulse-infant', breathingFact: 'breathing-rate-under-1', sleepFact: age < 0.34 ? 'sleep-newborn' : 'sleep-infant', note: 'Growth is rapid in the first year.' }
  if (age < 13) {
    const pulseFact = age < 3 ? 'pulse-child-1-2' : age < 5 ? 'pulse-child-3-4' : age < 7 ? 'pulse-child-5-6' : age < 10 ? 'pulse-child-7-9' : 'pulse-10-plus'
    return { id: 'child', name: 'Child', pulseFact, breathingFact: age >= 8 ? 'breathing-rate-age-10' : null, sleepFact: age >= 6 ? 'sleep-school' : age >= 3 ? 'sleep-preschool' : 'sleep-toddler', note: 'Bones keep growing in length through childhood.' }
  }
  if (age < 18) return { id: 'adolescent', name: 'Adolescent', pulseFact: 'pulse-10-plus', breathingFact: 'breathing-rate-adolescent-adult', sleepFact: 'sleep-teen', note: 'Growth spurts occur at puberty. Bones stop growing in length in early adulthood.' }
  if (age < 65) return { id: 'adult', name: 'Adult', pulseFact: 'pulse-10-plus', breathingFact: 'breathing-rate-adolescent-adult', sleepFact: age <= 60 ? 'sleep-adult' : 'sleep-61-64', note: age < 30 ? 'Bone density is still rising toward its peak at about 30.' : 'From about age 30, organs slowly lose some of their reserve capacity.' }
  return { id: 'older-adult', name: 'Older adult', pulseFact: 'pulse-10-plus', breathingFact: 'breathing-rate-adolescent-adult', sleepFact: 'sleep-older', note: 'Bone density and muscle mass fall with age, and height decreases as the trunk and spine shorten. MedlinePlus says muscle changes often begin in the 20s in men and in the 40s in women.' }
}

/** Share of organ reserve remaining, from the source's average of 1 percent lost each year after age 30. */
export function organReserve(age: number): number {
  return 1 - Math.max(0, age - 30) * (factNumber('reserve-loss-aging') / 100)
}

export interface BmiResult {
  bmi: number
  category: string
  appliesToAge: boolean
}

export function bmi(weightKg: number, heightCm: number, age: number): BmiResult {
  const metres = heightCm / 100
  const value = weightKg / (metres * metres)
  const category =
    value < factNumber('bmi-underweight-below')
      ? 'Underweight'
      : value < factNumber('bmi-overweight-from')
        ? 'Healthy weight'
        : value < factNumber('bmi-obesity-from')
          ? 'Overweight'
          : 'Obesity'
  // CDC's categories are for adults aged 20 and older.
  return { bmi: value, category, appliesToAge: age >= 20 }
}

/** Mifflin-St Jeor resting energy. Sources give a constant for males and females only. */
export function restingEnergy(weightKg: number, heightCm: number, age: number, referenceSex: SexProfile['referenceSex']): { low: number; high: number } {
  const base = factNumber('ree-weight-coefficient') * weightKg + factNumber('ree-height-coefficient') * heightCm + factNumber('ree-age-coefficient') * age
  const female = base + factNumber('ree-female-constant')
  const male = base + factNumber('ree-male-constant')
  if (referenceSex === 'female') return { low: female, high: female }
  if (referenceSex === 'male') return { low: male, high: male }
  return { low: female, high: male }
}

/** The whole-body rule of thumb from the source: about 3500 kcal adds one pound. Real change is more complex. */
export function weeklyWeightChangeKg(dailyBalanceKcal: number): number {
  const kgPerPound = 0.45359237
  return ((dailyBalanceKcal * 7) / factNumber('kcal-per-pound')) * kgPerPound
}

export interface BoneTrendPoint {
  age: number
  density: number
}

/**
 * Relative bone density across life. Sources give the age of the peak, and the age that faster loss begins in females.
 * The rest of the curve, its heights included, is illustrative.
 */
export function boneDensityCurve(referenceSex: NonNullable<SexProfile['referenceSex']>): BoneTrendPoint[] {
  const peak = factNumber('bone-density-peak')
  const fasterLoss = factNumber('bone-loss-female-onset')
  const points: BoneTrendPoint[] = []
  for (let age = 0; age <= 90; age += 1) {
    let density: number
    if (age <= peak) density = 0.25 + 0.75 * Math.sin(((age / peak) * Math.PI) / 2)
    else {
      const gradual = (age - peak) * 0.004
      const faster = referenceSex === 'female' && age > fasterLoss ? (age - fasterLoss) * 0.009 : 0
      density = 1 - gradual - faster
    }
    points.push({ age, density })
  }
  return points
}

export interface BoneCurve {
  label: string
  points: BoneTrendPoint[]
}

/** The curves to plot for a profile. A profile with no reference sex gets both, because sources report nothing separate for it. */
export function boneDensityCurves(referenceSex: SexProfile['referenceSex']): BoneCurve[] {
  const curves: BoneCurve[] = []
  if (referenceSex !== 'male') curves.push({ label: `Bone density, faster loss from about ${factNumber('bone-loss-female-onset')} (illustrative)`, points: boneDensityCurve('female') })
  if (referenceSex !== 'female') curves.push({ label: 'Bone density, without that faster loss (illustrative)', points: boneDensityCurve('male') })
  return curves
}

/** Scales the adult model only by size, which is illustrative. Width follows BMI around a middle value. */
export function bodyScaleFor(heightCm: number, modelHeightMetres: number, bmiValue: number, bodyFatPercent: number): { uniform: number; soft: number } {
  const uniform = heightCm / (modelHeightMetres * 100)
  const middle = (factNumber('bmi-underweight-below') + factNumber('bmi-overweight-from')) / 2
  const fromFat = 1 + (bodyFatPercent - 25) * 0.003
  const soft = Math.max(0.82, Math.min(1.4, Math.sqrt(bmiValue / middle) * fromFat))
  return { uniform, soft }
}

export interface CompareRow {
  label: string
  a: string
  b: string
}

export { factRange }
