// Web Worker: runs exact t-SNE off the main thread and streams intermediate layouts.
import { tsne } from './embedding-projector'

interface Job { X: number[][]; dims: number; perplexity: number; iterations: number }

const ctx = self as unknown as { onmessage: ((e: MessageEvent<Job>) => void) | null; postMessage: (m: unknown) => void }

ctx.onmessage = (e) => {
  const { X, dims, perplexity, iterations } = e.data
  const t0 = performance.now()
  tsne(X, {
    dims, perplexity, iterations, every: 10,
    onStep: (iter, Y, kl) => ctx.postMessage({ iter, Y: Array.from(Y), kl, ms: performance.now() - t0, done: iter >= iterations }),
  })
}
