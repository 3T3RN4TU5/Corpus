import { SYSTEM_NAMES, SYSTEM_SOURCES, type SystemId } from '../data/anatomy'
import { SYSTEM_PLUGINS } from '../systems'
import { formatFact, getFact, physiology, type PhysiologyEntry, type Source } from '../data/physiology'
import { SEX_PROFILES } from '../data/sexProfiles'

function groupBySource(entries: PhysiologyEntry[]) {
  const groups = new Map<string, { source: Source; entries: PhysiologyEntry[] }>()
  for (const entry of entries) {
    const group = groups.get(entry.source.url) ?? { source: entry.source, entries: [] }
    group.entries.push(entry)
    groups.set(entry.source.url, group)
  }
  return [...groups.values()]
}

export default function SourcesPage() {
  const groups = groupBySource(physiology)
  const profileSources = SEX_PROFILES.flatMap((profile) => (profile.source ? [{ name: profile.name, source: profile.source }] : []))

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-ink">
      <div className="mx-auto max-w-3xl px-4 py-6 md:py-10">
        <a className="eyebrow !text-bone" href="#">
          ← Back to the body
        </a>
        <h2 className="mt-4 font-display text-5xl italic">Sources</h2>
        <p className="mt-3 text-lg leading-snug">
          Every physiological number in Corpus is stored with its source and a confidence rating. {physiology.length} values
          from {groups.length} sources are in use so far.
        </p>
        <p className="mt-2 font-mono text-xs text-dust">Educational simplification. Not for diagnosis or medical decisions.</p>

        <h3 className="eyebrow mt-8">Numbers</h3>
        {groups.map(({ source, entries }) => (
          <section key={source.url} className="mt-5">
            <h4 className="text-lg leading-tight">
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>
            </h4>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="eyebrow">
                    <th scope="col" className="py-1 pr-3 font-normal">Measure</th>
                    <th scope="col" className="py-1 pr-3 font-normal">Value</th>
                    <th scope="col" className="py-1 pr-3 font-normal">Age</th>
                    <th scope="col" className="py-1 pr-3 font-normal">Sex</th>
                    <th scope="col" className="py-1 font-normal">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-t border-line align-top">
                      <td className="py-1.5 pr-3">{entry.label}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{formatFact(entry)}</td>
                      <td className="py-1.5 pr-3 text-dust">{entry.ageGroup}</td>
                      <td className="py-1.5 pr-3 text-dust">{entry.sex}</td>
                      <td className="py-1.5 text-dust">{entry.confidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <h3 className="eyebrow mt-10">Descriptions by system</h3>
        <ul className="mt-2">
          {(Object.keys(SYSTEM_SOURCES) as SystemId[]).map((system) => (
            <li key={system} className="border-t border-line py-2">
              <span className="text-dust">{SYSTEM_NAMES[system]}: </span>
              {SYSTEM_SOURCES[system].map((source, index) => (
                <span key={source.url}>
                  {index > 0 && '; '}
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                </span>
              ))}
            </li>
          ))}
        </ul>

        <h3 className="eyebrow mt-10">Sex profiles</h3>
        <ul className="mt-2">
          {profileSources.map(({ name, source }) => (
            <li key={name} className="border-t border-line py-2">
              <span className="text-dust">{name}: </span>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>
            </li>
          ))}
        </ul>

        <h3 className="eyebrow mt-10">Simulations</h3>
        <ul className="mt-2">
          {SYSTEM_PLUGINS.map((plugin) => (
            <li key={plugin.id} className="border-t border-line py-2 text-[0.95rem] leading-snug">
              <span className="italic">{plugin.name}.</span> <span className="text-dust">Key values: {plugin.dataSources.map((id) => getFact(id).label.toLowerCase()).join(', ')}. {plugin.limits.join(' ')}</span>
            </li>
          ))}
        </ul>

        <h3 className="eyebrow mt-10">3D models</h3>
        <ul className="mt-2 leading-snug">
          <li className="border-t border-line py-2">
            <a href="https://github.com/hubmapconsortium/ccf-3d-reference-object-library" target="_blank" rel="noreferrer">
              HuBMAP Human Reference Atlas, CCF 3D Reference Object Library
            </a>
            , licensed under CC BY 4.0. Female and male skin, eyes, brain, organs and trunk blood vessels, pelvis, vertebrae and spinal cord. Reduced in detail and compressed for this app.
          </li>
          <li className="border-t border-line py-2">
            <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html" target="_blank" rel="noreferrer">
              BodyParts3D, © The Database Center for Life Science
            </a>
            . Skeleton, teeth, muscles, limb vessels, stomach, esophagus, tongue, some glands and male external genital structures. Reduced in detail, compressed, and reshaped to fit each body. The database lists CC BY 4.0, and the files themselves carry CC BY-SA 2.1 Japan.
          </li>
        </ul>

        <h3 className="eyebrow mt-10">What is illustrative</h3>
        <p className="mt-2 leading-snug">
          BodyParts3D comes from one male body. Its skeleton and muscles were fitted to the female body by computer, so their shape is not female-specific, and hands are posed by computer to fit each body's open hand. Its intercostal muscles and some small back muscles exist on the left side only, so the right side is a mirror image. Peripheral nerves, lymph nodes, the thoracic duct, the thyroid, rectus abdominis, latissimus dorsi and the fat layer are hand-placed or simple shapes. Sex profiles use the female or male body model with typical organs, and reduced organ sizes in some profiles are illustrative. The function descriptions are short summaries written for this app, with the textbook chapter listed above as the reference.
        </p>
      </div>
    </div>
  )
}
