import { useFrame } from '@react-three/fiber'
import { factRange } from '../../data/physiology'
import { bodyEffects } from '../../sim/bodyEffects'

export const urinaryLive = { volume: 0 }

export default function UrinaryScene() {
  useFrame(() => {
    const capacity = factRange('bladder-capacity')[1]
    bodyEffects.scale.set('bladder', 0.7 + 0.75 * Math.cbrt(urinaryLive.volume / capacity))
    bodyEffects.glow.set('kidneys', 0.22)
  })
  return null
}
