// Web Worker: loudness measurement and normalisation off the main thread.
import { measure, normalize, type Measure, type NormOptions } from './loudness-normalizer'

type Job =
  | { id: number; type: 'measure'; ch: Float32Array[]; fs: number }
  | { id: number; type: 'normalize'; ch: Float32Array[]; fs: number; m: Measure; o: NormOptions }

self.onmessage = (e: MessageEvent<Job>) => {
  const j = e.data
  try {
    if (j.type === 'measure') {
      self.postMessage({ id: j.id, ok: true, m: measure(j.ch, j.fs) })
    } else {
      const r = normalize(j.ch, j.fs, j.m, j.o)
      const after = measure(r.out, j.fs)
      self.postMessage({ id: j.id, ok: true, r, after }, { transfer: r.out.map((c) => c.buffer as ArrayBuffer) })
    }
  } catch (err) {
    self.postMessage({ id: j.id, ok: false, msg: (err as Error).message })
  }
}
