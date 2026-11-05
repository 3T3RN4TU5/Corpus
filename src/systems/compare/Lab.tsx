import { useEffect, useMemo, useState } from 'react'
import { useClock } from '../../sim/clock'
import { useBodyStore } from '../../store/useBodyStore'
import { Choice, Limits, Slider } from '../labKit'
import { restVsExercise, youngVsOld } from './model'

type Mode = 'exercise' | 'age'

export default function CompareLab() {
  const age = useBodyStore((state) => state.sim.ageYears)
  const [mode, setMode] = useState<Mode>('exercise')
  const [young, setYoung] = useState(25)
  const [old, setOld] = useState(75)
  const comparison = useMemo(() => (mode === 'exercise' ? restVsExercise(age) : youngVsOld(young, old)), [mode, age, young, old])

  useEffect(() => {
    useClock.getState().configure(600, 1)
    useClock.getState().setPlaying(false)
  }, [])

  return (
    <>
      <Choice
        label="Compare"
        value={mode}
        options={[
          { id: 'exercise', name: 'Rest and exercise' },
          { id: 'age', name: 'Younger and older' },
        ]}
        onChange={setMode}
      />
      {mode === 'age' && (
        <>
          <Slider label="Younger age" unit="years" value={young} min={18} max={50} step={1} onChange={setYoung} />
          <Slider label="Older age" unit="years" value={old} min={51} max={90} step={1} onChange={setOld} />
        </>
      )}
      <table className="mt-2 w-full border-collapse text-left text-[0.88rem]">
        <caption className="sr-only">{comparison.name}</caption>
        <thead>
          <tr className="eyebrow">
            <th scope="col" className="py-1 pr-2 font-normal">
              Measure
            </th>
            <th scope="col" className="py-1 pr-2 font-normal">
              {comparison.a}
            </th>
            <th scope="col" className="py-1 font-normal">
              {comparison.b}
            </th>
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => (
            <tr key={row.label} className="border-t border-line align-top">
              <th scope="row" className="py-1.5 pr-2 font-normal">
                {row.label}
                <span className="tag ml-1">{row.basis}</span>
              </th>
              <td className="py-1.5 pr-2 font-mono text-[0.76rem]">{row.a}</td>
              <td className="py-1.5 font-mono text-[0.76rem]">{row.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Limits
        items={[
          'Tags show whether each row is a sourced value, calculated from sourced values, or illustrative.',
          'The exercise values come from a healthy young adult example, so they are not adjusted for age or sex here, other than the age-based maximum heart rate.',
          'The older-adult comparison uses general averages. Individuals vary widely.',
        ]}
      />
    </>
  )
}
