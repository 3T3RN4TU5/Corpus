import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { modelManifest } from '../../data/models'
import { factNumber, factRange, formatFact, getFact } from '../../data/physiology'
import { bodyEffects } from '../../sim/bodyEffects'
import { useClock } from '../../sim/clock'
import { selectProfile, useBodyStore } from '../../store/useBodyStore'
import { SYSTEM_PLUGINS } from '..'
import { Caption, Choice, Facts, Group, Limits, SERIES_COLORS, Slider, Stat, TimelineChart } from '../labKit'
import { maxHeartRateText } from '../circulatory/model'
import { bmi, bodyScaleFor, boneDensityCurves, lifeStage, organReserve, restingEnergy, weeklyWeightChangeKg } from './model'

const FACT_IDS = ['pulse-newborn', 'pulse-infant', 'pulse-child-1-2', 'pulse-child-3-4', 'pulse-child-5-6', 'pulse-child-7-9', 'pulse-10-plus', 'breathing-rate-under-1', 'breathing-rate-age-10', 'breathing-rate-adolescent-adult', 'growth-plate-closure', 'bone-density-peak', 'bone-loss-female-onset', 'reserve-loss-aging', 'bmi-underweight-below', 'bmi-overweight-from', 'bmi-obesity-from', 'ree-weight-coefficient', 'ree-height-coefficient', 'ree-age-coefficient', 'ree-male-constant', 'ree-female-constant', 'kcal-per-pound', 'kcal-carbohydrate', 'kcal-protein', 'kcal-fat']

export default function BodyLab() {
  const sim = useBodyStore((state) => state.sim)
  const setSim = useBodyStore((state) => state.setSim)
  const profile = useBodyStore(useShallow(selectProfile))
  const [intake, setIntake] = useState(2000)
  const [activity, setActivity] = useState(300)

  const { ageYears: age, heightCm, weightKg, bodyFatPercent } = sim
  const stage = lifeStage(age)
  const bmiResult = bmi(weightKg, heightCm, age)
  const energy = restingEnergy(weightKg, heightCm, age, profile.referenceSex)
  const middleEnergy = (energy.low + energy.high) / 2
  const balance = intake - middleEnergy - activity
  const chart = useMemo(() => {
    const curves = boneDensityCurves(profile.referenceSex)
    const colors = [SERIES_COLORS.white, SERIES_COLORS.orange]
    return {
      x: curves[0].points.map((point) => point.age),
      series: curves.map((curve, index) => ({ label: curve.label, color: colors[index], values: curve.points.map((point) => point.density) })),
    }
  }, [profile.referenceSex])
  const adultFormula = age >= 19 && age <= 78

  useEffect(() => {
    useClock.getState().configure(600, 1)
    useClock.getState().setPlaying(false)
  }, [])

  useEffect(() => {
    const { uniform, soft } = bodyScaleFor(heightCm, modelManifest.bodies[profile.body].height, bmiResult.bmi, bodyFatPercent)
    bodyEffects.bodyScale = uniform
    bodyEffects.scale.set('skin', [soft, 1, soft])
    bodyEffects.scale.set('subcutaneous-fat', [soft, 1, soft])
    return () => {
      bodyEffects.bodyScale = 1
    }
  }, [heightCm, bmiResult.bmi, bodyFatPercent, profile.body])

  const pulse = getFact(stage.pulseFact)
  const sleepRange = stage.sleepFact ? factRange(stage.sleepFact) : null
  const sleepMessage = !sleepRange
    ? 'The CDC table used here gives no figure for this age.'
    : sim.sleepHours < sleepRange[0]
      ? `This is below the CDC's recommended ${sleepRange[0] === sleepRange[1] ? `${sleepRange[0]} or more` : sleepRange.join(' to ')} hours for this age.`
      : sleepRange[0] !== sleepRange[1] && sim.sleepHours > sleepRange[1]
        ? `This is above the CDC's recommended ${sleepRange.join(' to ')} hours for this age.`
        : "This is within the CDC's recommendation for this age."
  const wholeBody = SYSTEM_PLUGINS.map((plugin) => plugin.update(0, sim, {}))
  const combined = Object.assign({}, ...wholeBody) as Record<string, number>

  return (
    <>
      <Group title="Life stage">
        <Slider label="Age" unit="years" value={age} min={0} max={90} step={age < 2 ? 0.05 : 1} format={(value) => (value < 2 ? value.toFixed(2) : String(value))} onChange={(value) => setSim({ ageYears: value })} />
        <Caption>
          <span className="italic">{stage.name}.</span> {stage.note}
        </Caption>
        <dl className="grid grid-cols-2 gap-x-3">
          <Stat label="Resting heart rate" value={formatFact(pulse)} />
          <Stat label="Breathing rate" value={stage.breathingFact ? formatFact(getFact(stage.breathingFact)) : 'Not in the sources used'} />
          <Stat
            label="Recommended sleep"
            value={
              stage.sleepFact
                ? factRange(stage.sleepFact)[0] === factRange(stage.sleepFact)[1]
                  ? `${factRange(stage.sleepFact)[0]} or more h`
                  : `${factRange(stage.sleepFact).join(' to ')} h`
                : 'Not listed'
            }
          />
          <Stat label="Estimated maximum heart rate" value={maxHeartRateText(age)} />
          <Stat label="Organ reserve, on average" value={`${Math.round(organReserve(age) * 100)}%`} />
          <Stat label="Bones" value={age < 18 ? `More than ${factNumber('bones-adult-total')}, fusing with age` : `${factNumber('bones-adult-total')}`} />
        </dl>
        <TimelineChart x={chart.x} series={chart.series} height={120} yRange={[0, 1.05]} xLabel="age, years" marker={() => useBodyStore.getState().sim.ageYears} />
        {profile.referenceSex === null && <p className="text-[0.84rem] text-dust">The source describes faster bone loss in females only and gives nothing separate for this profile, so both curves are shown.</p>}
      </Group>

      <Group title="Body composition">
        <Slider label="Height" unit="cm" value={heightCm} min={45} max={210} step={1} onChange={(value) => setSim({ heightCm: value })} />
        <Slider label="Weight" unit="kg" value={weightKg} min={3} max={160} step={1} onChange={(value) => setSim({ weightKg: value })} />
        <Slider label="Body fat" unit="%" value={bodyFatPercent} min={5} max={55} step={1} onChange={(value) => setSim({ bodyFatPercent: value })} />
        <Choice
          label="Activity level"
          value={sim.activityLevel}
          options={[
            { id: 'sedentary', name: 'Sedentary' },
            { id: 'light', name: 'Light' },
            { id: 'moderate', name: 'Moderate' },
            { id: 'vigorous', name: 'Vigorous' },
          ]}
          onChange={(activityLevel) => setSim({ activityLevel })}
        />
        <Slider label="Sleep" unit="h/night" value={sim.sleepHours} min={0} max={14} step={0.5} onChange={(sleepHours) => setSim({ sleepHours })} />
        <p className="text-[0.84rem] leading-snug text-dust">{sleepMessage}</p>
        <dl className="grid grid-cols-2 gap-x-3">
          <Stat label="BMI (weight ÷ height²)" value={bmiResult.bmi.toFixed(1)} />
          <Stat label="CDC adult category" value={bmiResult.appliesToAge ? bmiResult.category : 'Applies from age 20'} />
        </dl>
        <p className="text-[0.84rem] leading-snug text-dust">
          BMI's limits: the CDC notes that it does not directly measure body fat, does not separate fat from muscle and bone, and does not show where fat is carried. For a person, it should be considered with other factors.{' '}
          <a href="https://www.cdc.gov/bmi/about/index.html" target="_blank" rel="noreferrer">
            CDC: About BMI
          </a>
        </p>
      </Group>

      <Group title="Across the body, with these settings">
        <dl className="grid grid-cols-2 gap-x-3">
          <Stat label="Heart rate" value={`${Math.round(combined.heartRate)} bpm`} />
          <Stat label="Cardiac output" value={`${combined.cardiacOutput.toFixed(1)} L/min`} />
          <Stat label="Breathing rate" value={`${Math.round(combined.breathingRate)} per min`} />
          <Stat label="Sweat at 22 °C" value={`${combined.sweatLitresPerHour.toFixed(2)} L/h`} />
          <Stat label="Urine at this hydration" value={`${combined.urineLitresPerDay.toFixed(1)} L/day`} />
        </dl>
        <p className="text-[0.84rem] leading-snug text-dust">These come from each system's model, using adult values. The simulation panels start from your activity level and hydration.</p>
      </Group>

      <Group title="Energy balance">
        <p className="mt-1 font-mono text-[0.7rem] leading-snug text-dust">
          Resting energy (Mifflin-St Jeor) = 10 × kg + 6.25 × cm − 5 × age + 5 (male) or − 161 (female)
        </p>
        <Slider label="Food energy" unit="kcal/day" value={intake} min={800} max={4500} step={50} onChange={setIntake} />
        <Slider label="Activity energy" unit="kcal/day" value={activity} min={0} max={1500} step={25} onChange={setActivity} />
        <dl className="grid grid-cols-2 gap-x-3">
          <Stat label="Resting energy" value={energy.low === energy.high ? `${Math.round(energy.low)} kcal/day` : `${Math.round(energy.low)} to ${Math.round(energy.high)} kcal/day`} />
          <Stat label="Daily balance" value={`${balance >= 0 ? '+' : ''}${Math.round(balance)} kcal`} tone={SERIES_COLORS.yellow} />
          <Stat label="Rule-of-thumb weight change" value={`${weeklyWeightChangeKg(balance).toFixed(2)} kg/week`} />
        </dl>
        {energy.low !== energy.high && <p className="text-[0.84rem] text-dust">The equation has constants for males and females only, so this profile shows both results, and the balance uses the middle.</p>}
        {!adultFormula && <p className="text-[0.84rem] text-dust">The equation was developed in healthy adults aged 19 to 78, so treat this result as out of range for this age.</p>}
      </Group>

      <Facts ids={FACT_IDS} />
      <Limits
        items={[
          'The 3D model is always an adult body. Age changes the numbers shown, but it does not change the skeleton or body proportions, because no open child or older-adult models were used. Height only scales the whole model.',
          'Weight and body fat widen the skin and fat layers by an illustrative amount. Fat is not placed where real bodies store it, and body fat changes no numbers. Stress is not modelled, because the sources used give no usable figures.',
          'The bone density curve is illustrative apart from the two sourced ages. The female profile shows the curve with faster loss, the male profile shows the curve without it, and other profiles show both.',
          'The 3500 kcal rule is a rough rule of thumb. Real weight change slows as the body adapts.',
          'This is educational. It should not guide diet, weight goals or treatment, especially for children or during pregnancy.',
        ]}
      />
    </>
  )
}
