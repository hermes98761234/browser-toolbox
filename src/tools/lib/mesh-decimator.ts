// Mesh helpers for the decimator: OBJ parsing to a triangle soup, a deterministic noisy blob sample.

/** Parses Wavefront OBJ `v` / `f` lines (polygons are fan-triangulated, negative indices supported). */
export function parseObj(text: string): Float32Array {
  const v: number[][] = []
  const out: number[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('v ')) {
      const p = line.slice(2).trim().split(/\s+/).map(Number)
      if (p.length < 3 || p.slice(0, 3).some((x) => !Number.isFinite(x))) throw new Error(`Bad vertex: "${line}"`)
      v.push(p.slice(0, 3))
    } else if (line.startsWith('f ')) {
      const ids = line.slice(2).trim().split(/\s+/).map((tok) => {
        const i = parseInt(tok.split('/')[0], 10)
        const k = i < 0 ? v.length + i : i - 1
        if (!Number.isFinite(i) || !v[k]) throw new Error(`Face references missing vertex: "${line}"`)
        return k
      })
      for (let j = 1; j + 1 < ids.length; j++) out.push(...v[ids[0]], ...v[ids[j]], ...v[ids[j + 1]])
    }
  }
  if (!out.length) throw new Error('No faces found in the OBJ file.')
  return new Float32Array(out)
}

/** Smooth 3D value noise (deterministic), roughly in [-1, 1]. */
export function noise3(x: number, y: number, z: number): number {
  const h = (i: number, j: number, k: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453
    return (s - Math.floor(s)) * 2 - 1
  }
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const f = (t: number) => t * t * (3 - 2 * t)
  const u = f(x - xi), w = f(y - yi), q = f(z - zi)
  const L = (a: number, b: number, t: number) => a + (b - a) * t
  return L(
    L(L(h(xi, yi, zi), h(xi + 1, yi, zi), u), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), w),
    L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), w),
    q,
  )
}

/** Fractal noise displacement factor for a unit direction. */
export function rockFactor(x: number, y: number, z: number): number {
  let a = 0, amp = 0.28, fr = 1.3
  for (let o = 0; o < 5; o++) {
    a += amp * noise3(x * fr + 11, y * fr + 7, z * fr + 3)
    amp *= 0.5
    fr *= 2.1
  }
  return 1 + a
}

/** Ratio → whole triangle target (at least 4). */
export function targetTriangles(tris: number, ratio: number): number {
  return Math.max(4, Math.round(tris * Math.min(1, Math.max(0, ratio))))
}
