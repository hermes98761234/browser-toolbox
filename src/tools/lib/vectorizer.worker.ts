// Web Worker: runs the whole tracing pipeline off the main thread.
import { trace, type Options } from './vectorizer'

interface Job { id: number; px: Uint8ClampedArray; w: number; h: number; o: Options }

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, px, w, h, o } = e.data
  try {
    const t0 = performance.now()
    const res = trace(px, w, h, o, (f) => self.postMessage({ id, type: 'progress', f }))
    self.postMessage({ id, type: 'done', res, ms: performance.now() - t0 })
  } catch (err) {
    self.postMessage({ id, type: 'error', msg: (err as Error).message })
  }
}
