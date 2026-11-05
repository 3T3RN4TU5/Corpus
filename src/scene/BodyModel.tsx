import { Html } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, DoubleSide, FrontSide, Plane, Vector3, type BufferGeometry, type Intersection } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useShallow } from 'zustand/react/shallow'
import { getPart, LAYERS, partsForProfile, type Part } from '../data/anatomy'
import { selectProfile, useBodyStore } from '../store/useBodyStore'
import { partAppearance } from './appearance'
import { BUILDERS, DETAIL, landmarks } from './bodyGeometry'
import { setClipPlane } from './clip'

export const HOME_CAMERA: [number, number, number] = [0, 1.02, 3.75]
export const HOME_TARGET: [number, number, number] = [0, 0.9, 0]

const ACCENT = '#ff6a3d'
const XRAY_TINT = '#9fc4e8'
const CLICK_DRAG_LIMIT_PX = 5

interface Bounds {
  center: Vector3
  radius: number
}

const layerOrder = new Map(LAYERS.map((layer, index) => [layer.id, LAYERS.length - index]))

const PartMesh = memo(function PartMesh({ part, geometry, flat }: { part: Part; geometry: BufferGeometry; flat: boolean }) {
  const appearance = useBodyStore(
    useShallow((state) =>
      partAppearance(part, {
        layers: state.layers,
        xray: state.xray,
        isolate: state.isolate,
        selectedId: state.selectedId,
      }),
    ),
  )
  const selected = useBodyStore((state) => state.selectedId === part.id)
  const hovered = useBodyStore((state) => state.hoveredId === part.id)
  const clipped = useBodyStore((state) => state.clipAxis !== 'none')

  if (!appearance.visible) return null

  const transparent = appearance.opacity < 1
  const side = clipped ? DoubleSide : FrontSide
  // These settings change the compiled shader, so the material must be replaced when they change.
  const materialKey = `${flat}-${clipped}-${transparent}`

  return (
    <mesh geometry={geometry} renderOrder={layerOrder.get(part.layer)} userData={{ partId: part.id, pickable: appearance.pickable }}>
      {appearance.xray ? (
        <meshBasicMaterial
          key={`xray-${clipped}`}
          color={selected ? ACCENT : XRAY_TINT}
          transparent
          opacity={appearance.opacity}
          blending={AdditiveBlending}
          depthWrite={false}
          side={side}
        />
      ) : (
        <meshStandardMaterial
          key={materialKey}
          color={part.color}
          roughness={part.layer === 'skeleton' ? 0.82 : 0.58}
          metalness={0}
          flatShading={flat}
          emissive={ACCENT}
          emissiveIntensity={selected ? 0.55 : hovered ? 0.18 : 0}
          transparent={transparent}
          opacity={appearance.opacity}
          depthWrite={!transparent}
          side={side}
        />
      )}
    </mesh>
  )
})

/** Flies the camera whenever the store asks for it, and stops as soon as the person takes over. */
function CameraRig({ bounds }: { bounds: Map<string, Bounds> }) {
  const nonce = useBodyStore((state) => state.cameraNonce)
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as unknown as OrbitControlsImpl | null
  const flight = useRef<{ position: Vector3; target: Vector3 } | null>(null)

  useEffect(() => {
    if (nonce === 0 || !controls) return
    const id = useBodyStore.getState().cameraTargetId
    const part = id ? bounds.get(id) : undefined
    if (part) {
      const direction = camera.position.clone().sub(controls.target).normalize()
      const distance = Math.min(3.75, Math.max(0.5, part.radius * 5))
      flight.current = { target: part.center.clone(), position: part.center.clone().addScaledVector(direction, distance) }
    } else {
      flight.current = { target: new Vector3(...HOME_TARGET), position: new Vector3(...HOME_CAMERA) }
    }
  }, [nonce, bounds, camera, controls])

  useEffect(() => {
    if (!controls) return
    const stop = () => {
      flight.current = null
    }
    const events = controls as unknown as { addEventListener: (name: string, fn: () => void) => void; removeEventListener: (name: string, fn: () => void) => void }
    events.addEventListener('start', stop)
    return () => events.removeEventListener('start', stop)
  }, [controls])

  useFrame((_state, delta) => {
    const goal = flight.current
    if (!goal || !controls) return
    const t = 1 - Math.exp(-delta * 5)
    camera.position.lerp(goal.position, t)
    controls.target.lerp(goal.target, t)
    controls.update()
    if (camera.position.distanceTo(goal.position) < 0.004) flight.current = null
  })

  return null
}

function SelectionLabel({ bounds }: { bounds: Map<string, Bounds> }) {
  const selectedId = useBodyStore((state) => state.selectedId)
  const part = selectedId ? getPart(selectedId) : undefined
  const center = selectedId ? bounds.get(selectedId)?.center : undefined
  if (!part || !center) return null
  return (
    <Html position={center} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div className="callout">
        <span className="callout-dot" />
        <span className="callout-line" />
        <span className="callout-text">{part.name}</span>
      </div>
    </Html>
  )
}

export function BodyModel() {
  const quality = useBodyStore((state) => state.quality)
  const profile = useBodyStore(useShallow(selectProfile))
  const { frame, testesPosition, ovaryScale, testesScale, structures } = profile
  const selectPart = useBodyStore((state) => state.selectPart)
  const setHovered = useBodyStore((state) => state.setHovered)

  const built = useMemo(() => {
    const options = { frame, testesPosition, ovaryScale, testesScale }
    const marks = landmarks(frame)
    const detail = DETAIL[quality]
    const geometries = new Map<string, BufferGeometry>()
    const bounds = new Map<string, Bounds>()
    for (const [id, build] of Object.entries(BUILDERS)) {
      const geometry = build(marks, detail, options)
      geometry.computeBoundingSphere()
      const sphere = geometry.boundingSphere!
      geometries.set(id, geometry)
      bounds.set(id, { center: sphere.center.clone(), radius: sphere.radius })
    }
    return { geometries, bounds }
  }, [quality, frame, testesPosition, ovaryScale, testesScale])

  useEffect(() => () => built.geometries.forEach((geometry) => geometry.dispose()), [built])

  const parts = useMemo(() => partsForProfile(profile), [structures])

  const firstPickable = (hits: Intersection[]): string | null => {
    for (const hit of hits) {
      const { partId, pickable } = hit.object.userData as { partId?: string; pickable?: boolean }
      if (!partId || !pickable || isClippedAway(hit.point)) continue
      return partId
    }
    return null
  }

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > CLICK_DRAG_LIMIT_PX) return
    event.stopPropagation()
    selectPart(firstPickable(event.intersections))
  }

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    const id = firstPickable(event.intersections)
    setHovered(id)
    document.body.style.cursor = id ? 'pointer' : ''
  }

  const onPointerOut = () => {
    setHovered(null)
    document.body.style.cursor = ''
  }

  return (
    <>
      <group onClick={onClick} onPointerMove={onPointerMove} onPointerOut={onPointerOut}>
        {parts.map((part) => (
          <PartMesh key={part.id} part={part} geometry={built.geometries.get(part.id)!} flat={quality === 'low'} />
        ))}
      </group>
      <SelectionLabel bounds={built.bounds} />
      <CameraRig bounds={built.bounds} />
    </>
  )
}

const scratchPlane = new Plane()

/** True when a point lies in the part of the body that the slice has cut away. */
function isClippedAway(point: Vector3): boolean {
  const { clipAxis, clipPosition } = useBodyStore.getState()
  if (clipAxis === 'none') return false
  return setClipPlane(scratchPlane, clipAxis, clipPosition).distanceToPoint(point) < 0
}
