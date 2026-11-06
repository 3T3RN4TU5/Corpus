import { useEffect, useMemo, useRef, useState } from 'react'
import { getPart } from '../../data/anatomy'
import { factNumber } from '../../data/physiology'
import { useClock } from '../../sim/clock'
import { useBodyStore } from '../../store/useBodyStore'
import { Caption, Choice, Facts, Group, Limits, SERIES_COLORS, Slider, useAnimationFrame } from '../labKit'
import { activation, ATTACHMENTS, energySources, FILAMENT_STEPS, healingStages, JOINTS, MOVEMENTS, sarcomereLength, type MovementId } from './model'
import { musculoLive } from './Scene'

const FACT_IDS = ['bones-adult-total', 'bones-axial', 'bones-appendicular', 'skeleton-remodelled', 'sarcomere-length', 'power-stroke-distance', 'energy-stored-atp', 'energy-creatine', 'energy-glycolysis', 'fracture-hematoma', 'fracture-callus', 'growth-plate-closure', 'bone-density-peak']
const MOVEMENT_OPTIONS = (Object.keys(MOVEMENTS) as MovementId[]).map((id) => ({ id, name: MOVEMENTS[id].name }))

const rad = (degrees: number) => (degrees * Math.PI) / 180

/** A stick figure showing the movement. The 3D body has no rig yet, so it lights the working muscles instead. */
function Figure({ movement }: { movement: MovementId }) {
  const svg = useRef<SVGSVGElement>(null)

  useAnimationFrame(() => {
    const element = svg.current
    if (!element) return
    const current = MOVEMENTS[movement]
    const share = (useClock.getState().time % current.period) / current.period
    const pose = current.pose(share)
    const hip = { x: 80, y: 86 + pose.drop * 90 }
    const shoulder = { x: hip.x + Math.sin(rad(pose.trunk)) * 44, y: hip.y - Math.cos(rad(pose.trunk)) * 44 }
    const head = { x: shoulder.x + Math.sin(rad(pose.trunk)) * 14, y: shoulder.y - Math.cos(rad(pose.trunk)) * 14 }
    const limb = (start: { x: number; y: number }, angle: number, length: number) => ({ x: start.x + Math.sin(rad(angle)) * length, y: start.y + Math.cos(rad(angle)) * length })
    const line = (id: string, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const item = element.querySelector(`[data-l="${id}"]`)
      item?.setAttribute('x1', a.x.toFixed(1))
      item?.setAttribute('y1', a.y.toFixed(1))
      item?.setAttribute('x2', b.x.toFixed(1))
      item?.setAttribute('y2', b.y.toFixed(1))
    }
    const kneeL = limb(hip, -pose.hipL, 36)
    const footL = limb(kneeL, -pose.hipL + pose.kneeL, 36)
    const kneeR = limb(hip, -pose.hipR, 36)
    const footR = limb(kneeR, -pose.hipR + pose.kneeR, 36)
    const elbow = limb(shoulder, pose.shoulder + pose.trunk, 26)
    const hand = limb(elbow, pose.shoulder + pose.trunk - pose.elbow, 24)
    line('trunk', hip, shoulder)
    line('thighL', hip, kneeL)
    line('shinL', kneeL, footL)
    line('thighR', hip, kneeR)
    line('shinR', kneeR, footR)
    line('arm', shoulder, elbow)
    line('fore', elbow, hand)
    element.querySelector('[data-head]')?.setAttribute('cx', head.x.toFixed(1))
    element.querySelector('[data-head]')?.setAttribute('cy', (head.y - 2).toFixed(1))
  })

  return (
    <svg ref={svg} viewBox="0 0 160 170" className="mx-auto mt-1 w-40" role="img" aria-label={`Stick figure performing a ${MOVEMENTS[movement].name.toLowerCase()}`}>
      <line x1="10" y1="165" x2="150" y2="165" stroke="#59616a" />
      <g stroke="#59616a" strokeWidth="4" strokeLinecap="round">
        <line data-l="trunk" />
        <line data-l="thighL" stroke={SERIES_COLORS.orange} />
        <line data-l="shinL" stroke={SERIES_COLORS.orange} />
        <line data-l="thighR" />
        <line data-l="shinR" />
        <line data-l="arm" />
        <line data-l="fore" />
      </g>
      <circle data-head r="10" fill="#59616a" />
    </svg>
  )
}

function ActivationBars({ movement }: { movement: MovementId }) {
  const bars = useRef<HTMLUListElement>(null)
  const current = MOVEMENTS[movement]
  useAnimationFrame(() => {
    const share = (useClock.getState().time % current.period) / current.period
    const levels = activation(current, share)
    bars.current?.querySelectorAll<HTMLElement>('[data-bar]').forEach((bar) => {
      bar.style.width = `${(levels.get(bar.dataset.bar as string) ?? 0) * 100}%`
    })
  })
  return (
    <ul ref={bars} className="mt-1">
      {current.muscles.map((muscle) => (
        <li key={muscle.part} className="py-0.5 text-[0.84rem] leading-tight">
          {getPart(muscle.part)?.name}
          <span className="mt-0.5 block h-1.5 w-full bg-line">
            <span data-bar={muscle.part} className="block h-full" style={{ background: SERIES_COLORS.orange }} />
          </span>
        </li>
      ))}
    </ul>
  )
}

function SarcomereDiagram({ contraction }: { contraction: number }) {
  const length = sarcomereLength(contraction)
  const half = (length / factNumber('sarcomere-length')) * 100
  const left = 120 - half
  const right = 120 + half
  const thin = 62
  return (
    <svg viewBox="0 0 240 90" className="mt-1 w-full" role="img" aria-label={`Sarcomere at ${length.toFixed(2)} micrometres. Thin filaments slide over thick filaments toward the centre.`}>
      <rect x={left - 3} y="8" width="6" height="74" fill="#59616a" />
      <rect x={right - 3} y="8" width="6" height="74" fill="#59616a" />
      {[24, 45, 66].map((y) => (
        <g key={y}>
          <rect x="72" y={y - 3} width="96" height="6" fill={SERIES_COLORS.pink} opacity="0.85" />
          {[-1, 1].map((side) => (
            <g key={side}>
              <rect x={side < 0 ? left : right - thin} y={y - 12} width={thin} height="2.5" fill={SERIES_COLORS.blue} />
              <rect x={side < 0 ? left : right - thin} y={y + 10} width={thin} height="2.5" fill={SERIES_COLORS.blue} />
            </g>
          ))}
        </g>
      ))}
      <g fontFamily="IBM Plex Mono, monospace" fontSize="8" fill="#59616a" textAnchor="middle">
        <text x="120" y="88">Z-lines (grey), myosin (pink), actin (blue)</text>
      </g>
    </svg>
  )
}

function BoneDiagram({ bridge }: { bridge: number }) {
  const gap = 18 * (1 - bridge)
  return (
    <svg viewBox="0 0 240 110" className="mt-1 w-full" role="img" aria-label="Cross-section of a long bone with outer cortical bone, inner trabecular bone and a fracture that closes as it heals.">
      <defs>
        <pattern id="trabecular" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 0 L10 10 M10 0 L0 10" stroke="#59616a" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x="10" y="20" width="220" height="70" fill="url(#trabecular)" />
      <rect x="10" y="20" width="220" height="14" fill="#e8dfc9" />
      <rect x="10" y="76" width="220" height="14" fill="#e8dfc9" />
      <rect x={120 - gap} y="16" width={gap * 2} height="78" fill="#eef1f3" />
      {bridge < 0.3 && <rect x={120 - gap} y="24" width={gap * 2} height="62" fill="#8a2f2a" opacity="0.8" />}
      {bridge >= 0.3 && bridge < 1 && <ellipse cx="120" cy="55" rx={30 * (1.2 - bridge)} ry="46" fill="none" stroke={SERIES_COLORS.blue} strokeWidth="3" />}
      <g fontFamily="IBM Plex Mono, monospace" fontSize="8" fill="#59616a">
        <text x="12" y="14">Cortical (compact) bone</text>
        <text x="12" y="104">Trabecular (spongy) bone inside</text>
      </g>
    </svg>
  )
}

export default function MusculoskeletalLab() {
  const [movement, setMovement] = useState<MovementId>('walk')
  const [step, setStep] = useState(0)
  const [stageIndex, setStageIndex] = useState(0)
  const [contraction, setContraction] = useState(0.5)
  const stages = useMemo(healingStages, [])
  const energy = useMemo(energySources, [])
  const stage = stages[stageIndex]

  useEffect(() => {
    useClock.getState().configure(600, 1)
  }, [])
  useEffect(() => {
    musculoLive.movement = movement
  }, [movement])

  useAnimationFrame(() => {
    const next = Math.floor(useClock.getState().time / 1.5) % FILAMENT_STEPS.length
    setStep((current) => (current === next ? current : next))
    const pulse = 0.5 - 0.5 * Math.cos((useClock.getState().time / (FILAMENT_STEPS.length * 1.5)) * 2 * Math.PI)
    setContraction((current) => (Math.abs(current - pulse) < 0.02 ? current : pulse))
  })

  return (
    <>
      <Group title="Movement">
        <Choice label="Choose a movement" value={movement} options={MOVEMENT_OPTIONS} onChange={setMovement} />
        <Figure movement={movement} />
        <p className="text-[0.84rem] leading-snug text-dust">The working muscles glow in the 3D body. Levels below are an educational pattern, not measurements.</p>
        <ActivationBars movement={movement} />
      </Group>

      <Group title="Zoom: sliding filaments">
        <Caption>
          <span className="italic">{FILAMENT_STEPS[step].name}.</span> {FILAMENT_STEPS[step].text}
        </Caption>
        <SarcomereDiagram contraction={contraction} />
        <p className="text-[0.84rem] leading-snug text-dust">
          A sarcomere is about {factNumber('sarcomere-length')} µm long at rest. Filaments keep their length and slide past each other.
        </p>
      </Group>

      <Group title="Energy for contraction">
        <ul className="mt-1">
          {energy.map((source) => (
            <li key={source.name} className="py-0.5 text-[0.84rem]">
              {source.name}: <span className="text-dust">{source.label}</span>
              <span className="mt-0.5 block h-1.5 bg-line">
                <span className="block h-full" style={{ width: `${(source.seconds / factNumber('energy-glycolysis')) * 100}%`, background: SERIES_COLORS.green }} />
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[0.84rem] text-dust">After these, aerobic respiration supplies most of the energy for sustained activity.</p>
      </Group>

      <Group title="Bone and fracture healing (educational)">
        <BoneDiagram bridge={stage.bridge} />
        <Slider label="Healing stage" value={stageIndex} min={0} max={stages.length - 1} step={1} format={(value) => stages[value].name} onChange={setStageIndex} />
        <p className="text-[0.92rem] leading-snug">
          <span className="italic">{stage.timing}.</span> {stage.text}
        </p>
      </Group>

      <Group title="Where muscles attach">
        <p className="mt-1 text-[0.84rem] leading-snug text-dust">The origin is the end attached to a fixed bone, and the insertion is the end attached to the bone being pulled.</p>
        <ul className="mt-1">
          {ATTACHMENTS.map((item) => (
            <li key={item.part} className="border-t border-line py-1.5 text-[0.84rem] leading-snug">
              <button type="button" className="cursor-pointer italic underline" onClick={() => useBodyStore.getState().revealPart(item.part)}>
                {item.name}
              </button>
              <span className="block text-dust">Origin: {item.origin}.</span>
              <span className="block text-dust">Insertion: {item.insertion}.</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[0.76rem] text-dust">
          <a href="https://openstax.org/books/anatomy-and-physiology-2e/pages/11-5-muscles-of-the-pectoral-girdle-and-upper-limbs" target="_blank" rel="noreferrer">OpenStax A&amp;P 2e, 11.5</a>,{' '}
          <a href="https://openstax.org/books/anatomy-and-physiology-2e/pages/11-6-appendicular-muscles-of-the-pelvic-girdle-and-lower-limbs" target="_blank" rel="noreferrer">11.6</a> and{' '}
          <a href="https://openstax.org/books/anatomy-and-physiology-2e/pages/11-1-interactions-of-skeletal-muscles-their-fascicle-arrangement-and-their-lever-systems" target="_blank" rel="noreferrer">11.1</a>
        </p>
      </Group>

      <Group title="Joint types">
        <ul className="mt-1">
          {JOINTS.map((joint) => (
            <li key={joint.type} className="border-t border-line py-1.5 text-[0.86rem] leading-snug">
              <span className="italic">{joint.type}</span> <span className="tag">{joint.axes}</span>
              <span className="block text-dust">
                {joint.examples}. {joint.note}
              </span>
            </li>
          ))}
        </ul>
      </Group>

      <Facts ids={FACT_IDS} />
      <Limits
        items={[
          'The 3D body has no rig, so it does not move. A stick figure shows each movement, and the muscles light up on the 3D body.',
          'Which muscles lead each movement is a simplified teaching pattern. Levels and timing are illustrative, not electromyography data.',
          'The sourced textbook gives no joint angle ranges, so none are shown.',
          'Attachments are listed for eight major muscles. Attachment points are not marked on the 3D model.',
          'The contracted sarcomere length is illustrative.',
          'The fracture stages are a general teaching sequence. This is not guidance for any injury.',
        ]}
      />
    </>
  )
}
