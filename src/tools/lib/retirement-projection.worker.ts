// Web Worker: runs the retirement Monte Carlo (main projection + return-sensitivity surface) off the main thread.
import { simulate, surface, type Plan } from './retirement-projection'

interface Job { id: number; plan: Plan; paths: number; returns: number[]; seed: number }

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, plan, paths, returns, seed } = e.data
  const t0 = performance.now()
  const fan = simulate(plan, paths, seed)
  const rows = surface(plan, returns, Math.max(200, Math.round(paths / 4)), seed + 1)
  self.postMessage({ id, fan, rows, ms: performance.now() - t0 })
}
