// Web Worker: stacks frames strip by strip (bounded memory) and returns RGBA (preview) or a PNG (export).
import { addInto, decayFor, detectStars, drawDemoFrame, gapSegments, lightenInto, stampSegment, type Segment, type Star } from './star-trail-stacker'

export type Src = { kind: 'blob'; blob: Blob; w: number; h: number } | { kind: 'demo'; i: number }
export interface Job {
  id: number
  srcs: Src[]
  W: number
  H: number
  mode: 'lighten' | 'mean'
  tail: number // 1 = no comet fade
  gap: boolean
  shift: number // max star movement between frames, fraction of width
  sens: number // detection k·σ
  png: boolean
}

const ctx = self as unknown as { onmessage: ((e: MessageEvent<Job>) => void) | null; postMessage: (m: unknown, t?: Transferable[]) => void }

async function strip(src: Src, W: number, H: number, y0: number, rows: number): Promise<Uint8ClampedArray> {
  const c = new OffscreenCanvas(W, rows)
  const g = c.getContext('2d', { willReadFrequently: true })!
  if (src.kind === 'demo') {
    g.setTransform(1, 0, 0, 1, 0, -y0)
    drawDemoFrame(g, W, H, src.i)
  } else if (src.w === W && src.h === H) {
    const bmp = await createImageBitmap(src.blob, 0, y0, W, rows)
    g.drawImage(bmp, 0, 0)
    bmp.close()
  } else {
    const bmp = await createImageBitmap(src.blob, { resizeWidth: W, resizeHeight: H, resizeQuality: 'medium' })
    g.drawImage(bmp, 0, -y0)
    bmp.close()
  }
  return g.getImageData(0, 0, W, rows).data
}

async function run(j: Job) {
  const { srcs, W, H } = j
  const n = srcs.length
  const t0 = performance.now()
  // phase 1: star detection at ≤1200 px for gap filling
  const segs: Segment[][] = srcs.map(() => [])
  let starCount = 0
  if (j.gap && j.mode === 'lighten' && n > 1) {
    const aw = Math.min(W, 1200), ah = Math.round((H * aw) / W), scale = W / aw
    let prev: Star[] | null = null
    for (let i = 0; i < n; i++) {
      const d = await strip(srcs[i], aw, ah, 0, ah)
      const st = detectStars(d, aw, ah, j.sens)
      starCount += st.length
      if (prev) segs[i] = gapSegments(prev, st, j.shift * aw, scale, 1)
      prev = st
      ctx.postMessage({ id: j.id, progress: (0.3 * (i + 1)) / n })
    }
  }
  // phase 2: stack strip by strip
  const rowsPer = Math.max(16, Math.min(H, Math.floor(16_000_000 / W)))
  const out = j.png ? new OffscreenCanvas(W, H) : null
  const full = j.png ? null : new Uint8ClampedArray(W * H * 4)
  const decay = decayFor(n, j.tail)
  const strips = Math.ceil(H / rowsPer)
  for (let y0 = 0, si = 0; y0 < H; y0 += rowsPer, si++) {
    const rows = Math.min(rowsPer, H - y0)
    const acc = new Uint8ClampedArray(W * rows * 4)
    const sum = j.mode === 'mean' ? new Float32Array(W * rows * 4) : null
    for (let i = 0; i < n; i++) {
      const d = await strip(srcs[i], W, H, y0, rows)
      if (sum) addInto(sum, d)
      else {
        lightenInto(acc, d, decay)
        for (const s of segs[i]) stampSegment(acc, W, y0, rows, s)
      }
      ctx.postMessage({ id: j.id, progress: (j.gap ? 0.3 : 0) + ((j.gap ? 0.7 : 1) * (si * n + i + 1)) / (strips * n) })
    }
    if (sum) for (let k = 0; k < acc.length; k++) acc[k] = k % 4 === 3 ? 255 : sum[k] / n
    if (out) out.getContext('2d')!.putImageData(new ImageData(acc, W, rows), 0, y0)
    else full!.set(acc, y0 * W * 4)
  }
  const stats = { stars: n ? Math.round(starCount / n) : 0, segments: segs.reduce((a, s) => a + s.length, 0), ms: Math.round(performance.now() - t0) }
  if (out) {
    const blob = await out.convertToBlob({ type: 'image/png' })
    ctx.postMessage({ id: j.id, done: true, blob, stats })
  } else ctx.postMessage({ id: j.id, done: true, rgba: full, W, H, stats }, [full!.buffer])
}

ctx.onmessage = (e) => {
  run(e.data).catch((err: Error) => ctx.postMessage({ id: e.data.id, error: err.message || String(err) }))
}
