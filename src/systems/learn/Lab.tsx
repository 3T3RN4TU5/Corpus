import { useEffect, useMemo, useState } from 'react'
import { useClock } from '../../sim/clock'
import { useBodyStore } from '../../store/useBodyStore'
import { getPlugin } from '..'
import { Group, SERIES_COLORS } from '../labKit'
import { LESSONS, loadProgress, saveScore, type Lesson, type Progress } from './lessons'

/** Shuffles answer order so the correct answer is not always in the same place. Fixed per question for this session. */
function shuffled(count: number, seed: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i)
  let value = seed + 7
  for (let i = order.length - 1; i > 0; i--) {
    value = (value * 9301 + 49297) % 233280
    const j = Math.floor((value / 233280) * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

function Quiz({ lesson, onFinish }: { lesson: Lesson; onFinish: (score: number) => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const orders = useMemo(() => lesson.quiz.map((item, index) => shuffled(item.options.length, index + lesson.id.length * 3)), [lesson])
  const answeredAll = Object.keys(answers).length === lesson.quiz.length
  const score = lesson.quiz.filter((item, index) => answers[index] === item.answer).length

  useEffect(() => {
    if (answeredAll) onFinish(score)
    // Reports once, when the last question is answered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answeredAll])

  return (
    <div>
      {lesson.quiz.map((item, index) => {
        const chosen = answers[index]
        return (
          <fieldset key={item.question} className="border-t border-line py-2">
            <legend className="text-[0.95rem] leading-snug">{item.question}</legend>
            <div className="mt-1 flex flex-col gap-1">
              {orders[index].map((optionIndex) => (
                <label key={optionIndex} className="flex cursor-pointer items-start gap-2 text-[0.9rem] leading-snug">
                  <input type="radio" name={`${lesson.id}-${index}`} className="mt-0.5" disabled={chosen !== undefined} checked={chosen === optionIndex} onChange={() => setAnswers({ ...answers, [index]: optionIndex })} />
                  {item.options[optionIndex]}
                </label>
              ))}
            </div>
            {chosen !== undefined && (
              <p className="mt-1 text-[0.86rem] leading-snug" style={{ color: chosen === item.answer ? SERIES_COLORS.green : SERIES_COLORS.orange }}>
                {chosen === item.answer ? 'Correct.' : 'Not quite.'} <span className="text-dust">{item.why}</span>
              </p>
            )}
          </fieldset>
        )
      })}
      {answeredAll && (
        <p role="status" className="border-t border-line pt-2 font-mono text-[0.86rem]">
          Score: {score} of {lesson.quiz.length}
        </p>
      )}
    </div>
  )
}

export default function LearnLab() {
  const [progress, setProgress] = useState<Progress>(loadProgress)
  const [lessonId, setLessonId] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const setOpenSystem = useBodyStore((state) => state.setOpenSystem)
  const lesson = LESSONS.find((item) => item.id === lessonId)
  const completed = Object.keys(progress).length

  useEffect(() => {
    useClock.getState().configure(600, 1)
    useClock.getState().setPlaying(false)
  }, [])

  if (!lesson) {
    return (
      <Group title={`Lessons (${completed} of ${LESSONS.length} tried)`}>
        <ul className="mt-1">
          {LESSONS.map((item) => {
            const record = progress[item.id]
            return (
              <li key={item.id} className="border-t border-line">
                <button type="button" className="flex w-full cursor-pointer items-baseline justify-between gap-2 py-2 text-left hover:text-rust" onClick={() => setLessonId(item.id)}>
                  <span>{item.title}</span>
                  <span className="whitespace-nowrap font-mono text-[0.72rem] text-dust">{record ? `Best ${record.best}/${record.total}` : 'New'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </Group>
    )
  }

  const plugin = getPlugin(lesson.system)

  return (
    <>
      <button type="button" className="control mt-2" onClick={() => setLessonId(null)}>
        ← All lessons
      </button>
      <h3 className="mt-2 font-display text-2xl italic">{lesson.title}</h3>
      <ul className="mt-1 list-disc pl-4 text-[0.95rem] leading-snug">
        {lesson.points.map((point) => (
          <li key={point} className="py-0.5">
            {point}
          </li>
        ))}
      </ul>
      {plugin && (
        <button type="button" className="control mt-2" onClick={() => setOpenSystem(plugin.id, plugin.layers)}>
          Open the {plugin.name.toLowerCase()} simulation
        </button>
      )}
      <Group title="Quiz">
        <Quiz key={attempt} lesson={lesson} onFinish={(score) => setProgress(saveScore(progress, lesson.id, score, lesson.quiz.length))} />
        <button type="button" className="control mt-2" onClick={() => setAttempt(attempt + 1)}>
          Try again
        </button>
      </Group>
    </>
  )
}
