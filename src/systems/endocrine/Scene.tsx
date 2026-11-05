import { useFrame } from '@react-three/fiber'
import { bodyEffects } from '../../sim/bodyEffects'

export const endocrineLive = { insulin: 0, glucagon: 0 }

export default function EndocrineScene() {
  useFrame(() => {
    bodyEffects.glow.set('pancreas', 0.15 + Math.max(endocrineLive.insulin, endocrineLive.glucagon) * 0.75)
    bodyEffects.glow.set('liver', endocrineLive.glucagon * 0.5)
    bodyEffects.glow.set('thymus', 0.1)
  })
  return null
}
