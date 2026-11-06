import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Html, Lightformer, OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import { BufferGeometry, Float32BufferAttribute, MOUSE, Plane, Spherical, TOUCH, Vector3, type PerspectiveCamera } from 'three'
import { modelManifest } from '../data/models'
import { selectProfile, useBodyStore, type Quality } from '../store/useBodyStore'
import { BodyModel, HOME_CAMERA, HOME_TARGET } from './BodyModel'
import { captureTarget } from './capture'
import { setClipPlane } from './clip'

const MAX_DPR: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 }

const ZOOM_SPEED = 1.6

const DRAG_INPUTS = {
  rotate: {
    mouse: { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN },
    touch: { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN },
  },
  move: {
    mouse: { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE },
    touch: { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE },
  },
}

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

/** Keeps the point between two fingers in place during a pinch. The controls follow the cursor only for a mouse wheel. */
function PinchToPoint() {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const element = useThree((state) => state.gl.domElement)
  const controls = useThree((state) => state.controls) as unknown as { target: Vector3 } | null
  useEffect(() => {
    if (!controls) return
    let spread = 0
    const right = new Vector3()
    const up = new Vector3()
    const onMove = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        spread = 0
        return
      }
      const [a, b] = [event.touches[0], event.touches[1]]
      const next = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      if (spread > 0 && next > 0) {
        const box = element.getBoundingClientRect()
        const x = (((a.clientX + b.clientX) / 2 - box.left) / box.width) * 2 - 1
        const y = 1 - (((a.clientY + b.clientY) / 2 - box.top) / box.height) * 2
        const halfHeight = Math.tan((camera.fov * Math.PI) / 360) * camera.position.distanceTo(controls.target)
        camera.matrixWorld.extractBasis(right, up, new Vector3())
        const shift = right
          .multiplyScalar(x * halfHeight * camera.aspect)
          .addScaledVector(up, y * halfHeight)
          .multiplyScalar(1 - (spread / next) ** ZOOM_SPEED)
        camera.position.add(shift)
        controls.target.add(shift)
      }
      spread = next
    }
    const onEnd = () => {
      spread = 0
    }
    element.addEventListener('touchmove', onMove, { passive: true })
    element.addEventListener('touchend', onEnd)
    return () => {
      element.removeEventListener('touchmove', onMove)
      element.removeEventListener('touchend', onEnd)
    }
  }, [camera, controls, element])
  return null
}

/**
 * Soft studio lights that appear only in reflections, so wet tissue has highlights to reflect. It is rendered once, in the
 * browser, so no image needs downloading.
 */
function StudioReflections() {
  return (
    <Environment resolution={128} frames={1}>
      <color attach="background" args={['#aab2ba']} />
      <Lightformer form="rect" intensity={3.2} color="#fff3e2" position={[0, 4, 3]} rotation={[-Math.PI / 3, 0, 0]} scale={[5, 3, 1]} />
      <Lightformer form="rect" intensity={1.6} color="#cfe1ff" position={[-4, 1, 1]} rotation={[0, Math.PI / 2, 0]} scale={[2, 6, 1]} />
      <Lightformer form="rect" intensity={1.8} color="#ffe6cf" position={[4, 1, 1]} rotation={[0, -Math.PI / 2, 0]} scale={[2, 6, 1]} />
      <Lightformer form="rect" intensity={1.2} color="#ffffff" position={[0, 1.5, -4]} rotation={[0, Math.PI, 0]} scale={[6, 3, 1]} />
    </Environment>
  )
}

/** A true-scale ruler beside the body, marked every 10 cm. The body stands on zero. */
function HeightRuler() {
  const body = useBodyStore((state) => selectProfile(state).body)
  const { height, width } = modelManifest.bodies[body]
  // On a narrow screen the ruler moves in, so that its labels stay on screen.
  const visibleHalfWidth = useThree((state) => state.viewport.width) / 2
  const x = -Math.min(width / 2 + 0.12, visibleHalfWidth - 0.22)
  const geometry = useMemo(() => {
    const points: number[] = [x, 0, 0, x, height, 0]
    for (let cm = 0; cm <= height * 100; cm += 10) {
      const size = cm % 50 === 0 ? 0.045 : 0.02
      points.push(x, cm / 100, 0, x + size, cm / 100, 0)
    }
    return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3))
  }, [x, height])
  useEffect(() => () => geometry.dispose(), [geometry])
  const marks = useMemo(() => {
    const list: number[] = []
    for (let cm = 0; cm <= height * 100; cm += 50) list.push(cm)
    return list
  }, [height])

  return (
    <group raycast={() => null}>
      <lineSegments geometry={geometry} raycast={() => null}>
        <lineBasicMaterial color="#1b2245" transparent opacity={0.45} />
      </lineSegments>
      {marks.map((cm) => (
        <Html key={cm} position={[x, cm / 100, 0]} zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <span className="ruler-label block">{cm} cm</span>
        </Html>
      ))}
      <Html position={[x, height, 0]} zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
        <span className="ruler-label block" data-top="true">
          {(height * 100).toFixed(1)} cm
        </span>
      </Html>
    </group>
  )
}

function Floor() {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
      <mesh raycast={() => null}>
        <circleGeometry args={[0.38, 64]} />
        <meshBasicMaterial color="#1b2245" transparent opacity={0.045} depthWrite={false} />
      </mesh>
      <mesh raycast={() => null}>
        <ringGeometry args={[0.377, 0.38, 96]} />
        <meshBasicMaterial color="#cf4217" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  )
}

export default function BodyScene() {
  const quality = useBodyStore((state) => state.quality)
  const selectPart = useBodyStore((state) => state.selectPart)
  const dragMode = useBodyStore((state) => state.dragMode)

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
      <hemisphereLight args={['#ffffff', '#b9c0c7', 0.6]} />
      <directionalLight position={[1.6, 3, 3]} intensity={1.55} color="#fff4e4" />
      <directionalLight position={[-2.5, 2, -2.5]} intensity={0.8} color="#8fb0d6" />
      <StudioReflections />
      <ClipController />
      <PerformanceReadout />
      <CaptureBridge />
      <KeyboardOrbit />
      <PinchToPoint />
      <Floor />
      <HeightRuler />
      <BodyModel />
      <OrbitControls makeDefault target={HOME_TARGET} minDistance={0.2} maxDistance={6} enableDamping dampingFactor={0.09} zoomToCursor zoomSpeed={ZOOM_SPEED} mouseButtons={DRAG_INPUTS[dragMode].mouse} touches={DRAG_INPUTS[dragMode].touch} />
    </Canvas>
  )
}
