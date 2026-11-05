/**
 * What running simulations want the 3D body to show. Simulations write here every frame, and the scene reads it
 * in its render loop, so that animation never causes React to re-render.
 */
export const bodyEffects = {
  /** Scale of a part around its centre, keyed by part id. A missing entry means normal size. */
  scale: new Map<string, number | [number, number, number]>(),
  /** Glow from 0 to 1, keyed by part id. */
  glow: new Map<string, number>(),
  /** Uniform size of the whole body, about the ground. */
  bodyScale: 1,
}

export function clearBodyEffects(): void {
  bodyEffects.scale.clear()
  bodyEffects.glow.clear()
  bodyEffects.bodyScale = 1
}
