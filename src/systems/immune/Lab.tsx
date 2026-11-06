import { useEffect, useMemo, useRef, useState } from 'react'
import { factRange } from '../../data/physiology'
import { useClock } from '../../sim/clock'
import { Caption, Facts, Group, Limits, LiveChart, SERIES_COLORS, Slider, Stat, useAnimationFrame } from '../labKit'
import { createImmuneState, stepImmune, type ImmuneSettings } from './model'

const FACT_IDS = ['wbc-count', 'neutrophil-share', 'lymphocyte-share', 'monocyte-share', 'eosinophil-share', 'lymph-nodes', 'plasma-to-lymph']
const SERIES = [
  { label: 'Pathogens', color: SERIES_COLORS.orange },
  { label: 'Engulfed', color: SERIES_COLORS.green },
]

const SHARES = [
  { id: 'neutrophil-share', name: 'Neutrophils', role: 'The primary pathogen-killing cells of inflammation.' },
  { id: 'lymphocyte-share', name: 'Lymphocytes', role: 'T cells and B cells, which give targeted immune responses and memory.' },
  { id: 'monocyte-share', name: 'Monocytes', role: 'Become macrophages that engulf pathogens and debris.' },
  { id: 'eosinophil-share', name: 'Eosinophils', role: 'Act against parasites and in allergic responses.' },
]

export default function ImmuneLab() {
  const [responders, setResponders] = useState(10)
  const [growth, setGrowth] = useState(0.25)
  const [run, setRun] = useState(0)
  const settings = useMemo<ImmuneSettings>(() => ({ responders, growth }), [responders, growth])
  const state = useRef(createImmuneState(settings))
  const lastTime = useRef(0)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [counts, setCounts] = useState({ pathogens: 12, engulfed: 0 })

  useEffect(() => {
    useClock.getState().configure(3600, 1)
    state.current = createImmuneState(settings)
    lastTime.current = useClock.getState().time
    // Starting a run only depends on the settings present when "Restart" is pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  useAnimationFrame(() => {
    const { time, playing } = useClock.getState()
    const dt = Math.min(0.2, Math.max(0, time - lastTime.current))
    lastTime.current = time
    if (playing && dt > 0) state.current = stepImmune(state.current, dt, settings)

    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return
    const scale = element.width / 100
    context.fillStyle = '#eef1f4'
    context.fillRect(0, 0, element.width, element.height)
    context.fillStyle = SERIES_COLORS.orange
    for (const pathogen of state.current.pathogens) {
      context.beginPath()
      context.arc(pathogen.x * scale, pathogen.y * scale, 2 * scale * 0.5, 0, Math.PI * 2)
      context.fill()
    }
    context.strokeStyle = SERIES_COLORS.blue
    context.fillStyle = 'rgba(0,114,178,0.22)'
    context.lineWidth = 1.5
    for (const cell of state.current.neutrophils) {
      context.beginPath()
      context.arc(cell.x * scale, cell.y * scale, 3.5 * scale * 0.6, 0, Math.PI * 2)
      context.fill()
      context.stroke()
    }
    const pathogens = state.current.pathogens.length
    setCounts((current) => (current.pathogens === pathogens && current.engulfed === state.current.engulfed ? current : { pathogens, engulfed: state.current.engulfed }))
  })

  const sample = () => [useClock.getState().time, state.current.pathogens.length, state.current.engulfed]
  const cleared = counts.pathogens === 0

  return (
    <>
      <Caption>
        {cleared
          ? 'The infection in this demo has been cleared.'
          : 'Pathogens (orange) multiply. Neutrophils (blue) follow chemical signals toward them and engulf them, in a process called phagocytosis.'}
      </Caption>
      <canvas ref={canvas} width={340} height={220} className="mt-2 w-full" role="img" aria-label={`Simplified demo with ${counts.pathogens} pathogens and ${counts.engulfed} engulfed so far.`} />
      <Slider label="White blood cells responding" value={responders} min={1} max={30} step={1} onChange={setResponders} />
      <Slider label="Pathogen growth" value={growth} min={0.05} max={1} step={0.05} onChange={setGrowth} />
      <button type="button" className="control mt-1" onClick={() => setRun(run + 1)}>
        Restart demo
      </button>
      <LiveChart series={SERIES} sample={sample} windowLength={60} height={110} />
      <dl className="grid grid-cols-2 gap-x-3">
        <Stat label="Pathogens now" value={String(counts.pathogens)} tone={SERIES_COLORS.orange} />
        <Stat label="Engulfed" value={String(counts.engulfed)} tone={SERIES_COLORS.green} />
      </dl>

      <Group title="White blood cells in the blood">
        <p className="mt-1 text-[0.86rem] text-dust">
          Typically {factRange('wbc-count')[0].toLocaleString()} to {factRange('wbc-count')[1].toLocaleString()} per µL.
        </p>
        <ul>
          {SHARES.map((item) => (
            <li key={item.id} className="border-t border-line py-1.5 text-[0.86rem] leading-snug">
              <span className="italic">{item.name}</span> <span className="tag">{factRange(item.id).join('–')}%</span>
              <span className="block text-dust">{item.role}</span>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Lymph flow">
        <p className="mt-1 text-[0.88rem] leading-snug">
          The green particles in the body show lymph, fluid that leaves the blood and returns through lymphatic vessels. On the way, it passes through about {factRange('lymph-nodes').join(' to ')} lymph nodes that screen it for pathogens.
        </p>
      </Group>

      <Facts ids={FACT_IDS} />
      <Limits
        items={[
          'This is a simple game-like demo, not a model of a real infection. Counts, speeds and growth are illustrative, and the outcome predicts nothing about real illness.',
          'It shows only neutrophils and phagocytosis. Real immunity also involves antibodies, T cells, inflammation, fever and memory.',
          'Lymph routes in the body are hand-placed and illustrative, and lymph node positions are approximate.',
        ]}
      />
    </>
  )
}
