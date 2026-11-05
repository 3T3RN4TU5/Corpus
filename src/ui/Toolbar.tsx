import { useBodyStore, type ClipAxis, type Quality } from '../store/useBodyStore'
import { ExportTools } from './ExportTools'

const SLICES: { id: ClipAxis; label: string }[] = [
  { id: 'none', label: 'Off' },
  { id: 'axial', label: 'Axial' },
  { id: 'sagittal', label: 'Sagittal' },
  { id: 'coronal', label: 'Coronal' },
]

const QUALITIES: Quality[] = ['low', 'medium', 'high']

export function Toolbar() {
  const xray = useBodyStore((state) => state.xray)
  const setXray = useBodyStore((state) => state.setXray)
  const isolate = useBodyStore((state) => state.isolate)
  const setIsolate = useBodyStore((state) => state.setIsolate)
  const hasSelection = useBodyStore((state) => state.selectedId !== null)
  const clipAxis = useBodyStore((state) => state.clipAxis)
  const setClipAxis = useBodyStore((state) => state.setClipAxis)
  const clipPosition = useBodyStore((state) => state.clipPosition)
  const setClipPosition = useBodyStore((state) => state.setClipPosition)
  const quality = useBodyStore((state) => state.quality)
  const setQuality = useBodyStore((state) => state.setQuality)
  const resetView = useBodyStore((state) => state.resetView)

  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3 p-3">
      <div>
        <p className="eyebrow mb-1">View</p>
        <div className="flex gap-1">
          <button type="button" className="control" aria-pressed={xray} onClick={() => setXray(!xray)}>
            X-ray
          </button>
          <button
            type="button"
            className="control"
            aria-pressed={isolate}
            disabled={!hasSelection}
            title={hasSelection ? undefined : 'Select a part first'}
            onClick={() => setIsolate(!isolate)}
          >
            Isolate
          </button>
          <button type="button" className="control" onClick={resetView}>
            Reset
          </button>
        </div>
      </div>

      <div className="min-w-0">
        <p id="slice-label" className="eyebrow mb-1">
          Slice
        </p>
        <div role="radiogroup" aria-labelledby="slice-label" className="flex flex-wrap gap-1">
          {SLICES.map((slice) => (
            <button
              key={slice.id}
              type="button"
              role="radio"
              aria-checked={clipAxis === slice.id}
              className="control"
              onClick={() => setClipAxis(slice.id)}
            >
              {slice.label}
            </button>
          ))}
        </div>
      </div>

      {clipAxis !== 'none' && (
        <label className="min-w-32 flex-1">
          <span className="eyebrow mb-1 block">Slice position</span>
          <input type="range" min={0} max={1} step={0.005} value={clipPosition} onChange={(event) => setClipPosition(Number(event.target.value))} />
        </label>
      )}

      <div>
        <p id="quality-label" className="eyebrow mb-1">
          Quality
        </p>
        <div role="radiogroup" aria-labelledby="quality-label" className="flex gap-1">
          {QUALITIES.map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={quality === item}
              className="control capitalize"
              onClick={() => setQuality(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <ExportTools />

      <p id="performance-readout" className="ml-auto whitespace-nowrap pb-1.5 font-mono text-[0.68rem] text-dust" aria-live="off">
        – fps
      </p>
    </div>
  )
}
