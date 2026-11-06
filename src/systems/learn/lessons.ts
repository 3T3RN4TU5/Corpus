import { factNumber, factRange } from '../../data/physiology'

export interface QuizQuestion {
  question: string
  options: string[]
  answer: number
  why: string
}

export interface Lesson {
  id: string
  system: string
  title: string
  points: string[]
  quiz: QuizQuestion[]
}

/** Quiz facts and numbers come from physiology.json, so they always match the rest of the app. */
export const LESSONS: Lesson[] = [
  {
    id: 'circulatory',
    system: 'circulatory',
    title: 'The heart and blood flow',
    points: [
      `The heart has ${factNumber('heart-chambers')} chambers and ${factNumber('heart-valves')} valves that keep blood moving one way.`,
      'Oxygen-poor blood goes to the lungs, and oxygen-rich blood goes to the body.',
      'Cardiac output is heart rate multiplied by stroke volume.',
      `Normal adult blood pressure is given as ${factNumber('bp-systolic')}/${factNumber('bp-diastolic')} mm Hg.`,
    ],
    quiz: [
      { question: 'What does cardiac output measure?', options: ['Blood pumped per minute', 'Pressure in the aorta', 'Number of heartbeats in a day'], answer: 0, why: 'It is heart rate multiplied by stroke volume, usually in litres per minute.' },
      { question: 'What happens to a vessel\'s resistance if its radius is halved?', options: ['It doubles', 'It rises 4 times', 'It rises 16 times'], answer: 2, why: 'Resistance rises with the inverse fourth power of radius, and 2 to the fourth power is 16.' },
      { question: 'When are the aortic and pulmonary valves open?', options: ['During ventricular systole', 'During atrial systole', 'During diastole'], answer: 0, why: 'They open during ventricular systole, once pressure in the contracting ventricles rises high enough to eject blood.' },
    ],
  },
  {
    id: 'respiratory',
    system: 'respiratory',
    title: 'Breathing and gas exchange',
    points: [
      'The diaphragm contracts and moves down, and the external intercostals lift the ribs, which draws air in.',
      'At rest, breathing out is passive, as the lungs recoil.',
      `Tidal volume, one normal breath, is about ${factNumber('tidal-volume')} mL.`,
      'Oxygen and carbon dioxide cross the alveolar wall by simple diffusion.',
    ],
    quiz: [
      { question: 'What mainly drives the rate of breathing?', options: ['Carbon dioxide in the blood', 'Oxygen in the blood', 'Body temperature only'], answer: 0, why: 'The source says the main driver is carbon dioxide concentration, not oxygen.' },
      { question: `What is a typical resting breathing rate for an adult, in breaths per minute?`, options: [`${factRange('breathing-rate-adolescent-adult').join(' to ')}`, '30 to 60', '60 to 100'], answer: 0, why: 'The higher range of 30 to 60 applies to infants under 1 year.' },
      { question: 'How do gases cross the alveolar wall?', options: ['Simple diffusion', 'Active pumping', 'Through open pores in blood cells'], answer: 0, why: 'Each gas moves from higher to lower partial pressure, without using energy.' },
    ],
  },
  {
    id: 'digestive',
    system: 'digestive',
    title: 'From food to nutrients',
    points: [
      'Peristalsis, a wave of muscle contraction, moves food down the esophagus.',
      `The stomach usually empties in ${factRange('stomach-emptying').join(' to ')} hours, and fatty food can take longer.`,
      'Most digestion and absorption happen in the small intestine.',
      'The large intestine absorbs water and forms feces.',
    ],
    quiz: [
      { question: 'Where are most nutrients absorbed?', options: ['Small intestine', 'Stomach', 'Large intestine'], answer: 0, why: 'Villi give the small intestine a very large surface area for absorption.' },
      { question: 'What does bile do?', options: ['Breaks fat into small droplets', 'Digests protein', 'Absorbs water'], answer: 0, why: 'Bile has no enzymes. It emulsifies fats, which helps lipase act on them.' },
      { question: 'Which macronutrient has the most energy per gram?', options: ['Fat', 'Protein', 'Carbohydrate'], answer: 0, why: `Fat has ${factNumber('kcal-fat')} kcal per gram, and the other two have ${factNumber('kcal-protein')}.` },
    ],
  },
  {
    id: 'nervous',
    system: 'nervous',
    title: 'Neurons and reflexes',
    points: [
      `A neuron rests at about ${factNumber('resting-membrane')} mV, and it fires when it reaches about ${factNumber('ap-threshold')} mV.`,
      'Neurotransmitters carry the signal across a synapse.',
      'A reflex can act through the spinal cord without a decision from the brain.',
      `There are ${factNumber('cranial-nerves')} cranial nerves and ${factNumber('spinal-nerves')} spinal nerves.`,
    ],
    quiz: [
      { question: 'What causes the rising phase of an action potential?', options: ['Sodium entering the cell', 'Potassium entering the cell', 'Calcium leaving the cell'], answer: 0, why: 'Voltage-gated sodium channels open and sodium rushes in.' },
      { question: 'Which lobe is responsible for primary vision?', options: ['Occipital', 'Frontal', 'Temporal'], answer: 0, why: 'The temporal lobe handles primary hearing, and the frontal lobe is linked to motor function.' },
      { question: 'What receptor starts the knee-jerk reflex?', options: ['Muscle spindle', 'Taste bud', 'Photoreceptor'], answer: 0, why: 'Stretching the quadriceps activates a muscle spindle receptor.' },
    ],
  },
  {
    id: 'musculoskeletal',
    system: 'musculoskeletal',
    title: 'Bones, joints and muscles',
    points: [
      `An adult skeleton has ${factNumber('bones-adult-total')} bones.`,
      'There are six types of synovial joint. Ball-and-socket joints have the greatest range of motion.',
      'Muscles shorten as actin and myosin filaments slide past each other.',
      'ATP releases myosin from actin and powers its next stroke.',
    ],
    quiz: [
      { question: 'Which joints are ball-and-socket joints?', options: ['Hip and shoulder', 'Knee and elbow', 'Wrist and ankle'], answer: 0, why: 'The source says these are the only two ball-and-socket joints in the body.' },
      { question: 'What does calcium do in muscle contraction?', options: ['Binds to troponin and exposes actin sites', 'Powers the myosin head directly', 'Breaks down the sarcomere'], answer: 0, why: 'Tropomyosin then moves away, so myosin can bind.' },
      { question: 'What forms first after a bone breaks?', options: ['A hematoma', 'Compact bone', 'Trabecular bone'], answer: 0, why: `A fracture hematoma forms within about ${factRange('fracture-hematoma').join(' to ')} hours.` },
    ],
  },
  {
    id: 'urinary',
    system: 'urinary',
    title: 'Kidneys and urine',
    points: [
      'Nephrons filter blood, then reabsorb what the body needs and secrete some wastes.',
      `About ${factNumber('filtrate-reabsorbed')} percent of filtrate returns to the blood.`,
      `Normal urine output is ${factRange('urine-daily').join(' to ')} litres a day.`,
    ],
    quiz: [
      { question: 'Where is most water reabsorbed?', options: ['Proximal tubule', 'Bladder', 'Ureter'], answer: 0, why: `About ${factNumber('reabsorb-pct-water')} percent returns in the proximal tubule.` },
      { question: 'At what bladder volume is an urge to void first sensed?', options: [`About ${factNumber('bladder-urge')} mL`, 'About 5 mL', 'About 2000 mL'], answer: 0, why: 'The urge can be overridden at first.' },
    ],
  },
  {
    id: 'endocrine',
    system: 'endocrine',
    title: 'Hormones and blood glucose',
    points: ['Raised blood glucose brings insulin, which helps cells take up glucose.', 'Low blood glucose brings glucagon, which releases glucose from the liver.', 'This is negative feedback, which keeps glucose near a stable level.'],
    quiz: [
      { question: 'Which hormone lowers blood glucose?', options: ['Insulin', 'Glucagon', 'Oxytocin'], answer: 0, why: 'Insulin helps muscle and fat cells take up glucose.' },
      { question: `What is a normal fasting glucose, in mg/dL?`, options: [`${factRange('glucose-fasting').join(' to ')}`, `${factNumber('glucose-diabetes-fasting')} or more`, 'Below 40'], answer: 0, why: `${factNumber('glucose-diabetes-fasting')} mg/dL or higher usually means diabetes.` },
    ],
  },
  {
    id: 'immune',
    system: 'immune',
    title: 'Immune defences',
    points: ['Neutrophils follow chemical signals to infected tissue, and engulf pathogens by phagocytosis.', `Lymph drains fluid from tissues through about ${factRange('lymph-nodes').join(' to ')} lymph nodes.`],
    quiz: [
      { question: 'Which white blood cells are the most common?', options: ['Neutrophils', 'Basophils', 'Eosinophils'], answer: 0, why: `Neutrophils are ${factRange('neutrophil-share').join(' to ')} percent of the total.` },
      { question: 'What is phagocytosis?', options: ['A cell engulfing a particle', 'A cell dividing', 'A hormone signal'], answer: 0, why: 'The pathogen is enclosed and digested using enzymes.' },
    ],
  },
  {
    id: 'skin',
    system: 'skin',
    title: 'Skin and temperature',
    points: ['Skin has two main layers, the epidermis and the dermis, with the hypodermis beneath.', 'When hot, skin vessels widen and sweat evaporates. When cold, skin vessels narrow.'],
    quiz: [
      { question: 'How does a resting body lose most of its heat?', options: ['Radiation', 'Conduction', 'Breathing out'], answer: 0, why: `Radiation accounts for about ${factNumber('heat-loss-radiation')} percent.` },
      { question: 'What happens to skin blood vessels in the cold?', options: ['They narrow', 'They widen', 'They stay the same'], answer: 0, why: 'This keeps warm blood closer to the core.' },
    ],
  },
  {
    id: 'hygiene',
    system: 'hygiene',
    title: 'Everyday health guidance',
    points: [`The CDC advises scrubbing hands for at least ${factNumber('handwash-scrub')} seconds.`, `The CDC recommends at least ${factNumber('sleep-adult')} hours of sleep for adults aged 18 to 60.`, 'The CDC lists brushing twice daily and flossing daily to prevent oral disease.'],
    quiz: [
      { question: 'What is the CDC\'s minimum hand scrub time?', options: [`${factNumber('handwash-scrub')} seconds`, '5 seconds', '2 minutes'], answer: 0, why: 'Humming "Happy Birthday" twice takes about the same time.' },
      { question: 'What is sweat mostly made of?', options: ['Water', 'Urea', 'Fat'], answer: 0, why: 'It also has some salt, antibodies and traces of metabolic waste.' },
    ],
  },
]

const STORAGE_KEY = 'corpus-learning-progress'

export type Progress = Record<string, { best: number; total: number }>

/** Browser storage can be blocked, so progress simply starts empty when it is unavailable. */
export function loadProgress(): Progress {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Progress
  } catch {
    return {}
  }
}

export function saveScore(progress: Progress, lessonId: string, score: number, total: number): Progress {
  const previous = progress[lessonId]
  const next = { ...progress, [lessonId]: { best: Math.max(previous?.best ?? 0, score), total } }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Progress lasts for this visit only when storage is blocked.
  }
  return next
}
