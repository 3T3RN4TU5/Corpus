import { Plane, Vector3 } from 'three'
import type { ClipAxis } from '../store/useBodyStore'

const NORMALS: Record<Exclude<ClipAxis, 'none'>, Vector3> = {
  axial: new Vector3(0, -1, 0),
  sagittal: new Vector3(-1, 0, 0),
  coronal: new Vector3(0, 0, -1),
}

/** Writes the slice into `plane`. Geometry on the negative side of the plane is cut away. */
export function setClipPlane(
  plane: Plane,
  axis: Exclude<ClipAxis, 'none'>,
  position: number,
  size: { height: number; width: number },
): Plane {
  const ranges = {
    axial: [0, size.height + 0.02],
    sagittal: [-size.width / 2 - 0.01, size.width / 2 + 0.01],
    coronal: [-0.19, 0.19],
  }
  const [min, max] = ranges[axis]
  plane.normal.copy(NORMALS[axis])
  plane.constant = min + (max - min) * position
  return plane
}
