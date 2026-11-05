import { useFrame } from '@react-three/fiber'
import { bodyEffects } from '../../sim/bodyEffects'
import { useClock } from '../../sim/clock'
import { activation, MOVEMENTS, type MovementId } from './model'

export const musculoLive: { movement: MovementId } = { movement: 'walk' }

/** Lights up the muscles working in the chosen movement, and shows them shortening slightly. */
export default function MusculoskeletalScene() {
  useFrame(() => {
    const movement = MOVEMENTS[musculoLive.movement]
    const share = (useClock.getState().time % movement.period) / movement.period
    bodyEffects.glow.clear()
    activation(movement, share).forEach((level, part) => {
      bodyEffects.glow.set(part, level * 0.85)
    })
  })
  return null
}
