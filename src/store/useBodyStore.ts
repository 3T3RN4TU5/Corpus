import { create } from 'zustand'
import { getPart, LAYERS, type LayerId } from '../data/anatomy'
import { DEFAULT_CUSTOM, resolveProfile, type CustomSexConfig, type SexProfile } from '../data/sexProfiles'
import { MIN_PICKABLE_OPACITY } from '../scene/appearance'
import { setReducedMotionPreference, systemPrefersReducedMotion } from '../sim/clock'
import { decodeView } from './shareState'

export type DragMode = 'rotate' | 'move'
export type Quality = 'low' | 'medium' | 'high'
export type ClipAxis = 'none' | 'axial' | 'sagittal' | 'coronal'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'vigorous'

/** Global inputs that every body system reads. These are user settings, not reference data. */
export interface SimulationState {
  ageYears: number
  sexProfileId: string
  weightKg: number
  heightCm: number
  bodyFatPercent: number
  activityLevel: ActivityLevel
  hydration: number
  sleepHours: number
  stress: number
}

export interface LayerState {
  visible: boolean
  opacity: number
}

const DEFAULT_LAYERS: Record<LayerId, LayerState> = {
  skin: { visible: true, opacity: 0.2 },
  fat: { visible: false, opacity: 0.5 },
  muscle: { visible: false, opacity: 1 },
  skeleton: { visible: true, opacity: 1 },
  organs: { visible: true, opacity: 1 },
  vessels: { visible: false, opacity: 1 },
  nerves: { visible: false, opacity: 1 },
  lymph: { visible: false, opacity: 1 },
}

interface BodyStore {
  sim: SimulationState
  custom: CustomSexConfig
  layers: Record<LayerId, LayerState>
  xray: boolean
  isolate: boolean
  clipAxis: ClipAxis
  /** Position of the slice along its axis, from 0 to 1. */
  clipPosition: number
  quality: Quality
  /** What a plain drag does: turn the view, or slide it up, down, left and right. */
  dragMode: DragMode
  selectedId: string | null
  hoveredId: string | null
  /** Parts the person has hidden. */
  hiddenIds: string[]
  /** Parts standing between the camera and the selected part. The 3D view keeps this up to date. */
  fadedIds: string[]
  /** Whether parts in front of the selected part fade. */
  fadeInFront: boolean
  /** Whether every part that fits on screen has a name label. */
  showLabels: boolean
  /** Changes whenever the camera should fly. The target is `cameraTargetId`, or the home view when null. */
  cameraNonce: number
  cameraTargetId: string | null
  /** The simulation panel that is open, if any. */
  openSystem: string | null
  reducedMotion: boolean
  /** The layers to return to when a simulation closes. */
  layersBeforeLab: Record<LayerId, LayerState> | null
  setReducedMotion: (on: boolean) => void

  setOpenSystem: (id: string | null, layers?: Partial<Record<LayerId, number>>) => void
  setSim: (patch: Partial<SimulationState>) => void
  setLayerVisible: (id: LayerId, visible: boolean) => void
  setLayerOpacity: (id: LayerId, opacity: number) => void
  showAllLayers: () => void
  setXray: (on: boolean) => void
  setIsolate: (on: boolean) => void
  setClipAxis: (axis: ClipAxis) => void
  setClipPosition: (position: number) => void
  setQuality: (quality: Quality) => void
  setDragMode: (dragMode: DragMode) => void
  setSexProfile: (id: string) => void
  setCustom: (patch: Partial<CustomSexConfig>) => void
  selectPart: (id: string | null) => void
  /** Selects a part chosen from outside the scene, reveals its layer and flies the camera to it. */
  revealPart: (id: string) => void
  setHovered: (id: string | null) => void
  hidePart: (id: string) => void
  unhidePart: (id: string) => void
  unhideAll: () => void
  setFadedIds: (ids: string[]) => void
  setFadeInFront: (on: boolean) => void
  setShowLabels: (on: boolean) => void
  resetView: () => void
}

export const useBodyStore = create<BodyStore>((set, get) => ({
  sim: {
    ageYears: 30,
    sexProfileId: 'female',
    weightKg: 70,
    heightCm: 175,
    bodyFatPercent: 25,
    activityLevel: 'moderate',
    hydration: 1,
    sleepHours: 8,
    stress: 0.2,
  },
  custom: DEFAULT_CUSTOM,
  layers: DEFAULT_LAYERS,
  xray: false,
  isolate: false,
  clipAxis: 'none',
  clipPosition: 0.5,
  quality: 'medium',
  dragMode: 'rotate',
  selectedId: null,
  hoveredId: null,
  hiddenIds: [],
  fadedIds: [],
  fadeInFront: true,
  showLabels: false,
  cameraNonce: 0,
  cameraTargetId: null,
  openSystem: null,
  reducedMotion: systemPrefersReducedMotion(),
  setReducedMotion: (reducedMotion) => {
    setReducedMotionPreference(reducedMotion)
    set({ reducedMotion })
  },
  layersBeforeLab: null,

  setOpenSystem: (openSystem, layers) =>
    set((state) => ({
      openSystem,
      selectedId: openSystem ? null : state.selectedId,
      // A simulation animates particular parts, so it needs them all present.
      hiddenIds: openSystem ? [] : state.hiddenIds,
      isolate: openSystem ? false : state.isolate,
      layersBeforeLab: openSystem ? (state.layersBeforeLab ?? state.layers) : null,
      layers: !openSystem && state.layersBeforeLab
        ? state.layersBeforeLab
        : layers
        ? (Object.fromEntries(
            LAYERS.map(({ id }) => [
              id,
              layers[id] === undefined ? { ...state.layers[id], visible: false } : { visible: true, opacity: layers[id] as number },
            ]),
          ) as Record<LayerId, LayerState>)
        : state.layers,
    })),
  setSim: (patch) => set((state) => ({ sim: { ...state.sim, ...patch } })),
  setLayerVisible: (id, visible) =>
    set((state) => ({ layers: { ...state.layers, [id]: { ...state.layers[id], visible } } })),
  setLayerOpacity: (id, opacity) =>
    set((state) => ({ layers: { ...state.layers, [id]: { ...state.layers[id], opacity } } })),
  showAllLayers: () =>
    set((state) => ({
      layers: Object.fromEntries(
        LAYERS.map(({ id }) => [id, { ...state.layers[id], visible: true }]),
      ) as Record<LayerId, LayerState>,
    })),
  setXray: (xray) => set({ xray }),
  setIsolate: (isolate) => set((state) => ({ isolate: isolate && state.selectedId !== null })),
  setClipAxis: (clipAxis) => set({ clipAxis }),
  setClipPosition: (clipPosition) => set({ clipPosition }),
  setQuality: (quality) => set({ quality }),
  setDragMode: (dragMode) => set({ dragMode }),

  setSexProfile: (sexProfileId) => {
    set((state) => ({ sim: { ...state.sim, sexProfileId } }))
    clearUnavailableSelection(get, set)
  },
  setCustom: (patch) => {
    set((state) => ({ custom: { ...state.custom, ...patch } }))
    clearUnavailableSelection(get, set)
  },

  selectPart: (selectedId) =>
    set((state) => ({ selectedId, isolate: selectedId === null ? false : state.isolate })),

  revealPart: (id) => {
    const part = getPart(id)
    if (!part) return
    set((state) => {
      const layer = state.layers[part.layer]
      return {
        selectedId: id,
        hiddenIds: state.hiddenIds.filter((hidden) => hidden !== id),
        layers: {
          ...state.layers,
          [part.layer]: {
            visible: true,
            opacity: Math.max(layer.opacity, MIN_PICKABLE_OPACITY),
          },
        },
        cameraNonce: state.cameraNonce + 1,
        cameraTargetId: id,
      }
    })
  },

  setHovered: (hoveredId) => {
    if (get().hoveredId !== hoveredId) set({ hoveredId })
  },
  hidePart: (id) =>
    set((state) => ({
      hiddenIds: state.hiddenIds.includes(id) ? state.hiddenIds : [...state.hiddenIds, id],
      selectedId: state.selectedId === id ? null : state.selectedId,
      isolate: state.selectedId === id ? false : state.isolate,
    })),
  unhidePart: (id) => set((state) => ({ hiddenIds: state.hiddenIds.filter((hidden) => hidden !== id) })),
  unhideAll: () => set({ hiddenIds: [] }),
  setFadedIds: (fadedIds) => {
    const current = get().fadedIds
    if (current.length !== fadedIds.length || fadedIds.some((id) => !current.includes(id))) set({ fadedIds })
  },
  setFadeInFront: (fadeInFront) => set({ fadeInFront }),
  setShowLabels: (showLabels) => set({ showLabels }),
  resetView: () => set((state) => ({ cameraNonce: state.cameraNonce + 1, cameraTargetId: null, isolate: false })),
}))

function clearUnavailableSelection(
  get: () => BodyStore,
  set: (patch: Partial<BodyStore>) => void,
) {
  const { selectedId } = get()
  const part = selectedId ? getPart(selectedId) : undefined
  const profile = selectProfile(get())
  if (part?.requires && !profile.structures.includes(part.requires) && !profile.alsoShows?.includes(part.id)) {
    set({ selectedId: null, isolate: false })
  }
}

/** Restores the view from a shared link, if the page was opened with one. */
export function applySharedView(): void {
  const match = window.location.hash.match(/^#view=(.+)$/)
  if (!match) return
  const { layers, custom } = useBodyStore.getState()
  const view = decodeView(decodeURIComponent(match[1]), { layers, custom })
  useBodyStore.setState((state) => ({
    sim: view.sex ? { ...state.sim, sexProfileId: view.sex } : state.sim,
    custom: view.custom ?? state.custom,
    layers: view.layers ?? state.layers,
    xray: view.xray ?? state.xray,
    clipAxis: view.clipAxis ?? state.clipAxis,
    clipPosition: view.clipPosition ?? state.clipPosition,
    quality: view.quality ?? state.quality,
    openSystem: view.openSystem ?? null,
    selectedId: view.selectedId && getPart(view.selectedId) ? view.selectedId : null,
  }))
}

export function selectProfile(state: Pick<BodyStore, 'sim' | 'custom'>): SexProfile {
  return resolveProfile(state.sim.sexProfileId, state.custom)
}
