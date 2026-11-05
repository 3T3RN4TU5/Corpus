import { timelineCurves, type Meal } from '../systems/digestive/model'
import { simulateDay, type DayPlan } from './day'

export type WorkerRequest =
  | { id: number; kind: 'meal-curves'; meal: Meal }
  | { id: number; kind: 'day'; plan: DayPlan }

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  const result = request.kind === 'meal-curves' ? timelineCurves(request.meal) : simulateDay(request.plan)
  self.postMessage({ id: request.id, result })
}
