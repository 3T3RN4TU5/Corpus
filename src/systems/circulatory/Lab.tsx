import { useEffect, useMemo, useRef, useState } from 'react'
import { factNumber, factRange } from '../../data/physiology'
import { useClock } from '../../sim/clock'
import { useBodyStore } from '../../store/useBodyStore'
import { Caption, Facts, Group, Limits, LiveChart, SERIES_COLORS, Slider, Stat, useAnimationFrame } from '../labKit'
import { circulatoryLive } from './live'
import { circulation, heartAt, limitDiastolic, limitSystolic, maxHeartRateText, type Phase } from './model'

const PHASE_TEXT: Record<Phase, string> = {
  'atrial-systole': 'Atrial systole: the atria contract and top up the ventricles. The mitral and tricuspid valves are open.',
  'ventricular-systole': 'Ventricular systole: the ventricles contract. All four valves are shut at first, while pressure builds. Then the aortic and pulmonary valves open and blood is ejected. The diagram shows only the ejection stage.',
  diastole: 'Diastole: the ventricles relax. All four valves are shut at first, then the mitral and tricuspid valves open and the ventricles fill, mostly passively. The diagram shows only the filling stage.',
}

/** Illustrative shares of the source's exercise values. */
const ACTIVITY_EXERCISE = { sedentary: 0, light: 0.25, moderate: 0.5, vigorous: 1 }

const ECG_SERIES = [{ label: 'ECG (stylised)', color: SERIES_COLORS.green }]
const PRESSURE_SERIES = [
  { label: 'Arterial pressure, mm Hg', color: SERIES_COLORS.orange },
  { label: 'Left ventricle, mL', color: SERIES_COLORS.blue },
]

const FACT_IDS = ['rbc-female', 'rbc-male', 'rbc-lifespan', 'oxygen-saturation', 'venous-blood-share', 'heart-rate-rest-adult', 'stroke-volume-rest', 'cardiac-output-rest', 'exercise-hr', 'exercise-sv', 'exercise-co', 'max-hr-base', 'atrial-systole', 'ventricular-systole', 'ventricular-diastole', 'conduction-sa-to-av', 'conduction-av-delay', 'conduction-sa-to-ventricles', 'atria-contract-after-p', 'atrial-filling-share', 'end-diastolic-volume', 'end-systolic-volume', 'ejection-fraction', 'bp-systolic', 'bp-diastolic', 'map-normal']

/** A cross-section diagram of the four chambers and four valves. */
function HeartDiagram({ svg }: { svg: React.RefObject<SVGSVGElement | null> }) {
  return (
    <svg ref={svg} viewBox="-26 0 292 190" className="mt-2 w-full" role="img" aria-label="Diagram of the heart's four chambers and four valves, animated with each beat">
      <g id="atria">
        <ellipse data-chamber="ra" cx="72" cy="52" rx="42" ry="34" fill="#3f6fb5" opacity="0.85" />
        <ellipse data-chamber="la" cx="168" cy="52" rx="42" ry="34" fill="#c8402f" opacity="0.85" />
      </g>
      <g id="ventricles">
        <ellipse data-chamber="rv" cx="74" cy="132" rx="46" ry="46" fill="#3f6fb5" />
        <ellipse data-chamber="lv" cx="166" cy="132" rx="46" ry="46" fill="#c8402f" />
      </g>
      <rect x="116" y="30" width="8" height="150" fill="#8a5a54" />
      <line data-valve="tricuspid" x1="52" y1="88" x2="92" y2="88" stroke="#1d2126" strokeWidth="4" strokeLinecap="round" />
      <line data-valve="mitral" x1="148" y1="88" x2="188" y2="88" stroke="#1d2126" strokeWidth="4" strokeLinecap="round" />
      <line data-valve="pulmonary" x1="20" y1="118" x2="20" y2="150" stroke="#b58900" strokeWidth="4" strokeLinecap="round" />
      <line data-valve="aortic" x1="220" y1="118" x2="220" y2="150" stroke="#b58900" strokeWidth="4" strokeLinecap="round" />
      <g fontFamily="IBM Plex Mono, monospace" fontSize="8" fill="#ffffff" textAnchor="middle">
        <text x="72" y="55">Right atrium</text>
        <text x="168" y="55">Left atrium</text>
        <text x="74" y="135">Right ventricle</text>
        <text x="166" y="135">Left ventricle</text>
        <text x="72" y="79" fill="#1d2126" stroke="#ffffff" strokeWidth="2.5" paintOrder="stroke">tricuspid</text>
        <text x="168" y="79" fill="#1d2126" stroke="#ffffff" strokeWidth="2.5" paintOrder="stroke">mitral</text>
      </g>
      <g fontFamily="IBM Plex Mono, monospace" fontSize="8" fill="#59616a">
        <text x="-24" y="112">pulmonary</text>
        <text x="214" y="112">aortic</text>
      </g>
    </svg>
  )
}

export default function CirculatoryLab() {
  const ageYears = useBodyStore((state) => state.sim.ageYears)
  const activityLevel = useBodyStore((state) => state.sim.activityLevel)
  const [restingRate, setRestingRate] = useState(factNumber('heart-rate-rest-adult'))
  const [systolic, setSystolic] = useState(factNumber('bp-systolic'))
  const [diastolic, setDiastolic] = useState(factNumber('bp-diastolic'))
  const [exercise, setExercise] = useState(ACTIVITY_EXERCISE[activityLevel])
  const [stenosis, setStenosis] = useState(0)
  const [phase, setPhase] = useState<Phase>('diastole')
  const svg = useRef<SVGSVGElement>(null)

  const output = useMemo(() => circulation({ ageYears, restingRate, systolic, diastolic, exercise, stenosis }), [ageYears, restingRate, systolic, diastolic, exercise, stenosis])

  useEffect(() => {
    circulatoryLive.heartRate = output.heartRate
    circulatoryLive.systolic = systolic
    circulatoryLive.diastolic = diastolic
    circulatoryLive.cardiacOutput = output.cardiacOutput
    circulatoryLive.strokeVolume = output.strokeVolume
  }, [output, systolic, diastolic])

  useEffect(() => {
    useClock.getState().configure(600, 1)
  }, [])

  useAnimationFrame(() => {
    const element = svg.current
    if (!element) return
    const heart = heartAt(useClock.getState().time, output.heartRate, systolic, diastolic, output.strokeVolume)
    setPhase((current) => (current === heart.phase ? current : heart.phase))
    element.querySelectorAll<SVGEllipseElement>('[data-chamber]').forEach((chamber) => {
      const isAtrium = chamber.dataset.chamber === 'ra' || chamber.dataset.chamber === 'la'
      const size = isAtrium ? 0.72 + 0.28 * heart.atria : 0.55 + 0.45 * heart.ventricles
      const cx = Number(chamber.getAttribute('cx'))
      const cy = Number(chamber.getAttribute('cy'))
      chamber.setAttribute('transform', `translate(${cx} ${cy}) scale(${size}) translate(${-cx} ${-cy})`)
    })
    element.querySelectorAll<SVGLineElement>('[data-valve]').forEach((valve) => {
      const isAv = valve.dataset.valve === 'tricuspid' || valve.dataset.valve === 'mitral'
      const open = isAv ? heart.avOpen : heart.semilunarOpen
      valve.setAttribute('stroke-dasharray', open ? '10 20' : '0')
      valve.setAttribute('opacity', open ? '0.55' : '1')
    })
  })

  const sampleEcg = () => {
    const { time } = useClock.getState()
    return [time, heartAt(time, output.heartRate, systolic, diastolic).ecg]
  }
  const samplePressure = () => {
    const { time } = useClock.getState()
    const heart = heartAt(time, output.heartRate, systolic, diastolic, output.strokeVolume)
    return [time, heart.arterialPressure, heart.leftVentricleMl]
  }

  const [hrLow] = factRange('pulse-athlete')

  return (
    <>
      <Caption>{PHASE_TEXT[phase]}</Caption>
      <HeartDiagram svg={svg} />
      <LiveChart series={ECG_SERIES} sample={sampleEcg} windowLength={4} height={100} yRange={[-0.4, 1.2]} />
      <LiveChart series={PRESSURE_SERIES} sample={samplePressure} windowLength={4} height={120} />

      <Group title="Controls">
        <Slider label="Resting heart rate" unit="bpm" value={restingRate} min={hrLow} max={factRange('heart-rate-rest-adult')[1]} step={1} onChange={setRestingRate} />
        <Slider label="Systolic pressure" unit="mm Hg" value={systolic} min={90} max={180} step={1} onChange={(value) => setSystolic(limitSystolic(value, diastolic))} />
        <Slider label="Diastolic pressure" unit="mm Hg" value={diastolic} min={50} max={110} step={1} onChange={(value) => setDiastolic(limitDiastolic(value, systolic))} />
        <Slider label="Exercise level" value={exercise} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={setExercise} />
      </Group>

      <Group title="Live values">
        <dl className="grid grid-cols-2 gap-x-3">
          <Stat label="Heart rate" value={`${Math.round(output.heartRate)} bpm`} />
          <Stat label="Maximum estimate for this age" value={maxHeartRateText(ageYears)} />
          <Stat label="Stroke volume" value={`${Math.round(output.strokeVolume)} mL`} />
          <Stat label="Cardiac output" value={`${output.cardiacOutput.toFixed(1)} L/min`} />
          <Stat label="Mean arterial pressure" value={`${Math.round(output.meanArterialPressure)} mm Hg`} />
          <Stat label="Pulse pressure" value={`${Math.round(output.pulsePressure)} mm Hg`} />
        </dl>
      </Group>

      <Group title="What if: narrowed vessel (illustrative)">
        <Slider label="Radius lost to plaque" value={stenosis} min={0} max={0.9} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={setStenosis} />
        <dl className="grid grid-cols-2 gap-x-3">
          <Stat label="Flow if pressure stays the same" value={`${Math.round(output.vesselFlowShare * 100)}%`} tone={SERIES_COLORS.orange} />
          <Stat label="Resistance" value={`${output.resistanceMultiple.toFixed(1)}×`} />
        </dl>
        <p className="text-[0.82rem] leading-snug text-dust">
          Uses the source's rule that resistance rises with the inverse fourth power of the remaining radius. Real vessels and real plaque behave in more complex ways.
        </p>
      </Group>

      <Facts ids={FACT_IDS} />
      <Limits
        items={[
          'The diagram leaves out isovolumic contraction and relaxation, the two moments when all four valves are shut, because the source gives no duration for them. Here the valves switch directly between open and shut.',
          'The left ventricle chart ejects the stroke volume shown. At rest, the sourced 130 mL end-diastolic volume and 70 mL stroke volume leave 60 mL, the top of the sourced end-systolic range, so ejection fraction is just under its sourced range. The source gives no end volumes during exercise, so the chart holds that 60 mL and adds the extra stroke volume to filling. This is illustrative, and real hearts also empty further.',
          'Passive filling uses the middle of the sourced share. The shapes of the volume and arterial pressure curves, and the atrial movement, are illustrative.',
          'The exercise level set by each activity level is illustrative, and the pressure slider ranges are for exploring, not sourced limits.',
          'The ECG is a stylised trace timed from conduction delays. Its wave heights are illustrative, and it is not a recording.',
          'Blood particles follow illustrative routes through the body, not traced vessels, and their speed is scaled for visibility.',
          'Beat timing is scaled evenly with heart rate. In reality, diastole shortens more than systole at high rates.',
          'Blood pressure here is a setting you choose. It does not respond to exercise, and it does not model pressure regulation.',
          'Exercise values come from a healthy young adult example. They are not specific to any sex or age.',
          'Capillaries are not shown individually. Blood particles turn from oxygen-rich to oxygen-poor at the far end of each route, where capillaries would be.',
          'The 3D heart chambers change size, but do not model wall thickening or the direction of flow. Valves are shown by a glow, and the diagram shows them opening and closing.',
        ]}
      />
    </>
  )
}
