import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { PathParticles } from '../../scene/PathParticles'
import { bodyEffects } from '../../sim/bodyEffects'
import { selectProfile, useBodyStore } from '../../store/useBodyStore'
import { lymphPaths } from '../bodyPaths'

export default function ImmuneScene() {
  const body = useBodyStore(useShallow((state) => selectProfile(state).body))
  const paths = useMemo(() => lymphPaths(body), [body])
  useFrame(() => {
    bodyEffects.glow.set('spleen', 0.3)
    bodyEffects.glow.set('thymus', 0.3)
    bodyEffects.glow.set('axillary-nodes', 0.4)
    bodyEffects.glow.set('inguinal-nodes', 0.4)
    bodyEffects.glow.set('cervical-nodes', 0.4)
  })
  // Lymph is shown moving slowly toward the neck, where it returns to the blood. The speed is illustrative.
  return <PathParticles paths={paths} count={900} lapsPerSecond={0.05} size={13} />
}
