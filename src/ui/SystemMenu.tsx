import { useEffect, useRef, useState } from 'react'
import { useBodyStore } from '../store/useBodyStore'
import { SYSTEM_PLUGINS } from '../systems'

export function SystemMenu() {
  const [open, setOpen] = useState(false)
  const openSystem = useBodyStore((state) => state.openSystem)
  const setOpenSystem = useBodyStore((state) => state.setOpenSystem)
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={host} className="relative">
      <button type="button" className="control control-primary" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
        Simulate
      </button>
      {open && (
        <ul className="sheet absolute right-0 top-full z-40 mt-1 max-h-[70dvh] w-72 overflow-y-auto">
          {SYSTEM_PLUGINS.map((plugin) => (
            <li key={plugin.id}>
              <button
                type="button"
                aria-current={openSystem === plugin.id}
                className="w-full cursor-pointer border-t border-line px-3 py-2 text-left hover:bg-line"
                onClick={() => {
                  setOpenSystem(plugin.id, plugin.layers)
                  setOpen(false)
                }}
              >
                <span className="block text-base leading-tight">{plugin.name}</span>
                <span className="block text-[0.82rem] leading-snug text-dust">{plugin.summary}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
