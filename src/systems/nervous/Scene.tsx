import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { PathParticles, type ParticlePath } from '../../scene/PathParticles'
import { bodyEffects } from '../../sim/bodyEffects'
import { useClock } from '../../sim/clock'
import { selectProfile, useBodyStore } from '../../store/useBodyStore'
import { reflexPath, reflexReturnPath, spinalPath } from '../bodyPaths'
import { SERIES_COLORS } from '../labKit'
import { reflexStepAt } from './model'

export const nervousLive: { reflexLoop: number; region: string | null } = { reflexLoop: 6, region: null }

export default function NervousScene() {
  const body = useBodyStore(useShallow((state) => selectProfile(state).body))
  const paths = useMemo<ParticlePath[]>(() => {
    const sensory = [{ at: 0, color: SERIES_COLORS.yellow }, { at: 1, color: SERIES_COLORS.yellow }]
    const motor = [{ at: 0, color: SERIES_COLORS.pink }, { at: 1, color: SERIES_COLORS.pink }]
    return [
      { weight: 1, colors: sensory, points: reflexPath(body) },
      { weight: 1, colors: motor, points: reflexReturnPath(body) },
      { weight: 1, colors: sensory, points: spinalPath(body) },
    ]
  }, [body])

  useFrame(() => {
    const share = (useClock.getState().time % nervousLive.reflexLoop) / nervousLive.reflexLoop
    const step = reflexStepAt(share)
    bodyEffects.glow.clear()
    step.glow.forEach((id) => bodyEffects.glow.set(id, 0.65))
    if (nervousLive.region) bodyEffects.glow.set(nervousLive.region, 0.8)
  })

  return <PathParticles paths={paths} count={500} lapsPerSecond={0.5} size={20} />
}
