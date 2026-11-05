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
    <section aria-labelledby="layers-heading" className="p-4">
      <div className="flex items-baseline justify-between">
        <h2 id="layers-heading" className="eyebrow">
          Layers
        </h2>
        <button type="button" className="font-mono text-[0.68rem] text-dust underline hover:text-bone" onClick={showAllLayers}>
          Show all
        </button>
      </div>
      <ol className="mt-2">
        {LAYERS.map((layer, index) => {
          const state = layers[layer.id]
          return (
            <li key={layer.id} className="border-t border-line py-1.5">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={state.visible}
                  onChange={(event) => setLayerVisible(layer.id, event.target.checked)}
                />
                <span aria-hidden className="h-2.5 w-2.5 flex-none" style={{ background: layer.color }} />
                <span className="flex-1 text-[1.02rem] leading-tight">{layer.name}</span>
                <span aria-hidden className="font-mono text-[0.66rem] text-dust">
                  {state.visible ? `${Math.round(state.opacity * 100)}%` : `0${index + 1}`}
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
