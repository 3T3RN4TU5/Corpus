import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { CatmullRomCurve3, Vector3 } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { PathParticles, type ParticlePath } from '../../scene/PathParticles'
import { bodyEffects } from '../../sim/bodyEffects'
import { SERIES_COLORS } from '../labKit'
import { useClock } from '../../sim/clock'
import { selectProfile, useBodyStore } from '../../store/useBodyStore'
import { digestivePath } from '../bodyPaths'
import { digestiveLive } from './live'
import { stageAt } from './model'

const STAGE_PART: Record<string, string> = { esophagus: 'esophagus', stomach: 'stomach', small: 'small-intestine', large: 'large-intestine' }

/** A marker for the food, moving along the digestive tract as the timeline runs. */
export default function DigestiveScene() {
  const body = useBodyStore(useShallow((state) => selectProfile(state).body))
  const { curve, stops } = useMemo(() => {
    const path = digestivePath(body)
    const curve = new CatmullRomCurve3(path.points.map((p) => new Vector3(...p)))
    curve.arcLengthDivisions = 800
    const samples = curve.getSpacedPoints(800)
    // Measures where each stage ends along the curve, because the curve's spacing is uneven.
    const shareOf = (target: [number, number, number]) => {
      const goal = new Vector3(...target)
      let best = 0
      samples.forEach((sample, index) => {
        if (sample.distanceToSquared(goal) < samples[best].distanceToSquared(goal)) best = index
      })
      return best / 800
    }
    const stops = {
      mouth: 0,
      esophagus: shareOf(path.stopPoints.esophagus),
      stomach: shareOf(path.stopPoints.stomach),
      small: shareOf(path.stopPoints.small),
      large: 1,
    }
    return { curve, stops }
  }, [body])
  const marker = useRef<Mesh>(null)
  const point = useMemo(() => new Vector3(), [])
  const foodPaths = useMemo<ParticlePath[]>(
    () => [{ weight: 1, points: digestivePath(body).points, colors: [{ at: 0, color: SERIES_COLORS.yellow }, { at: 1, color: SERIES_COLORS.orange }] }],
    [body],
  )

  useFrame(() => {
    const stages = digestiveLive.stages
    if (!stages.length || !marker.current) return
    const { time } = useClock.getState()
    const stage = stageAt(stages, time)
    const progress = Math.min(1, Math.max(0, (time - stage.start) / (stage.end - stage.start)))
    const from = { mouth: stops.mouth, esophagus: stops.mouth, stomach: stops.esophagus, small: stops.stomach, large: stops.small }[stage.id]
    const to = { mouth: stops.mouth, esophagus: stops.esophagus, stomach: stops.stomach, small: stops.small, large: stops.large }[stage.id]
    curve.getPointAt(from + (to - from) * progress, point)
    marker.current.position.copy(point)
    bodyEffects.glow.clear()
    const part = STAGE_PART[stage.id]
    if (part) bodyEffects.glow.set(part, 0.35)
    // Peristalsis is a wave of contraction, shown here as a pulse along the esophagus and the intestines.
    if (stage.id === 'esophagus' || stage.id === 'small' || stage.id === 'large') {
      const wave = 0.5 + 0.5 * Math.sin(performance.now() / 260)
      bodyEffects.glow.set(STAGE_PART[stage.id], 0.2 + 0.35 * wave)
      bodyEffects.scale.set(STAGE_PART[stage.id], [1 + 0.03 * wave, 1, 1 + 0.03 * wave])
    } else {
      for (const id of ['esophagus', 'small-intestine', 'large-intestine']) bodyEffects.scale.delete(id)
    }
    if (stage.id === 'stomach') {
      // The size and speed of the churning are exaggerated so that they can be seen.
      const churn = Math.sin(time * ((2 * Math.PI) / 20))
      bodyEffects.scale.set('stomach', 1.05 + 0.03 * churn)
      bodyEffects.glow.set('liver', 0.0)
    } else {
      bodyEffects.scale.delete('stomach')
    }
    if (stage.id === 'small') {
      bodyEffects.glow.set('liver', 0.22)
      bodyEffects.glow.set('gallbladder', 0.4)
      bodyEffects.glow.set('pancreas', 0.4)
    }
  })

  return (
    <>
    <PathParticles paths={foodPaths} count={260} lapsPerSecond={0.02} size={12} />
    <mesh ref={marker} renderOrder={60} raycast={() => null}>
      <sphereGeometry args={[0.016, 16, 12]} />
      <meshBasicMaterial color="#f0d24b" depthTest={false} transparent />
    </mesh>
    </>
  )
}
