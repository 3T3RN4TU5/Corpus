import { useEffect, useMemo, useRef, useState } from 'react'
import { factNumber } from '../../data/physiology'
import { useClock } from '../../sim/clock'
import { computeMealCurves } from '../../sim/useWorker'
import { Caption, Choice, Facts, Group, Limits, SERIES_COLORS, Slider, Stat, TimelineChart, useAnimationFrame } from '../labKit'
import { digestiveLive } from './live'
import { absorbedAt, fatShare, mealEnergy, mealTimeline, MEALS, stageAt, totalDuration, type Meal, type Stage, type TimelineCurves } from './model'

const FACT_IDS = ['swallow-solid', 'swallow-liquid', 'esophagus-length', 'saliva-daily', 'stomach-emptying', 'stomach-emptying-fatty', 'full-digestion', 'stomach-ph', 'stomach-mixing-wave', 'stomach-capacity', 'small-intestine-length', 'small-intestine-transit', 'small-intestine-area', 'villus-length', 'large-intestine-transit', 'bile-daily', 'protein-absorbed', 'lipid-absorbed', 'water-absorbed-si', 'kcal-carbohydrate', 'kcal-protein', 'kcal-fat']

function duration(seconds: number): string {
  if (seconds < 120) return `${Math.round(seconds)} s`
  return `${(seconds / 3600).toFixed(1)} h`
}

const villi = [40, 90, 140, 190]

/** A zoomed view of intestinal villi, with absorbed nutrients moving into the blood and lymph. */
function VilliDiagram({ active }: { active: boolean }) {
  const svg = useRef<SVGSVGElement>(null)

  const dots = useMemo(() => Array.from({ length: 20 }, (_, i) => ({ id: i, villus: villi[i % 4], phase: (i * 0.173) % 1, offset: ((i * 7) % 11) - 5, color: [SERIES_COLORS.yellow, SERIES_COLORS.pink, SERIES_COLORS.green][i % 3] })), [])

  useAnimationFrame(() => {
    const element = svg.current
    if (!element) return
    const t0 = useClock.getState().time / 1000
    element.querySelectorAll<SVGCircleElement>('[data-dot]').forEach((dot) => {
      const t = (t0 + Number(dot.dataset.phase)) % 1
      dot.setAttribute('cy', (20 + t * 112).toFixed(1))
      dot.setAttribute('opacity', active ? '1' : '0.15')
    })
  })

  return (
    <svg ref={svg} viewBox="0 0 230 160" className="mt-2 w-full" role="img" aria-label="Diagram of finger-like villi. Nutrients move from the intestine's interior through the villi toward blood and lymph vessels below.">
      {villi.map((x) => (
        <path key={x} d={`M${x - 20} 125 L${x - 13} 30 Q${x} 8 ${x + 13} 30 L${x + 20} 125 Z`} fill="#7a3a3a" stroke="#d49a8a" />
      ))}
      <rect x="10" y="125" width="210" height="10" fill="#c8402f" opacity="0.7" />
      <rect x="10" y="137" width="210" height="6" fill="#54d6a0" opacity="0.6" />
      {dots.map((dot) => (
        <circle key={dot.id} data-dot data-phase={dot.phase} cx={dot.villus + dot.offset} cy="20" r="2.4" fill={dot.color} />
      ))}
      <g fontFamily="IBM Plex Mono, monospace" fontSize="8" fill="#59616a">
        <text x="12" y="155">Blood vessels (red) and lymph (green) carry nutrients away</text>
      </g>
    </svg>
  )
}

export default function DigestiveLab() {
  const [meal, setMeal] = useState<Meal>(MEALS[0].meal)
  const [mealId, setMealId] = useState('balanced')
  const [curves, setCurves] = useState<TimelineCurves | null>(null)
  const stages = useMemo(() => mealTimeline(meal), [meal])
  const [stage, setStage] = useState<Stage>(stages[0])
  const [snapshot, setSnapshot] = useState(() => absorbedAt(stages, meal, 0))
  const lastUpdate = useRef(0)

  useEffect(() => {
    digestiveLive.stages = stages
    useClock.getState().configure(totalDuration(stages), 300)
    let current = true
    computeMealCurves(meal).then((result) => {
      if (current) setCurves(result)
    })
    return () => {
      current = false
    }
  }, [stages, meal])

  useAnimationFrame(() => {
    const { time } = useClock.getState()
    const next = stageAt(stages, time)
    setStage((current) => (current.id === next.id ? current : next))
    const now = performance.now()
    if (now - lastUpdate.current > 200) {
      lastUpdate.current = now
      setSnapshot(absorbedAt(stages, meal, time))
    }
  })

  const choose = (id: string) => {
    setMealId(id)
    setMeal((MEALS.find((item) => item.id === id) as (typeof MEALS)[number]).meal)
  }
  const edit = (patch: Partial<Meal>) => {
    setMealId('')
    setMeal({ ...meal, ...patch })
  }

  const chartSeries = useMemo(
    () =>
      curves
        ? [
            { label: 'Carbohydrate, g', color: SERIES_COLORS.yellow, values: curves.carbohydrate },
            { label: 'Protein, g', color: SERIES_COLORS.pink, values: curves.protein },
            { label: 'Fat, g', color: SERIES_COLORS.green, values: curves.fat },
          ]
        : [],
    [curves],
  )

  return (
    <>
      <Caption>
        <strong className="font-normal italic">{stage.name}.</strong> {stage.note}
      </Caption>

      <ol className="mt-2 flex gap-0.5" aria-label="Stages of digestion">
        {stages.map((item) => (
          <li key={item.id} aria-current={item.id === stage.id} className={`flex-1 border-t-2 pt-1 font-mono text-[0.62rem] leading-tight ${item.id === stage.id ? 'border-rust text-bone' : 'border-line text-dust'}`}>
            {item.name}
            <span className="block">{duration(item.end - item.start)}</span>
          </li>
        ))}
      </ol>

      <Choice label="Meal" value={mealId} options={MEALS.map(({ id, name }) => ({ id, name }))} onChange={choose} />
      <Slider label="Carbohydrate" unit="g" value={meal.carbohydrate} min={0} max={150} step={5} onChange={(carbohydrate) => edit({ carbohydrate })} />
      <Slider label="Protein" unit="g" value={meal.protein} min={0} max={100} step={5} onChange={(protein) => edit({ protein })} />
      <Slider label="Fat" unit="g" value={meal.fat} min={1} max={80} step={1} onChange={(fat) => edit({ fat })} />

      <dl className="grid grid-cols-2 gap-x-3">
        <Stat label="Meal energy" value={`${Math.round(mealEnergy(meal))} kcal`} />
        <Stat label="Energy from fat" value={`${Math.round(fatShare(meal) * 100)}%`} />
        <Stat label="Time in this stage (source)" value={stage.rangeLabel} />
        <Stat label="Whole-meal timeline" value={duration(totalDuration(stages))} />
        <Stat label="Energy absorbed so far" value={`${Math.round(snapshot.energyShare * 100)}%`} tone={SERIES_COLORS.yellow} />
        <Stat label="Stomach acidity" value={`pH ${factNumber('stomach-ph')} (mid-range)`} />
      </dl>

      <Group title="Enzymes at work here">
        {stage.enzymes.length ? (
          <ul className="mt-1 flex flex-wrap gap-1">
            {stage.enzymes.map((enzyme) => (
              <li key={enzyme} className="tag">
                {enzyme}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.88rem] text-dust">None of the digestive enzymes listed in the source act here.</p>
        )}
      </Group>

      <Group title="Nutrients absorbed">
        {curves && <TimelineChart x={curves.hours} series={chartSeries} height={150} xLabel="hours after eating" marker={() => useClock.getState().time / 3600} />}
      </Group>

      <Group title="Zoom: villi in the small intestine">
        <VilliDiagram active={stage.id === 'small'} />
      </Group>

      <Facts ids={FACT_IDS} />
      <Limits
        items={[
          'Each stage uses the middle of its sourced range. Real times vary widely between people and meals.',
          'The source says fatty food can stay in the stomach for 6 hours or longer. Scaling stomach time smoothly with fat content is illustrative.',
          'Absorption follows an illustrative curve through the small intestine. Sources give the final shares for protein and fat, and carbohydrate is treated like protein.',
          'The whole meal moves as one marker, though real meals spread out and mix with earlier ones.',
          'The energy values are general factors, which can overestimate available energy in high-fibre diets.',
          'The chewing time is an illustrative value.',
        ]}
      />
    </>
  )
}
