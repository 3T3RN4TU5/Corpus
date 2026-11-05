import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, DataTexture, FloatType, LinearFilter, RGBAFormat, ShaderMaterial, Vector3 } from 'three'
import { useClock } from '../sim/clock'

export interface ParticlePath {
  points: [number, number, number][]
  /** Colour along the path, as stops from 0 to 1. */
  colors: { at: number; color: string }[]
  /** Share of the particles on this path. */
  weight: number
}

const SAMPLES = 256

/** Bakes paths into a texture, so the GPU can move every particle without any work on the CPU. */
function bake(paths: ParticlePath[]) {
  const positions = new Float32Array(SAMPLES * paths.length * 4)
  const colors = new Float32Array(SAMPLES * paths.length * 4)
  const color = new Color()
  const next = new Color()
  paths.forEach((path, row) => {
    const curve = new CatmullRomCurve3(path.points.map((p) => new Vector3(...p)))
    curve.arcLengthDivisions = 1024
    const samples = curve.getSpacedPoints(SAMPLES - 1)
    samples.forEach((point, column) => {
      const offset = (row * SAMPLES + column) * 4
      positions.set([point.x, point.y, point.z, 1], offset)
      const t = column / (SAMPLES - 1)
      let stop = 0
      while (stop < path.colors.length - 2 && path.colors[stop + 1].at < t) stop += 1
      const a = path.colors[stop]
      const b = path.colors[Math.min(stop + 1, path.colors.length - 1)]
      const blend = b.at === a.at ? 0 : Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at)))
      color.set(a.color).lerp(next.set(b.color), blend)
      colors.set([color.r, color.g, color.b, 1], offset)
    })
  })
  const make = (data: Float32Array) => {
    const texture = new DataTexture(data, SAMPLES, paths.length, RGBAFormat, FloatType)
    texture.minFilter = texture.magFilter = LinearFilter
    texture.needsUpdate = true
    return texture
  }
  return { positionTexture: make(positions), colorTexture: make(colors) }
}

const VERTEX = /* glsl */ `
  attribute vec3 seed;
  uniform sampler2D uPositions;
  uniform sampler2D uColors;
  uniform float uPhase;
  uniform float uRows;
  uniform float uSize;
  uniform float uPixelRatio;
  varying vec3 vColor;
  void main() {
    float t = fract(seed.x + uPhase * seed.z);
    float row = (seed.y + 0.5) / uRows;
    vec4 position = texture2D(uPositions, vec2(t * 0.996 + 0.002, row));
    vColor = texture2D(uColors, vec2(t * 0.996 + 0.002, row)).rgb;
    vec3 jitter = vec3(fract(seed.x * 91.7), fract(seed.x * 47.3), fract(seed.x * 13.1)) - 0.5;
    vec4 mv = modelViewMatrix * vec4(position.xyz + jitter * 0.008, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio / -mv.z;
  }
`

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, 1.0 - smoothstep(0.25, 0.5, d));
  }
`

interface Props {
  paths: ParticlePath[]
  count: number
  /** Laps of the path per simulated second. */
  lapsPerSecond: number | (() => number)
  size?: number
}

/** GPU particles that flow along fixed paths, used for blood, food and nerve signals. */
export function PathParticles({ paths, count, lapsPerSecond, size = 16 }: Props) {
  const phase = useRef(0)
  const textures = useMemo(() => bake(paths), [paths])
  useEffect(
    () => () => {
      textures.positionTexture.dispose()
      textures.colorTexture.dispose()
    },
    [textures],
  )

  const geometry = useMemo(() => {
    const result = new BufferGeometry()
    const total = paths.reduce((sum, path) => sum + path.weight, 0)
    const seeds = new Float32Array(count * 3)
    let index = 0
    paths.forEach((path, row) => {
      const share = Math.round((path.weight / total) * count)
      for (let i = 0; i < share && index < count; i++, index++) {
        seeds.set([Math.random(), row, 0.92 + Math.random() * 0.16], index * 3)
      }
    })
    result.setAttribute('seed', new BufferAttribute(seeds.subarray(0, index * 3), 3))
    result.setAttribute('position', new BufferAttribute(new Float32Array(index * 3), 3))
    return result
  }, [paths, count])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending,
        uniforms: {
          uPositions: { value: textures.positionTexture },
          uColors: { value: textures.colorTexture },
          uPhase: { value: 0 },
          uRows: { value: paths.length },
          uSize: { value: size },
          uPixelRatio: { value: 1 },
        },
      }),
    [textures, paths.length, size],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame((state, delta) => {
    const clock = useClock.getState()
    if (clock.playing) {
      const speed = typeof lapsPerSecond === 'function' ? lapsPerSecond() : lapsPerSecond
      phase.current = (phase.current + delta * Math.min(clock.speed, 8) * speed) % 1000
    }
    material.uniforms.uPhase.value = phase.current
    material.uniforms.uPixelRatio.value = state.viewport.dpr
  })

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={50} raycast={() => null} />
}
