import type { ComponentType, LazyExoticComponent } from 'react'
import type { LayerId, SystemId } from '../data/anatomy'
import type { SimulationState } from '../store/useBodyStore'

/** Headline values from a system. The whole-body timeline reads these for every system at once. */
export type SystemSummary = Record<string, number>

/** The contract every body system implements. Models and panels load only when the system is opened. */
export interface BodySystemPlugin {
  id: string
  name: string
  summary: string
  /** Which anatomy systems open this simulation from a selected part. */
  anatomy: SystemId[]
  /** The 3D content shown in the body while the system is open. */
  model: LazyExoticComponent<ComponentType> | null
  /** The panel with controls, charts and explanations. */
  ui: LazyExoticComponent<ComponentType>
  /** Layers that make the system easy to see. */
  layers: Partial<Record<LayerId, number>>
  /** Advances the system by `dt` simulated seconds and returns its state for the next step. */
  update: (dt: number, sim: SimulationState, previous: SystemSummary) => SystemSummary
  /** Ids of the physiology.json entries the system uses. */
  dataSources: string[]
  /** Plain statements of what the system simplifies or leaves out. */
  limits: string[]
}
