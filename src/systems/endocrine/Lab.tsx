import { useEffect, useRef, useState } from 'react'
import { factRange } from '../../data/physiology'
import { useClock } from '../../sim/clock'
import { Caption, Facts, Group, Limits, LiveChart, SERIES_COLORS, Stat, useAnimationFrame } from '../labKit'
import { eat, exercise, GLANDS, glucoseBand, initialGlucose, stepGlucose } from './model'
import { endocrineLive } from './Scene'

const FACT_IDS = ['glucose-normal-textbook', 'glucose-fasting', 'glucose-prediabetes', 'glucose-diabetes-fasting']
const GLUCOSE = [{ label: 'Blood glucose, mg/dL', color: SERIES_COLORS.yellow }]
const HORMONES = [
  { label: 'Insulin signal', color: SERIES_COLORS.blue },
  { label: 'Glucagon signal', color: SERIES_COLORS.orange },
]

export default function EndocrineLab() {
  const state = useRef(initialGlucose())
  const lastTime = useRef(0)
  const [view, setView] = useState(state.current)

  useEffect(() => {
    useClock.getState().configure(86400, 300)
  }, [])

  useAnimationFrame(() => {
    const { time, playing } = useClock.getState()
    const dt = time - lastTime.current
    lastTime.current = time
    if (playing && dt > 0) state.current = stepGlucose(state.current, dt)
    endocrineLive.insulin = state.current.insulin
    endocrineLive.glucagon = state.current.glucagon
    setView((current) => (Math.abs(current.glucose - state.current.glucose) > 0.4 ? state.current : current))
  })

  const hours = () => useClock.getState().time / 3600
  const band = glucoseBand(view.glucose)
  const [low, high] = factRange('glucose-normal-textbook')

  const message =
    view.insulin > view.glucagon + 0.05
      ? 'Glucose is raised, so beta cells release insulin. Muscle and fat cells take up glucose, and the liver stores it as glycogen.'
      : view.glucagon > view.insulin + 0.05
        ? 'Glucose is falling, so alpha cells release glucagon. The liver breaks down glycogen and releases glucose.'
        : 'Glucose is near its usual level, and both hormones are low.'

  return (
    <>
      <Caption>{message}</Caption>
      <div className="mt-2 flex flex-wrap gap-1">
        <button type="button" className="control" onClick={() => (state.current = eat(state.current, 30))}>
          Snack, 30 g carbohydrate
        </button>
        <button type="button" className="control" onClick={() => (state.current = eat(state.current, 75))}>
          Meal, 75 g carbohydrate
        </button>
        <button type="button" className="control" onClick={() => (state.current = exercise(state.current))}>
          Exercise
        </button>
      </div>
      <LiveChart series={GLUCOSE} sample={() => [hours(), state.current.glucose]} windowLength={12} height={120} yRange={[50, 170]} xLabel="simulated hours" />
      <LiveChart series={HORMONES} sample={() => [hours(), state.current.insulin, state.current.glucagon]} windowLength={12} height={100} yRange={[0, 1]} />
      <dl className="grid grid-cols-2 gap-x-3">
        <Stat label="Blood glucose" value={`${Math.round(view.glucose)} mg/dL`} tone={band === 'normal' ? SERIES_COLORS.green : SERIES_COLORS.orange} />
        <Stat label="Source's usual range" value={`${low} to ${high} mg/dL`} />
      </dl>

      <Group title="Glands and hormones">
        <ul className="mt-1">
          {GLANDS.map((gland) => (
            <li key={gland.name} className="border-t border-line py-1.5 text-[0.86rem] leading-snug">
              <span className="italic">{gland.name}.</span> {gland.role} <span className="text-dust">{gland.hormones}.</span>
            </li>
          ))}
        </ul>
      </Group>

      <Facts ids={FACT_IDS} />
      <Limits
        items={[
          'This models one person without diabetes, using a simple feedback loop. Do not use it to judge your own glucose or decide on food or medicine.',
          'The direction of each effect is sourced, but every rate in the loop is illustrative. So the height and timing of the curve are not predictions.',
          'Insulin and glucagon are relative signals from 0 to 1, not measured concentrations.',
          'All listed glands appear in the 3D body. The thyroid is a simple illustrative shape, because neither anatomy dataset includes it. Parathyroid glands are not included.',
          'Hormone levels do not change with age or sex in this model.',
        ]}
      />
    </>
  )
}
