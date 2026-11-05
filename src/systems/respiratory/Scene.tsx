import { useFrame } from '@react-three/fiber'
import { bodyEffects } from '../../sim/bodyEffects'
import { useClock } from '../../sim/clock'
import { breathAt, breathing, type ActivityLevel } from './model'

export const respiratoryLive: { level: ActivityLevel } = { level: 'sedentary' }

export default function RespiratoryScene() {
  useFrame(() => {
    const output = breathing(respiratoryLive.level)
    const { fill } = breathAt(useClock.getState().time, output)
    // The size change is exaggerated to be visible, and it grows with breath depth.
    const depth = Math.min(1, output.tidalVolume / 2000)
    const lung = 1 + fill * (0.03 + 0.09 * depth)
    bodyEffects.scale.set('lung-left', lung)
    bodyEffects.scale.set('lung-right', lung)
    bodyEffects.scale.set('diaphragm', [1, 1 - fill * (0.06 + 0.1 * depth), 1])
    bodyEffects.scale.set('rib-cage', [1 + fill * 0.012, 1, 1 + fill * 0.02])
    bodyEffects.scale.set('chest-wall-muscles', [1 + fill * 0.012, 1, 1 + fill * 0.02])
    bodyEffects.glow.set('diaphragm', fill * 0.35)
    bodyEffects.glow.set('chest-wall-muscles', fill * 0.25)
  })
  return null
}
