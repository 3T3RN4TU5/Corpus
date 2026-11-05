import type { BodyId } from './models'
import type { DataSex, Source } from './physiology'

export type ReproStructure = 'ovaries' | 'uterus' | 'testes' | 'prostate'

export interface SexProfile {
  id: string
  name: string
  group: 'typical' | 'variation' | 'custom'
  chromosomes: string
  summary: string
  /** Which sex-specific reference ranges apply. null shows both, because sources report no separate range. */
  referenceSex: Exclude<DataSex, 'all'> | null
  structures: ReproStructure[]
  /** Which real body model to show. The models are not specific to any variation. */
  body: BodyId
  testesPosition: 'external' | 'internal'
  /** Placeholder size multipliers. Illustrative only. */
  ovaryScale: number
  testesScale: number
  source: Source | null
  prevalenceFactId?: string
  /** States what the model shows that the cited source does not describe. */
  modelNote?: string
}

export const REPRO_STRUCTURES: ReproStructure[] = ['ovaries', 'uterus', 'testes', 'prostate']

const FEMALE_SOURCE: Source = {
  title: 'OpenStax A&P 2e, 27.2 Anatomy and Physiology of the Ovarian Reproductive System',
  url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/27-2-anatomy-and-physiology-of-the-ovarian-reproductive-system',
}

const MALE_SOURCE: Source = {
  title: 'OpenStax A&P 2e, 27.1 Anatomy and Physiology of the Testicular Reproductive System',
  url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/27-1-anatomy-and-physiology-of-the-testicular-reproductive-system',
}

export const SEX_PROFILES: SexProfile[] = [
  {
    id: 'female',
    name: 'Female',
    group: 'typical',
    chromosomes: '46,XX',
    summary: 'Typical female anatomy, with ovaries and a uterus.',
    referenceSex: 'female',
    structures: ['ovaries', 'uterus'],
    body: 'female',
    testesPosition: 'external',
    ovaryScale: 1,
    testesScale: 1,
    source: FEMALE_SOURCE,
  },
  {
    id: 'male',
    name: 'Male',
    group: 'typical',
    chromosomes: '46,XY',
    summary: 'Typical male anatomy, with testes and a prostate.',
    referenceSex: 'male',
    structures: ['testes', 'prostate'],
    body: 'male',
    testesPosition: 'external',
    ovaryScale: 1,
    testesScale: 1,
    source: MALE_SOURCE,
  },
  {
    id: 'cais',
    name: 'Complete androgen insensitivity',
    group: 'variation',
    chromosomes: '46,XY',
    summary:
      'External sex characteristics are typical of females. There is no uterus, and undescended testes sit in the pelvis or abdomen.',
    referenceSex: null,
    structures: ['testes'],
    body: 'female',
    testesPosition: 'internal',
    ovaryScale: 1,
    testesScale: 1,
    source: {
      title: 'MedlinePlus Genetics: Androgen insensitivity syndrome',
      url: 'https://medlineplus.gov/genetics/condition/androgen-insensitivity-syndrome/',
    },
    prevalenceFactId: 'prevalence-cais',
  },
  {
    id: 'klinefelter',
    name: 'Klinefelter syndrome',
    group: 'variation',
    chromosomes: '47,XXY (about 10% are mosaic 46,XY/47,XXY)',
    summary: 'Testes are typically small and produce a reduced amount of testosterone.',
    referenceSex: null,
    structures: ['testes', 'prostate'],
    body: 'male',
    testesPosition: 'external',
    ovaryScale: 1,
    testesScale: 0.6,
    source: {
      title: 'MedlinePlus Genetics: Klinefelter syndrome',
      url: 'https://medlineplus.gov/genetics/condition/klinefelter-syndrome/',
    },
    prevalenceFactId: 'prevalence-klinefelter',
    modelNote: 'The prostate is a male-typical placeholder. The cited page does not describe it.',
  },
  {
    id: 'turner',
    name: 'Turner syndrome',
    group: 'variation',
    chromosomes: '45,X in about half of cases; others have an altered X or mosaicism',
    summary: 'One X chromosome is missing or altered. Ovarian function is reduced, and most ovarian tissue breaks down before birth.',
    referenceSex: null,
    structures: ['ovaries', 'uterus'],
    body: 'female',
    testesPosition: 'external',
    ovaryScale: 0.55,
    testesScale: 1,
    source: {
      title: 'MedlinePlus Genetics: Turner syndrome',
      url: 'https://medlineplus.gov/genetics/condition/turner-syndrome/',
    },
    prevalenceFactId: 'prevalence-turner',
    modelNote: 'The uterus is a female-typical placeholder. The cited page does not describe it.',
  },
  {
    id: 'cah',
    name: '21-hydroxylase deficiency (classic CAH)',
    group: 'variation',
    chromosomes: 'Modelled here as 46,XX',
    summary: 'In the classic forms, affected females typically have external genitalia that do not look clearly male or female.',
    referenceSex: null,
    structures: ['ovaries', 'uterus'],
    body: 'female',
    testesPosition: 'external',
    ovaryScale: 1,
    testesScale: 1,
    source: {
      title: 'MedlinePlus Genetics: 21-hydroxylase deficiency',
      url: 'https://medlineplus.gov/genetics/condition/21-hydroxylase-deficiency/',
    },
    prevalenceFactId: 'prevalence-21-hydroxylase-classic',
    modelNote:
      'This uses the typical female body model, with typical ovaries and uterus. The cited page describes external anatomy only, and the model does not show the external differences it describes.',
  },
]

export interface CustomSexConfig {
  structures: ReproStructure[]
  body: BodyId
  testesPosition: 'external' | 'internal'
}

export const DEFAULT_CUSTOM: CustomSexConfig = {
  structures: ['ovaries', 'testes'],
  body: 'female',
  testesPosition: 'internal',
}

export const CUSTOM_PROFILE_ID = 'custom'

export function resolveProfile(id: string, custom: CustomSexConfig): SexProfile {
  if (id === CUSTOM_PROFILE_ID) {
    return {
      id: CUSTOM_PROFILE_ID,
      name: 'Custom',
      group: 'custom',
      chromosomes: 'Not specified',
      summary:
        'Choose any combination of structures to explore. This is a free-form tool, and not every combination describes a documented condition.',
      referenceSex: null,
      structures: custom.structures,
      body: custom.body,
      testesPosition: custom.testesPosition,
      ovaryScale: 1,
      testesScale: 1,
      source: null,
    }
  }
  const profile = SEX_PROFILES.find((candidate) => candidate.id === id)
  if (!profile) throw new Error(`Unknown sex profile: ${id}`)
  return profile
}
