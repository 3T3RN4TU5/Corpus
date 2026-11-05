import { useRef, useState } from 'react'
import { recordingSupported, saveScreenshot, startRecording } from '../scene/capture'
import { useClock } from '../sim/clock'
import { useBodyStore } from '../store/useBodyStore'
import { encodeView } from '../store/shareState'

export function ExportTools() {
  const [recording, setRecording] = useState(false)
  const [copied, setCopied] = useState(false)
  const stop = useRef<(() => void) | null>(null)
  const reduced = useBodyStore((state) => state.reducedMotion)
  const setReduced = useBodyStore((state) => state.setReducedMotion)

  const toggleRecording = () => {
    if (recording) {
      stop.current?.()
      stop.current = null
      setRecording(false)
      return
    }
    stop.current = startRecording()
    setRecording(Boolean(stop.current))
  }

  const share = async () => {
    const state = useBodyStore.getState()
    const hash = encodeView({
      sex: state.sim.sexProfileId,
      custom: state.custom,
      layers: state.layers,
      xray: state.xray,
      clipAxis: state.clipAxis,
      clipPosition: state.clipPosition,
      quality: state.quality,
      openSystem: state.openSystem,
      selectedId: state.selectedId,
    })
    const url = `${window.location.origin}${window.location.pathname}#view=${encodeURIComponent(hash)}`
    window.history.replaceState(null, '', url)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // The address bar still holds the link if the clipboard is blocked.
      setCopied(false)
    }
  }

  return (
    <div>
      <p className="eyebrow mb-1">Share and save</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" className="control" onClick={saveScreenshot}>
          Screenshot
        </button>
        {recordingSupported() && (
          <button type="button" className="control" aria-pressed={recording} onClick={toggleRecording}>
            {recording ? 'Stop' : 'Record'}
          </button>
        )}
        <button type="button" className="control" onClick={share}>
          {copied ? 'Copied' : 'Link'}
        </button>
        <button
          type="button"
          className="control"
          aria-pressed={reduced}
          onClick={() => {
            setReduced(!reduced)
            if (!reduced) useClock.getState().setPlaying(false)
          }}
        >
          Reduce motion
        </button>
      </div>
    </div>
  )
}
