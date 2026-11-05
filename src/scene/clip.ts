import { Plane, Vector3 } from 'three'
import type { ClipAxis } from '../store/useBodyStore'

const CLIP_SPACE: Record<Exclude<ClipAxis, 'none'>, { normal: Vector3; min: number; max: number }> = {
  axial: { normal: new Vector3(0, -1, 0), min: 0, max: 1.78 },
  sagittal: { normal: new Vector3(-1, 0, 0), min: -0.42, max: 0.42 },
  coronal: { normal: new Vector3(0, 0, -1), min: -0.16, max: 0.18 },
}

/** Writes the slice into `plane`. Geometry on the negative side of the plane is cut away. */
export function setClipPlane(plane: Plane, axis: Exclude<ClipAxis, 'none'>, position: number): Plane {
  const { normal, min, max } = CLIP_SPACE[axis]
  plane.normal.copy(normal)
  plane.constant = min + (max - min) * position
  return plane
}
