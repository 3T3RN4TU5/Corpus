export interface Agent {
  x: number
  y: number
  vx: number
  vy: number
}

export interface ImmuneState {
  pathogens: Agent[]
  neutrophils: Agent[]
  time: number
  engulfed: number
  seed: number
}

export interface ImmuneSettings {
  /** How fast pathogens multiply, in doublings per simulated unit. Illustrative. */
  growth: number
  /** How many white blood cells respond. Illustrative. */
  responders: number
}

/** A small repeatable random generator, so that tests and replays behave the same way. */
function random(state: { seed: number }): number {
  state.seed = (state.seed * 1664525 + 1013904223) % 4294967296
  return state.seed / 4294967296
}

const SIZE = 100
const ENGULF_DISTANCE = 3.2
const MAX_PATHOGENS = 240

export function createImmuneState(settings: ImmuneSettings, seed = 12345): ImmuneState {
  const state: ImmuneState = { pathogens: [], neutrophils: [], time: 0, engulfed: 0, seed }
  for (let i = 0; i < 12; i++) {
    state.pathogens.push({ x: 42 + random(state) * 16, y: 42 + random(state) * 16, vx: random(state) - 0.5, vy: random(state) - 0.5 })
  }
  for (let i = 0; i < settings.responders; i++) {
    const edge = i / settings.responders
    state.neutrophils.push({ x: edge * SIZE, y: i % 2 === 0 ? 0 : SIZE, vx: 0, vy: 0 })
  }
  return state
}

/**
 * White cells follow the nearest pathogen, as they follow chemical signals in chemotaxis, and engulf it when they touch it.
 * The behaviours come from the source, and all the counts and speeds are illustrative.
 */
export function stepImmune(state: ImmuneState, dt: number, settings: ImmuneSettings): ImmuneState {
  const next: ImmuneState = { ...state, pathogens: [], neutrophils: [], time: state.time + dt }
  for (const pathogen of state.pathogens) {
    const moved = {
      x: Math.max(0, Math.min(SIZE, pathogen.x + pathogen.vx * dt * 3)),
      y: Math.max(0, Math.min(SIZE, pathogen.y + pathogen.vy * dt * 3)),
      vx: pathogen.vx + (random(next) - 0.5) * 0.3,
      vy: pathogen.vy + (random(next) - 0.5) * 0.3,
    }
    next.pathogens.push(moved)
    if (next.pathogens.length < MAX_PATHOGENS && random(next) < settings.growth * dt) {
      next.pathogens.push({ ...moved, vx: random(next) - 0.5, vy: random(next) - 0.5 })
    }
  }
  const speed = 13
  for (const cell of state.neutrophils) {
    let nearest: Agent | null = null
    let best = Infinity
    for (const pathogen of next.pathogens) {
      const distance = (pathogen.x - cell.x) ** 2 + (pathogen.y - cell.y) ** 2
      if (distance < best) {
        best = distance
        nearest = pathogen
      }
    }
    if (nearest && best < ENGULF_DISTANCE ** 2) {
      next.pathogens = next.pathogens.filter((pathogen) => pathogen !== nearest)
      next.engulfed += 1
    }
    let { vx, vy } = cell
    if (nearest) {
      const length = Math.sqrt(best) || 1
      vx = ((nearest.x - cell.x) / length) * speed
      vy = ((nearest.y - cell.y) / length) * speed
    } else {
      vx *= 0.9
      vy *= 0.9
    }
    next.neutrophils.push({ x: cell.x + vx * dt, y: cell.y + vy * dt, vx, vy })
  }
  return next
}
