import rawManifest from './models.manifest.json'
import type { LayerId } from './anatomy'

export type BodyId = 'female' | 'male'
export type Lod = 'high' | 'low'
export type ModelSource = 'hra' | 'bp3d' | 'zanatomy' | 'illustrative'

export interface ModelFile {
  file: string
  lod: Lod
  layer: LayerId
  source: ModelSource
  bytes: number
}

export interface PartModel {
  layer: LayerId
  sources: ModelSource[]
  triangles: number
  centre: [number, number, number]
  radius: number
  illustrative: boolean
}

export interface BodyModelInfo {
  height: number
  width: number
  pelvisCentre: [number, number, number]
  files: ModelFile[]
  parts: Record<string, PartModel>
  triangles: number
}

interface Manifest {
  bodies: Record<BodyId, BodyModelInfo>
}

export const modelManifest = rawManifest as unknown as Manifest

export const MODEL_BASE = `${import.meta.env?.BASE_URL ?? '/'}models/`
export const DRACO_PATH = `${import.meta.env?.BASE_URL ?? '/'}draco/`

export function filesFor(body: BodyId, lod: Lod, layers: LayerId[]): ModelFile[] {
  return modelManifest.bodies[body].files.filter((file) => file.lod === lod && layers.includes(file.layer))
}

export function partModel(body: BodyId, id: string): PartModel | undefined {
  return modelManifest.bodies[body].parts[id]
}

/** Blender adds a numeric suffix when one name is used twice, and glTF loading removes the dot. */
export function partIdFromNodeName(name: string): string {
  return name.replace(/\.?\d{3}$/, '')
}

/** Plain-language statement of where a part's shape comes from, for the information panel. */
export function modelProvenance(body: BodyId, id: string): string {
  const model = partModel(body, id)
  if (!model) return 'No 3D model is available for this part.'
  if (id === 'subcutaneous-fat') return 'Illustrative: the skin surface moved inward by a fixed distance. It does not show real fat distribution.'
  if (model.illustrative) return 'Illustrative shape, placed by hand. Neither anatomy dataset includes this structure.'
  if (model.sources.includes('zanatomy')) {
    const parts = model.layer === 'lymph' ? 'Each node is drawn as a small sphere at its position in that atlas, not one person\'s actual node.' : 'Drawn a little thicker than the source, so that fine branches can be seen.'
    return `From Z-Anatomy, an open atlas modelled on one male body, moved to follow this body's fitted bones. ${parts}`
  }
  if (id === 'skin' && body === 'male') return 'From the NIH Human Reference Atlas male model, based on the Visible Human Project. That face is a blurred scan, so the face takes its shape and eye openings from BodyParts3D.'
  const atlas = model.sources.includes('hra')
  const fitted = model.sources.includes('bp3d')
  const sex = body === 'female' ? 'female' : 'male'
  if (atlas && fitted) return `Partly from the NIH Human Reference Atlas ${sex} model, and partly BodyParts3D anatomy from one male body, fitted to this body.`
  if (atlas) return `From the NIH Human Reference Atlas ${sex} model, based on the Visible Human Project.`
  return body === 'female'
    ? 'BodyParts3D anatomy from one male body, fitted to this female body. No open full-body female data was found, so its shape is not female-specific.'
    : 'BodyParts3D anatomy from one male body, fitted to this body.'
}
