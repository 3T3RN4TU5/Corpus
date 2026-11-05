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
    const { heartRate, systolic, diastolic } = circulatoryLive
    const heart = heartAt(useClock.getState().time, heartRate, systolic, diastolic)
    bodyEffects.scale.set('heart', 0.93 + 0.1 * heart.ventricles)
  })

  // One lap of the body takes about a minute at rest, and flow rises with cardiac output. Illustrative.
  return <PathParticles paths={paths} count={count} lapsPerSecond={() => (circulatoryLive.cardiacOutput / 5) * 0.12} size={15} />
}
