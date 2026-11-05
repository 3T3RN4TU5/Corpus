import { useMemo, useState, type KeyboardEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { LAYERS, partsForProfile, searchParts, SYSTEM_NAMES } from '../data/anatomy'
import { selectProfile, useBodyStore } from '../store/useBodyStore'

export function SearchBox() {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const profile = useBodyStore(useShallow(selectProfile))
  const revealPart = useBodyStore((state) => state.revealPart)

  const results = useMemo(() => searchParts(query, partsForProfile(profile)), [query, profile])
  const showList = open && query.trim().length > 0

  const choose = (id: string) => {
    revealPart(id)
    setQuery('')
    setOpen(false)
    setActive(0)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault()
      setActive((active + 1) % results.length)
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault()
      setActive((active - 1 + results.length) % results.length)
    } else if (event.key === 'Enter' && results[active]) {
      choose(results[active].id)
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <input
        type="search"
        role="combobox"
        aria-label="Search the body"
        aria-expanded={showList}
        aria-controls="search-results"
        aria-activedescendant={showList && results[active] ? `search-${results[active].id}` : undefined}
        placeholder="Find a bone, muscle or organ"
        className="sheet w-full px-3 py-2 text-base text-bone placeholder:text-dust"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul id="search-results" role="listbox" aria-label="Matching body parts" className="sheet absolute inset-x-0 top-full mt-1 max-h-80 overflow-y-auto">
          {results.length === 0 && <li className="px-3 py-2 text-dust">No match in this body.</li>}
          {results.map((part, index) => (
            <li
              key={part.id}
              id={`search-${part.id}`}
              role="option"
              aria-selected={index === active}
              className={`flex cursor-pointer items-baseline justify-between gap-2 border-t border-line px-3 py-1.5 first:border-t-0 ${index === active ? 'bg-line' : ''}`}
              onMouseEnter={() => setActive(index)}
              // Choosing on mouse down happens before the input's blur closes the list.
              onMouseDown={(event) => {
                event.preventDefault()
                choose(part.id)
              }}
            >
              <span>{part.name}</span>
              <span className="whitespace-nowrap font-mono text-[0.64rem] text-dust">
                {SYSTEM_NAMES[part.system]} · {LAYERS.find((layer) => layer.id === part.layer)?.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
