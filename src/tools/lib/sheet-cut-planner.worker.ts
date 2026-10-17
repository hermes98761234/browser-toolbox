import { optimize, type Opts, type Part } from './sheet-cut-planner'

self.onmessage = (e: MessageEvent<{ id: number; parts: Part[]; opts: Opts; restarts: number }>) => {
  const { id, parts, opts, restarts } = e.data
  self.postMessage({ id, plan: optimize(parts, opts, restarts) })
}
