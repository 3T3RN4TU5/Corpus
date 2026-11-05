import { factNumber, factRange } from '../../data/physiology'

export interface Joint {
  type: string
  axes: string
  examples: string
  note: string
}

/** Joint types and examples follow OpenStax A&P 2e, 9.4 Synovial Joints. The source gives no angle ranges. */
export const JOINTS: Joint[] = [
  { type: 'Ball-and-socket', axes: 'Multiaxial', examples: 'Hip and shoulder', note: 'The greatest range of motion of any joint type.' },
  { type: 'Hinge', axes: 'Uniaxial', examples: 'Elbow, knee, ankle, finger joints', note: 'Bends and straightens, like a door.' },
  { type: 'Pivot', axes: 'Uniaxial', examples: 'Between the first two neck vertebrae, and at the top of the forearm', note: 'One bone rotates around another.' },
  { type: 'Condyloid', axes: 'Biaxial', examples: 'Knuckles and wrist', note: 'Moves in two planes.' },
  { type: 'Saddle', axes: 'Biaxial', examples: 'Base of the thumb, and the sternoclavicular joint', note: 'Two saddle-shaped surfaces fit together.' },
  { type: 'Plane', axes: 'Multiaxial, limited by ligaments', examples: 'Between wrist bones and between ankle bones', note: 'Flat surfaces glide over each other.' },
]

export type MovementId = 'walk' | 'run' | 'lift' | 'squat'

export interface Movement {
  id: MovementId
  name: string
  period: number
  /** Stick-figure joint angles in degrees through the cycle: hip, knee, ankle, shoulder and elbow. */
  pose: (share: number) => { hipL: number; kneeL: number; hipR: number; kneeR: number; shoulder: number; elbow: number; trunk: number; drop: number }
  /** Which muscles work, with peak activation (0 to 1) and when in the cycle they peak (0 to 1). */
  muscles: { part: string; peak: number; at: number; width: number }[]
}

const swing = (share: number, amplitude: number, offset = 0) => Math.sin((share + offset) * 2 * Math.PI) * amplitude
const lower = (share: number) => 0.5 - 0.5 * Math.cos(share * 2 * Math.PI)

/** Educational patterns of which muscles lead each movement. The timings and levels are illustrative, not measurements. */
export const MOVEMENTS: Record<MovementId, Movement> = {
  walk: {
    id: 'walk',
    name: 'Walk',
    period: 1.2,
    pose: (s) => ({ hipL: swing(s, 22), kneeL: 8 + Math.max(0, swing(s, 40, 0.2)), hipR: swing(s, 22, 0.5), kneeR: 8 + Math.max(0, swing(s, 40, 0.7)), shoulder: swing(s, -16), elbow: 18, trunk: 2, drop: 0 }),
    muscles: [
      { part: 'gluteus-maximus', peak: 0.5, at: 0.05, width: 0.15 },
      { part: 'quadriceps', peak: 0.5, at: 0.12, width: 0.12 },
      { part: 'hamstrings', peak: 0.5, at: 0.92, width: 0.12 },
      { part: 'gastrocnemius', peak: 0.7, at: 0.45, width: 0.12 },
      { part: 'tibialis-anterior', peak: 0.5, at: 0.75, width: 0.2 },
      { part: 'hip-muscles', peak: 0.5, at: 0.2, width: 0.15 },
    ],
  },
  run: {
    id: 'run',
    name: 'Run',
    period: 0.7,
    pose: (s) => ({ hipL: swing(s, 38), kneeL: 20 + Math.max(0, swing(s, 75, 0.2)), hipR: swing(s, 38, 0.5), kneeR: 20 + Math.max(0, swing(s, 75, 0.7)), shoulder: swing(s, -38), elbow: 85, trunk: 8, drop: 0 }),
    muscles: [
      { part: 'gluteus-maximus', peak: 0.9, at: 0.1, width: 0.15 },
      { part: 'quadriceps', peak: 0.95, at: 0.15, width: 0.12 },
      { part: 'hamstrings', peak: 0.9, at: 0.9, width: 0.15 },
      { part: 'gastrocnemius', peak: 1, at: 0.3, width: 0.12 },
      { part: 'tibialis-anterior', peak: 0.6, at: 0.7, width: 0.2 },
      { part: 'external-oblique', peak: 0.5, at: 0.3, width: 0.3 },
      { part: 'deltoid', peak: 0.4, at: 0.5, width: 0.3 },
    ],
  },
  lift: {
    id: 'lift',
    name: 'Lift',
    period: 3,
    pose: (s) => {
      const d = lower(s)
      return { hipL: -55 * d, kneeL: 60 * d, hipR: -55 * d, kneeR: 60 * d, shoulder: 20 * (1 - d), elbow: 5, trunk: 40 * d, drop: d * 0.2 }
    },
    muscles: [
      { part: 'gluteus-maximus', peak: 0.95, at: 0.7, width: 0.2 },
      { part: 'hamstrings', peak: 0.85, at: 0.7, width: 0.2 },
      { part: 'quadriceps', peak: 0.85, at: 0.65, width: 0.2 },
      { part: 'back-muscles', peak: 1, at: 0.7, width: 0.25 },
      { part: 'trapezius', peak: 0.7, at: 0.75, width: 0.25 },
      { part: 'forearm-muscles', peak: 0.7, at: 0.6, width: 0.4 },
      { part: 'latissimus-dorsi', peak: 0.6, at: 0.7, width: 0.25 },
    ],
  },
  squat: {
    id: 'squat',
    name: 'Squat',
    period: 3,
    pose: (s) => {
      const d = lower(s)
      return { hipL: -90 * d, kneeL: 110 * d, hipR: -90 * d, kneeR: 110 * d, shoulder: -70 * d, elbow: 5, trunk: 22 * d, drop: d * 0.32 }
    },
    muscles: [
      { part: 'quadriceps', peak: 1, at: 0.6, width: 0.25 },
      { part: 'gluteus-maximus', peak: 0.85, at: 0.65, width: 0.22 },
      { part: 'hamstrings', peak: 0.45, at: 0.65, width: 0.22 },
      { part: 'gastrocnemius', peak: 0.4, at: 0.6, width: 0.25 },
      { part: 'back-muscles', peak: 0.6, at: 0.5, width: 0.4 },
      { part: 'rectus-abdominis', peak: 0.4, at: 0.5, width: 0.4 },
    ],
  },
}

/** Wrapped distance, because a cycle's end meets its start. */
function cycleGap(a: number, b: number): number {
  const gap = Math.abs(a - b)
  return Math.min(gap, 1 - gap)
}

export function activation(movement: Movement, share: number): Map<string, number> {
  const levels = new Map<string, number>()
  for (const muscle of movement.muscles) {
    const gap = cycleGap(share, muscle.at) / muscle.width
    levels.set(muscle.part, muscle.peak * Math.exp(-gap * gap))
  }
  return levels
}

/** A sarcomere shortens as filaments slide. The contracted length shown is illustrative. */
export function sarcomereLength(contraction: number): number {
  const rest = factNumber('sarcomere-length')
  return rest * (1 - 0.3 * contraction)
}

export const FILAMENT_STEPS = [
  { name: 'Calcium binds', text: 'Calcium binds to troponin, and tropomyosin moves off the binding sites on actin.' },
  { name: 'Cross-bridge', text: 'Myosin heads bind to the exposed sites, forming cross-bridges.' },
  { name: 'Power stroke', text: 'The myosin head pivots, pulling the thin filament about 10 nm toward the centre of the sarcomere.' },
  { name: 'Release', text: 'ATP binds to the myosin head, which detaches from actin.' },
  { name: 'Re-cock', text: 'Myosin splits the ATP and resets its head, ready to pull again.' },
]

export interface EnergySource {
  name: string
  seconds: number
  label: string
}

export function energySources(): EnergySource[] {
  return [
    { name: 'Stored ATP', seconds: factRange('energy-stored-atp')[1], label: 'A few seconds' },
    { name: 'Creatine phosphate', seconds: factNumber('energy-creatine'), label: `About ${factNumber('energy-creatine')} s` },
    { name: 'Glycolysis', seconds: factNumber('energy-glycolysis'), label: `About ${factNumber('energy-glycolysis')} s` },
  ]
}

export interface HealingStage {
  name: string
  timing: string
  text: string
  /** How much of the gap is bridged in the diagram, from 0 to 1. Illustrative. */
  bridge: number
}

export function healingStages(): HealingStage[] {
  const [low, high] = factRange('fracture-hematoma')
  return [
    { name: 'Hematoma', timing: `About ${low} to ${high} hours`, text: 'Torn blood vessels bleed, and a clot called a fracture hematoma forms.', bridge: 0.1 },
    { name: 'Calli form', timing: `Within about ${factNumber('fracture-callus')} hours`, text: 'Cartilage-forming cells build an internal callus and an external callus around the break.', bridge: 0.4 },
    { name: 'Trabecular bone', timing: 'Over the next several weeks', text: 'Dead bone is cleared, and bone-forming cells replace the callus cartilage with trabecular bone.', bridge: 0.75 },
    { name: 'Remodeling', timing: 'The source gives no time', text: 'The calli unite, compact bone replaces spongy bone at the margins, and the bone is remodeled.', bridge: 1 },
  ]
}
