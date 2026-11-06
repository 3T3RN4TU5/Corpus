import { useEffect, useMemo, useRef, useState } from 'react'
import { factNumber, factRange } from '../../data/physiology'
import { useClock } from '../../sim/clock'
import { Caption, Facts, Group, Limits, SERIES_COLORS, Slider, Stat, useAnimationFrame } from '../labKit'
import { SKIN_LAYERS, thermoregulation } from './model'

const FACT_IDS = ['core-temp', 'temp-average', 'fever-threshold', 'sweat-rest', 'sweat-active', 'heat-loss-radiation', 'heat-loss-evaporation', 'heat-loss-convection', 'heat-loss-conduction']

const RESPONSE = {
  cold: 'The air is cooler than the comfortable temperature for an unclothed body, so blood vessels in the skin narrow, keeping warm blood near the core.',
  neutral: 'Little response is needed. Skin vessels are at a middle width, and sweating is minimal.',
  hot: 'The body is gaining heat, so skin vessels widen and sweat glands release sweat, which cools the skin as it evaporates.',
}

function SkinDiagram({ selected, onSelect, dilation, sweat }: { selected: string; onSelect: (id: string) => void; dilation: number; sweat: number }) {
  const svg = useRef<SVGSVGElement>(null)
  useAnimationFrame(() => {
    const element = svg.current
    if (!element) return
    const t = useClock.getState().time
    element.querySelectorAll<SVGCircleElement>('[data-drop]').forEach((drop) => {
      const share = (t * 0.4 + Number(drop.dataset.phase)) % 1
      drop.setAttribute('cy', (96 - share * 90).toFixed(1))
      drop.setAttribute('opacity', sweat > 0.05 ? String(Math.min(1, sweat * 1.5)) : '0')
    })
  })
  return (
    <svg ref={svg} viewBox="0 0 240 156" className="mt-1 w-full" role="group" aria-label="Cross-section of skin. Choose a layer to read about it.">
      {SKIN_LAYERS.map((layer) => (
        <rect
          key={layer.id}
          x="10"
          y={layer.y}
          width="220"
          height={layer.height}
          fill={layer.color}
          stroke={selected === layer.id ? '#ff6a3d' : 'none'}
          strokeWidth="2"
          role="button"
          tabIndex={0}
          aria-label={layer.name}
          className="cursor-pointer"
          onClick={() => onSelect(layer.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onSelect(layer.id)
            }
          }}
        />
      ))}
      <path d={`M10 88 C70 ${88 - dilation * 12} 170 ${88 + dilation * 12} 230 88`} fill="none" stroke="#c8402f" strokeWidth={2 + dilation * 7} pointerEvents="none" />
      <path d="M180 100 Q172 104 180 110 Q190 116 180 122" fill="none" stroke="#5aa7ff" strokeWidth="3" pointerEvents="none" />
      <line x1="180" y1="100" x2="180" y2="12" stroke="#5aa7ff" strokeWidth="2" pointerEvents="none" />
      {[0, 0.25, 0.5, 0.75].map((phase) => (
        <circle key={phase} data-drop data-phase={phase} cx="180" cy="96" r="2.5" fill="#0072b2" pointerEvents="none" />
      ))}
    </svg>
  )
}

export default function SkinLab() {
  const [ambient, setAmbient] = useState(22)
  const [activity, setActivity] = useState(0)
  const [layerId, setLayerId] = useState('corneum')
  const output = useMemo(() => thermoregulation({ ambient, activity }), [ambient, activity])
  const layer = SKIN_LAYERS.find((item) => item.id === layerId) ?? SKIN_LAYERS[0]

  useEffect(() => {
    useClock.getState().configure(600, 1)
  }, [])

  const [low, high] = factRange('core-temp')

  return (
    <>
      <Caption>{RESPONSE[output.response]}</Caption>
      <Group title="Zoom: skin layers">
        <SkinDiagram selected={layerId} onSelect={setLayerId} dilation={output.vesselDilation} sweat={output.sweat} />
        <p className="text-[0.95rem] leading-snug">
          <span className="italic">{layer.name}.</span> {layer.text}
        </p>
      </Group>
      <Group title="Thermoregulation">
        <Slider label="Air temperature" unit="°C" value={ambient} min={-5} max={45} step={1} onChange={setAmbient} />
        <Slider label="Activity" value={activity} min={0} max={1} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={setActivity} />
        <dl className="grid grid-cols-2 gap-x-3">
          <Stat label="Sweat rate" value={`${output.sweat.toFixed(2)} L/h`} tone={SERIES_COLORS.blue} />
          <Stat label="Skin vessels" value={output.response === 'cold' ? 'Narrowed' : output.response === 'hot' ? 'Widened' : 'Middle'} />
          <Stat label="Core temperature range (source)" value={`${low} to ${high} °C`} />
          <Stat label="Fever (source), above" value={`${factNumber('fever-threshold')} °C`} />
        </dl>
      </Group>
      <Group title="How a resting body loses heat">
        <ul className="mt-1">
          {[
            ['Radiation', 'heat-loss-radiation'],
            ['Evaporation', 'heat-loss-evaporation'],
            ['Convection', 'heat-loss-convection'],
            ['Conduction', 'heat-loss-conduction'],
          ].map(([name, id]) => (
            <li key={id} className="py-0.5 text-[0.84rem]">
              {name}: {factNumber(id)}%
              <span className="mt-0.5 block h-1.5 bg-line">
                <span className="block h-full" style={{ width: `${factNumber(id)}%`, background: SERIES_COLORS.orange }} />
              </span>
            </li>
          ))}
        </ul>
      </Group>
      <Facts ids={FACT_IDS} />
      <Limits
        items={[
          'The link between air temperature, activity and sweat rate is illustrative. Only the end points of sweat are sourced.',
          'Humidity, clothing, wind, acclimatisation, age and body size are not modelled. This does not predict heat illness or safe limits.',
          'Core temperature stays inside the sourced normal range here, so this shows no fever, heat stroke or hypothermia.',
          'The skin diagram is not to scale. The 3D skin layer is a surface, and it does not contain these layers.',
        ]}
      />
    </>
  )
}
