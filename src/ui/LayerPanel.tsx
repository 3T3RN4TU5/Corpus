import type { CSSProperties } from 'react'
import { LAYERS } from '../data/anatomy'
import { MIN_PICKABLE_OPACITY } from '../scene/appearance'
import { useBodyStore } from '../store/useBodyStore'
import { PartBrowser } from './PartBrowser'

export function LayerPanel() {
  const layers = useBodyStore((state) => state.layers)
  const xray = useBodyStore((state) => state.xray)
  const setLayerVisible = useBodyStore((state) => state.setLayerVisible)
  const setLayerOpacity = useBodyStore((state) => state.setLayerOpacity)
  const showAllLayers = useBodyStore((state) => state.showAllLayers)

  return (
    <section aria-labelledby="layers-heading" className="sheet p-4">
      <div className="flex items-baseline justify-between">
        <h2 id="layers-heading" className="eyebrow">
          Layers
        </h2>
        <button type="button" className="font-mono text-[0.68rem] text-dust underline hover:text-bone" onClick={showAllLayers}>
          Show all
        </button>
      </div>
      <ol className="mt-2 space-y-1">
        {LAYERS.map((layer) => {
          const state = layers[layer.id]
          return (
            <li key={layer.id} className="layer-row" data-on={state.visible} style={{ "--layer": layer.color } as CSSProperties}>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={state.visible}
                  onChange={(event) => setLayerVisible(layer.id, event.target.checked)}
                />
                <span aria-hidden className="h-3 w-3 flex-none rounded-full shadow-sm" style={{ background: layer.color }} />
                <span className="flex-1 text-[1.02rem] leading-tight">{layer.name}</span>
                <span aria-hidden className="font-mono text-[0.66rem] text-dust">
                  {state.visible ? `${Math.round(state.opacity * 100)}%` : 'Off'}
                </span>
              </label>
              {state.visible && (
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={state.opacity}
                  aria-label={`${layer.name} opacity`}
                  onChange={(event) => setLayerOpacity(layer.id, Number(event.target.value))}
                />
              )}
            </li>
          )
        })}
      </ol>
      <p className="mt-2 border-t border-line pt-2 text-[0.84rem] leading-snug text-dust">
        {xray
          ? 'In X-ray mode, clicks pass through skin, fat and muscle.'
          : `Clicks pass through layers below ${MIN_PICKABLE_OPACITY * 100}% opacity.`}
      </p>
      <PartBrowser />
    </section>
  )
}
