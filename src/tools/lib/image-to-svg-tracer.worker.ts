// Web Worker: threshold + trace off the main thread.
import { run, type Options, type SvgStyle } from './image-to-svg-tracer'

interface Job { id: number; px: Uint8ClampedArray; w: number; h: number; o: Options; st: SvgStyle }

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, px, w, h, o, st } = e.data
  try {
    const t0 = performance.now()
    const res = run(px, w, h, o, st)
    self.postMessage({ id, ok: true, res, ms: performance.now() - t0 }, { transfer: [res.bm.buffer] })
  } catch (err) {
    self.postMessage({ id, ok: false, msg: (err as Error).message })
  }
}
