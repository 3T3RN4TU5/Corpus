import { create } from 'zustand'
import { getPart, LAYERS, type LayerId } from '../data/anatomy'
import { DEFAULT_CUSTOM, resolveProfile, type CustomSexConfig, type SexProfile } from '../data/sexProfiles'
import { MIN_PICKABLE_OPACITY } from '../scene/appearance'

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
  selectedId: string | null
  hoveredId: string | null
  /** Changes whenever the camera should fly. The target is `cameraTargetId`, or the home view when null. */
  cameraNonce: number
  cameraTargetId: string | null

  setLayerVisible: (id: LayerId, visible: boolean) => void
  setLayerOpacity: (id: LayerId, opacity: number) => void
  showAllLayers: () => void
  setXray: (on: boolean) => void
  setIsolate: (on: boolean) => void
  setClipAxis: (axis: ClipAxis) => void
  setClipPosition: (position: number) => void
  setQuality: (quality: Quality) => void
  setSexProfile: (id: string) => void
  setCustom: (patch: Partial<CustomSexConfig>) => void
  selectPart: (id: string | null) => void
  /** Selects a part chosen from outside the scene, reveals its layer and flies the camera to it. */
  revealPart: (id: string) => void
  setHovered: (id: string | null) => void
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
  selectedId: null,
  hoveredId: null,
  cameraNonce: 0,
  cameraTargetId: null,

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
  resetView: () => set((state) => ({ cameraNonce: state.cameraNonce + 1, cameraTargetId: null })),
}))

function clearUnavailableSelection(
  get: () => BodyStore,
  set: (patch: Partial<BodyStore>) => void,
) {
  const { selectedId } = get()
  const part = selectedId ? getPart(selectedId) : undefined
  if (part?.requires && !selectProfile(get()).structures.includes(part.requires)) {
    set({ selectedId: null, isolate: false })
  }
}

export function selectProfile(state: Pick<BodyStore, 'sim' | 'custom'>): SexProfile {
  return resolveProfile(state.sim.sexProfileId, state.custom)
}
