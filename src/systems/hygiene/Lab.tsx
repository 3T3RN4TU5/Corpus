import { useEffect, useState } from 'react'
import { factNumber, factRange, getFact } from '../../data/physiology'
import { Choice, Facts, Group, Limits, SERIES_COLORS } from '../labKit'

const FACT_IDS = ['handwash-scrub', 'hand-sanitizer-alcohol', 'hospital-hand-hygiene-effect', 'brushing-daily', 'flossing-daily', 'fluoride-water-effect', 'sleep-newborn', 'sleep-infant', 'sleep-school', 'sleep-teen', 'sleep-adult', 'sleep-older', 'urine-daily', 'sweat-rest', 'filtrate-reabsorbed', 'activity-weekly']

const EXCRETION = [
  { name: 'Sweat', removes: 'Mostly water, with some salt, antibodies and traces of metabolic waste.', role: 'Its main job is cooling the body, not clearing waste.', source: 'OpenStax A&P 2e, 5.2 Accessory Structures of the Skin', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/5-2-accessory-structures-of-the-skin' },
  { name: 'Urine', removes: 'Water, urea, salts, uric acid and creatinine.', role: 'The kidneys clear wastes from the blood and balance water and salts.', source: 'OpenStax A&P 2e, 25.6 Tubular Reabsorption', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/25-6-tubular-reabsorption' },
  { name: 'Feces', removes: 'Undigested food residue, water, and bacteria from the large intestine.', role: 'The gut removes what it did not absorb.', source: 'OpenStax A&P 2e, 23.5 The Small and Large Intestines', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/23-5-the-small-and-large-intestines' },
]

type ScenarioId = 'hands' | 'teeth' | 'sleep' | 'water'

const SCENARIOS: { id: ScenarioId; name: string }[] = [
  { id: 'hands', name: 'Handwashing' },
  { id: 'teeth', name: 'Teeth' },
  { id: 'sleep', name: 'Sleep' },
  { id: 'water', name: 'Hydration' },
]

function HandwashTimer() {
  const target = factNumber('handwash-scrub')
  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    if (left === null || left <= 0) return
    const timer = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(timer)
  }, [left])
  return (
    <div className="mt-2">
      <button type="button" className="control" onClick={() => setLeft(target)}>
        Start {target} second scrub timer
      </button>
      {left !== null && (
        <p role="timer" className="mt-1 font-mono text-[0.95rem]" style={{ color: left === 0 ? SERIES_COLORS.green : undefined }}>
          {left === 0 ? 'Done. Rinse and dry.' : `${left} s left. Backs of hands, between fingers, under nails.`}
        </p>
      )}
    </div>
  )
}

function Scenario({ id }: { id: ScenarioId }) {
  if (id === 'hands') {
    return (
      <>
        <ol className="mt-1 list-decimal pl-4 text-[0.92rem] leading-snug">
          <li>Wet hands with clean, running water, turn off the tap and apply soap.</li>
          <li>Lather the backs of your hands, between your fingers and under your nails.</li>
          <li>Scrub for at least {factNumber('handwash-scrub')} seconds.</li>
          <li>Rinse well under clean, running water.</li>
          <li>Dry with a clean towel or air dryer.</li>
        </ol>
        <HandwashTimer />
        <p className="mt-2 text-[0.88rem] leading-snug text-dust">
          The CDC says handwashing helps prevent the spread of respiratory and diarrheal infections. If soap and water are not available, it advises hand sanitizer with at least {factNumber('hand-sanitizer-alcohol')}% alcohol. In hospitals, WHO reports that hand hygiene programmes can prevent up to {factNumber('hospital-hand-hygiene-effect')}% of avoidable infections.
        </p>
        <Citation ids={['handwash-scrub', 'hospital-hand-hygiene-effect']} />
      </>
    )
  }
  if (id === 'teeth') {
    return (
      <>
        <p className="mt-1 text-[0.92rem] leading-snug">
          The CDC lists brushing {factNumber('brushing-daily')} times a day and flossing daily among ways to prevent oral disease. It also says drinking fluoridated water reduces cavities by about {factNumber('fluoride-water-effect')}%.
        </p>
        <Citation ids={['brushing-daily']} />
      </>
    )
  }
  if (id === 'sleep') {
    const rows = [
      ['0 to 3 months', 'sleep-newborn'],
      ['4 to 12 months', 'sleep-infant'],
      ['6 to 12 years', 'sleep-school'],
      ['13 to 17 years', 'sleep-teen'],
      ['18 to 60 years', 'sleep-adult'],
      ['65 years and older', 'sleep-older'],
    ]
    return (
      <>
        <table className="mt-1 w-full text-left text-[0.88rem]">
          <tbody>
            {rows.map(([age, factId]) => {
              const [low, high] = factRange(factId)
              return (
                <tr key={factId} className="border-t border-line">
                  <td className="py-1">{age}</td>
                  <td className="py-1 text-right font-mono text-[0.78rem]">{low === high ? `${low} or more hours` : `${low} to ${high} hours`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-1 text-[0.88rem] text-dust">The CDC also suggests turning off electronic devices at least 30 minutes before bedtime.</p>
        <Citation ids={['sleep-adult']} />
      </>
    )
  }
  return (
    <>
      <p className="mt-1 text-[0.92rem] leading-snug">
        The CDC gives no single daily water amount, because needs vary with age, sex, pregnancy, breastfeeding and activity. It says needs rise in hot climates, with more physical activity, and when someone has a fever, diarrhea or vomiting.
      </p>
      <p className="mt-1 text-[0.88rem] text-dust">
        <a href="https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html" target="_blank" rel="noreferrer">
          CDC: About Water and Healthier Drinks
        </a>
      </p>
    </>
  )
}

function Citation({ ids }: { ids: string[] }) {
  const sources = [...new Map(ids.map((id) => [getFact(id).source.url, getFact(id).source])).values()]
  return (
    <p className="mt-1 text-[0.82rem] text-dust">
      {sources.map((source, index) => (
        <span key={source.url}>
          {index > 0 && '; '}
          <a href={source.url} target="_blank" rel="noreferrer">
            {source.title}
          </a>
        </span>
      ))}
    </p>
  )
}

export default function HygieneLab() {
  const [scenario, setScenario] = useState<ScenarioId>('hands')
  return (
    <>
      <Group title="What the body removes, and how">
        <ul className="mt-1">
          {EXCRETION.map((item) => (
            <li key={item.name} className="border-t border-line py-1.5 text-[0.88rem] leading-snug">
              <span className="italic">{item.name}.</span> {item.removes} <span className="text-dust">{item.role}</span>{' '}
              <a className="text-[0.76rem] text-dust" href={item.url} target="_blank" rel="noreferrer">
                {item.source}
              </a>
            </li>
          ))}
        </ul>
      </Group>
      <Group title="Everyday guidance">
        <Choice label="Choose a topic" value={scenario} options={SCENARIOS} onChange={setScenario} />
        <Scenario id={scenario} />
      </Group>
      <Facts ids={FACT_IDS} />
      <Limits
        items={[
          'This summarises general public guidance. It is not personal medical or dental advice.',
          'It shows only effects that the cited sources state, and it does not calculate a personal benefit.',
          'WHO pages reviewed here do not state a handwashing duration, so the time shown comes from the CDC.',
        ]}
      />
    </>
  )
}
