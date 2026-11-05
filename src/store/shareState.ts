import { LAYERS, type LayerId } from '../data/anatomy'
import { REPRO_STRUCTURES, SEX_PROFILES, CUSTOM_PROFILE_ID, type CustomSexConfig } from '../data/sexProfiles'
import type { ClipAxis, LayerState, Quality } from './useBodyStore'

export interface SharedView {
  sex: string
  custom: CustomSexConfig
  layers: Record<LayerId, LayerState>
  xray: boolean
  clipAxis: ClipAxis
  clipPosition: number
  quality: Quality
  openSystem: string | null
  selectedId: string | null
}

const AXES: ClipAxis[] = ['none', 'axial', 'sagittal', 'coronal']
const QUALITIES: Quality[] = ['low', 'medium', 'high']

/** Turns a view into a short URL string, which holds settings only and no personal data. */
export function encodeView(view: SharedView): string {
  const params = new URLSearchParams()
  params.set('sex', view.sex)
  params.set('layers', LAYERS.map(({ id }) => (view.layers[id].visible ? Math.round(view.layers[id].opacity * 100).toString(36) : '-')).join('.'))
  if (view.xray) params.set('xray', '1')
  if (view.clipAxis !== 'none') {
    params.set('clip', view.clipAxis)
    params.set('pos', view.clipPosition.toFixed(3))
  }
  params.set('q', view.quality)
  if (view.openSystem) params.set('sim', view.openSystem)
  if (view.selectedId) params.set('part', view.selectedId)
  if (view.sex === CUSTOM_PROFILE_ID) {
    params.set('cs', view.custom.structures.join('.'))
    params.set('cb', view.custom.body)
    params.set('ct', view.custom.testesPosition)
  }
  return params.toString()
}

/** Reads a shared link, ignoring anything it does not recognise. */
export function decodeView(text: string, defaults: Pick<SharedView, 'layers' | 'custom'>): Partial<SharedView> {
  const params = new URLSearchParams(text)
  const view: Partial<SharedView> = {}
  const sex = params.get('sex')
  if (sex && (sex === CUSTOM_PROFILE_ID || SEX_PROFILES.some((profile) => profile.id === sex))) view.sex = sex

  const layerText = params.get('layers')?.split('.')
  if (layerText?.length === LAYERS.length) {
    const layers = { ...defaults.layers }
    LAYERS.forEach(({ id }, index) => {
      if (layerText[index] === '-') layers[id] = { ...layers[id], visible: false }
      else {
        const opacity = parseInt(layerText[index], 36) / 100
        if (opacity > 0 && opacity <= 1) layers[id] = { visible: true, opacity }
      }
    })
    view.layers = layers
  }
  if (params.get('xray') === '1') view.xray = true
  const clip = params.get('clip') as ClipAxis | null
  if (clip && AXES.includes(clip)) view.clipAxis = clip
  const position = Number(params.get('pos'))
  if (params.has('pos') && position >= 0 && position <= 1) view.clipPosition = position
  const quality = params.get('q') as Quality | null
  if (quality && QUALITIES.includes(quality)) view.quality = quality
  const sim = params.get('sim')
  if (sim) view.openSystem = sim
  const part = params.get('part')
  if (part) view.selectedId = part

  if (sex === CUSTOM_PROFILE_ID) {
    const structures = (params.get('cs') ?? '').split('.').filter((item) => REPRO_STRUCTURES.includes(item as (typeof REPRO_STRUCTURES)[number])) as CustomSexConfig['structures']
    const body = params.get('cb') === 'male' ? 'male' : 'female'
    const testesPosition = params.get('ct') === 'external' ? 'external' : 'internal'
    view.custom = { structures, body, testesPosition }
  }
  return view
}
