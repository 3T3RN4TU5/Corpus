import { useShallow } from 'zustand/react/shallow'
import { formatFact, getFact } from '../data/physiology'
import { CUSTOM_PROFILE_ID, REPRO_STRUCTURES, SEX_PROFILES, type ReproStructure, type SexProfile } from '../data/sexProfiles'
import { selectProfile, useBodyStore } from '../store/useBodyStore'

const STRUCTURE_NAMES: Record<ReproStructure, string> = {
  ovaries: 'Ovaries',
  uterus: 'Uterus',
  testes: 'Testes',
  prostate: 'Prostate',
  penis: 'Penis',
}

function ProfileOption({ profile, checked, onChoose }: { profile: Pick<SexProfile, 'id' | 'name'>; checked: boolean; onChoose: () => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-1 text-[0.98rem] leading-tight">
      <input type="radio" name="sex-profile" className="mt-0.5" checked={checked} onChange={onChoose} />
      {profile.name}
    </label>
  )
}

function CustomControls() {
  const custom = useBodyStore((state) => state.custom)
  const setCustom = useBodyStore((state) => state.setCustom)

  const toggle = (structure: ReproStructure, on: boolean) =>
    setCustom({
      structures: on ? [...custom.structures, structure] : custom.structures.filter((item) => item !== structure),
    })

  return (
    <div className="mt-2 border-t border-line pt-2">
      <fieldset>
        <legend className="eyebrow">Structures</legend>
        <div className="mt-1 grid grid-cols-2 gap-x-2">
          {REPRO_STRUCTURES.map((structure) => (
            <label key={structure} className="flex cursor-pointer items-center gap-2 py-0.5 text-[0.95rem]">
              <input
                type="checkbox"
                checked={custom.structures.includes(structure)}
                onChange={(event) => toggle(structure, event.target.checked)}
              />
              {STRUCTURE_NAMES[structure]}
            </label>
          ))}
        </div>
      </fieldset>
      {custom.structures.includes('testes') && (
        <label className="mt-1 flex cursor-pointer items-center gap-2 text-[0.95rem]">
          <input
            type="checkbox"
            checked={custom.testesPosition === 'internal'}
            onChange={(event) => setCustom({ testesPosition: event.target.checked ? 'internal' : 'external' })}
          />
          Undescended testes
        </label>
      )}
      <fieldset className="mt-2">
        <legend className="eyebrow">Body model</legend>
        <div className="mt-1 flex gap-4">
          {(['female', 'male'] as const).map((body) => (
            <label key={body} className="flex cursor-pointer items-center gap-2 text-[0.95rem] capitalize">
              <input type="radio" name="custom-body" checked={custom.body === body} onChange={() => setCustom({ body })} />
              {body}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}

export function SexPanel() {
  const profile = useBodyStore(useShallow(selectProfile))
  const setSexProfile = useBodyStore((state) => state.setSexProfile)
  const prevalence = profile.prevalenceFactId ? getFact(profile.prevalenceFactId) : null

  return (
    <section aria-labelledby="sex-heading" className="sheet p-4">
      <h2 id="sex-heading" className="eyebrow">
        Sex
      </h2>
      <div role="radiogroup" aria-labelledby="sex-heading" className="mt-1">
        {SEX_PROFILES.filter((item) => item.group === 'typical').map((item) => (
          <ProfileOption key={item.id} profile={item} checked={profile.id === item.id} onChoose={() => setSexProfile(item.id)} />
        ))}
        <p className="eyebrow mt-2">Intersex variations</p>
        {SEX_PROFILES.filter((item) => item.group === 'variation').map((item) => (
          <ProfileOption key={item.id} profile={item} checked={profile.id === item.id} onChoose={() => setSexProfile(item.id)} />
        ))}
        <p className="eyebrow mt-2">Any other combination</p>
        <ProfileOption
          profile={{ id: CUSTOM_PROFILE_ID, name: 'Custom' }}
          checked={profile.id === CUSTOM_PROFILE_ID}
          onChoose={() => setSexProfile(CUSTOM_PROFILE_ID)}
        />
      </div>

      <div className="mt-2 border-t border-line pt-2 text-[0.9rem] leading-snug">
        <p className="font-mono text-[0.7rem] text-dust">{profile.chromosomes}</p>
        <p className="mt-1">{profile.summary}</p>
        {prevalence && (
          <p className="mt-1 text-dust">
            About {formatFact(prevalence)} ({prevalence.confidence}).
          </p>
        )}
        {profile.modelNote && <p className="mt-1 text-dust">{profile.modelNote}</p>}
        {profile.source && (
          <p className="mt-1 text-[0.82rem] text-dust">
            <a href={profile.source.url} target="_blank" rel="noreferrer">
              {profile.source.title}
            </a>
          </p>
        )}
        {profile.group === 'variation' && (
          <p className="mt-1 text-[0.82rem] text-dust">
            These are a few examples among many variations. Terminology differs, and not everyone with these conditions identifies as intersex.
          </p>
        )}
      </div>

      {profile.id === CUSTOM_PROFILE_ID && <CustomControls />}
    </section>
  )
}
