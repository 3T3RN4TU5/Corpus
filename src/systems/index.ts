import { lazy } from 'react'
import type { SystemId } from '../data/anatomy'
import { factNumber } from '../data/physiology'
import { resolveProfile, DEFAULT_CUSTOM } from '../data/sexProfiles'
import { bmi, organReserve, restingEnergy } from './body/model'
import { circulation } from './circulatory/model'
import { initialGlucose, stepGlucose, type GlucoseState } from './endocrine/model'
import { breathing } from './respiratory/model'
import { thermoregulation } from './skin/model'
import type { BodySystemPlugin } from './types'
import { urinePerDay } from './urinary/model'

const EXERCISE = { sedentary: 0, light: 0.25, moderate: 0.5, vigorous: 1 }

export const SYSTEM_PLUGINS: BodySystemPlugin[] = [
  {
    id: 'circulatory',
    name: 'Circulatory',
    summary: 'The heart cycle, ECG, blood flow and pressure.',
    anatomy: ['cardiovascular'],
    model: lazy(() => import('./circulatory/Scene')),
    ui: lazy(() => import('./circulatory/Lab')),
    layers: { skin: 0.1, skeleton: 0.22, organs: 0.45, vessels: 1 },
    update: (_dt, sim) => {
      const output = circulation({ ageYears: sim.ageYears, restingRate: factNumber('heart-rate-rest-adult'), systolic: factNumber('bp-systolic'), diastolic: factNumber('bp-diastolic'), exercise: EXERCISE[sim.activityLevel], stenosis: 0 })
      return { heartRate: output.heartRate, cardiacOutput: output.cardiacOutput }
    },
    dataSources: ['heart-rate-rest-adult', 'stroke-volume-rest', 'cardiac-output-rest', 'exercise-hr', 'exercise-sv', 'max-hr-base', 'bp-systolic', 'bp-diastolic'],
    limits: ['ECG wave heights and blood routes are illustrative.'],
  },
  {
    id: 'respiratory',
    name: 'Respiratory',
    summary: 'Breathing, tidal volume and gas exchange in the alveoli.',
    anatomy: ['respiratory'],
    model: lazy(() => import('./respiratory/Scene')),
    ui: lazy(() => import('./respiratory/Lab')),
    layers: { skin: 0.12, skeleton: 0.5, organs: 1, muscle: 0.2 },
    update: (_dt, sim) => {
      const output = breathing(sim.activityLevel === 'sedentary' ? 'sedentary' : sim.activityLevel)
      return { breathingRate: output.rate, tidalVolume: output.tidalVolume }
    },
    dataSources: ['breathing-rate-adolescent-adult', 'tidal-volume', 'vital-capacity', 'alveolar-po2', 'alveolar-pco2'],
    limits: ['Breathing during exercise is illustrative, built up from sourced resting values.'],
  },
  {
    id: 'digestive',
    name: 'Digestive',
    summary: 'A meal from mouth to large intestine, with enzymes and absorption.',
    anatomy: ['digestive'],
    model: lazy(() => import('./digestive/Scene')),
    ui: lazy(() => import('./digestive/Lab')),
    layers: { skin: 0.1, skeleton: 0.2, organs: 1 },
    update: (dt, _sim, previous) => ({ elapsed: (previous.elapsed ?? 0) + dt }),
    dataSources: ['stomach-emptying', 'small-intestine-transit', 'large-intestine-transit', 'kcal-carbohydrate', 'kcal-protein', 'kcal-fat'],
    limits: ['Stage lengths use mid-range values, and the absorption curve is illustrative.'],
  },
  {
    id: 'nervous',
    name: 'Nervous system and brain',
    summary: 'Brain regions, action potentials, synapses and the knee-jerk reflex.',
    anatomy: ['nervous'],
    model: lazy(() => import('./nervous/Scene')),
    ui: lazy(() => import('./nervous/Lab')),
    layers: { skin: 0.1, skeleton: 0.2, nerves: 1, organs: 1 },
    update: (dt, _sim, previous) => ({ elapsed: (previous.elapsed ?? 0) + dt, restingPotential: factNumber('resting-membrane') }),
    dataSources: ['resting-membrane', 'ap-threshold', 'ap-peak', 'ap-duration', 'spinal-nerves', 'cranial-nerves'],
    limits: ['Peripheral nerve routes are hand-placed.'],
  },
  {
    id: 'musculoskeletal',
    name: 'Musculoskeletal',
    summary: 'Movements, working muscles, sliding filaments, joints and bone healing.',
    anatomy: ['skeletal', 'muscular'],
    model: lazy(() => import('./musculoskeletal/Scene')),
    ui: lazy(() => import('./musculoskeletal/Lab')),
    layers: { skeleton: 1, muscle: 1 },
    update: (dt, _sim, previous) => ({ elapsed: (previous.elapsed ?? 0) + dt }),
    dataSources: ['sarcomere-length', 'power-stroke-distance', 'energy-creatine', 'energy-glycolysis', 'fracture-hematoma', 'fracture-callus'],
    limits: ['The body has no rig, so a stick figure shows movements. Activation levels are illustrative.'],
  },
  {
    id: 'urinary',
    name: 'Urinary',
    summary: 'Nephrons, urine formation, the bladder and hydration.',
    anatomy: ['urinary'],
    model: lazy(() => import('./urinary/Scene')),
    ui: lazy(() => import('./urinary/Lab')),
    layers: { skin: 0.1, skeleton: 0.2, organs: 1 },
    update: (_dt, sim) => ({ urineLitresPerDay: urinePerDay(sim.hydration) }),
    dataSources: ['gfr-female', 'gfr-male', 'urine-daily', 'urine-minimum', 'bladder-capacity', 'bladder-urge'],
    limits: ['Urine output follows a simple line with hydration.'],
  },
  {
    id: 'endocrine',
    name: 'Endocrine',
    summary: 'Glands and the insulin and glucagon feedback loop.',
    anatomy: ['endocrine', 'reproductive'],
    model: lazy(() => import('./endocrine/Scene')),
    ui: lazy(() => import('./endocrine/Lab')),
    layers: { skin: 0.1, skeleton: 0.2, organs: 1 },
    update: (dt, _sim, previous) => {
      const next = stepGlucose({ ...initialGlucose(), ...(previous as Partial<GlucoseState>) }, dt)
      return { glucose: next.glucose, insulin: next.insulin, glucagon: next.glucagon, gut: next.gut, exercise: next.exercise }
    },
    dataSources: ['glucose-normal-textbook', 'glucose-fasting', 'glucose-prediabetes', 'glucose-diabetes-fasting'],
    limits: ['The feedback directions are sourced, and all rates are illustrative.'],
  },
  {
    id: 'immune',
    name: 'Immune and lymphatic',
    summary: 'White blood cells against pathogens, and lymph flow.',
    anatomy: ['lymphatic'],
    model: lazy(() => import('./immune/Scene')),
    ui: lazy(() => import('./immune/Lab')),
    layers: { skin: 0.1, skeleton: 0.2, organs: 0.35, lymph: 1 },
    update: (dt, _sim, previous) => ({ elapsed: (previous.elapsed ?? 0) + dt }),
    dataSources: ['wbc-count', 'neutrophil-share', 'lymphocyte-share', 'lymph-nodes'],
    limits: ['A simplified demo that predicts nothing about real illness.'],
  },
  {
    id: 'skin',
    name: 'Skin and temperature',
    summary: 'Skin layers, sweat glands and thermoregulation.',
    anatomy: ['integumentary'],
    model: null,
    ui: lazy(() => import('./skin/Lab')),
    layers: { skin: 1 },
    update: (_dt, sim) => {
      const output = thermoregulation({ ambient: 22, activity: EXERCISE[sim.activityLevel] })
      return { sweatLitresPerHour: output.sweat, coreTemperature: output.core }
    },
    dataSources: ['core-temp', 'sweat-rest', 'sweat-active', 'heat-loss-radiation'],
    limits: ['The link between temperature and sweat is illustrative between sourced end points.'],
  },
  {
    id: 'hygiene',
    name: 'Excretion and hygiene',
    summary: 'What sweat, urine and feces remove, and everyday guidance.',
    anatomy: [],
    model: null,
    ui: lazy(() => import('./hygiene/Lab')),
    layers: { skin: 1 },
    update: (dt, _sim, previous) => ({ elapsed: (previous.elapsed ?? 0) + dt }),
    dataSources: ['handwash-scrub', 'brushing-daily', 'sleep-adult'],
    limits: ['General public guidance, not personal advice.'],
  },
  {
    id: 'body',
    name: 'Life stages and body composition',
    summary: 'Age, height, weight, BMI and energy balance.',
    anatomy: [],
    model: null,
    ui: lazy(() => import('./body/Lab')),
    layers: { skin: 0.5, fat: 0.5, skeleton: 1, organs: 1 },
    update: (_dt, sim) => {
      const profile = resolveProfile(sim.sexProfileId, DEFAULT_CUSTOM)
      const energy = restingEnergy(sim.weightKg, sim.heightCm, sim.ageYears, profile.referenceSex)
      return { bmi: bmi(sim.weightKg, sim.heightCm, sim.ageYears).bmi, restingEnergy: (energy.low + energy.high) / 2, organReserve: organReserve(sim.ageYears) }
    },
    dataSources: ['pulse-10-plus', 'bone-density-peak', 'bmi-overweight-from', 'ree-weight-coefficient', 'kcal-per-pound'],
    limits: ['The model stays an adult body at every age.'],
  },
  {
    id: 'day',
    name: 'A day in the body',
    summary: 'Meals, exercise and sleep acting on heart rate, glucose, water and temperature.',
    anatomy: [],
    model: null,
    ui: lazy(() => import('./day/Lab')),
    layers: { skin: 0.2, skeleton: 1, organs: 1 },
    update: (dt, _sim, previous) => ({ elapsed: (previous.elapsed ?? 0) + dt }),
    dataSources: ['exercise-hr', 'sweat-active', 'temp-average'],
    limits: ['A combination of simple models, for one illustrative adult.'],
  },
  {
    id: 'compare',
    name: 'Compare',
    summary: 'Rest and exercise, or a younger and an older adult, side by side.',
    anatomy: [],
    model: null,
    ui: lazy(() => import('./compare/Lab')),
    layers: { skin: 0.2, skeleton: 1, organs: 1 },
    update: (dt, _sim, previous) => ({ elapsed: (previous.elapsed ?? 0) + dt }),
    dataSources: ['exercise-hr', 'reserve-loss-aging'],
    limits: ['Each row is tagged as sourced, calculated or illustrative.'],
  },
  {
    id: 'learn',
    name: 'Lessons and quizzes',
    summary: 'A short lesson and quiz for each system, with saved progress.',
    anatomy: [],
    model: null,
    ui: lazy(() => import('./learn/Lab')),
    layers: { skin: 0.2, skeleton: 1, organs: 1 },
    update: (dt, _sim, previous) => ({ elapsed: (previous.elapsed ?? 0) + dt }),
    dataSources: ['heart-chambers', 'tidal-volume'],
    limits: ['Lessons are short introductions.'],
  },
]

export function getPlugin(id: string | null): BodySystemPlugin | undefined {
  return SYSTEM_PLUGINS.find((plugin) => plugin.id === id)
}

export function pluginForAnatomy(system: SystemId): BodySystemPlugin | undefined {
  return SYSTEM_PLUGINS.find((plugin) => plugin.anatomy.includes(system))
}
