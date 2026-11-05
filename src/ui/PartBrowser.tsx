import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { LAYERS, partsForProfile } from '../data/anatomy'
import { selectProfile, useBodyStore } from '../store/useBodyStore'

/** A keyboard and screen reader friendly way to reach every part, without using the 3D view. */
export function PartBrowser() {
  const profile = useBodyStore(useShallow(selectProfile))
  const revealPart = useBodyStore((state) => state.revealPart)
  const parts = useMemo(() => partsForProfile(profile), [profile])
  return (
    <details className="mt-2 border-t border-line pt-2">
      <summary className="eyebrow cursor-pointer">Browse all {parts.length} parts</summary>
      {LAYERS.map((layer) => (
        <div key={layer.id} className="mt-2">
          <h3 className="text-[0.9rem] italic text-dust">{layer.name}</h3>
          <ul>
            {parts
              .filter((part) => part.layer === layer.id)
              .map((part) => (
                <li key={part.id}>
                  <button type="button" className="w-full cursor-pointer py-0.5 text-left text-[0.92rem] leading-tight hover:text-rust" onClick={() => revealPart(part.id)}>
                    {part.name}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </details>
  )
}
