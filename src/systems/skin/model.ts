import { factNumber, factRange } from '../../data/physiology'

export interface ThermalInput {
  /** Air temperature in °C. */
  ambient: number
  /** Activity from 0 (rest) to 1 (vigorous). */
  activity: number
}

export interface ThermalOutput {
  /** Sweat in litres per hour. */
  sweat: number
  /** Blood vessel width in the skin: below 0.5 is constricted, and above 0.5 is dilated. */
  vesselDilation: number
  /** Illustrative core temperature, which stays in the sourced range except at extremes. */
  core: number
  response: 'cold' | 'neutral' | 'hot'
}

/**
 * Heat load grows as air warms above the source's comfortable temperature for a naked person, and with activity. The
 * body responds as the source describes: vessels widen and sweat flows when hot, and vessels narrow when cold. Sweat runs
 * from the sourced resting amount to the top of the sourced active range. The curve between is illustrative.
 */
export function thermoregulation({ ambient, activity }: ThermalInput): ThermalOutput {
  const neutral = ((factNumber('thermoneutral-air') - 32) * 5) / 9
  const load = (ambient - neutral) / 14 + activity
  const heat = Math.max(0, Math.min(1, load))
  const restingPerHour = factNumber('sweat-rest') / 1000 / 24
  const top = factRange('sweat-active')[1]
  const sweat = restingPerHour + (top - restingPerHour) * heat ** 1.5
  const [low, high] = factRange('core-temp')
  const core = Math.max(low, Math.min(high, (low + high) / 2 + load * 0.25))
  return {
    sweat,
    vesselDilation: Math.max(0, Math.min(1, 0.5 + load * 0.5)),
    core,
    response: load < -0.08 ? 'cold' : load > 0.08 ? 'hot' : 'neutral',
  }
}

export interface SkinLayer {
  id: string
  name: string
  text: string
  /** The band in the diagram, from top. */
  y: number
  height: number
  color: string
}

/** Layers follow OpenStax A&P 2e, 5.1 Layers of the Skin. Thicknesses in the diagram are not to scale. */
export const SKIN_LAYERS: SkinLayer[] = [
  { id: 'corneum', name: 'Stratum corneum', text: 'The outermost layer of dead, flattened cells, which forms a tough barrier.', y: 12, height: 10, color: '#d9c2a5' },
  { id: 'granulosum', name: 'Stratum granulosum', text: 'Cells flatten and fill with the protein keratin.', y: 22, height: 8, color: '#c9a184' },
  { id: 'spinosum', name: 'Stratum spinosum', text: 'Cells join by strong connections and begin making keratin.', y: 30, height: 12, color: '#bb8c70' },
  { id: 'basale', name: 'Stratum basale', text: 'The deepest epidermal layer, where new skin cells form.', y: 42, height: 6, color: '#8f5f48' },
  { id: 'papillary', name: 'Papillary dermis', text: 'Loose tissue with capillaries and nerve endings just under the epidermis.', y: 48, height: 18, color: '#c77e72' },
  { id: 'reticular', name: 'Reticular dermis', text: 'Dense tissue with collagen and elastin. It holds sweat glands and hair follicles.', y: 66, height: 46, color: '#a85d58' },
  { id: 'hypodermis', name: 'Hypodermis', text: 'Fat and connective tissue beneath the skin, which connect it to underlying structures.', y: 112, height: 40, color: '#e3c370' },
]
