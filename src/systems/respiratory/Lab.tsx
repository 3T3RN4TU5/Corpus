import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { factNumber, factRange } from '../../data/physiology'
import { useClock } from '../../sim/clock'
import { selectProfile, useBodyStore } from '../../store/useBodyStore'
import { Caption, Choice, Facts, Group, Limits, LiveChart, SERIES_COLORS, Stat, useAnimationFrame } from '../labKit'
import { breathAt, breathing, capillaryGas, gasGradients, type ActivityLevel } from './model'
import { respiratoryLive } from './Scene'

const LEVELS: { id: ActivityLevel; name: string }[] = [
  { id: 'sedentary', name: 'Rest' },
  { id: 'light', name: 'Light' },
  { id: 'moderate', name: 'Moderate' },
  { id: 'vigorous', name: 'Vigorous' },
]

const VOLUME_SERIES = [{ label: 'Air breathed in, mL', color: SERIES_COLORS.blue }]
const FACT_IDS = ['breathing-rate-adolescent-adult', 'breathing-rate-under-1', 'breathing-rate-age-10', 'tidal-volume', 'vital-capacity', 'tlc-female', 'tlc-male', 'erv-male', 'alveolar-po2', 'alveolar-pco2', 'leaving-po2', 'arterial-po2', 'returning-po2', 'returning-pco2', 'atmospheric-po2', 'alveolus-diameter', 'respiratory-membrane']

/** A zoomed view of one alveolus and its capillary, with oxygen entering and carbon dioxide leaving. */
function AlveolusDiagram() {
  const svg = useRef<SVGSVGElement>(null)
  const dots = useMemo(
    () => Array.from({ length: 28 }, (_, i) => ({ id: i, oxygen: i % 2 === 0, phase: (i * 0.137) % 1, row: (i * 0.61) % 1 })),
    [],
  )

  useAnimationFrame(() => {
    const element = svg.current
    if (!element) return
    const time = useClock.getState().time
    element.querySelectorAll<SVGCircleElement>('[data-gas]').forEach((dot) => {
      const oxygen = dot.dataset.gas === 'o2'
      const offset = Number(dot.dataset.phase)
      const row = Number(dot.dataset.row)
      const t = (time * 0.25 + offset) % 1
      const x = 34 + row * 172
      // Oxygen moves down from the air sac into the capillary, and carbon dioxide moves up.
      const y = oxygen ? 72 + t * 62 : 134 - t * 62
      dot.setAttribute('cx', x.toFixed(1))
      dot.setAttribute('cy', y.toFixed(1))
    })
  })

  return (
    <svg ref={svg} viewBox="0 0 240 170" className="mt-2 w-full" role="img" aria-label="Diagram of an alveolus above a capillary. Oxygen moves from the air into the blood, and carbon dioxide moves from the blood into the air.">
      <path d="M20 96 Q20 18 120 18 Q220 18 220 96 Z" fill="#d5e4f3" stroke="#59616a" />
      <rect x="20" y="96" width="200" height="8" fill="#59616a" opacity="0.6" />
      <rect x="20" y="104" width="200" height="44" rx="10" fill="#f0c2bb" stroke="#c8402f" />
      {dots.map((dot) => (
        <circle key={dot.id} data-gas={dot.oxygen ? 'o2' : 'co2'} data-phase={dot.phase} data-row={dot.row} r="3" fill={dot.oxygen ? SERIES_COLORS.orange : SERIES_COLORS.blue} />
      ))}
      <g fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#1d2126">
        <text x="120" y="38" textAnchor="middle">Alveolus (air)</text>
        <text x="120" y="163" textAnchor="middle">Capillary (blood)</text>
      </g>
    </svg>
  )
}

export default function RespiratoryLab() {
  const [level, setLevel] = useState<ActivityLevel>(useBodyStore.getState().sim.activityLevel)
  const [inhaling, setInhaling] = useState(true)
  const profile = useBodyStore(useShallow(selectProfile))
  const output = useMemo(() => breathing(level), [level])
  const gradients = useMemo(gasGradients, [])

  useEffect(() => {
    useClock.getState().configure(600, 1)
  }, [])
  useEffect(() => {
    respiratoryLive.level = level
  }, [level])

  useAnimationFrame(() => {
    const now = breathAt(useClock.getState().time, output).inhaling
    setInhaling((current) => (current === now ? current : now))
  })

  const sample = () => {
    const { time } = useClock.getState()
    return [time, breathAt(time, output).volume]
  }

  const capacity = profile.referenceSex === 'female' ? `${factNumber('tlc-female')} mL` : profile.referenceSex === 'male' ? `${factNumber('tlc-male')} mL` : `${factNumber('tlc-female')} to ${factNumber('tlc-male')} mL`
  const start = capillaryGas(0)
  const end = capillaryGas(1)

  return (
    <>
      <Caption>
        {inhaling
          ? 'Breathing in: the diaphragm contracts and moves down while the external intercostals lift the ribs, so the chest expands and air flows in.'
          : 'Breathing out: at rest, the muscles relax and the lungs recoil, pushing air out without active effort.'}
      </Caption>
      <Choice label="Activity level" value={level} options={LEVELS} onChange={setLevel} />
      <LiveChart series={VOLUME_SERIES} sample={sample} windowLength={20} height={120} yRange={[0, 2500]} />
      <dl className="grid grid-cols-2 gap-x-3">
        <Stat label="Breathing rate" value={`${output.rate.toFixed(0)} per min`} />
        <Stat label="Tidal volume" value={`${Math.round(output.tidalVolume)} mL`} />
        <Stat label="Air moved each minute" value={`${output.minuteVentilation.toFixed(1)} L`} />
        <Stat label="Total lung capacity" value={capacity} />
      </dl>
      <p className="text-[0.84rem] leading-snug text-dust">
        The source gives vital capacity as {factRange('vital-capacity').join(' to ')} mL without saying which sex that describes. Its top end is above the source's female total lung capacity of {factNumber('tlc-female')} mL, so it cannot apply to every sex.
      </p>

      <Group title="Zoom: gas exchange in an alveolus">
        <AlveolusDiagram />
        <dl className="grid grid-cols-2 gap-x-3">
          <Stat label="Oxygen pressure difference" value={`${gradients.oxygenGradient} mm Hg`} tone={SERIES_COLORS.orange} />
          <Stat label="Carbon dioxide pressure difference" value={`${gradients.carbonDioxideGradient} mm Hg`} tone={SERIES_COLORS.blue} />
          <Stat label="Blood oxygen, entering to leaving" value={`${start.oxygen} to ${end.oxygen.toFixed(0)} mm Hg`} />
          <Stat label="Blood CO₂, entering to leaving" value={`${start.carbonDioxide} to ${end.carbonDioxide.toFixed(0)} mm Hg`} />
        </dl>
        <p className="text-[0.84rem] leading-snug text-dust">
          Gases cross by simple diffusion, moving from higher to lower pressure. The carbon dioxide difference is smaller, but carbon dioxide dissolves far more easily than oxygen. The source gives {factNumber('alveolar-po2')} mm Hg of oxygen in alveolar air and {factNumber('leaving-po2')} mm Hg in blood leaving the lungs, without explaining the gap.
        </p>
      </Group>

      <Facts ids={FACT_IDS} />
      <Limits
        items={[
          'The sourced textbook gives no numbers for breathing during exercise. The rise in rate and depth with activity is illustrative, built up from sourced resting values. Vigorous breaths use half of the middle of the vital capacity range for every profile, and breathing in takes one third of each breath. Both are illustrative.',
          'The chest movement in the 3D body is exaggerated so it can be seen. The lungs scale evenly, and they do not change shape as real lungs do.',
          'The gas particles show direction only. Their number and speed are not to scale.',
          'The airway tree in this model stops at the larger bronchi, and alveoli appear only in the diagram.',
        ]}
      />
    </>
  )
}
