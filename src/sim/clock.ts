import { create } from 'zustand'

/** Simulation speed multipliers offered in the time controls. */
export const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 10, 60, 300, 1000]

interface ClockState {
  playing: boolean
  speed: number
  /** Simulated seconds since the start of the current run. */
  time: number
  /** Length of the scrub bar, in simulated seconds. */
  duration: number
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: number) => void
  setTime: (time: number) => void
  configure: (duration: number, speed: number) => void
  advance: (realSeconds: number) => void
}

export const useClock = create<ClockState>((set, get) => ({
  playing: true,
  speed: 1,
  time: 0,
  duration: 60,
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setTime: (time) => set({ time }),
  // People who prefer reduced motion start paused, and can press play when they choose.
  configure: (duration, speed) => set({ duration, speed, time: 0, playing: !prefersReducedMotion() }),
  advance: (realSeconds) => {
    const { playing, speed, time, duration } = get()
    if (!playing) return
    const next = time + realSeconds * speed
    set({ time: next >= duration ? next % duration : next })
  },
}))

/** Motion preference, used to slow or skip purely decorative animation. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}
