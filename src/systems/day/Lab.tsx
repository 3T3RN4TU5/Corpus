import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_PLAN, type DayEvent, type DayResult } from '../../sim/day'
import { useClock } from '../../sim/clock'
import { computeDay } from '../../sim/useWorker'
import { Caption, Group, Limits, SERIES_COLORS, Slider, Stat, TimelineChart, useAnimationFrame } from '../labKit'

const hourLabel = (hour: number) => `${String(Math.floor(hour) % 24).padStart(2, '0')}:${String(Math.round((hour % 1) * 60) % 60).padStart(2, '0')}`

function describe(events: DayEvent[], hour: number): string {
  const active = events.find((event) => (event.kind === 'exercise' || event.kind === 'sleep') && hour >= event.hour && hour < event.hour + (event.hours ?? 0))
  if (active?.kind === 'sleep') return 'Asleep. Heart rate is at the low end of its range, and body temperature is lowest in the early morning.'
  if (active?.kind === 'exercise') return 'Exercising. Heart rate rises, and working muscles use more glucose. The body sweats, which uses up body water and cools the skin.'
  const meal = events.find((event) => event.kind === 'meal' && hour >= event.hour && hour < event.hour + 2.5)
  if (meal) return 'After a meal. Glucose rises as food is absorbed, and insulin brings it back down.'
  return 'Awake and resting. The body keeps glucose, temperature and water in balance.'
}

export default function DayLab() {
  const [exerciseHour, setExerciseHour] = useState(17.5)
  const [exerciseHours, setExerciseHours] = useState(1)
  const [wake, setWake] = useState(7)
  const [mealSize, setMealSize] = useState(75)
  const [result, setResult] = useState<DayResult | null>(null)
  const [hour, setHour] = useState(0)

  const events = useMemo<DayEvent[]>(() => {
    const base = DEFAULT_PLAN.events.filter((event) => event.kind === 'drink')
    return [
      ...base,
      { kind: 'sleep', hour: 0, hours: wake },
      { kind: 'sleep', hour: 23, hours: 1 },
      { kind: 'meal', hour: wake + 1, amount: mealSize * 0.67 },
      { kind: 'meal', hour: 13, amount: mealSize },
      { kind: 'meal', hour: 19.5, amount: mealSize },
      ...(exerciseHours > 0 ? [{ kind: 'exercise' as const, hour: exerciseHour, hours: exerciseHours }] : []),
    ]
  }, [exerciseHour, exerciseHours, wake, mealSize])

  useEffect(() => {
    useClock.getState().configure(86400, 1000)
  }, [])

  useEffect(() => {
    let current = true
    computeDay({ events, restingRate: DEFAULT_PLAN.restingRate }).then((value) => {
      if (current) setResult(value)
    })
    return () => {
      current = false
    }
  }, [events])

  useAnimationFrame(() => {
    const next = useClock.getState().time / 3600
    setHour((previous) => (Math.abs(previous - next) > 0.05 ? next : previous))
  })

  const charts = useMemo(() => {
    if (!result) return null
    return {
      heart: [{ label: 'Heart rate, bpm', color: SERIES_COLORS.orange, values: result.heartRate }],
      glucose: [{ label: 'Blood glucose, mg/dL', color: SERIES_COLORS.yellow, values: result.glucose }],
      hydration: [{ label: 'Body water change, L', color: SERIES_COLORS.blue, values: result.hydration }],
      temperature: [{ label: 'Body temperature, °C', color: SERIES_COLORS.green, values: result.temperature }],
    }
  }, [result])

  const marker = () => useClock.getState().time / 3600
  const index = result ? Math.min(result.hours.length - 1, Math.round((hour / 24) * (result.hours.length - 1))) : 0

  return (
    <>
      <Caption>
        <span className="font-mono text-[0.8rem]">{hourLabel(hour)}.</span> {describe(events, hour)}
      </Caption>
      {result && charts && (
        <>
          <dl className="grid grid-cols-2 gap-x-3">
            <Stat label="Heart rate" value={`${Math.round(result.heartRate[index])} bpm`} tone={SERIES_COLORS.orange} />
            <Stat label="Glucose" value={`${Math.round(result.glucose[index])} mg/dL`} tone={SERIES_COLORS.yellow} />
            <Stat label="Body water change" value={`${result.hydration[index] >= 0 ? '+' : ''}${result.hydration[index].toFixed(1)} L`} tone={SERIES_COLORS.blue} />
            <Stat label="Temperature" value={`${result.temperature[index].toFixed(1)} °C`} tone={SERIES_COLORS.green} />
          </dl>
          <TimelineChart x={result.hours} series={charts.heart} height={95} marker={marker} />
          <TimelineChart x={result.hours} series={charts.glucose} height={95} marker={marker} />
          <TimelineChart x={result.hours} series={charts.hydration} height={95} marker={marker} />
          <TimelineChart x={result.hours} series={charts.temperature} height={105} marker={marker} xLabel="hour of the day" />
        </>
      )}
      <Group title="Change the day">
        <Slider label="Wake time" value={wake} min={5} max={10} step={0.25} format={hourLabel} onChange={setWake} />
        <Slider label="Exercise starts" value={exerciseHour} min={8} max={21} step={0.25} format={hourLabel} onChange={setExerciseHour} />
        <Slider label="Exercise length" unit="h" value={exerciseHours} min={0} max={3} step={0.25} onChange={setExerciseHours} />
        <Slider label="Main meal carbohydrate" unit="g" value={mealSize} min={20} max={150} step={5} onChange={setMealSize} />
      </Group>
      <Limits
        items={[
          'This combines separate simple models, for one illustrative healthy adult. It does not predict any real person\'s day.',
          'Heart rate moves between the resting value, the low end of the resting range during sleep, and the source\'s exercise value. Real transitions are gradual.',
          'Body water change is illustrative. Sweat and urine limits are sourced, but drinks, food water and the balance between them are simplified.',
          'The glucose curve uses illustrative rates, and temperature uses an illustrative daily swing inside the sourced range.',
          'Stress and sleep quality are not modelled.',
        ]}
      />
    </>
  )
}
