import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Euler, Matrix4, SphereGeometry, TubeGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Procedural placeholder anatomy. Sizes are in metres, feet at y = 0, facing +z,
 * so the body's left is +x. All shapes and proportions are illustrative, not measured.
 */

type V3 = [number, number, number]

export interface Ring {
  p: V3
  rx: number
  rz: number
}

export interface BodyShapeOptions {
  /** 0 is narrower shoulders with wider hips, 1 is the reverse. */
  frame: number
  testesPosition: 'external' | 'internal'
  ovaryScale: number
  testesScale: number
}

export interface Detail {
  /** Points around each ring or sphere. */
  seg: number
  /** Extra rings between each defined ring. */
  sub: number
}

export const DETAIL: Record<'low' | 'medium' | 'high', Detail> = {
  low: { seg: 7, sub: 1 },
  medium: { seg: 14, sub: 2 },
  high: { seg: 24, sub: 3 },
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t)

function resample(rings: Ring[], sub: number): Ring[] {
  if (sub <= 1) return rings
  const out: Ring[] = []
  const at = (i: number) => rings[Math.max(0, Math.min(rings.length - 1, i))]
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < sub; s++) {
      const t = s / sub
      const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
      out.push({
        p: [0, 1, 2].map((k) => catmull(a.p[k], b.p[k], c.p[k], d.p[k], t)) as unknown as V3,
        rx: Math.max(0.0005, catmull(a.rx, b.rx, c.rx, d.rx, t)),
        rz: Math.max(0.0005, catmull(a.rz, b.rz, c.rz, d.rz, t)),
      })
    }
  }
  out.push(rings[rings.length - 1])
  return out
}

/** Skins a series of elliptical rings into a closed surface. */
export function loft(rings: Ring[], detail: Detail): BufferGeometry {
  const stations = resample(rings, detail.sub)
  const { seg } = detail
  const positions: number[] = []
  const indices: number[] = []
  const X = new Vector3(1, 0, 0)
  const Y = new Vector3(0, 1, 0)

  stations.forEach((ring, i) => {
    const prev = stations[Math.max(0, i - 1)].p
    const next = stations[Math.min(stations.length - 1, i + 1)].p
    const t = new Vector3(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]).normalize()
    const reference = Math.abs(t.dot(X)) > 0.9 ? Y : X
    const u = reference.clone().addScaledVector(t, -reference.dot(t)).normalize()
    const w = new Vector3().crossVectors(u, t).normalize()
    for (let j = 0; j < seg; j++) {
      const angle = (j / seg) * Math.PI * 2
      const c = Math.cos(angle) * ring.rx
      const s = Math.sin(angle) * ring.rz
      positions.push(ring.p[0] + u.x * c + w.x * s, ring.p[1] + u.y * c + w.y * s, ring.p[2] + u.z * c + w.z * s)
    }
  })

  const index = (i: number, j: number) => i * seg + ((j + seg) % seg)
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const [a, b, c, d] = [index(i, j), index(i, j + 1), index(i + 1, j), index(i + 1, j + 1)]
      indices.push(a, c, b, b, c, d)
    }
  }

  const start = stations.length * seg
  const first = stations[0].p
  const last = stations[stations.length - 1].p
  positions.push(...first, ...last)
  for (let j = 0; j < seg; j++) {
    indices.push(start, index(0, j), index(0, j + 1))
    indices.push(start + 1, index(stations.length - 1, j + 1), index(stations.length - 1, j))
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function ellipsoid(center: V3, radii: V3, detail: Detail, rotation?: V3): BufferGeometry {
  const geometry = new SphereGeometry(1, detail.seg, Math.max(4, Math.round(detail.seg * 0.7)))
  geometry.deleteAttribute('uv')
  geometry.scale(...radii)
  if (rotation) geometry.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...rotation)))
  geometry.translate(...center)
  return geometry
}

function tube(points: V3[], radius: number, detail: Detail, closed = false): BufferGeometry {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), closed)
  const geometry = new TubeGeometry(curve, points.length * detail.sub * 3, radius, Math.max(5, Math.round(detail.seg / 2)), closed)
  geometry.deleteAttribute('uv')
  return geometry
}

/** A long shape between two points, with a radius at each end and one at the middle. */
function limb(a: V3, b: V3, [ra, rm, rb]: [number, number, number], detail: Detail, shift: V3 = [0, 0, 0]): BufferGeometry {
  const at = (t: number): V3 => [lerp(a[0], b[0], t) + shift[0], lerp(a[1], b[1], t) + shift[1], lerp(a[2], b[2], t) + shift[2]]
  return loft(
    [
      { p: at(0), rx: ra * 0.75, rz: ra * 0.75 },
      { p: at(0.08), rx: ra, rz: ra },
      { p: at(0.5), rx: rm, rz: rm },
      { p: at(0.92), rx: rb, rz: rb },
      { p: at(1), rx: rb * 0.75, rz: rb * 0.75 },
    ],
    detail,
  )
}

const merge = (...geometries: BufferGeometry[]) => mergeGeometries(geometries, false) as BufferGeometry

function mirror(geometry: BufferGeometry): BufferGeometry {
  const copy = geometry.clone()
  copy.scale(-1, 1, 1)
  const index = copy.getIndex()!
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1)
    index.setX(i + 1, index.getX(i + 2))
    index.setX(i + 2, b)
  }
  copy.computeVertexNormals()
  return copy
}

const both = (geometry: BufferGeometry) => merge(geometry, mirror(geometry))

export interface Landmarks {
  shoulderX: number
  chestX: number
  waistX: number
  hipX: number
  hipJoint: V3
  knee: V3
  ankle: V3
  shoulder: V3
  elbow: V3
  wrist: V3
  handEnd: V3
}

export function landmarks(frame: number): Landmarks {
  const shoulderX = lerp(0.175, 0.2, frame)
  const hipX = lerp(0.165, 0.15, frame)
  const armX = shoulderX - 0.015
  return {
    shoulderX,
    chestX: lerp(0.135, 0.155, frame),
    waistX: lerp(0.115, 0.125, frame),
    hipX,
    hipJoint: [hipX * 0.55, 0.92, 0],
    knee: [0.095, 0.5, 0.01],
    ankle: [0.09, 0.085, -0.01],
    shoulder: [armX, 1.42, 0],
    elbow: [armX + 0.075, 1.12, -0.01],
    wrist: [armX + 0.125, 0.87, 0.03],
    handEnd: [armX + 0.145, 0.72, 0.045],
  }
}

const spineZ = (y: number) => -0.045 + 0.012 * Math.sin((y - 1) * 5)

const mix = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/** The body surface. `inset` shrinks it, which forms the fat layer just under the skin. */
function surface(l: Landmarks, d: Detail, inset: number): BufferGeometry {
  const r = (rx: number, rz: number, y: number, z = 0): Ring => ({ p: [0, y, z], rx: rx - inset, rz: rz - inset })
  const trunk = loft(
    [
      r(l.hipX * 0.7, 0.07, 0.82),
      r(l.hipX * 0.9, 0.1, 0.86),
      r(l.hipX, 0.118, 0.93),
      r(lerp(l.hipX, l.waistX, 0.6), 0.104, 1.01),
      r(l.waistX, 0.096, 1.08),
      r(lerp(l.waistX, l.chestX, 0.5), 0.104, 1.2, 0.002),
      r(l.chestX, 0.122, 1.3, 0.004),
      r(l.chestX * 1.03, 0.115, 1.38),
      r(l.shoulderX * 0.8, 0.085, 1.44),
      r(0.07, 0.066, 1.48),
      r(0.054, 0.055, 1.52),
      r(0.052, 0.053, 1.57, 0.005),
    ],
    d,
  )
  const head = ellipsoid([0, 1.635, 0.01], [0.082 - inset, 0.112 - inset, 0.1 - inset], d)
  const ring = (p: V3, radius: number, rz = radius): Ring => ({ p, rx: radius - inset, rz: rz - inset })
  const arm = loft(
    [
      ring([l.shoulder[0] - 0.005, 1.465, 0], 0.03),
      ring(l.shoulder, 0.056),
      ring(mix(l.shoulder, l.elbow, 0.5), 0.047),
      ring(l.elbow, 0.039),
      ring(mix(l.elbow, l.wrist, 0.35), 0.042, 0.04),
      ring(l.wrist, 0.03, 0.022),
      ring(mix(l.wrist, l.handEnd, 0.4), 0.045, 0.018),
      ring(mix(l.wrist, l.handEnd, 0.8), 0.038, 0.013),
      ring(l.handEnd, 0.016, 0.008),
    ],
    d,
  )
  const leg = loft(
    [
      ring([l.hipJoint[0], 0.98, 0], 0.05),
      ring([l.hipJoint[0] + 0.005, 0.88, 0], 0.092, 0.1),
      ring(mix(l.hipJoint, l.knee, 0.45), 0.078),
      ring(l.knee, 0.054, 0.056),
      ring(mix(l.knee, l.ankle, 0.3), 0.056),
      ring(l.ankle, 0.034, 0.036),
      ring([l.ankle[0], 0.05, -0.012], 0.034, 0.04),
    ],
    d,
  )
  const foot = ellipsoid([l.ankle[0] + 0.004, 0.04, 0.05], [0.044 - inset, 0.04 - inset, 0.118 - inset], d)
  return merge(trunk, head, both(arm), both(leg), both(foot))
}

type Builder = (l: Landmarks, d: Detail, options: BodyShapeOptions) => BufferGeometry

function ribs(l: Landmarks, d: Detail): BufferGeometry {
  const parts: BufferGeometry[] = []
  for (let i = 0; i < 12; i++) {
    const y = 1.385 - i * 0.023
    const width = l.chestX * lerp(0.62, 0.95, Math.min(1, i / 5))
    const depth = lerp(0.7, 1, Math.min(1, i / 5))
    const points: V3[] = [
      [0.018, y, spineZ(y) - 0.005],
      [width * 0.72, y, -0.082 * depth],
      [width, y - 0.03, -0.01],
    ]
    const floating = i >= 10
    if (!floating) {
      const reach = i < 7 ? 0.024 : 0.05
      points.push([width * 0.72, y - 0.055, 0.074 * depth], [reach, y - (i < 7 ? 0.07 : 0.05), 0.094 * depth])
    }
    parts.push(tube(points, 0.0055, d))
  }
  return both(merge(...parts))
}

function vertebrae(d: Detail): BufferGeometry {
  const count = 24
  const low = { ...d, seg: Math.max(5, Math.round(d.seg / 2)) }
  const parts: BufferGeometry[] = []
  for (let i = 0; i < count; i++) {
    const y = 1.54 - (i / (count - 1)) * 0.555
    const size = lerp(0.014, 0.024, i / (count - 1))
    parts.push(ellipsoid([0, y, spineZ(y)], [size, 0.0095, size * 0.9], low))
    parts.push(ellipsoid([0, y - 0.004, spineZ(y) - size * 1.25], [0.004, 0.009, size * 0.55], low))
  }
  return merge(...parts)
}

function fingers(wrist: V3, end: V3, d: Detail, spread: number, radius: number): BufferGeometry {
  const parts: BufferGeometry[] = []
  for (let i = 0; i < 5; i++) {
    const side = (i - 2) * spread
    const base = mix(wrist, end, 0.42)
    const tip = mix(wrist, end, i === 0 ? 0.78 : 1)
    parts.push(
      tube(
        [
          [base[0] + side * 0.75, base[1], base[2] + side * 0.4],
          [lerp(base[0], tip[0], 0.5) + side, lerp(base[1], tip[1], 0.5), lerp(base[2], tip[2], 0.5) + side * 0.5],
          [tip[0] + side * 1.05, tip[1], tip[2] + side * 0.5],
        ],
        radius,
        d,
      ),
    )
  }
  return merge(...parts)
}

function smallIntestine(d: Detail): BufferGeometry {
  const points: V3[] = []
  const rows = 6
  for (let row = 0; row < rows; row++) {
    const y = 1.03 - row * 0.024
    const dir = row % 2 === 0 ? 1 : -1
    for (const x of [-0.055, -0.02, 0.02, 0.055]) {
      points.push([x * dir, y + (x === 0.02 ? 0.006 : -0.004), 0.05 + 0.012 * Math.sin((row + x * 30) * 1.3)])
    }
  }
  return tube(points, 0.0105, d)
}

function nodeCluster(center: V3, spread: V3, count: number, d: Detail): BufferGeometry {
  const low = { ...d, seg: Math.max(5, Math.round(d.seg / 2)) }
  const parts: BufferGeometry[] = []
  for (let i = 0; i < count; i++) {
    // A fixed pattern, so the cluster stays identical between rebuilds.
    const a = i * 2.4
    const k = (i + 1) / count
    parts.push(
      ellipsoid(
        [center[0] + Math.cos(a) * spread[0] * k, center[1] + Math.sin(a * 1.3) * spread[1] * k, center[2] + Math.sin(a) * spread[2] * k],
        [0.0055, 0.0055, 0.0055],
        low,
      ),
    )
  }
  return both(merge(...parts))
}

/** One builder for each part id in the anatomy catalog. A test keeps the two lists in step. */
export const BUILDERS: Record<string, Builder> = {
  skin: (l, d) => surface(l, d, 0),
  'subcutaneous-fat': (l, d) => surface(l, d, 0.006),

  deltoid: (l, d) => both(ellipsoid([l.shoulder[0] + 0.006, l.shoulder[1] - 0.035, 0], [0.043, 0.07, 0.047], d)),
  'pectoralis-major': (l, d) => both(ellipsoid([l.chestX * 0.47, 1.335, 0.09], [l.chestX * 0.46, 0.058, 0.022], d, [0, 0.35, 0])),
  'rectus-abdominis': (_l, d) =>
    loft(
      [
        { p: [0, 0.9, 0.093], rx: 0.03, rz: 0.008 },
        { p: [0, 0.98, 0.087], rx: 0.044, rz: 0.012 },
        { p: [0, 1.08, 0.078], rx: 0.05, rz: 0.012 },
        { p: [0, 1.2, 0.09], rx: 0.05, rz: 0.011 },
        { p: [0, 1.27, 0.103], rx: 0.04, rz: 0.008 },
      ],
      d,
    ),
  'external-oblique': (l, d) => both(ellipsoid([l.waistX * 0.72, 1.09, 0.025], [0.034, 0.125, 0.062], d)),
  trapezius: (l, d) => ellipsoid([0, 1.4, -0.058], [l.shoulderX * 0.78, 0.095, 0.022], d),
  'latissimus-dorsi': (l, d) => both(ellipsoid([l.chestX * 0.56, 1.21, -0.07], [0.065, 0.13, 0.022], d, [0, -0.3, 0])),
  'biceps-brachii': (l, d) => both(limb(mix(l.shoulder, l.elbow, 0.12), mix(l.shoulder, l.elbow, 0.95), [0.014, 0.024, 0.01], d, [0, 0, 0.016])),
  'triceps-brachii': (l, d) => both(limb(mix(l.shoulder, l.elbow, 0.08), mix(l.shoulder, l.elbow, 0.98), [0.016, 0.027, 0.012], d, [0, 0, -0.016])),
  'forearm-muscles': (l, d) => both(limb(l.elbow, mix(l.elbow, l.wrist, 0.92), [0.024, 0.033, 0.016], d)),
  'gluteus-maximus': (l, d) => both(ellipsoid([l.hipJoint[0] + 0.012, 0.91, -0.07], [0.075, 0.085, 0.04], d)),
  quadriceps: (l, d) => both(limb(mix(l.hipJoint, l.knee, 0.05), mix(l.hipJoint, l.knee, 0.98), [0.038, 0.052, 0.024], d, [0, 0, 0.022])),
  hamstrings: (l, d) => both(limb(mix(l.hipJoint, l.knee, 0.1), mix(l.hipJoint, l.knee, 1), [0.03, 0.042, 0.02], d, [0, 0, -0.026])),
  gastrocnemius: (l, d) => both(limb(mix(l.knee, l.ankle, 0.02), mix(l.knee, l.ankle, 0.62), [0.024, 0.04, 0.012], d, [0, 0, -0.016])),
  'tibialis-anterior': (l, d) => both(limb(mix(l.knee, l.ankle, 0.06), mix(l.knee, l.ankle, 0.92), [0.012, 0.016, 0.006], d, [0.006, 0, 0.02])),

  skull: (_l, d) => merge(ellipsoid([0, 1.65, 0.004], [0.072, 0.082, 0.088], d), ellipsoid([0, 1.59, 0.036], [0.052, 0.05, 0.054], d)),
  mandible: (_l, d) =>
    tube(
      [
        [-0.052, 1.585, 0.005],
        [-0.046, 1.53, 0.04],
        [0, 1.518, 0.078],
        [0.046, 1.53, 0.04],
        [0.052, 1.585, 0.005],
      ],
      0.0085,
      d,
    ),
  'vertebral-column': (_l, d) => vertebrae(d),
  'rib-cage': (l, d) => ribs(l, d),
  sternum: (_l, d) =>
    loft(
      [
        { p: [0, 1.365, 0.09], rx: 0.016, rz: 0.005 },
        { p: [0, 1.34, 0.095], rx: 0.024, rz: 0.006 },
        { p: [0, 1.25, 0.105], rx: 0.016, rz: 0.005 },
        { p: [0, 1.19, 0.106], rx: 0.006, rz: 0.003 },
      ],
      d,
    ),
  clavicle: (l, d) =>
    both(
      tube(
        [
          [0.018, 1.39, 0.08],
          [l.shoulderX * 0.5, 1.41, 0.07],
          [l.shoulder[0] - 0.012, 1.445, 0.015],
        ],
        0.0065,
        d,
      ),
    ),
  scapula: (l, d) => both(ellipsoid([l.chestX * 0.68, 1.34, -0.083], [0.05, 0.066, 0.007], d, [0, 0.45, 0])),
  humerus: (l, d) => both(limb(l.shoulder, l.elbow, [0.021, 0.0105, 0.017], d)),
  radius: (l, d) => both(limb(l.elbow, l.wrist, [0.0085, 0.0075, 0.012], d, [0.012, 0, 0.006])),
  ulna: (l, d) => both(limb(l.elbow, l.wrist, [0.012, 0.0075, 0.007], d, [-0.012, 0, -0.004])),
  'hand-bones': (l, d) =>
    both(merge(ellipsoid(mix(l.wrist, l.handEnd, 0.25), [0.03, 0.04, 0.009], d), fingers(l.wrist, l.handEnd, d, 0.0085, 0.0034))),
  pelvis: (l, d) => {
    const j = l.hipJoint[0]
    return merge(
      both(ellipsoid([l.hipX * 0.62, 1.0, -0.012], [0.06, 0.064, 0.016], d, [0, 0.55, -0.25])),
      ellipsoid([0, 0.945, -0.066], [0.038, 0.058, 0.018], d),
      tube(
        [
          [-0.06, 0.87, 0.068],
          [0, 0.858, 0.085],
          [0.06, 0.87, 0.068],
          [j, 0.92, 0.012],
          [0.05, 0.93, -0.05],
          [0, 0.91, -0.072],
          [-0.05, 0.93, -0.05],
          [-j, 0.92, 0.012],
        ],
        0.0105,
        d,
        true,
      ),
    )
  },
  femur: (l, d) => both(merge(limb(l.hipJoint, l.knee, [0.018, 0.012, 0.024], d), ellipsoid([l.hipJoint[0] - 0.006, l.hipJoint[1] + 0.008, 0], [0.024, 0.024, 0.024], d))),
  patella: (l, d) => both(ellipsoid([l.knee[0], l.knee[1], l.knee[2] + 0.034], [0.019, 0.022, 0.009], d)),
  tibia: (l, d) => both(limb(l.knee, l.ankle, [0.024, 0.0125, 0.017], d, [-0.006, 0, 0])),
  fibula: (l, d) => both(limb(l.knee, l.ankle, [0.0075, 0.006, 0.0085], d, [0.02, 0, -0.008])),
  'foot-bones': (l, d) => {
    const x = l.ankle[0] + 0.004
    const toes: BufferGeometry[] = []
    for (let i = 0; i < 5; i++) {
      const side = (i - 2) * 0.014
      toes.push(
        tube(
          [
            [x + side * 0.6, 0.03, 0.035],
            [x + side * 0.9, 0.018, 0.1],
            [x + side, 0.012, 0.155 - Math.abs(i) * 0.008],
          ],
          0.0042,
          d,
        ),
      )
    }
    return both(merge(ellipsoid([x, 0.042, -0.015], [0.026, 0.03, 0.055], d), ...toes))
  },

  brain: (_l, d) => ellipsoid([0, 1.655, 0.004], [0.064, 0.072, 0.08], d),
  heart: (_l, d) => ellipsoid([0.018, 1.265, 0.045], [0.046, 0.06, 0.04], d, [0.2, 0, -0.5]),
  'lung-left': (_l, d) =>
    loft(
      [
        { p: [0.052, 1.405, 0], rx: 0.012, rz: 0.018 },
        { p: [0.064, 1.36, 0], rx: 0.036, rz: 0.05 },
        { p: [0.078, 1.28, -0.006], rx: 0.044, rz: 0.07 },
        { p: [0.086, 1.2, -0.012], rx: 0.044, rz: 0.076 },
        { p: [0.09, 1.165, -0.016], rx: 0.03, rz: 0.05 },
      ],
      d,
    ),
  'lung-right': (_l, d) =>
    loft(
      [
        { p: [-0.05, 1.405, 0], rx: 0.012, rz: 0.018 },
        { p: [-0.062, 1.36, 0], rx: 0.04, rz: 0.052 },
        { p: [-0.07, 1.28, 0], rx: 0.054, rz: 0.076 },
        { p: [-0.074, 1.21, -0.006], rx: 0.058, rz: 0.08 },
        { p: [-0.076, 1.175, -0.012], rx: 0.04, rz: 0.054 },
      ],
      d,
    ),
  trachea: (_l, d) =>
    merge(
      tube([[0, 1.51, 0.022], [0, 1.44, 0.016], [0, 1.365, 0.008]], 0.009, d),
      tube([[0, 1.365, 0.008], [0.03, 1.335, 0.004], [0.058, 1.31, 0]], 0.0058, d),
      tube([[0, 1.365, 0.008], [-0.03, 1.338, 0.004], [-0.055, 1.316, 0]], 0.0062, d),
    ),
  esophagus: (_l, d) => tube([[0, 1.51, -0.003], [-0.001, 1.38, -0.016], [0.006, 1.25, -0.02], [0.024, 1.155, 0.008]], 0.0075, d),
  stomach: (_l, d) =>
    loft(
      [
        { p: [0.024, 1.158, 0.012], rx: 0.012, rz: 0.012 },
        { p: [0.056, 1.15, 0.026], rx: 0.03, rz: 0.03 },
        { p: [0.077, 1.115, 0.036], rx: 0.04, rz: 0.038 },
        { p: [0.05, 1.07, 0.044], rx: 0.03, rz: 0.03 },
        { p: [0.008, 1.06, 0.044], rx: 0.015, rz: 0.015 },
      ],
      d,
    ),
  liver: (_l, d) => ellipsoid([-0.052, 1.128, 0.024], [0.086, 0.05, 0.066], d, [0, 0, -0.2]),
  gallbladder: (_l, d) => ellipsoid([-0.052, 1.076, 0.073], [0.011, 0.024, 0.011], d, [0.3, 0, 0]),
  pancreas: (_l, d) =>
    loft(
      [
        { p: [-0.038, 1.05, 0.02], rx: 0.016, rz: 0.015 },
        { p: [0.01, 1.062, 0.01], rx: 0.013, rz: 0.012 },
        { p: [0.055, 1.08, -0.004], rx: 0.011, rz: 0.01 },
        { p: [0.085, 1.09, -0.016], rx: 0.007, rz: 0.007 },
      ],
      d,
    ),
  spleen: (_l, d) => ellipsoid([0.1, 1.135, -0.04], [0.021, 0.048, 0.03], d, [0, 0, -0.2]),
  kidneys: (_l, d) =>
    merge(
      ellipsoid([0.062, 1.07, -0.052], [0.026, 0.05, 0.022], d, [0, 0, -0.14]),
      ellipsoid([-0.062, 1.055, -0.052], [0.026, 0.05, 0.022], d, [0, 0, 0.14]),
    ),
  'small-intestine': (_l, d) => smallIntestine(d),
  'large-intestine': (_l, d) =>
    tube(
      [
        [-0.082, 0.925, 0.03],
        [-0.09, 1.0, 0.02],
        [-0.085, 1.052, 0.03],
        [0, 1.055, 0.058],
        [0.086, 1.058, 0.03],
        [0.092, 0.98, 0.016],
        [0.08, 0.915, 0.02],
        [0.03, 0.895, 0.015],
        [0.004, 0.91, -0.025],
        [0, 0.85, -0.042],
      ],
      0.017,
      d,
    ),
  bladder: (_l, d) => ellipsoid([0, 0.878, 0.052], [0.034, 0.029, 0.029], d),
  uterus: (_l, d) =>
    loft(
      [
        { p: [0, 0.862, 0.012], rx: 0.009, rz: 0.009 },
        { p: [0, 0.885, 0.014], rx: 0.015, rz: 0.012 },
        { p: [0, 0.915, 0.02], rx: 0.026, rz: 0.018 },
        { p: [0, 0.938, 0.024], rx: 0.024, rz: 0.016 },
      ],
      d,
    ),
  ovaries: (_l, d, o) => {
    const s = o.ovaryScale
    return both(
      merge(
        ellipsoid([0.058, 0.92, 0.012], [0.012 * s, 0.018 * s, 0.011 * s], d),
        tube([[0.022, 0.932, 0.022], [0.04, 0.94, 0.018], [0.056, 0.932, 0.012]], 0.0022, d),
      ),
    )
  },
  testes: (_l, d, o) => {
    const s = o.testesScale
    const center: V3 = o.testesPosition === 'internal' ? [0.062, 0.895, 0.02] : [0.02, 0.795, 0.07]
    return both(ellipsoid(center, [0.014 * s, 0.021 * s, 0.015 * s], d))
  },
  prostate: (_l, d) => ellipsoid([0, 0.84, 0.024], [0.019, 0.016, 0.015], d),

  aorta: (l, d) =>
    merge(
      tube(
        [
          [0.008, 1.3, 0.036],
          [0.012, 1.36, 0.02],
          [0.028, 1.365, -0.012],
          [0.02, 1.27, -0.026],
          [0.008, 1.05, -0.022],
          [0, 0.975, -0.012],
        ],
        0.0105,
        d,
      ),
      both(tube([[0, 0.975, -0.012], [l.hipJoint[0] * 0.55, 0.94, 0.01], [l.hipJoint[0] * 0.9, 0.89, 0.034]], 0.0062, d)),
    ),
  'carotid-arteries': (_l, d) => both(tube([[0.012, 1.36, 0.012], [0.024, 1.46, 0.012], [0.03, 1.57, 0.016]], 0.0038, d)),
  'arm-arteries': (l, d) =>
    both(
      tube(
        [
          [0.02, 1.362, 0.004],
          [l.shoulderX * 0.6, 1.39, 0.018],
          [l.shoulder[0] + 0.004, 1.37, 0.014],
          [l.elbow[0] - 0.012, l.elbow[1], 0.012],
          [l.wrist[0], l.wrist[1], l.wrist[2] + 0.008],
        ],
        0.0036,
        d,
      ),
    ),
  'leg-arteries': (l, d) =>
    both(
      tube(
        [
          [l.hipJoint[0] * 0.9, 0.89, 0.034],
          [l.knee[0] - 0.015, 0.62, 0.012],
          [l.knee[0] - 0.012, l.knee[1] - 0.01, -0.024],
          [l.ankle[0] - 0.012, 0.22, -0.018],
          [l.ankle[0] - 0.015, l.ankle[1], -0.018],
        ],
        0.0044,
        d,
      ),
    ),
  'vena-cava': (l, d) =>
    merge(
      tube([[-0.024, 1.385, 0.012], [-0.022, 1.33, 0.024], [-0.018, 1.29, 0.028]], 0.0095, d),
      tube([[-0.018, 1.24, 0.024], [-0.018, 1.15, -0.012], [-0.012, 1.05, -0.022], [-0.008, 0.975, -0.006]], 0.0105, d),
      tube([[-0.008, 0.975, -0.006], [l.hipJoint[0] * 0.55, 0.935, 0.018], [l.hipJoint[0] * 0.75, 0.885, 0.04]], 0.0055, d),
      tube([[-0.008, 0.975, -0.006], [-l.hipJoint[0] * 0.55, 0.935, 0.018], [-l.hipJoint[0] * 0.75, 0.885, 0.04]], 0.0055, d),
    ),
  'jugular-veins': (_l, d) => both(tube([[0.026, 1.385, 0.012], [0.038, 1.47, 0.004], [0.042, 1.57, 0.002]], 0.0046, d)),
  'arm-veins': (l, d) =>
    both(
      tube(
        [
          [0.028, 1.385, 0.012],
          [l.shoulderX * 0.6, 1.402, 0.03],
          [l.shoulder[0] + 0.02, 1.36, 0.026],
          [l.elbow[0] + 0.006, l.elbow[1], 0.024],
          [l.wrist[0] + 0.012, l.wrist[1], l.wrist[2] + 0.014],
        ],
        0.0034,
        d,
      ),
    ),
  'leg-veins': (l, d) =>
    both(
      tube(
        [
          [l.hipJoint[0] * 0.75, 0.885, 0.04],
          [l.knee[0] - 0.03, 0.62, 0.02],
          [l.knee[0] - 0.025, l.knee[1] - 0.01, -0.012],
          [l.ankle[0] - 0.024, 0.22, -0.006],
          [l.ankle[0] - 0.024, l.ankle[1], -0.006],
        ],
        0.0044,
        d,
      ),
    ),

  'spinal-cord': (_l, d) => {
    const points: V3[] = []
    for (let i = 0; i <= 10; i++) {
      const y = 1.585 - (i / 10) * 0.525
      points.push([0, y, spineZ(y) - 0.002 + (i === 0 ? 0.014 : 0)])
    }
    return tube(points, 0.0052, d)
  },
  'vagus-nerve': (_l, d) => both(tube([[0.018, 1.58, 0.006], [0.03, 1.44, 0], [0.024, 1.3, -0.012], [0.015, 1.13, 0.012]], 0.0018, d)),
  'arm-nerves': (l, d) =>
    both(
      tube(
        [
          [0.022, 1.45, -0.03],
          [l.shoulderX * 0.6, 1.4, 0.004],
          [l.shoulder[0] + 0.006, 1.36, 0.006],
          [l.elbow[0] - 0.004, l.elbow[1], 0.004],
          [l.wrist[0] - 0.002, l.wrist[1], l.wrist[2]],
          l.handEnd,
        ],
        0.0023,
        d,
      ),
    ),
  'sciatic-nerve': (l, d) =>
    both(
      tube(
        [
          [0.022, 0.975, -0.056],
          [l.hipJoint[0] + 0.012, 0.87, -0.05],
          [lerp(l.hipJoint[0], l.knee[0], 0.5), 0.7, -0.03],
          [l.knee[0], l.knee[1], -0.03],
          [l.ankle[0] + 0.005, 0.22, -0.026],
          [l.ankle[0], l.ankle[1] - 0.02, -0.024],
        ],
        0.0032,
        d,
      ),
    ),
  'femoral-nerve': (l, d) =>
    both(
      tube(
        [
          [0.03, 1.02, -0.024],
          [l.hipJoint[0] * 0.75, 0.93, 0.02],
          [l.hipJoint[0] + 0.01, 0.87, 0.048],
          [lerp(l.hipJoint[0], l.knee[0], 0.5), 0.72, 0.042],
        ],
        0.0024,
        d,
      ),
    ),

  'thoracic-duct': (_l, d) => tube([[0.004, 1.06, -0.026], [-0.002, 1.25, -0.03], [0.004, 1.37, -0.018], [0.024, 1.43, 0.012], [0.03, 1.4, 0.02]], 0.0024, d),
  thymus: (_l, d) => both(ellipsoid([0.012, 1.345, 0.074], [0.012, 0.03, 0.009], d)),
  'cervical-nodes': (_l, d) => nodeCluster([0.042, 1.5, 0.012], [0.012, 0.045, 0.016], 6, d),
  'axillary-nodes': (l, d) => nodeCluster([l.chestX + 0.002, 1.335, 0], [0.012, 0.03, 0.022], 6, d),
  'inguinal-nodes': (l, d) => nodeCluster([l.hipJoint[0] * 1.15, 0.85, 0.07], [0.022, 0.012, 0.009], 6, d),
}
