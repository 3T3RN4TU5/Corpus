import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import { Plane, Spherical, type Vector3 } from 'three'
import { modelManifest } from '../data/models'
import { selectProfile, useBodyStore, type Quality } from '../store/useBodyStore'
import { BodyModel, HOME_CAMERA, HOME_TARGET } from './BodyModel'
import { captureTarget } from './capture'
import { setClipPlane } from './clip'

const MAX_DPR: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 }

const clipPlane = new Plane()

function ClipController() {
  const gl = useThree((state) => state.gl)
  const axis = useBodyStore((state) => state.clipAxis)
  const position = useBodyStore((state) => state.clipPosition)
  const body = useBodyStore((state) => selectProfile(state).body)

  useEffect(() => {
    if (axis === 'none') {
      gl.clippingPlanes = []
      return
    }
    gl.clippingPlanes = [setClipPlane(clipPlane, axis, position, modelManifest.bodies[body])]
  }, [gl, axis, position, body])

  return null
}

function PerformanceReadout() {
  const gl = useThree((state) => state.gl)
  const frames = useRef(0)
  const elapsed = useRef(0)

  useFrame((_state, delta) => {
    frames.current += 1
    elapsed.current += delta
    if (elapsed.current < 0.5) return
    const element = document.getElementById('performance-readout')
    if (element) {
      const fps = Math.round(frames.current / elapsed.current)
      const triangles = Math.round(gl.info.render.triangles / 1000)
      element.textContent = `${fps} fps · ${triangles}k tris`
    }
    frames.current = 0
    elapsed.current = 0
  })

  return null
}

/** Lets interface buttons reach the renderer for screenshots and recording. */
function CaptureBridge() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    captureTarget.gl = gl
    captureTarget.scene = scene
    captureTarget.camera = camera
  }, [gl, scene, camera])
  return null
}

/** Arrow keys orbit the camera, so the view can be turned without a mouse. */
function KeyboardOrbit() {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as unknown as { target: Vector3; update: () => void } | null
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY', 'A'].includes(target.tagName) || target.closest('[role="button"]')) return
      if (!controls || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      event.preventDefault()
      const offset = camera.position.clone().sub(controls.target)
      const spherical = new Spherical().setFromVector3(offset)
      if (event.key === 'ArrowLeft') spherical.theta -= 0.12
      if (event.key === 'ArrowRight') spherical.theta += 0.12
      if (event.key === 'ArrowUp') spherical.phi = Math.max(0.2, spherical.phi - 0.1)
      if (event.key === 'ArrowDown') spherical.phi = Math.min(Math.PI - 0.2, spherical.phi + 0.1)
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical))
      controls.update()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [camera, controls])
  return null
}

function Floor() {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
      <mesh raycast={() => null}>
        <circleGeometry args={[0.62, 64]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <mesh raycast={() => null}>
        <ringGeometry args={[0.615, 0.62, 96]} />
        <meshBasicMaterial color="#e9e1cf" transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  )
}

export default function BodyScene() {
  const quality = useBodyStore((state) => state.quality)
  const selectPart = useBodyStore((state) => state.selectPart)

  return (
    <Canvas
      // Antialiasing is fixed when the WebGL context is created, so changing it needs a new canvas.
      key={quality === 'low' ? 'aliased' : 'smooth'}
      gl={{ antialias: quality !== 'low', alpha: true, powerPreference: 'high-performance' }}
      dpr={[1, MAX_DPR[quality]]}
      camera={{ position: HOME_CAMERA, fov: 32, near: 0.03, far: 20 }}
      onPointerMissed={() => selectPart(null)}
      fallback={
        <p className="p-8 text-center text-bone">
          This simulator needs WebGL, which is not available in this browser.
        </p>
      }
    >
      <hemisphereLight args={['#f4e9d8', '#2a1f18', 1.1]} />
      <directionalLight position={[1.6, 3, 3]} intensity={1.9} color="#fff4e4" />
      <directionalLight position={[-2.5, 2, -2.5]} intensity={1.1} color="#8fb0d6" />
      <ClipController />
      <PerformanceReadout />
      <CaptureBridge />
      <KeyboardOrbit />
      <Floor />
      <BodyModel />
      <OrbitControls makeDefault target={HOME_TARGET} minDistance={0.2} maxDistance={6} enableDamping dampingFactor={0.09} />
    </Canvas>
  )
}
