import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { PathParticles } from '../../scene/PathParticles'
import { selectProfile, useBodyStore } from '../../store/useBodyStore'
import { bodyEffects } from '../../sim/bodyEffects'
import { useClock } from '../../sim/clock'
import { bloodPaths } from '../bodyPaths'
import { circulatoryLive } from './live'
import { heartAt } from './model'

export default function CirculatoryScene() {
  const body = useBodyStore(useShallow((state) => selectProfile(state).body))
  const quality = useBodyStore((state) => state.quality)
  const paths = useMemo(() => bloodPaths(body), [body])
  const count = quality === 'low' ? 1200 : quality === 'medium' ? 3000 : 6000

  useFrame(() => {
    const { heartRate, systolic, diastolic, strokeVolume } = circulatoryLive
    const heart = heartAt(useClock.getState().time, heartRate, systolic, diastolic, strokeVolume)
    // Each chamber changes size with its own part of the beat. The amount is exaggerated so that it can be seen.
    const ventricle = 0.86 + 0.14 * heart.ventricles
    const atrium = 0.84 + 0.16 * heart.atria
    bodyEffects.scale.set('heart-left-ventricle', ventricle)
    bodyEffects.scale.set('heart-right-ventricle', ventricle)
    bodyEffects.scale.set('heart-left-atrium', atrium)
    bodyEffects.scale.set('heart-right-atrium', atrium)
    bodyEffects.scale.set('heart', ventricle)
    // Valves glow while open: the semilunar valves in systole, and the others at all other times.
    bodyEffects.glow.set('heart-valves', heart.semilunarOpen ? 0.5 : 0.1)
  })

  // One lap of the body takes about a minute at rest, and flow rises with cardiac output. Illustrative.
  return <PathParticles paths={paths} count={count} lapsPerSecond={() => (circulatoryLive.cardiacOutput / 5) * 0.12} size={15} />
}
