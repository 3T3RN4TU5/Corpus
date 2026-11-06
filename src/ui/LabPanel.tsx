import { Suspense, useEffect } from 'react'
import { clearBodyEffects } from '../sim/bodyEffects'
import { useClock } from '../sim/clock'
import { useBodyStore } from '../store/useBodyStore'
import { getPlugin } from '../systems'
import { TimeControls } from '../systems/labKit'

/** Keeps the simulation clock running while a lab is open. */
function useClockDriver(active: boolean) {
  useEffect(() => {
    if (!active) return
    let frame = 0
    let previous = performance.now()
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      // A long gap means the tab was hidden, and the simulation should not jump forward.
      useClock.getState().advance(Math.min(0.1, (now - previous) / 1000))
      previous = now
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [active])
}

export function LabPanel() {
  const openSystem = useBodyStore((state) => state.openSystem)
  const setOpenSystem = useBodyStore((state) => state.setOpenSystem)
  const plugin = getPlugin(openSystem)
  useClockDriver(Boolean(plugin))
  useEffect(() => clearBodyEffects, [openSystem])

  if (!plugin) return null
  const Lab = plugin.ui

  return (
    <aside
      key={plugin.id}
      aria-label={`${plugin.name} simulation`}
      className="sheet reveal absolute inset-x-4 bottom-24 z-30 max-h-[62dvh] overflow-y-auto p-4 md:bottom-[10.5rem] md:left-auto md:right-4 md:top-20 md:max-h-none md:w-[25rem] 2xl:bottom-[6.5rem]"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="eyebrow">Simulation</p>
          <h2 className="mt-1 font-display text-3xl italic leading-tight">{plugin.name}</h2>
        </div>
        <button type="button" className="control" aria-label="Close simulation" onClick={() => setOpenSystem(null)}>
          ×
        </button>
      </div>
      {plugin.timeless ? <div className="mt-2 border-t border-line" /> : <TimeControls />}
      <Suspense fallback={<p className="eyebrow mt-3">Loading simulation</p>}>
        <Lab />
      </Suspense>
    </aside>
  )
}
