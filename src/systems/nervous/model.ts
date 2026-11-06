import { factNumber } from '../../data/physiology'

export interface ActionPotentialPhase {
  id: 'resting' | 'depolarization' | 'repolarization' | 'hyperpolarization'
  name: string
  text: string
}

export const AP_PHASES: Record<ActionPotentialPhase['id'], ActionPotentialPhase> = {
  resting: { id: 'resting', name: 'Resting potential', text: 'The inside of the neuron is negative compared with the outside, held there by ion gradients.' },
  depolarization: { id: 'depolarization', name: 'Depolarization', text: 'Past the threshold, voltage-gated sodium channels open. Sodium rushes in and the inside turns positive.' },
  repolarization: { id: 'repolarization', name: 'Repolarization', text: 'Sodium channels inactivate and potassium channels open. Potassium leaves and the inside turns negative again.' },
  hyperpolarization: { id: 'hyperpolarization', name: 'Hyperpolarization', text: 'Potassium channels are slow to close, so the voltage briefly drops below its resting level.' },
}

/** Time positions within one action potential, as shares of its duration. These shapes are illustrative. */
const RISE_END = 0.3
const FALL_END = 0.65

/**
 * Membrane potential during one action potential, from sourced resting, threshold, peak and duration values. The source
 * gives no size for the undershoot, so its depth is illustrative.
 */
export function membranePotential(msAfterThreshold: number): { voltage: number; phase: ActionPotentialPhase['id'] } {
  const resting = factNumber('resting-membrane')
  const threshold = factNumber('ap-threshold')
  const peak = factNumber('ap-peak')
  const duration = factNumber('ap-duration')
  const undershoot = resting - 10
  const t = msAfterThreshold / duration
  if (t < 0) return { voltage: resting + (threshold - resting) * Math.exp(t * 2), phase: 'resting' }
  if (t < RISE_END) return { voltage: threshold + (peak - threshold) * Math.sin(((t / RISE_END) * Math.PI) / 2), phase: 'depolarization' }
  if (t < FALL_END) {
    const fall = (t - RISE_END) / (FALL_END - RISE_END)
    return { voltage: peak + (undershoot - peak) * (0.5 - 0.5 * Math.cos(fall * Math.PI)), phase: 'repolarization' }
  }
  // The source says the whole event, including the undershoot and the return to rest, fits in the stated duration.
  if (t < 1) {
    const recover = (t - FALL_END) / (1 - FALL_END)
    return { voltage: undershoot + (resting - undershoot) * recover, phase: 'hyperpolarization' }
  }
  return { voltage: resting, phase: 'resting' }
}

export interface ReflexStep {
  id: string
  name: string
  text: string
  /** Where the signal is, as a share of the whole route from 0 to 1. */
  start: number
  end: number
  glow: string[]
}

/** The knee-jerk as a route. The steps follow the source's stretch reflex description. Relative timing is illustrative. */
export const REFLEX_STEPS: ReflexStep[] = [
  { id: 'tap', name: 'Tap', text: 'A hammer strikes the patellar ligament, which stretches the quadriceps.', start: 0, end: 0.1, glow: ['patella', 'quadriceps'] },
  { id: 'receptor', name: 'Muscle spindle receptor', text: 'The stretch activates a muscle spindle receptor in the quadriceps.', start: 0.1, end: 0.18, glow: ['quadriceps'] },
  { id: 'sensory', name: 'Sensory neuron', text: 'A sensory neuron carries the signal up the femoral nerve to the spinal cord.', start: 0.18, end: 0.48, glow: ['femoral-nerve'] },
  { id: 'cord', name: 'Spinal cord', text: 'In the spinal cord, the axon connects directly with a motor neuron. No brain decision is needed.', start: 0.48, end: 0.56, glow: ['spinal-cord'] },
  { id: 'motor', name: 'Motor neuron', text: 'The motor neuron carries a signal back to the same muscle.', start: 0.56, end: 0.86, glow: ['femoral-nerve'] },
  { id: 'contract', name: 'Muscle contracts', text: 'The quadriceps contracts and the lower leg kicks forward.', start: 0.86, end: 1, glow: ['quadriceps'] },
]

export function reflexStepAt(share: number): ReflexStep {
  return REFLEX_STEPS.find((step) => share < step.end) ?? REFLEX_STEPS[REFLEX_STEPS.length - 1]
}

export interface BrainRegion {
  id: string
  name: string
  function: string
  /** An SVG outline in the diagram's coordinates. */
  shape: string
  label: [number, number]
  color: string
}

/** Functions follow OpenStax A&P 2e, 13.2 The Central Nervous System. Outlines are schematic. */
export const BRAIN_REGIONS: BrainRegion[] = [
  { id: 'frontal', name: 'Frontal lobe', function: 'Primarily associated with motor functions, including planning and carrying out movement.', shape: 'M18 80 C18 30 60 12 108 14 L118 84 L84 104 L40 106 C26 104 18 94 18 80 Z', label: [66, 62], color: '#b86a55' },
  { id: 'parietal', name: 'Parietal lobe', function: 'Handles somatosensation, the general sensations from the body, such as touch and pain.', shape: 'M108 14 C146 14 170 28 182 52 L136 88 L118 84 Z', label: [140, 50], color: '#a8824f' },
  { id: 'occipital', name: 'Occipital lobe', function: 'Responsible for primary visual perception.', shape: 'M182 52 C198 72 200 96 190 112 L146 104 L136 88 Z', label: [170, 88], color: '#7a7f4e' },
  { id: 'temporal', name: 'Temporal lobe', function: 'Associated with primary auditory sensation. It contains the hippocampus and amygdala on its inner side.', shape: 'M40 106 L84 104 L118 84 L136 88 L146 104 C128 126 92 134 62 126 C48 122 40 116 40 106 Z', label: [94, 116], color: '#5f8a7a' },
  { id: 'hippocampus', name: 'Hippocampus', function: 'Involved in long-term memory formation and, with the amygdala, in emotional responses.', shape: 'M92 96 C104 90 124 92 132 100 C122 106 104 108 92 104 Z', label: [112, 100], color: '#e0b84b' },
  { id: 'thalamus', name: 'Thalamus', function: 'Relays information between the cerebral cortex and the periphery.', shape: 'M108 72 a12 9 0 1 0 24 0 a12 9 0 1 0 -24 0', label: [120, 75], color: '#c774a0' },
  { id: 'hypothalamus', name: 'Hypothalamus', function: 'Largely involved in regulating homeostasis, including body temperature, thirst and hunger.', shape: 'M92 82 a9 6 0 1 0 18 0 a9 6 0 1 0 -18 0', label: [101, 85], color: '#8d74c7' },
  { id: 'cerebellum', name: 'Cerebellum', function: 'Compares information from the cerebrum with sensory feedback, to coordinate movement. About 10 percent of the brain\'s mass.', shape: 'M146 110 C168 106 192 114 192 130 C192 146 164 152 148 142 C140 136 140 118 146 110 Z', label: [168, 132], color: '#5a7fa8' },
  { id: 'brainstem', name: 'Brainstem', function: 'The midbrain, pons and medulla. The pons and medulla regulate crucial functions, including the cardiovascular and respiratory systems.', shape: 'M116 108 L138 108 L144 142 L134 176 L120 176 L122 142 Z', label: [130, 140], color: '#7f6a5a' },
]

export const NEUROTRANSMITTERS = ['Acetylcholine', 'Glutamate', 'GABA', 'Glycine', 'Serotonin', 'Dopamine', 'Norepinephrine', 'Epinephrine', 'Endorphins', 'Substance P']
