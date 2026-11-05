import { useEffect, useRef, type ReactNode } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { formatFact, getFact } from '../data/physiology'
import { SPEEDS, useClock } from '../sim/clock'

/** Colours chosen to stay distinct with common colour vision differences. */
export const SERIES_COLORS = { orange: '#ff8a3d', blue: '#5aa7ff', green: '#54d6a0', yellow: '#f0d24b', pink: '#ff7eb6', white: '#ece4d2' }

export function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (value: number) => void
  format?: (value: number) => string
}) {
  const { label, value, min, max, step, unit, onChange, format } = props
  return (
    <label className="block py-1">
      <span className="flex justify-between gap-2 text-[0.92rem] leading-tight">
        <span>{label}</span>
        <span className="whitespace-nowrap font-mono text-[0.74rem] text-dust">
          {format ? format(value) : value} {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border-t border-line py-1.5">
      <dt className="text-[0.82rem] leading-tight text-dust">{label}</dt>
      <dd className="font-mono text-[0.95rem]" style={tone ? { color: tone } : undefined}>
        {value}
      </dd>
    </div>
  )
}

/** Sourced values shown beside a simulation, each linked to its reference. */
export function Facts({ ids, title = 'Sourced values' }: { ids: string[]; title?: string }) {
  return (
    <details className="mt-3 border-t border-line pt-2">
      <summary className="eyebrow cursor-pointer">{title}</summary>
      <ul className="mt-1">
        {ids.map((id) => {
          const fact = getFact(id)
          return (
            <li key={id} className="border-t border-line py-1.5 text-[0.84rem] leading-snug">
              <span className="text-dust">
                {fact.label}
                {fact.sex !== 'all' && `, ${fact.sex}`}:{' '}
              </span>
              <span className="font-mono text-[0.78rem]">{formatFact(fact)}</span>{' '}
              <a className="text-[0.74rem] text-dust" href={fact.source.url} target="_blank" rel="noreferrer">
                {fact.source.title}
              </a>
              {fact.note && <span className="block text-[0.76rem] text-dust">{fact.note}</span>}
            </li>
          )
        })}
      </ul>
    </details>
  )
}

export function Limits({ items }: { items: string[] }) {
  return (
    <details className="mt-3 border-t border-line pt-2">
      <summary className="eyebrow cursor-pointer">What this simplifies</summary>
      <ul className="mt-1 list-disc pl-4 text-[0.84rem] leading-snug text-dust">
        {items.map((item) => (
          <li key={item} className="py-0.5">
            {item}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** A short text description of the current animation, for people who can't see it or prefer not to. */
export function Caption({ children }: { children: ReactNode }) {
  return (
    <p role="status" aria-live="polite" className="mt-2 border-l-2 border-rust pl-2 text-[0.9rem] leading-snug">
      {children}
    </p>
  )
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </section>
  )
}

export function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; name: string }[]; onChange: (id: T) => void }) {
  return (
    <div className="py-1">
      <p className="mb-1 text-[0.92rem] leading-tight">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button key={option.id} type="button" role="radio" aria-checked={value === option.id} className="control" onClick={() => onChange(option.id)}>
            {option.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 120) return `${seconds.toFixed(1)} s`
  if (seconds < 7200) return `${(seconds / 60).toFixed(1)} min`
  return `${(seconds / 3600).toFixed(1)} h`
}

export function TimeControls() {
  const playing = useClock((state) => state.playing)
  const speed = useClock((state) => state.speed)
  const time = useClock((state) => state.time)
  const duration = useClock((state) => state.duration)
  const setPlaying = useClock((state) => state.setPlaying)
  const setSpeed = useClock((state) => state.setSpeed)
  const setTime = useClock((state) => state.setTime)

  return (
    <div className="border-y border-line py-2">
      <div className="flex items-center gap-2">
        <button type="button" className="control" aria-pressed={playing} onClick={() => setPlaying(!playing)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <label className="flex items-center gap-1 font-mono text-[0.72rem] text-dust">
          Speed
          <select className="control" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            {SPEEDS.map((item) => (
              <option key={item} value={item} className="bg-ink">
                {item}×
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto font-mono text-[0.72rem] text-dust">
          {formatDuration(time)} / {formatDuration(duration)}
        </span>
      </div>
      <input type="range" aria-label="Scrub timeline" min={0} max={duration} step={duration / 1000} value={time} onChange={(event) => setTime(Number(event.target.value))} />
    </div>
  )
}

const CHART_AXIS = { stroke: '#a69c88', grid: { stroke: '#3a342d', width: 1 }, ticks: { stroke: '#3a342d' }, font: '10px "IBM Plex Mono"' }

export interface ChartSeries {
  label: string
  color: string
}

interface LiveChartProps {
  series: ChartSeries[]
  /** Called on every animation frame. Returns [x, ...y] to add a point, or null to skip. */
  sample: () => number[] | null
  windowLength: number
  height?: number
  yRange?: [number, number]
  xLabel?: string
}

/** A chart that scrolls as a simulation runs. */
export function LiveChart({ series, sample, windowLength, height = 120, yRange, xLabel }: LiveChartProps) {
  const host = useRef<HTMLDivElement>(null)
  const latestSample = useRef(sample)
  latestSample.current = sample

  useEffect(() => {
    const element = host.current
    if (!element) return
    const data: number[][] = [[], ...series.map(() => [])]
    const chart = new uPlot(
      {
        width: element.clientWidth || 300,
        height,
        legend: { show: true, live: false },
        cursor: { show: false },
        scales: { x: { time: false }, y: yRange ? { range: yRange } : {} },
        axes: [{ ...CHART_AXIS, label: xLabel, labelSize: xLabel ? 14 : 0, labelFont: '10px "IBM Plex Mono"' }, { ...CHART_AXIS, size: 40 }],
        series: [{}, ...series.map((item) => ({ label: item.label, stroke: item.color, width: 1.5, points: { show: false } }))],
      },
      data as uPlot.AlignedData,
      element,
    )
    const resize = new ResizeObserver(() => chart.setSize({ width: element.clientWidth || 300, height }))
    resize.observe(element)

    let frame = 0
    let last = 0
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      const point = latestSample.current()
      if (point) {
        point.forEach((value, index) => data[index].push(value))
        const start = point[0] - windowLength
        while (data[0].length > 2 && (data[0][0] < start || data[0][0] > point[0])) data.forEach((column) => column.shift())
      }
      // Redrawing at 30 frames per second is smooth enough and leaves time for the 3D scene.
      if (now - last > 33 && data[0].length > 1) {
        last = now
        chart.setData(data as uPlot.AlignedData)
      }
    }
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      chart.destroy()
    }
    // The range is compared by value, so an inline array doesn't rebuild the chart and lose its history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, windowLength, height, yRange?.[0], yRange?.[1], xLabel])

  return <div ref={host} role="img" aria-label={`Live chart of ${series.map((item) => item.label).join(', ')}`} className="chart mt-1 w-full" />
}

/** A chart of a finished calculation, such as a day-long timeline. */
export function TimelineChart({ x, series, height = 150, yRange, xLabel, marker }: { x: number[]; series: (ChartSeries & { values: number[] })[]; height?: number; yRange?: [number, number]; xLabel?: string; marker?: () => number }) {
  const host = useRef<HTMLDivElement>(null)
  const markerRef = useRef(marker)
  markerRef.current = marker

  useEffect(() => {
    const element = host.current
    if (!element) return
    const chart = new uPlot(
      {
        width: element.clientWidth || 300,
        height,
        legend: { show: true, live: false },
        cursor: { show: false },
        scales: { x: { time: false }, y: yRange ? { range: yRange } : {} },
        axes: [{ ...CHART_AXIS, label: xLabel, labelSize: xLabel ? 14 : 0, labelFont: '10px "IBM Plex Mono"' }, { ...CHART_AXIS, size: 44 }],
        series: [{}, ...series.map((item) => ({ label: item.label, stroke: item.color, width: 1.5, points: { show: false } }))],
        hooks: {
          draw: [
            (u) => {
              const at = markerRef.current?.()
              if (at === undefined) return
              const px = u.valToPos(at, 'x', true)
              const ctx = u.ctx
              ctx.save()
              ctx.strokeStyle = '#ff6a3d'
              ctx.lineWidth = 1
              ctx.beginPath()
              ctx.moveTo(px, u.bbox.top)
              ctx.lineTo(px, u.bbox.top + u.bbox.height)
              ctx.stroke()
              ctx.restore()
            },
          ],
        },
      },
      [x, ...series.map((item) => item.values)] as uPlot.AlignedData,
      element,
    )
    const resize = new ResizeObserver(() => chart.setSize({ width: element.clientWidth || 300, height }))
    resize.observe(element)
    let frame = 0
    let last = 0
    if (markerRef.current) {
      const loop = (now: number) => {
        frame = requestAnimationFrame(loop)
        if (now - last > 100) {
          last = now
          chart.redraw(false, true)
        }
      }
      frame = requestAnimationFrame(loop)
    }
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      chart.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, series, height, yRange?.[0], yRange?.[1], xLabel])

  return <div ref={host} role="img" aria-label={`Chart of ${series.map((item) => item.label).join(', ')}`} className="chart mt-1 w-full" />
}

/** Runs a callback on every animation frame while mounted. */
export function useAnimationFrame(callback: (seconds: number) => void) {
  const latest = useRef(callback)
  latest.current = callback
  useEffect(() => {
    let frame = 0
    let previous = performance.now()
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      latest.current((now - previous) / 1000)
      previous = now
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])
}
