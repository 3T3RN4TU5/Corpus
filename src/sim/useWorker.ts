import type { TimelineCurves, Meal } from '../systems/digestive/model'
import type { DayPlan, DayResult } from './day'
import type { WorkerRequest } from './sim.worker'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, (result: unknown) => void>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ id: number; result: unknown }>) => {
      pending.get(event.data.id)?.(event.data.result)
      pending.delete(event.data.id)
    }
  }
  return worker
}

function send<T>(request: Omit<WorkerRequest, 'id'>): Promise<T> {
  return new Promise((resolve) => {
    const id = nextId++
    pending.set(id, resolve as (result: unknown) => void)
    getWorker().postMessage({ ...request, id })
  })
}

export const computeMealCurves = (meal: Meal) => send<TimelineCurves>({ kind: 'meal-curves', meal } as Omit<WorkerRequest, 'id'>)
export const computeDay = (plan: DayPlan) => send<DayResult>({ kind: 'day', plan } as Omit<WorkerRequest, 'id'>)
