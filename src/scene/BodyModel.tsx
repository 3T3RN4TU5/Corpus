import { Html, useGLTF } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { memo, Suspense, useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, DoubleSide, FrontSide, Mesh, Plane, Vector3, type BufferGeometry, type Group, type Intersection, type MeshStandardMaterial } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useShallow } from 'zustand/react/shallow'
import { getPart, LAYERS, partsForProfile, type LayerId, type Part } from '../data/anatomy'
import { DRACO_PATH, filesFor, MODEL_BASE, modelManifest, partIdFromNodeName, partModel, type BodyId, type ModelFile } from '../data/models'
import type { SexProfile } from '../data/sexProfiles'
import { bodyEffects } from '../sim/bodyEffects'
import { selectProfile, useBodyStore } from '../store/useBodyStore'
import { getPlugin } from '../systems'
import { partAppearance } from './appearance'
import { setClipPlane } from './clip'

const ACCENT = '#ff6a3d'
const XRAY_TINT = '#9fc4e8'
const CLICK_DRAG_LIMIT_PX = 5

export const HOME_CAMERA: [number, number, number] = [0, 0.95, 3.7]
export const HOME_TARGET: [number, number, number] = [0, 0.88, 0]

/**
 * How each tissue reflects light. Wet tissue has a glossy clear layer over it, and bone is mostly matte. These are artistic
 * choices to make shapes easy to read. They are not measured optical properties.
 */
const TISSUE: Record<LayerId, { roughness: number; clearcoat: number; clearcoatRoughness: number; sheen: number }> = {
  skin: { roughness: 0.58, clearcoat: 0.12, clearcoatRoughness: 0.55, sheen: 0.25 },
  fat: { roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.35, sheen: 0 },
  muscle: { roughness: 0.46, clearcoat: 0.55, clearcoatRoughness: 0.32, sheen: 0.2 },
  skeleton: { roughness: 0.62, clearcoat: 0.08, clearcoatRoughness: 0.6, sheen: 0 },
  organs: { roughness: 0.34, clearcoat: 0.85, clearcoatRoughness: 0.2, sheen: 0 },
  vessels: { roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.22, sheen: 0 },
  nerves: { roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3, sheen: 0 },
  lymph: { roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.25, sheen: 0 },
}

const layerOrder = new Map(LAYERS.map((layer, index) => [layer.id, LAYERS.length - index]))

interface PartPlacement {
  position: [number, number, number]
  scale: number
}

/**
 * Sex profiles can resize some organs, or place testes inside the pelvis. This keeps a part's centre where it
 * belongs while it scales. The resized organs are illustrative, as the profile notes state.
 */
function placement(id: string, body: BodyId, profile: SexProfile): PartPlacement | undefined {
  const model = partModel(body, id)
  if (!model) return undefined
  const [x, y, z] = model.centre
  if (id === 'ovaries' && profile.ovaryScale !== 1) {
    const s = profile.ovaryScale
    return { position: [x * (1 - s), y * (1 - s), z * (1 - s)], scale: s }
  }
  if (id === 'testes') {
    const s = profile.testesScale
    if (profile.testesPosition === 'internal') {
      const [px, py, pz] = modelManifest.bodies[body].pelvisCentre
      return { position: [px - x * s, py - y * s, pz + 0.02 - z * s], scale: s }
    }
    if (s !== 1) return { position: [x * (1 - s), y * (1 - s), z * (1 - s)], scale: s }
  }
  return undefined
}

const PartMesh = memo(function PartMesh({ part, geometry, place, centre }: { part: Part; geometry: BufferGeometry; place?: PartPlacement; centre: [number, number, number] }) {
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
  const simple = useBodyStore((state) => state.quality === 'low')
  const mesh = useRef<Mesh>(null)

  // Simulations move and light parts through this loop, so animation never re-renders React.
  useFrame(() => {
    const object = mesh.current
    if (!object) return
    const effect = bodyEffects.scale.get(part.id)
    const glow = bodyEffects.glow.get(part.id)
    if (effect !== undefined || object.userData.effected) {
      const base = place?.scale ?? 1
      const [sx, sy, sz] = effect === undefined ? [1, 1, 1] : typeof effect === 'number' ? [effect, effect, effect] : effect
      const [px, py, pz] = place?.position ?? [0, 0, 0]
      object.scale.set(base * sx, base * sy, base * sz)
      object.position.set(px + centre[0] * base * (1 - sx), py + centre[1] * base * (1 - sy), pz + centre[2] * base * (1 - sz))
      object.userData.effected = effect !== undefined
    }
    const material = object.material as MeshStandardMaterial
    if (material.emissiveIntensity !== undefined && (glow !== undefined || object.userData.glowing)) {
      material.emissiveIntensity = Math.max(glow ?? 0, selected ? 0.5 : hovered ? 0.16 : 0)
      object.userData.glowing = glow !== undefined
    }
  })

  if (!appearance.visible) return null

  const transparent = appearance.opacity < 1
  const side = clipped ? DoubleSide : FrontSide
  // These settings change the compiled shader, so the material must be replaced when they change.
  const materialKey = `${clipped}-${transparent}-${simple}`
  const tissue = TISSUE[part.layer]

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      position={place?.position}
      scale={place?.scale ?? 1}
      renderOrder={layerOrder.get(part.layer)}
      userData={{ partId: part.id, pickable: appearance.pickable }}
    >
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
        <meshPhysicalMaterial
          key={materialKey}
          color={part.color}
          roughness={tissue.roughness}
          metalness={0}
          clearcoat={simple ? 0 : tissue.clearcoat}
          clearcoatRoughness={tissue.clearcoatRoughness}
          sheen={simple ? 0 : tissue.sheen}
          sheenRoughness={0.6}
          sheenColor={part.color}
          envMapIntensity={simple ? 0.5 : 1}
          emissive={ACCENT}
          emissiveIntensity={selected ? 0.5 : hovered ? 0.16 : 0}
          transparent={transparent}
          opacity={appearance.opacity}
          depthWrite={!transparent}
          side={side}
        />
      )}
    </mesh>
  )
})

/** Renders every part in one model file. Each layer's files load only once the layer is switched on. */
function ModelFileParts({ file, allowed, body, profile }: { file: ModelFile; allowed: Map<string, Part>; body: BodyId; profile: SexProfile }) {
  const gltf = useGLTF(MODEL_BASE + file.file, DRACO_PATH)
  const meshes = useMemo(() => {
    const found: { name: string; id: string; geometry: BufferGeometry }[] = []
    gltf.scene.traverse((object) => {
      if (object instanceof Mesh) found.push({ name: object.name, id: partIdFromNodeName(object.name), geometry: object.geometry })
    })
    return found
  }, [gltf])

  return (
    <>
      {meshes.map(({ name, id, geometry }) => {
        const part = allowed.get(id)
        return part ? <PartMesh key={name} part={part} geometry={geometry} place={placement(id, body, profile)} centre={partModel(body, id)?.centre ?? [0, 0, 0]} /> : null
      })}
    </>
  )
}

/** Flies the camera whenever the store asks for it, and stops as soon as the person takes over. */
function CameraRig({ body }: { body: BodyId }) {
  const nonce = useBodyStore((state) => state.cameraNonce)
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as unknown as OrbitControlsImpl | null
  const flight = useRef<{ position: Vector3; target: Vector3 } | null>(null)

  useEffect(() => {
    if (nonce === 0 || !controls) return
    const id = useBodyStore.getState().cameraTargetId
    const model = id ? partModel(body, id) : undefined
    if (model) {
      const centre = new Vector3(...model.centre)
      const direction = camera.position.clone().sub(controls.target).normalize()
      const distance = Math.min(4.3, Math.max(0.45, model.radius * 4.2))
      flight.current = { target: centre, position: centre.clone().addScaledVector(direction, distance) }
    } else {
      flight.current = { target: new Vector3(...HOME_TARGET), position: new Vector3(...HOME_CAMERA) }
    }
  }, [nonce, body, camera, controls])

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

function SelectionLabel({ body }: { body: BodyId }) {
  const selectedId = useBodyStore((state) => state.selectedId)
  const part = selectedId ? getPart(selectedId) : undefined
  const model = selectedId ? partModel(body, selectedId) : undefined
  if (!part || !model) return null
  return (
    <Html position={model.centre} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
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
  const selectPart = useBodyStore((state) => state.selectPart)
  const setHovered = useBodyStore((state) => state.setHovered)
  const openSystem = useBodyStore((state) => state.openSystem)
  const SystemScene = getPlugin(openSystem)?.model
  const body = profile.body
  const bodyGroup = useRef<Group>(null)

  useFrame(() => {
    bodyGroup.current?.scale.setScalar(bodyEffects.bodyScale)
  })

  // Parts of a layer are loaded once it is on. The skin also loads while isolating, for the faint outline.
  const activeLayers = useBodyStore(
    useShallow((state) => {
      const on = LAYERS.filter((layer) => state.layers[layer.id].visible).map((layer) => layer.id)
      const selected = state.selectedId ? getPart(state.selectedId) : undefined
      const extra: LayerId[] = state.isolate && selected ? [selected.layer, 'skin'] : []
      return [...new Set([...on, ...extra])]
    }),
  )

  const lod = quality === 'low' ? 'low' : 'high'
  const files = useMemo(() => filesFor(body, lod, activeLayers), [body, lod, activeLayers])
  const allowed = useMemo(() => new Map(partsForProfile(profile).map((part) => [part.id, part])), [profile])

  const firstPickable = (hits: Intersection[]): string | null => {
    for (const hit of hits) {
      const { partId, pickable } = hit.object.userData as { partId?: string; pickable?: boolean }
      if (!partId || !pickable || isClippedAway(hit.point, body)) continue
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
      <group ref={bodyGroup} onClick={onClick} onPointerMove={onPointerMove} onPointerOut={onPointerOut}>
        {files.map((file) => (
          <Suspense key={file.file} fallback={null}>
            <ModelFileParts file={file} allowed={allowed} body={body} profile={profile} />
          </Suspense>
        ))}
      </group>
      <SelectionLabel body={body} />
      <CameraRig body={body} />
      {SystemScene && (
        <Suspense fallback={null}>
          <SystemScene />
        </Suspense>
      )}
    </>
  )
}

const scratchPlane = new Plane()

/** True when a point lies in the part of the body that the slice has cut away. */
function isClippedAway(point: Vector3, body: BodyId): boolean {
  const { clipAxis, clipPosition } = useBodyStore.getState()
  if (clipAxis === 'none') return false
  return setClipPlane(scratchPlane, clipAxis, clipPosition, modelManifest.bodies[body]).distanceToPoint(point) < 0
}
