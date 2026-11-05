import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { factNumber, factRange } from '../../data/physiology'
import { useClock } from '../../sim/clock'
import { selectProfile, useBodyStore } from '../../store/useBodyStore'
import { Caption, Facts, Group, Limits, LiveChart, SERIES_COLORS, Slider, Stat, useAnimationFrame } from '../labKit'
import { filtration, NEPHRON_STAGES, stepBladder, urinePerDay, waterRemaining, type BladderState } from './model'
import { urinaryLive } from './Scene'

const FACT_IDS = ['gfr-female', 'gfr-male', 'filtrate-female', 'filtrate-male', 'filtrate-reabsorbed', 'reabsorb-pct-water', 'reabsorb-loop-water', 'reabsorb-glucose', 'urine-daily', 'urine-minimum', 'urine-ph', 'bladder-capacity', 'bladder-urge']
const SERIES = [{ label: 'Bladder, mL', color: SERIES_COLORS.yellow }]
const STAGE_POSITIONS = [
  { x: 40, y: 34 },
  { x: 110, y: 30 },
  { x: 118, y: 118 },
  { x: 170, y: 34 },
  { x: 214, y: 96 },
]

function Nephron({ index }: { index: number }) {
  const point = STAGE_POSITIONS[index]
  return (
    <svg viewBox="0 0 240 150" className="mt-1 w-full" role="img" aria-label="Diagram of a nephron, from the glomerulus through the tubules to the collecting duct.">
      <circle cx="40" cy="34" r="20" fill="#7a2c26" stroke="#c8402f" />
      <path d="M58 30 C80 10 96 50 110 30 C124 10 130 40 110 58 L110 128 Q118 140 126 128 L126 60 C136 40 150 56 170 34 C186 16 200 30 214 30 L214 142" fill="none" stroke="#e3c370" strokeWidth="6" strokeLinejoin="round" />
      <circle cx={point.x} cy={point.y} r="8" fill="none" stroke="#ff6a3d" strokeWidth="2.5" />
      <g fontFamily="IBM Plex Mono, monospace" fontSize="8" fill="#a69c88">
        <text x="16" y="66">Glomerulus</text>
        <text x="62" y="16">Proximal</text>
        <text x="74" y="110">Loop</text>
        <text x="146" y="16">Distal</text>
        <text x="156" y="120">Collecting duct</text>
      </g>
    </svg>
  )
}

export default function UrinaryLab() {
  const profile = useBodyStore(useShallow(selectProfile))
  const hydration = useBodyStore((state) => state.sim.hydration)
  const setSim = useBodyStore((state) => state.setSim)
  const [state, setState] = useState<BladderState>({ volume: 0, urge: false, voids: 0 })
  const [stage, setStage] = useState(0)
  const live = useRef(state)
  const lastTime = useRef(0)
  const figures = useMemo(() => filtration(profile), [profile])
  const remaining = useMemo(() => waterRemaining(hydration), [hydration])
  const voidAt = factNumber('bladder-capacity') * 0.7

  useEffect(() => {
    useClock.getState().configure(86400, 300)
  }, [])

  useAnimationFrame(() => {
    const { time, playing } = useClock.getState()
    const dt = time - lastTime.current
    lastTime.current = time
    if (playing && dt > 0) {
      live.current = stepBladder(live.current, dt, hydration, voidAt)
      urinaryLive.volume = live.current.volume
    }
    setState((current) => (Math.abs(current.volume - live.current.volume) > 3 || current.voids !== live.current.voids ? { ...live.current } : current))
    const next = Math.floor(performance.now() / 3500) % NEPHRON_STAGES.length
    setStage((current) => (current === next ? current : next))
  })

  const sample = () => [useClock.getState().time / 3600, live.current.volume]

  return (
    <>
      <Slider label="Hydration" value={hydration} min={0} max={1} step={0.05} format={(value) => (value < 0.34 ? 'Low' : value < 0.67 ? 'Moderate' : 'High')} onChange={(value) => setSim({ hydration: value })} />
      <Caption>
        {state.urge ? `The bladder has passed about ${factNumber('bladder-urge')} mL, so an urge to void is sensed.` : 'Urine flows down the ureters and collects in the bladder.'}
      </Caption>
      <LiveChart series={SERIES} sample={sample} windowLength={24} height={120} yRange={[0, factRange('bladder-capacity')[1]]} xLabel="simulated hours" />
      <dl className="grid grid-cols-2 gap-x-3">
        <Stat label="Urine at this hydration" value={`${urinePerDay(hydration).toFixed(1)} L/day`} tone={SERIES_COLORS.yellow} />
        <Stat label="Bladder now" value={`${Math.round(state.volume)} mL`} />
        <Stat label="Voids this run" value={String(state.voids)} />
        <Stat label="Filtration rate (GFR)" value={figures.gfr} />
        <Stat label="Filtrate per day" value={figures.filtrate} />
        <Stat label="Filtrate returned to blood" value={`${factNumber('filtrate-reabsorbed')}%`} />
      </dl>
      {figures.note && <p className="text-[0.84rem] text-dust">{figures.note}</p>}

      <Group title="Zoom: inside a nephron">
        <Nephron index={stage} />
        <Caption>
          <span className="italic">{NEPHRON_STAGES[stage].name}</span> ({NEPHRON_STAGES[stage].action}). {NEPHRON_STAGES[stage].text}
        </Caption>
        <p className="mt-1 text-[0.84rem] text-dust">Water still in the tubule here: about {(remaining[stage] * 100).toFixed(remaining[stage] < 0.05 ? 1 : 0)}% of what was filtered.</p>
      </Group>

      <Facts ids={FACT_IDS} />
      <Limits
        items={[
          'Hydration is a simple setting from low to high. Urine output runs in a straight line from the sourced minimum to the top of the normal range, which is illustrative.',
          'Urine flows at a steady rate and the bladder empties completely at a fixed volume. Real timing depends on many factors, including hormones, meals and choice.',
          'The diagram shows one nephron in schematic form. Water percentages between the tubule stages are built from sourced figures and simplified.',
          'The bladder change in the 3D body is exaggerated so that it can be seen.',
        ]}
      />
    </>
  )
}
