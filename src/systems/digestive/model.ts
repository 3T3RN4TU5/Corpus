import { factNumber, factRange } from '../../data/physiology'

export interface Meal {
  carbohydrate: number
  protein: number
  fat: number
}

export const MEALS: { id: string; name: string; meal: Meal }[] = [
  { id: 'balanced', name: 'Mixed', meal: { carbohydrate: 60, protein: 25, fat: 20 } },
  { id: 'carb', name: 'Mostly carbohydrate', meal: { carbohydrate: 100, protein: 10, fat: 5 } },
  { id: 'protein', name: 'Mostly protein', meal: { carbohydrate: 15, protein: 60, fat: 15 } },
  { id: 'fatty', name: 'Mostly fat', meal: { carbohydrate: 15, protein: 15, fat: 50 } },
]

export function mealEnergy(meal: Meal): number {
  return meal.carbohydrate * factNumber('kcal-carbohydrate') + meal.protein * factNumber('kcal-protein') + meal.fat * factNumber('kcal-fat')
}

export function fatShare(meal: Meal): number {
  return (meal.fat * factNumber('kcal-fat')) / mealEnergy(meal)
}

const HOUR = 3600

export interface Stage {
  id: 'mouth' | 'esophagus' | 'stomach' | 'small' | 'large'
  name: string
  start: number
  end: number
  /** The sourced range for this stage, in the source's units, for display. */
  rangeLabel: string
  enzymes: string[]
  note: string
}

/**
 * Builds the meal's timeline. Each stage uses the middle of its sourced range. A meal with more fat stays longer in
 * the stomach, moving toward the source's upper figure for fatty food. That scaling is illustrative.
 */
export function mealTimeline(meal: Meal): Stage[] {
  const swallow = factNumber('swallow-solid')
  const [stomachLow, stomachHigh] = factRange('stomach-emptying')
  const fatty = factNumber('stomach-emptying-fatty')
  const share = Math.min(1, fatShare(meal) / 0.7)
  const stomach = (stomachLow + (stomachHigh - stomachLow) * 0.5 + (fatty - stomachHigh) * share) * HOUR
  const small = factNumber('small-intestine-transit') * HOUR
  const large = factNumber('large-intestine-transit') * HOUR
  const chew = factNumber('chewing-time')

  const stages: Stage[] = []
  let time = 0
  const add = (id: Stage['id'], name: string, duration: number, rangeLabel: string, enzymes: string[], note: string) => {
    stages.push({ id, name, start: time, end: time + duration, rangeLabel, enzymes, note })
    time += duration
  }
  add('mouth', 'Mouth', chew, 'Chewing time is illustrative', ['Salivary amylase', 'Lingual lipase'], 'Chewing and saliva form a soft bolus, and salivary amylase begins to break down starch.')
  add('esophagus', 'Esophagus', swallow, `Swallow: ${factRange('swallow-solid').join(' to ')} s`, [], 'Peristalsis, a wave of muscle contraction, pushes the bolus down to the stomach.')
  add('stomach', 'Stomach', stomach, `${stomachLow} to ${stomachHigh} h, or ${fatty} h or longer if fatty`, ['Pepsin', 'Lingual lipase', 'Gastric lipase'], 'Mixing waves and acid turn the food into chyme, and pepsin begins protein digestion. Acid stops salivary amylase.')
  add('small', 'Small intestine', small, `${factRange('small-intestine-transit').join(' to ')} h`, ['Pancreatic amylase', 'Trypsin', 'Chymotrypsin', 'Carboxypeptidase', 'Pancreatic lipase', 'Sucrase, maltase, lactase', 'Aminopeptidase, dipeptidase'], 'Bile from the liver and gallbladder breaks fat into small droplets. Pancreatic and brush-border enzymes finish digestion, and villi absorb the nutrients.')
  add('large', 'Large intestine', large, `${factRange('large-intestine-transit').join(' to ')} h`, [], 'Water and salts are absorbed, bacteria act on the remaining material, and feces form. Feces collect in the rectum until they leave the body.')
  return stages
}

export function stageAt(stages: Stage[], time: number): Stage {
  return stages.find((stage) => time < stage.end) ?? stages[stages.length - 1]
}

export function totalDuration(stages: Stage[]): number {
  return stages[stages.length - 1].end
}

export interface Absorption {
  carbohydrate: number
  protein: number
  fat: number
  /** Share of the meal's energy absorbed so far, from 0 to 1. */
  energyShare: number
}

/**
 * Grams absorbed so far. Absorption happens through the small intestine stage and reaches the sourced shares for
 * protein and fat. The curve's shape and the carbohydrate share (treated like protein) are illustrative.
 */
export function absorbedAt(stages: Stage[], meal: Meal, time: number): Absorption {
  const small = stages.find((stage) => stage.id === 'small') as Stage
  const progress = Math.max(0, Math.min(1, (time - small.start) / (small.end - small.start)))
  const curve = 1 - (1 - progress) ** 2
  const proteinShare = factNumber('protein-absorbed') / 100
  const fatAbsorbed = factNumber('lipid-absorbed') / 100
  const carbohydrate = meal.carbohydrate * proteinShare * curve
  const protein = meal.protein * proteinShare * curve
  const fat = meal.fat * fatAbsorbed * curve
  const energy = carbohydrate * factNumber('kcal-carbohydrate') + protein * factNumber('kcal-protein') + fat * factNumber('kcal-fat')
  return { carbohydrate, protein, fat, energyShare: energy / mealEnergy(meal) }
}

export interface TimelineCurves {
  hours: number[]
  carbohydrate: number[]
  protein: number[]
  fat: number[]
}

/** The curves for a whole meal. It is computed in a Web Worker, to keep the animation smooth. */
export function timelineCurves(meal: Meal, samples = 400): TimelineCurves {
  const stages = mealTimeline(meal)
  const total = totalDuration(stages)
  const curves: TimelineCurves = { hours: [], carbohydrate: [], protein: [], fat: [] }
  for (let i = 0; i <= samples; i++) {
    const time = (i / samples) * total
    const absorbed = absorbedAt(stages, meal, time)
    curves.hours.push(time / HOUR)
    curves.carbohydrate.push(absorbed.carbohydrate)
    curves.protein.push(absorbed.protein)
    curves.fat.push(absorbed.fat)
  }
  return curves
}
