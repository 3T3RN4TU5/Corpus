import { useProgress } from '@react-three/drei'

/** Shows while body models are downloading, because large layers take a moment on slower connections. */
export default function ModelProgress() {
  const { active, progress } = useProgress()
  if (!active) return null
  return (
    <div role="status" className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 bg-ink/80 px-3 py-1">
      <p className="eyebrow !text-bone">Loading anatomy {Math.round(progress)}%</p>
    </div>
  )
}
