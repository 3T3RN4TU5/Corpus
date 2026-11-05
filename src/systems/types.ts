import type { ComponentType, LazyExoticComponent } from 'react'
import type { SimulationState } from '../store/useBodyStore'

/**
 * The contract each body system implements from Phase 2 onward.
 * `TState` is the system's own simulation output, which its model and UI display.
 */
export interface BodySystemPlugin<TState = unknown> {
  id: string
  name: string
  /** The 3D content, loaded only when the system is opened. */
  model: LazyExoticComponent<ComponentType>
  /** Advances the system by `dt` simulated seconds. */
  update: (dt: number, sim: SimulationState, previous: TState) => TState
  ui: LazyExoticComponent<ComponentType>
  /** Ids of the physiology.json entries the system uses. */
  dataSources: string[]
  /** Plain statements of what the system simplifies or leaves out. */
  limits: string[]
}

/** Empty in Phase 1. Phase 2 registers the circulatory system first. */
export const SYSTEM_PLUGINS: BodySystemPlugin[] = []
