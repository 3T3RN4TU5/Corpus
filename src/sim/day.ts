import { factNumber, factRange } from '../data/physiology'
import { eat, exercise as startExercise, initialGlucose, stepGlucose } from '../systems/endocrine/model'
import { urinePerDay } from '../systems/urinary/model'

export interface DayEvent {
  kind: 'meal' | 'exercise' | 'sleep' | 'drink'
  /** Start, in hours from midnight. */
  hour: number
  /** Length in hours. Meals and drinks are instant. */
  hours?: number
  /** Carbohydrate grams for a meal, or litres for a drink. */
  amount?: number
}

export interface DayPlan {
  events: DayEvent[]
  restingRate: number
}

export interface DayResult {
  hours: number[]
  heartRate: number[]
  glucose: number[]
  hydration: number[]
  temperature: number[]
}

export const DEFAULT_PLAN: DayPlan = {
  restingRate: 75,
  events: [
    { kind: 'sleep', hour: 0, hours: 7 },
    { kind: 'drink', hour: 7.3, amount: 0.4 },
    { kind: 'meal', hour: 8, amount: 50 },
    { kind: 'drink', hour: 10.5, amount: 0.4 },
    { kind: 'meal', hour: 13, amount: 75 },
    { kind: 'drink', hour: 15, amount: 0.4 },
    { kind: 'exercise', hour: 17.5, hours: 1 },
    { kind: 'drink', hour: 18.6, amount: 0.6 },
    { kind: 'meal', hour: 19.5, amount: 70 },
    { kind: 'sleep', hour: 23, hours: 1 },
  ],
}

const inEvent = (events: DayEvent[], kind: DayEvent['kind'], hour: number) =>
  events.some((event) => event.kind === kind && hour >= event.hour && hour < event.hour + (event.hours ?? 0))

/**
 * Combines the system models over a day. Exercise values, the glucose feedback directions, the urine and sweat limits, and
 * the temperature range are sourced. Sleep's fall in heart rate, the drift of temperature through the day, and the hydration
 * balance are illustrative.
 */
export function simulateDay(plan: DayPlan, stepMinutes = 5): DayResult {
  const result: DayResult = { hours: [], heartRate: [], glucose: [], hydration: [], temperature: [] }
  const steps = (24 * 60) / stepMinutes
  const stepHours = stepMinutes / 60
  let glucoseState = initialGlucose()
  // Warm up, so that the day starts settled rather than from arbitrary starting values.
  for (let i = 0; i < 40; i++) glucoseState = stepGlucose(glucoseState, 300)
  let water = 0
  const done = new Set<DayEvent>()
  const [tempLow, tempHigh] = factRange('temp-average')
  const sleepRate = factRange('heart-rate-rest-adult')[0]

  for (let i = 0; i <= steps; i++) {
    const hour = i * stepHours
    for (const event of plan.events) {
      if ((event.kind === 'meal' || event.kind === 'drink') && hour >= event.hour && !done.has(event)) {
        done.add(event)
        if (event.kind === 'meal') {
          glucoseState = eat(glucoseState, event.amount ?? 0)
          water += 0.15
        } else {
          water += event.amount ?? 0
        }
      }
      if (event.kind === 'exercise' && hour >= event.hour && !done.has(event)) {
        done.add(event)
        glucoseState = startExercise(glucoseState)
      }
    }
    const asleep = inEvent(plan.events, 'sleep', hour)
    const working = inEvent(plan.events, 'exercise', hour)
    glucoseState = stepGlucose(glucoseState, stepMinutes * 60)
    const heartRate = working ? factNumber('exercise-hr') : asleep ? Math.min(sleepRate, plan.restingRate) : plan.restingRate
    const sweatPerHour = working ? factRange('sweat-active')[0] : factNumber('sweat-rest') / 1000 / 24
    const hydrationShare = Math.max(0, Math.min(1, 0.6 + water / 2))
    water -= (sweatPerHour + urinePerDay(hydrationShare) / 24) * stepHours
    // Temperature is lowest in the early morning, as the source says. The size and timing of the swing are illustrative.
    const swing = 0.5 - 0.5 * Math.cos(((hour - 5) / 24) * 2 * Math.PI)
    const temperature = tempLow + 0.25 * (tempHigh - tempLow) + 0.45 * (tempHigh - tempLow) * swing + (working ? 0.3 * (tempHigh - tempLow) : 0)

    result.hours.push(hour)
    result.heartRate.push(heartRate)
    result.glucose.push(glucoseState.glucose)
    result.hydration.push(water)
    result.temperature.push(temperature)
  }
  return result
}
