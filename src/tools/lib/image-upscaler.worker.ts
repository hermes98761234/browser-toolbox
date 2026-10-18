// Web Worker: runs the upscaling pipeline off the main thread and reports progress.
import { upscale, type Job } from './image-upscaler'

interface Msg { id: number; d: Uint8ClampedArray; w: number; h: number; job: Job }

self.onmessage = (e: MessageEvent<Msg>) => {
  const { id, d, w, h, job } = e.data
  try {
    let last = 0
    const r = upscale({ w, h, d }, job, (p) => {
      const now = performance.now()
      if (now - last > 80 || p >= 1) {
        last = now
        self.postMessage({ id, progress: p })
      }
    })
    self.postMessage({ id, done: true, d: r.d, w: r.w, h: r.h }, { transfer: [r.d.buffer] })
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
