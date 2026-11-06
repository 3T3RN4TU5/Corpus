import { lazy, Suspense, useEffect, useState } from 'react'
import { useBodyStore } from './store/useBodyStore'
import { InfoPanel } from './ui/InfoPanel'
import { LabPanel } from './ui/LabPanel'
import { LayerPanel } from './ui/LayerPanel'
import { LoadingPlate } from './ui/LoadingPlate'
import { SearchBox } from './ui/SearchBox'
import { SexPanel } from './ui/SexPanel'
import { SystemMenu } from './ui/SystemMenu'
import { Toolbar } from './ui/Toolbar'

const BodyScene = lazy(() => import('./scene/BodyScene'))
const SourcesPage = lazy(() => import('./ui/SourcesPage'))
// This imports the 3D library, which should stay out of the first download.
const ModelProgress = lazy(() => import('./ui/ModelProgress'))

export const DISCLAIMER = 'Educational simplification. Not for diagnosis or medical decisions.'

type MobilePanel = 'layers' | 'sex' | 'tools' | null

const MOBILE_TABS: { id: Exclude<MobilePanel, null>; label: string }[] = [
  { id: 'layers', label: 'Layers' },
  { id: 'sex', label: 'Sex' },
  { id: 'tools', label: 'Tools' },
]

export function App() {
  const [hash, setHash] = useState(window.location.hash)
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null)
  const selectedId = useBodyStore((state) => state.selectedId)
  const openSystem = useBodyStore((state) => state.openSystem)
  const xray = useBodyStore((state) => state.xray)

  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  // A part's details and an open panel would overlap on a phone, so the newest one wins.
  useEffect(() => {
    if (selectedId || openSystem) setMobilePanel(null)
  }, [selectedId, openSystem])

  return (
    <div className="relative h-dvh overflow-hidden">
      <main className="stage absolute inset-0" data-xray={xray} data-lab={Boolean(openSystem)} aria-label="3D body viewer">
        {/* On wider screens the canvas fills only the space the panels leave free, so they never cover the body. */}
        <div className={`absolute inset-0 pb-24 pt-28 md:bottom-[10.5rem] md:left-[19rem] md:pb-0 md:pt-14 2xl:bottom-[6.5rem] ${openSystem ? 'md:right-[26rem]' : ''}`}>
          <Suspense fallback={<LoadingPlate />}>
            <BodyScene />
          </Suspense>
        </div>
      </main>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-wrap items-start justify-between gap-x-3 gap-y-2 p-4 md:flex-nowrap md:justify-start md:gap-6">
        <h1 className="wordmark reveal pointer-events-auto font-display text-3xl italic leading-none md:text-5xl">Corpus</h1>
        <div className="pointer-events-auto order-last w-full min-w-0 md:order-none md:mx-auto md:w-auto md:max-w-md md:flex-1">
          <SearchBox />
        </div>
        <div className="pointer-events-auto flex items-start gap-3">
          <SystemMenu />
          <a className="eyebrow pt-2 !text-bone" href="#sources">
            Sources
          </a>
        </div>
      </header>

      <aside
        className={`${mobilePanel === 'layers' || mobilePanel === 'sex' ? 'block' : 'hidden'} absolute inset-x-4 bottom-24 z-20 max-h-[58dvh] space-y-3 overflow-y-auto md:reveal md:bottom-8 md:left-4 md:right-auto md:top-20 md:block md:max-h-none md:w-72`}
      >
        <div className={mobilePanel === 'sex' ? 'hidden md:block' : ''}>
          <LayerPanel />
        </div>
        <div className={mobilePanel === 'layers' ? 'hidden md:block' : ''}>
          <SexPanel />
        </div>
      </aside>

      {openSystem ? <LabPanel /> : <InfoPanel />}
      <Suspense fallback={null}>
        <ModelProgress />
      </Suspense>

      <div
        className={`${mobilePanel === 'tools' ? 'block' : 'hidden'} sheet absolute inset-x-4 bottom-24 z-20 max-h-[58dvh] overflow-y-auto md:bottom-8 md:left-[19rem] md:right-4 md:block md:max-h-none md:overflow-visible`}
      >
        <Toolbar />
      </div>

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-4 pb-2">
        <nav className="pointer-events-auto mb-2 grid grid-cols-3 gap-1 md:hidden" aria-label="Panels">
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="control bg-ink"
              aria-pressed={mobilePanel === tab.id}
              onClick={() => setMobilePanel(mobilePanel === tab.id ? null : tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <p role="note" className="text-center font-mono text-[0.68rem] leading-tight">
          <span className="note-pill">{DISCLAIMER}</span>
        </p>
      </footer>

      {hash === '#sources' && (
        <Suspense fallback={null}>
          <SourcesPage />
        </Suspense>
      )}
    </div>
  )
}
