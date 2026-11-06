import { useEffect, useMemo, useRef, useState } from 'react'
import { factNumber } from '../../data/physiology'
import { useClock } from '../../sim/clock'
import { Caption, Facts, Group, Limits, LiveChart, SERIES_COLORS, useAnimationFrame } from '../labKit'
import { AP_PHASES, BRAIN_REGIONS, membranePotential, NEUROTRANSMITTERS, reflexStepAt, REFLEX_STEPS, type ActionPotentialPhase } from './model'
import { nervousLive } from './Scene'

const FACT_IDS = ['resting-membrane', 'ap-threshold', 'ap-peak', 'ap-duration', 'cerebellum-mass', 'spinal-nerves', 'cranial-nerves']
const VOLTAGE_SERIES = [{ label: 'Membrane potential, mV', color: SERIES_COLORS.yellow }]

/** Real-time milliseconds are too fast to see, so one simulated action potential plays over a few seconds. */
const AP_LOOP_SECONDS = 4
const AP_SLOWDOWN = 800

/** Each region on the map lights up the matching part of the 3D brain. */
const BRAIN_PART: Record<string, string> = {
  frontal: 'brain-frontal',
  parietal: 'brain-parietal',
  occipital: 'brain-occipital',
  temporal: 'brain-temporal',
  hippocampus: 'brain-hippocampus',
  thalamus: 'brain-thalamus',
  hypothalamus: 'brain-hypothalamus',
  cerebellum: 'brain-cerebellum',
  brainstem: 'brain-brainstem',
}

function BrainMap() {
  const [selected, setSelected] = useState(BRAIN_REGIONS[0])
  useEffect(() => {
    nervousLive.region = BRAIN_PART[selected.id]
    return () => {
      nervousLive.region = null
    }
  }, [selected])
  return (
    <>
      <svg viewBox="0 0 210 185" className="mt-1 w-full" role="group" aria-label="Side view of the brain. Choose a region to read about it.">
        {BRAIN_REGIONS.map((region) => (
          <g
            key={region.id}
            role="button"
            tabIndex={0}
            aria-label={region.name}
            aria-pressed={selected.id === region.id}
            className="cursor-pointer outline-none"
            onClick={() => setSelected(region)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setSelected(region)
              }
            }}
          >
            <path d={region.shape} fill={region.color} stroke={selected.id === region.id ? '#c4431a' : '#ffffff'} strokeWidth={selected.id === region.id ? 2 : 1} opacity={selected.id === region.id ? 1 : 0.82} />
          </g>
        ))}
      </svg>
      <p className="text-[0.95rem] leading-snug">
        <span className="italic">{selected.name}.</span> {selected.function}
      </p>
    </>
  )
}

/** The action potential moves down the axon, and neurotransmitter crosses the synapse when it arrives. */
function NeuronDiagram() {
  const svg = useRef<SVGSVGElement>(null)
  const vesicles = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ id: i, y: 56 + (i % 4) * 9, delay: (i * 0.07) % 0.4 })), [])

  useAnimationFrame(() => {
    const element = svg.current
    if (!element) return
    const share = ((useClock.getState().time / AP_LOOP_SECONDS) % 1 + 1) % 1
    const pulse = element.querySelector<SVGCircleElement>('[data-pulse]')
    pulse?.setAttribute('cx', (40 + Math.min(1, share / 0.6) * 150).toFixed(1))
    pulse?.setAttribute('opacity', share < 0.6 ? '1' : '0')
    element.querySelectorAll<SVGCircleElement>('[data-vesicle]').forEach((vesicle) => {
      const t = Math.max(0, Math.min(1, (share - 0.6 - Number(vesicle.dataset.delay) * 0.3) / 0.3))
      vesicle.setAttribute('cx', (196 + t * 22).toFixed(1))
      vesicle.setAttribute('opacity', share > 0.6 ? String(1 - t * 0.4) : '0.2')
    })
  })

  return (
    <svg ref={svg} viewBox="0 0 240 120" className="mt-1 w-full" role="img" aria-label="Diagram of a neuron. A signal travels along the axon, and neurotransmitter crosses the synapse to the next cell.">
      <circle cx="26" cy="60" r="20" fill="#7f6a5a" />
      <rect x="44" y="56" width="146" height="8" fill="#59616a" />
      {[60, 92, 124, 156].map((x) => (
        <rect key={x} x={x} y="52" width="26" height="16" rx="6" fill="#59616a" opacity="0.55" />
      ))}
      <path d="M190 40 Q204 60 190 80 L184 80 L184 40 Z" fill="#7f6a5a" />
      <rect x="220" y="30" width="16" height="60" rx="6" fill="#5a7fa8" />
      <circle data-pulse cx="40" cy="60" r="7" fill={SERIES_COLORS.yellow} />
      {vesicles.map((vesicle) => (
        <circle key={vesicle.id} data-vesicle data-delay={vesicle.delay} cx="196" cy={vesicle.y} r="2.2" fill={SERIES_COLORS.pink} />
      ))}
      <g fontFamily="IBM Plex Mono, monospace" fontSize="8" fill="#59616a">
        <text x="6" y="100">cell body</text>
        <text x="96" y="100">axon, myelin</text>
        <text x="186" y="108">synapse</text>
      </g>
    </svg>
  )
}

export default function NervousLab() {
  const [phase, setPhase] = useState<ActionPotentialPhase['id']>('resting')
  const [stepId, setStepId] = useState(REFLEX_STEPS[0].id)

  useEffect(() => {
    useClock.getState().configure(600, 1)
  }, [])

  const voltageAt = (time: number) => {
    const inLoop = time % AP_LOOP_SECONDS
    // The signal sits at rest for the first part of the loop, then fires.
    const ms = ((inLoop - 0.8) / AP_SLOWDOWN) * 1000
    return membranePotential(ms)
  }

  useAnimationFrame(() => {
    const { time } = useClock.getState()
    const current = voltageAt(time).phase
    setPhase((previous) => (previous === current ? previous : current))
    const step = reflexStepAt((time % nervousLive.reflexLoop) / nervousLive.reflexLoop)
    setStepId((previous) => (previous === step.id ? previous : step.id))
  })

  const sample = () => {
    const { time } = useClock.getState()
    return [time, voltageAt(time).voltage]
  }

  const details = AP_PHASES[phase]
  const step = REFLEX_STEPS.find((item) => item.id === stepId) ?? REFLEX_STEPS[0]

  return (
    <>
      <Group title="Brain regions">
        <p className="text-[0.84rem] leading-snug text-dust">Choose a region on this map and it lights up in the 3D brain. You can also click regions directly in the 3D view.</p>
        <BrainMap />
      </Group>

      <Group title="Zoom: action potential">
        <Caption>
          <span className="italic">{details.name}.</span> {details.text}
        </Caption>
        <NeuronDiagram />
        <LiveChart series={VOLTAGE_SERIES} sample={sample} windowLength={8} height={120} yRange={[-90, 40]} />
        <p className="text-[0.84rem] leading-snug text-dust">
          Slowed down {AP_SLOWDOWN} times. Resting {factNumber('resting-membrane')} mV, threshold {factNumber('ap-threshold')} mV, peak +{factNumber('ap-peak')} mV, in about {factNumber('ap-duration')} ms.
        </p>
      </Group>

      <Group title="Synapse">
        <p className="text-[0.88rem] leading-snug">When the signal arrives, vesicles release neurotransmitter across the synapse, and it binds to receptors on the next cell.</p>
        <ul className="mt-1 flex flex-wrap gap-1">
          {NEUROTRANSMITTERS.map((name) => (
            <li key={name} className="tag">
              {name}
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Reflex arc: the knee-jerk">
        <Caption>
          <span className="italic">{step.name}.</span> {step.text}
        </Caption>
        <ol className="mt-2 flex gap-0.5" aria-label="Reflex steps">
          {REFLEX_STEPS.map((item) => (
            <li key={item.id} aria-current={item.id === stepId} className={`flex-1 border-t-2 pt-1 font-mono text-[0.58rem] leading-tight ${item.id === stepId ? 'border-rust text-bone' : 'border-line text-dust'}`}>
              {item.name}
            </li>
          ))}
        </ol>
      </Group>

      <Facts ids={FACT_IDS} />
      <Limits
        items={[
          'The 2D map is schematic. The 3D brain regions are grouped from a detailed atlas of about 140 structures.',
          'The source gives no size for the hyperpolarization undershoot, or for how long each phase lasts, so the curve shape is illustrative.',
          'The reflex plays at a speed you can watch. Its real speed is not shown, and step timing is illustrative.',
          'The source sets out the stretch reflex in general terms. The route through the femoral nerve and the kick are simplified, and the body model does not move.',
          'Peripheral nerves in the 3D body are hand-placed paths, because neither anatomy dataset includes them.',
        ]}
      />
    </>
  )
}
