// Web Worker: quantises and LZW-encodes GIF frames off the main thread.
import { encodeGif, type EncodeOpts } from './video-to-gif'

interface Job { w: number; h: number; frames: Uint8ClampedArray[]; delays: number[]; opts: EncodeOpts }

const ctx = self as unknown as { onmessage: ((e: MessageEvent<Job>) => void) | null; postMessage: (m: unknown, t?: Transferable[]) => void }

ctx.onmessage = (e) => {
  const { w, h, frames, delays, opts } = e.data
  try {
    let last = 0
    const r = encodeGif(w, h, frames, delays, opts, (p) => {
      if (p - last > 0.02 || p === 1) {
        last = p
        ctx.postMessage({ progress: p })
      }
    })
    ctx.postMessage({ done: true, bytes: r.bytes, colors: r.colors, frames: r.frames }, [r.bytes.buffer])
  } catch (err) {
    ctx.postMessage({ error: (err as Error).message })
  }
}
