// Runs a Monte Carlo simulation off the main thread.
import { run, type Input } from './monte-carlo-simulator'

const ctx = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage: (m: unknown) => void }

ctx.onmessage = (e: MessageEvent<{ id: number; expr: string; inputs: Input[]; n: number; seed: number; threshold: number }>) => {
  const { id, expr, inputs, n, seed, threshold } = e.data
  const t0 = performance.now()
  try {
    const r = run(expr, inputs, n, seed, threshold)
    // send a thinned CDF instead of every sample
    const cdf: [number, number][] = []
    const step = Math.max(1, Math.floor(r.sorted.length / 400))
    for (let i = 0; i < r.sorted.length; i += step) cdf.push([r.sorted[i], i / (r.sorted.length - 1 || 1)])
    if (r.sorted.length) cdf.push([r.sorted[r.sorted.length - 1], 1])
    ctx.postMessage({ id, ok: true, ms: performance.now() - t0, result: { ...r, sorted: undefined, cdf } })
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: (err as Error).message })
  }
}
