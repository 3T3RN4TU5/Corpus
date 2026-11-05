import { modelManifest, partModel, type BodyId } from '../data/models'
import type { ParticlePath } from '../scene/PathParticles'
import { SERIES_COLORS } from './labKit'

type Point = [number, number, number]

/** Places a point by share of half the body's width and share of its height, so paths fit either body. */
export function placer(body: BodyId) {
  const { height, width } = modelManifest.bodies[body]
  return (xShare: number, yShare: number, z = 0): Point => [(xShare * width) / 2, yShare * height, z]
}

function centre(body: BodyId, id: string): Point {
  return partModel(body, id)?.centre ?? [0, 1, 0]
}

export const ARTERIAL = SERIES_COLORS.orange
export const VENOUS = SERIES_COLORS.blue

/** Round trips from the heart. They are illustrative routes through the body, not traced vessels. */
export function bloodPaths(body: BodyId): ParticlePath[] {
  const p = placer(body)
  const heart = centre(body, 'heart')
  const left = centre(body, 'lung-left')
  const right = centre(body, 'lung-right')
  const arch: Point = [heart[0] * 0.3, heart[1] + 0.08, heart[2] - 0.02]
  const out = [{ at: 0, color: ARTERIAL }, { at: 0.46, color: ARTERIAL }, { at: 0.54, color: VENOUS }, { at: 1, color: VENOUS }]
  const lungs = [{ at: 0, color: VENOUS }, { at: 0.46, color: VENOUS }, { at: 0.54, color: ARTERIAL }, { at: 1, color: ARTERIAL }]

  const arm = (side: 1 | -1): ParticlePath => ({
    weight: 1,
    colors: out,
    points: [heart, arch, p(0.18 * side, 0.815), p(0.38 * side, 0.8), p(0.62 * side, 0.66), p(0.88 * side, 0.49), p(0.63 * side, 0.665, 0.015), p(0.39 * side, 0.805, 0.015), p(0.1 * side, 0.82, 0.02), heart],
  })
  const leg = (side: 1 | -1): ParticlePath => ({
    weight: 2,
    colors: out,
    points: [heart, [0.01, heart[1] - 0.2, -0.03], p(0.04 * side, 0.54, -0.02), p(0.17 * side, 0.46, 0.03), p(0.19 * side, 0.28, 0), p(0.2 * side, 0.05, -0.01), p(0.2 * side, 0.1, 0.02), p(0.17 * side, 0.3, 0.02), p(0.14 * side, 0.46, 0.04), p(0.03 * side, 0.55, 0), [-0.015, heart[1] - 0.2, -0.015], heart],
  })
  const head: ParticlePath = {
    weight: 1.5,
    colors: out,
    points: [heart, arch, p(0.04, 0.87, 0.01), p(0.03, 0.95, 0.01), p(-0.03, 0.97, 0), p(-0.05, 0.88, 0), [-0.02, heart[1] + 0.1, 0], heart],
  }
  const lung = (target: Point, sign: number): ParticlePath => ({
    weight: 2,
    colors: lungs,
    points: [heart, [target[0] * 0.5, heart[1] + 0.06, 0], target, [target[0] + 0.03 * sign, target[1] - 0.05, target[2]], [target[0] * 0.4, heart[1] + 0.02, -0.01], heart],
  })
  return [arm(1), arm(-1), leg(1), leg(-1), head, lung(left, 1), lung(right, -1)]
}

/** Route of food through the digestive tract, from the mouth, with the point where each stage ends. */
export function digestivePath(body: BodyId): { points: Point[]; stopPoints: Record<'esophagus' | 'stomach' | 'small' | 'large', Point> } {
  const p = placer(body)
  const stomach = centre(body, 'stomach')
  const small = centre(body, 'small-intestine')
  const large = centre(body, 'large-intestine')
  const coil = 0.055
  const points: Point[] = [
    p(0, 0.915, 0.07),
    p(0, 0.86, 0.02),
    [0, stomach[1] + 0.13, 0],
    [stomach[0] * 0.6, stomach[1] + 0.03, stomach[2]],
    stomach,
    [stomach[0] * 0.25, stomach[1] - 0.04, stomach[2]],
    [small[0] - coil, small[1] + 0.06, small[2]],
    [small[0] + coil, small[1] + 0.05, small[2]],
    [small[0] - coil, small[1] + 0.02, small[2]],
    [small[0] + coil, small[1], small[2]],
    [small[0] - coil, small[1] - 0.03, small[2]],
    [small[0] + coil, small[1] - 0.05, small[2]],
    [large[0] - 0.09, large[1] - 0.07, large[2]],
    [large[0] - 0.1, large[1] + 0.07, large[2]],
    [large[0], large[1] + 0.09, large[2] + 0.02],
    [large[0] + 0.1, large[1] + 0.07, large[2]],
    [large[0] + 0.09, large[1] - 0.07, large[2]],
    [large[0] + 0.02, large[1] - 0.12, large[2] - 0.03],
    [0, large[1] - 0.15, large[2] - 0.05],
  ]
  return { points, stopPoints: { esophagus: points[3], stomach: points[5], small: points[11], large: points[points.length - 1] } }
}

/** Reflex route for the knee-jerk: from the knee up to the spinal cord and back. Illustrative. */
export function reflexPath(body: BodyId): Point[] {
  const p = placer(body)
  return [p(0.19, 0.285, 0.05), p(0.17, 0.4, 0), p(0.1, 0.5, -0.04), p(0.01, 0.6, -0.05), p(0.01, 0.65, -0.05)]
}

export function reflexReturnPath(body: BodyId): Point[] {
  const p = placer(body)
  return [p(0.01, 0.65, -0.05), p(0.01, 0.6, -0.04), p(0.11, 0.5, 0.02), p(0.18, 0.4, 0.05), p(0.19, 0.33, 0.06)]
}

export function spinalPath(body: BodyId): Point[] {
  const p = placer(body)
  return [p(0, 0.92, 0), p(0, 0.86, -0.02), p(0, 0.7, -0.05), p(0, 0.62, -0.05)]
}

/** Lymph drains from the limbs toward the neck, where it returns to the blood. Illustrative route. */
export function lymphPaths(body: BodyId): ParticlePath[] {
  const p = placer(body)
  const color = [{ at: 0, color: SERIES_COLORS.green }, { at: 1, color: SERIES_COLORS.green }]
  return [
    { weight: 1, colors: color, points: [p(0.18, 0.08), p(0.17, 0.3), p(0.13, 0.46, 0.05), p(0.01, 0.58, -0.03), p(0, 0.72, -0.03), p(0.04, 0.83, 0.01)] },
    { weight: 1, colors: color, points: [p(-0.18, 0.08), p(-0.17, 0.3), p(-0.13, 0.46, 0.05), p(-0.01, 0.58, -0.03), p(0, 0.72, -0.03), p(0.04, 0.83, 0.01)] },
    { weight: 0.6, colors: color, points: [p(0.85, 0.5), p(0.62, 0.66), p(0.38, 0.77), p(0.04, 0.83, 0.01)] },
    { weight: 0.6, colors: color, points: [p(-0.85, 0.5), p(-0.62, 0.66), p(-0.38, 0.77), p(-0.04, 0.83, 0.01)] },
  ]
}
