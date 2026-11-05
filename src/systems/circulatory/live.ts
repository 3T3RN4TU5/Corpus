import { factNumber } from '../../data/physiology'

/** Current values shared with the 3D scene, updated by the lab panel. */
export const circulatoryLive = {
  heartRate: factNumber('heart-rate-rest-adult'),
  systolic: factNumber('bp-systolic'),
  diastolic: factNumber('bp-diastolic'),
  cardiacOutput: factNumber('cardiac-output-rest'),
}
