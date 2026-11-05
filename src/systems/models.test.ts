import { describe, expect, it } from 'vitest'
import { factNumber, factRange } from '../data/physiology'
import { DEFAULT_CUSTOM, resolveProfile } from '../data/sexProfiles'
import { simulateDay, DEFAULT_PLAN } from '../sim/day'
import { encodeView, decodeView } from '../store/shareState'
import type { LayerState } from '../store/useBodyStore'
import { LAYERS, type LayerId } from '../data/anatomy'
import { bmi, boneDensityCurve, lifeStage, organReserve, restingEnergy, weeklyWeightChangeKg } from './body/model'
import { circulation, cyclePhases, ecgAt, heartAt, maxHeartRate } from './circulatory/model'
import { restVsExercise, youngVsOld } from './compare/model'
import { absorbedAt, fatShare, mealEnergy, mealTimeline, stageAt, timelineCurves, totalDuration } from './digestive/model'
import { eat, glucoseBand, initialGlucose, stepGlucose } from './endocrine/model'
import { createImmuneState, stepImmune } from './immune/model'
import { LESSONS } from './learn/lessons'
import { activation, healingStages, MOVEMENTS, sarcomereLength } from './musculoskeletal/model'
import { membranePotential, reflexStepAt, REFLEX_STEPS } from './nervous/model'
import { breathAt, breathing, capillaryGas, gasGradients } from './respiratory/model'
import { thermoregulation } from './skin/model'
import { filtration, stepBladder, urinePerDay } from './urinary/model'

const base = { ageYears: 30, restingRate: 75, systolic: 120, diastolic: 80, exercise: 0, stenosis: 0 }

describe('circulatory', () => {
  it('reproduces the sourced resting cardiac output from heart rate and stroke volume', () => {
    expect(circulation(base).cardiacOutput).toBeCloseTo(5.25, 2)
  })

  it('reproduces the sourced exercise cardiac output', () => {
    expect(circulation({ ...base, exercise: 1 }).cardiacOutput).toBeCloseTo(19.5, 1)
  })

  it('never goes above the age-based maximum heart rate', () => {
    expect(maxHeartRate(40)).toBe(180)
    expect(circulation({ ...base, ageYears: 90, exercise: 1 }).heartRate).toBe(130)
  })

  it('calculates mean arterial pressure and pulse pressure', () => {
    const output = circulation(base)
    expect(output.meanArterialPressure).toBeCloseTo(93.33, 1)
    expect(output.pulsePressure).toBe(40)
  })

  it('raises resistance 16 times when radius is halved', () => {
    expect(circulation({ ...base, stenosis: 0.5 }).resistanceMultiple).toBeCloseTo(16)
    expect(circulation({ ...base, stenosis: 0.5 }).vesselFlowShare).toBeCloseTo(1 / 16)
  })

  it('splits a beat at 75 bpm into the sourced phase lengths', () => {
    const phases = cyclePhases(75)
    expect(phases.period).toBeCloseTo(0.8)
    expect(phases.atrialSystole).toBeCloseTo(0.1)
    expect(phases.ventricularSystole).toBeCloseTo(0.27)
    expect(phases.ventricularDiastole).toBeCloseTo(0.43)
  })

  it('opens the right valves in each phase', () => {
    const systole = heartAt(0.2, 75, 120, 80)
    expect(systole.phase).toBe('ventricular-systole')
    expect(systole.semilunarOpen).toBe(true)
    expect(systole.avOpen).toBe(false)
    const diastole = heartAt(0.6, 75, 120, 80)
    expect(diastole.semilunarOpen).toBe(false)
    expect(diastole.avOpen).toBe(true)
  })

  it('keeps ventricle volume between the sourced end volumes', () => {
    for (let t = 0; t < 0.8; t += 0.01) {
      const { leftVentricleMl } = heartAt(t, 75, 120, 80)
      expect(leftVentricleMl).toBeGreaterThanOrEqual(factNumber('end-systolic-volume') - 0.01)
      expect(leftVentricleMl).toBeLessThanOrEqual(factNumber('end-diastolic-volume') + 0.01)
    }
  })

  it('puts the R wave at the sourced conduction time', () => {
    const phases = cyclePhases(75)
    let best = 0
    let peakAt = 0
    for (let t = 0; t < 0.8; t += 0.001) {
      const value = ecgAt(t, phases)
      if (value > best) {
        best = value
        peakAt = t
      }
    }
    expect(peakAt).toBeCloseTo(0.25, 2)
  })
})

describe('respiratory', () => {
  it('uses the sourced tidal volume and a rate within the sourced range at rest', () => {
    const rest = breathing('sedentary')
    expect(rest.tidalVolume).toBe(500)
    expect(rest.rate).toBeGreaterThanOrEqual(12)
    expect(rest.rate).toBeLessThanOrEqual(18)
  })

  it('breathes faster and deeper with activity', () => {
    expect(breathing('vigorous').minuteVentilation).toBeGreaterThan(breathing('light').minuteVentilation)
  })

  it('fills to the tidal volume within one breath', () => {
    const output = breathing('sedentary')
    expect(breathAt(0, output).volume).toBeCloseTo(0)
    expect(breathAt(output.periodSeconds / 3, output).volume).toBeCloseTo(500, 0)
    expect(breathAt(output.periodSeconds * 0.999, output).volume).toBeLessThan(10)
  })

  it('uses the sourced gas gradients', () => {
    expect(gasGradients()).toEqual({ oxygenGradient: 64, carbonDioxideGradient: 5 })
    expect(capillaryGas(0).oxygen).toBe(40)
    expect(capillaryGas(1).oxygen).toBeGreaterThan(100)
  })
})

describe('digestive', () => {
  const meal = { carbohydrate: 60, protein: 25, fat: 20 }

  it('calculates meal energy from general factors', () => {
    expect(mealEnergy(meal)).toBe(60 * 4 + 25 * 4 + 20 * 9)
  })

  it('keeps stages contiguous and in order', () => {
    const stages = mealTimeline(meal)
    expect(stages.map((stage) => stage.id)).toEqual(['mouth', 'esophagus', 'stomach', 'small', 'large'])
    stages.slice(1).forEach((stage, index) => expect(stage.start).toBe(stages[index].end))
  })

  it('keeps fatty meals in the stomach longer, up to the sourced limit', () => {
    const lean = mealTimeline({ carbohydrate: 100, protein: 10, fat: 1 }).find((stage) => stage.id === 'stomach')!
    const fatty = mealTimeline({ carbohydrate: 5, protein: 5, fat: 80 }).find((stage) => stage.id === 'stomach')!
    expect(fatty.end - fatty.start).toBeGreaterThan(lean.end - lean.start)
    expect((fatty.end - fatty.start) / 3600).toBeLessThanOrEqual(factNumber('stomach-emptying-fatty'))
    expect(fatShare({ carbohydrate: 5, protein: 5, fat: 80 })).toBeGreaterThan(0.9)
  })

  it('absorbs nothing before the small intestine, and the sourced share by its end', () => {
    const stages = mealTimeline(meal)
    const small = stages.find((stage) => stage.id === 'small')!
    expect(absorbedAt(stages, meal, small.start - 1).fat).toBe(0)
    expect(absorbedAt(stages, meal, small.end).fat).toBeCloseTo(20 * 0.95)
    expect(stageAt(stages, totalDuration(stages) + 100).id).toBe('large')
  })

  it('produces rising curves', () => {
    const curves = timelineCurves(meal, 50)
    expect(curves.hours).toHaveLength(51)
    for (let i = 1; i <= 50; i++) expect(curves.fat[i]).toBeGreaterThanOrEqual(curves.fat[i - 1])
  })
})

describe('nervous', () => {
  it('rests, crosses threshold, peaks and returns at sourced voltages', () => {
    expect(membranePotential(-100).voltage).toBeCloseTo(factNumber('resting-membrane'), 0)
    expect(membranePotential(0).voltage).toBeCloseTo(factNumber('ap-threshold'))
    const voltages = Array.from({ length: 400 }, (_, i) => membranePotential(i * 0.01).voltage)
    expect(Math.max(...voltages)).toBeCloseTo(factNumber('ap-peak'), 0)
    expect(membranePotential(10).voltage).toBe(factNumber('resting-membrane'))
  })

  it('goes through the reflex steps in order', () => {
    expect(reflexStepAt(0).id).toBe('tap')
    expect(reflexStepAt(0.5).id).toBe('cord')
    expect(reflexStepAt(0.999).id).toBe('contract')
    REFLEX_STEPS.slice(1).forEach((step, index) => expect(step.start).toBe(REFLEX_STEPS[index].end))
  })
})

describe('musculoskeletal', () => {
  it('peaks each muscle at its stated time', () => {
    const movement = MOVEMENTS.run
    const muscle = movement.muscles[0]
    expect(activation(movement, muscle.at).get(muscle.part)).toBeCloseTo(muscle.peak)
  })

  it('wraps activation around the end of a cycle', () => {
    const movement = { ...MOVEMENTS.walk, muscles: [{ part: 'x', peak: 1, at: 0.99, width: 0.1 }] }
    expect(activation(movement, 0.01).get('x')).toBeGreaterThan(0.9)
  })

  it('shortens the sarcomere from its sourced length', () => {
    expect(sarcomereLength(0)).toBe(2)
    expect(sarcomereLength(1)).toBeLessThan(2)
  })

  it('orders healing stages from start to finish', () => {
    const stages = healingStages()
    expect(stages[0].name).toBe('Hematoma')
    expect(stages[stages.length - 1].bridge).toBe(1)
  })
})

describe('urinary', () => {
  it('stays between the sourced minimum and normal maximum', () => {
    expect(urinePerDay(0)).toBeCloseTo(factNumber('urine-minimum') / 1000)
    expect(urinePerDay(1)).toBe(factRange('urine-daily')[1])
    expect(urinePerDay(5)).toBe(factRange('urine-daily')[1])
  })

  it('senses an urge at the sourced volume, and empties', () => {
    const below = stepBladder({ volume: 149, urge: false, voids: 0 }, 0, 0.5, 400)
    expect(below.urge).toBe(false)
    const above = stepBladder({ volume: 160, urge: false, voids: 0 }, 0, 0.5, 400)
    expect(above.urge).toBe(true)
    const emptied = stepBladder({ volume: 399.99, urge: true, voids: 2 }, 100, 1, 400)
    expect(emptied).toEqual({ volume: 0, urge: false, voids: 3 })
  })

  it('shows both GFR values when no specific range is reported', () => {
    expect(filtration(resolveProfile('female', DEFAULT_CUSTOM)).gfrValue).toBe(105)
    expect(filtration(resolveProfile('male', DEFAULT_CUSTOM)).gfrValue).toBe(125)
    const other = filtration(resolveProfile('cais', DEFAULT_CUSTOM))
    expect(other.gfr).toContain('105 to 125')
    expect(other.note).not.toBeNull()
  })
})

describe('endocrine', () => {
  const run = (state: ReturnType<typeof initialGlucose>, hours: number) => {
    let current = state
    for (let i = 0; i < hours * 12; i++) current = stepGlucose(current, 300)
    return current
  }

  it('stays stable while fasting', () => {
    const settled = run(initialGlucose(), 12)
    expect(glucoseBand(settled.glucose)).toBe('normal')
  })

  it('rises after a meal, brings insulin, and recovers', () => {
    const settled = run(initialGlucose(), 6)
    const fed = eat(settled, 75)
    const after = run(fed, 1)
    expect(after.glucose).toBeGreaterThan(settled.glucose)
    expect(after.insulin).toBeGreaterThan(settled.insulin)
    expect(run(after, 8).glucose).toBeLessThan(factRange('glucose-normal-textbook')[1] + 1)
  })

  it('stays finite with very long steps', () => {
    expect(Number.isFinite(stepGlucose(eat(initialGlucose(), 100), 86400).glucose)).toBe(true)
  })
})

describe('immune', () => {
  const settings = { responders: 12, growth: 0.1 }

  it('repeats exactly from the same seed', () => {
    let a = createImmuneState(settings, 1)
    let b = createImmuneState(settings, 1)
    for (let i = 0; i < 50; i++) {
      a = stepImmune(a, 0.1, settings)
      b = stepImmune(b, 0.1, settings)
    }
    expect(a.pathogens).toEqual(b.pathogens)
  })

  it('lets enough white cells clear the demo infection', () => {
    let state = createImmuneState({ responders: 30, growth: 0.05 })
    for (let i = 0; i < 1500 && state.pathogens.length; i++) state = stepImmune(state, 0.05, { responders: 30, growth: 0.05 })
    expect(state.pathogens).toHaveLength(0)
    expect(state.engulfed).toBeGreaterThan(0)
  })
})

describe('skin', () => {
  it('sweats at the sourced resting amount when cool and still', () => {
    expect(thermoregulation({ ambient: 10, activity: 0 }).sweat).toBeCloseTo(factNumber('sweat-rest') / 1000 / 24)
    expect(thermoregulation({ ambient: 10, activity: 0 }).response).toBe('cold')
  })

  it('reaches the sourced active maximum and stays in the core range', () => {
    const hot = thermoregulation({ ambient: 45, activity: 1 })
    expect(hot.sweat).toBeCloseTo(factRange('sweat-active')[1])
    expect(hot.response).toBe('hot')
    expect(hot.core).toBeLessThanOrEqual(factRange('core-temp')[1])
  })
})

describe('life stages and body composition', () => {
  it('picks the sourced heart rate range for each age', () => {
    expect(lifeStage(0.02).pulseFact).toBe('pulse-newborn')
    expect(lifeStage(0.5).pulseFact).toBe('pulse-infant')
    expect(lifeStage(4).pulseFact).toBe('pulse-child-3-4')
    expect(lifeStage(15).id).toBe('adolescent')
    expect(lifeStage(70).id).toBe('older-adult')
  })

  it('calculates BMI and categories', () => {
    expect(bmi(70, 175, 30).bmi).toBeCloseTo(22.86, 2)
    expect(bmi(70, 175, 30).category).toBe('Healthy weight')
    expect(bmi(100, 175, 30).category).toBe('Obesity')
    expect(bmi(70, 175, 12).appliesToAge).toBe(false)
  })

  it('follows the published Mifflin-St Jeor equation', () => {
    expect(restingEnergy(70, 175, 30, 'male')).toEqual({ low: 1648.75, high: 1648.75 })
    expect(restingEnergy(70, 175, 30, 'female')).toEqual({ low: 1482.75, high: 1482.75 })
    expect(restingEnergy(70, 175, 30, null)).toEqual({ low: 1482.75, high: 1648.75 })
  })

  it('applies the energy rule of thumb', () => {
    expect(weeklyWeightChangeKg(500)).toBeCloseTo(0.4536, 3)
  })

  it('loses organ reserve only after age 30', () => {
    expect(organReserve(25)).toBe(1)
    expect(organReserve(70)).toBeCloseTo(0.6)
  })

  it('peaks bone density at the sourced age', () => {
    const curve = boneDensityCurve('female')
    const peak = curve.reduce((best, point) => (point.density > best.density ? point : best))
    expect(peak.age).toBe(factNumber('bone-density-peak'))
    expect(curve[80].density).toBeLessThan(boneDensityCurve('male')[80].density)
  })
})

describe('a day in the body', () => {
  const day = simulateDay(DEFAULT_PLAN)

  it('covers 24 hours in 5 minute steps', () => {
    expect(day.hours[0]).toBe(0)
    expect(day.hours[day.hours.length - 1]).toBeCloseTo(24)
    expect(day.hours).toHaveLength(289)
  })

  it('raises heart rate during exercise and lowers it in sleep', () => {
    const at = (hour: number) => day.heartRate[Math.round(hour * 12)]
    expect(at(18)).toBe(factNumber('exercise-hr'))
    expect(at(3)).toBeLessThan(at(12))
  })

  it('raises glucose after meals', () => {
    const at = (hour: number) => day.glucose[Math.round(hour * 12)]
    expect(at(14)).toBeGreaterThan(at(12.9))
  })

  it('keeps every value finite and temperature in range', () => {
    for (const series of [day.heartRate, day.glucose, day.hydration, day.temperature]) {
      expect(series.every(Number.isFinite)).toBe(true)
    }
    const [low, high] = factRange('temp-average')
    expect(Math.min(...day.temperature)).toBeGreaterThanOrEqual(low)
    expect(Math.max(...day.temperature)).toBeLessThanOrEqual(high + 0.01)
  })
})

describe('compare', () => {
  it('shows exercise above rest for heart rate', () => {
    const row = restVsExercise(30).rows[0]
    expect(parseInt(row.b)).toBeGreaterThan(parseInt(row.a))
  })

  it('tags every row with how it was produced', () => {
    for (const row of [...restVsExercise(30).rows, ...youngVsOld(25, 75).rows]) {
      expect(['sourced', 'calculated', 'illustrative']).toContain(row.basis)
    }
  })
})

describe('lessons', () => {
  it('has valid quiz answers for every lesson', () => {
    for (const lesson of LESSONS) {
      expect(lesson.quiz.length).toBeGreaterThan(0)
      for (const question of lesson.quiz) {
        expect(question.answer).toBeLessThan(question.options.length)
        expect(question.why.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('shared links', () => {
  const layers = Object.fromEntries(LAYERS.map(({ id }) => [id, { visible: id === 'skin', opacity: id === 'skin' ? 0.25 : 1 }])) as Record<LayerId, LayerState>
  const view = { sex: 'male', custom: DEFAULT_CUSTOM, layers, xray: true, clipAxis: 'axial' as const, clipPosition: 0.4, quality: 'high' as const, openSystem: 'urinary', selectedId: 'heart' }

  it('restores a view', () => {
    const decoded = decodeView(encodeView(view), { layers, custom: DEFAULT_CUSTOM })
    expect(decoded).toMatchObject({ sex: 'male', xray: true, clipAxis: 'axial', clipPosition: 0.4, quality: 'high', openSystem: 'urinary', selectedId: 'heart' })
    expect(decoded.layers?.skin).toEqual({ visible: true, opacity: 0.25 })
  })

  it('restores a custom sex profile', () => {
    const custom = { structures: ['uterus' as const, 'testes' as const], body: 'male' as const, testesPosition: 'external' as const }
    const decoded = decodeView(encodeView({ ...view, sex: 'custom', custom }), { layers, custom: DEFAULT_CUSTOM })
    expect(decoded.custom).toEqual(custom)
  })

  it('ignores bad values', () => {
    const decoded = decodeView('sex=not-real&q=ultra&clip=sideways&pos=9', { layers, custom: DEFAULT_CUSTOM })
    expect(decoded.sex).toBeUndefined()
    expect(decoded.quality).toBeUndefined()
    expect(decoded.clipAxis).toBeUndefined()
    expect(decoded.clipPosition).toBeUndefined()
  })
})
