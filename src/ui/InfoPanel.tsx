import { useShallow } from 'zustand/react/shallow'
import { factsForPart, getPart, LAYERS, SYSTEM_NAMES, SYSTEM_SOURCES } from '../data/anatomy'
import { modelProvenance } from '../data/models'
import { formatFact } from '../data/physiology'
import { selectProfile, useBodyStore } from '../store/useBodyStore'
import { pluginForAnatomy } from '../systems'

export function InfoPanel() {
  const selectedId = useBodyStore((state) => state.selectedId)
  const selectPart = useBodyStore((state) => state.selectPart)
  const revealPart = useBodyStore((state) => state.revealPart)
  const isolate = useBodyStore((state) => state.isolate)
  const setIsolate = useBodyStore((state) => state.setIsolate)
  const profile = useBodyStore(useShallow(selectProfile))

  const setOpenSystem = useBodyStore((state) => state.setOpenSystem)
  const part = selectedId ? getPart(selectedId) : undefined
  if (!part) return null
  const simulation = pluginForAnatomy(part.system)

  const layerName = LAYERS.find((layer) => layer.id === part.layer)?.name
  const { facts, showsBothSexes } = factsForPart(part, profile)

  return (
    <aside
      key={part.id}
      aria-label={`${part.name} details`}
      className="sheet reveal absolute inset-x-4 bottom-24 z-30 max-h-[58dvh] overflow-y-auto p-4 md:bottom-[10.5rem] md:left-auto md:right-4 md:top-20 md:max-h-none md:w-[22rem] 2xl:bottom-[6.5rem]"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="eyebrow">
            {SYSTEM_NAMES[part.system]} · {layerName}
          </p>
          <h2 className="mt-1 font-display text-3xl italic leading-tight">{part.name}</h2>
        </div>
        <button type="button" className="control" aria-label="Close details" onClick={() => selectPart(null)}>
          ×
        </button>
      </div>

      <p className="mt-3 text-[1.05rem] leading-snug">{part.function}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" className="control" onClick={() => revealPart(part.id)}>
          Focus
        </button>
        <button type="button" className="control" aria-pressed={isolate} onClick={() => setIsolate(!isolate)}>
          Isolate
        </button>
        {simulation && (
          <button type="button" className="control" onClick={() => setOpenSystem(simulation.id, simulation.layers)}>
            Simulate this
          </button>
        )}
      </div>

      <h3 className="eyebrow mt-4">3D model</h3>
      <p className="mt-1 text-[0.88rem] leading-snug text-dust">{modelProvenance(profile.body, part.id)}</p>

      <h3 className="eyebrow mt-4">Connected systems</h3>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {part.connected.map((system) => (
          <li key={system} className="tag">
            {SYSTEM_NAMES[system]}
          </li>
        ))}
      </ul>

      {facts.length > 0 && (
        <>
          <h3 className="eyebrow mt-4">Key facts</h3>
          <dl className="mt-1">
            {facts.map((fact) => (
              <div key={fact.id} className="border-t border-line py-2">
                <dt className="text-[0.92rem] leading-tight text-dust">
                  {fact.label}
                  {fact.sex !== 'all' && `, ${fact.sex}`}
                </dt>
                <dd className="mt-0.5 font-mono text-[0.86rem]">{formatFact(fact)}</dd>
                {fact.note && <dd className="mt-0.5 text-[0.84rem] leading-snug text-dust">{fact.note}</dd>}
                <dd className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.78rem] leading-tight text-dust">
                  <span className="tag">{fact.confidence}</span>
                  <a href={fact.source.url} target="_blank" rel="noreferrer">
                    {fact.source.title}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
          {showsBothSexes && (
            <p className="mt-1 border-t border-line pt-2 text-[0.84rem] leading-snug text-dust">
              The sources report female and male ranges only, with none specific to this profile, so both are shown.
            </p>
          )}
        </>
      )}

      <h3 className="eyebrow mt-4">Reference</h3>
      <ul className="mt-1 text-[0.82rem] leading-snug text-dust">
        {SYSTEM_SOURCES[part.system].map((source) => (
          <li key={source.url}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  )
}
