import type { LayerId, Part } from '../data/anatomy'

/** Layers fainter than this are click-through, so people can select what lies beneath a ghosted layer. */
export const MIN_PICKABLE_OPACITY = 0.35

/** How see-through a part becomes while it stands in front of the selected part. */
export const FADED_OPACITY = 0.14

const XRAY_SOFT_TISSUE: LayerId[] = ['skin', 'fat', 'muscle']

/** The eyes show through the openings in the face, so they stay present whenever the skin is close to solid. */
export const EYE_PARTS = ['eyes', 'eye-iris', 'eye-pupil']
export const SOLID_SKIN_OPACITY = 0.6

export interface AppearanceInput {
  layers: Record<LayerId, { visible: boolean; opacity: number }>
  xray: boolean
  isolate: boolean
  selectedId: string | null
  /** The person hid this part. */
  hidden?: boolean
  /** This part stands between the camera and the selected part. */
  faded?: boolean
}

export interface Appearance {
  visible: boolean
  opacity: number
  pickable: boolean
  xray: boolean
}

const HIDDEN: Appearance = { visible: false, opacity: 0, pickable: false, xray: false }

export function partAppearance(part: Part, input: AppearanceInput): Appearance {
  const { layers, xray, isolate, selectedId, hidden, faded } = input

  if (hidden) return HIDDEN

  if (isolate && selectedId) {
    if (part.id === selectedId) return { visible: true, opacity: 1, pickable: true, xray: false }
    // A faint body outline keeps the isolated part in context.
    if (part.layer === 'skin') return { visible: true, opacity: 0.08, pickable: false, xray: false }
    return HIDDEN
  }

  const layer = layers[part.layer]
  if (!layer.visible || layer.opacity <= 0) {
    const skin = layers.skin
    if (EYE_PARTS.includes(part.id) && !xray && skin.visible && skin.opacity >= SOLID_SKIN_OPACITY) return { visible: true, opacity: 1, pickable: true, xray: false }
    return HIDDEN
  }

  if (xray) {
    const soft = XRAY_SOFT_TISSUE.includes(part.layer)
    // These layers add up where they overlap, so bright organs in front of bone would turn solid white.
    const glow = soft ? 0.04 : part.layer === 'organs' ? 0.1 : 0.34
    return { visible: true, opacity: glow * layer.opacity, pickable: !soft, xray: true }
  }

  // A faded part lets clicks through, so that the part behind it can still be clicked.
  if (faded) return { visible: true, opacity: Math.min(layer.opacity, FADED_OPACITY), pickable: false, xray: false }

  return { visible: true, opacity: layer.opacity, pickable: layer.opacity >= MIN_PICKABLE_OPACITY, xray: false }
}
