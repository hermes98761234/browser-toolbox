// STL parsing (binary + ASCII), mesh measurements and sample-model generation.

export interface Mesh { pos: Float32Array; name: string }

export function parseStl(buf: ArrayBuffer): Mesh {
  const dv = new DataView(buf)
  if (buf.byteLength >= 84) {
    const n = dv.getUint32(80, true)
    if (84 + n * 50 === buf.byteLength) {
      const pos = new Float32Array(n * 9)
      for (let i = 0; i < n; i++) {
        const o = 84 + i * 50 + 12
        for (let k = 0; k < 9; k++) pos[i * 9 + k] = dv.getFloat32(o + k * 4, true)
      }
      const name = new TextDecoder().decode(new Uint8Array(buf, 0, 80)).replace(/\0.*$/s, '').trim()
      return { pos, name }
    }
  }
  const text = new TextDecoder().decode(buf)
  if (!/^\s*solid/i.test(text) || !/facet/i.test(text)) throw new Error('Not a valid STL file (neither binary nor ASCII).')
  const nums: number[] = []
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) nums.push(+m[1], +m[2], +m[3])
  if (!nums.length || nums.length % 9) throw new Error('ASCII STL has no complete triangles.')
  return { pos: new Float32Array(nums), name: /^\s*solid\s+(.*)$/im.exec(text)?.[1].trim() ?? '' }
}

export interface Stats {
  triangles: number
  min: [number, number, number]
  max: [number, number, number]
  size: [number, number, number]
  volume: number
  area: number
  centroid: [number, number, number]
  openEdges: number
  nonManifold: number
}

/** Volume by signed tetrahedra (divergence theorem), surface area, bbox, manifold check. */
export function measure(pos: Float32Array): Stats {
  const n = pos.length / 9
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  let vol = 0, area = 0, cx = 0, cy = 0, cz = 0
  const edges = new Map<string, number>()
  const q = (v: number) => Math.round(v * 1e4) + 0 // +0 turns −0 into 0
  const key = (i: number) => `${q(pos[i])},${q(pos[i + 1])},${q(pos[i + 2])}`
  for (let t = 0; t < n; t++) {
    const o = t * 9
    const ax = pos[o], ay = pos[o + 1], az = pos[o + 2]
    const bx = pos[o + 3], by = pos[o + 4], bz = pos[o + 5]
    const qx = pos[o + 6], qy = pos[o + 7], qz = pos[o + 8]
    for (let k = 0; k < 9; k += 3) for (let d = 0; d < 3; d++) {
      const v = pos[o + k + d]
      if (v < min[d]) min[d] = v
      if (v > max[d]) max[d] = v
    }
    const v6 = ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx)
    vol += v6
    cx += v6 * (ax + bx + qx); cy += v6 * (ay + by + qy); cz += v6 * (az + bz + qz)
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = qx - ax, wy = qy - ay, wz = qz - az
    area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2
    const ka = key(o), kb = key(o + 3), kc = key(o + 6)
    for (const [p, q] of [[ka, kb], [kb, kc], [kc, ka]]) {
      const e = p < q ? `${p}|${q}` : `${q}|${p}`
      edges.set(e, (edges.get(e) ?? 0) + 1)
    }
  }
  let openEdges = 0, nonManifold = 0
  for (const c of edges.values()) { if (c === 1) openEdges++; else if (c > 2) nonManifold++ }
  const V = vol / 6
  const cen: [number, number, number] = vol ? [cx / (4 * vol), cy / (4 * vol), cz / (4 * vol)] : [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  return { triangles: n, min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], volume: Math.abs(V), area, centroid: cen, openEdges, nonManifold }
}

/** Binary STL writer. */
export function toBinaryStl(pos: Float32Array, name = 'model'): ArrayBuffer {
  const n = pos.length / 9
  const buf = new ArrayBuffer(84 + n * 50)
  const dv = new DataView(buf)
  new Uint8Array(buf, 0, 80).set(new TextEncoder().encode(name.slice(0, 79)))
  dv.setUint32(80, n, true)
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50
    const p = pos.subarray(i * 9, i * 9 + 9)
    const ux = p[3] - p[0], uy = p[4] - p[1], uz = p[5] - p[2], wx = p[6] - p[0], wy = p[7] - p[1], wz = p[8] - p[2]
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l; ny /= l; nz /= l
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true)
    for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, p[k], true)
  }
  return buf
}

/** Watertight surface of revolution / sweep from a grid of points (u wraps, v capped). */
function gridMesh(nu: number, nv: number, f: (u: number, v: number) => [number, number, number], capBottom?: [number, number, number], capTop?: [number, number, number]): Float32Array {
  const out: number[] = []
  const P = (i: number, j: number) => f((i % nu) / nu, j / (nv - 1))
  const tri = (a: number[], b: number[], c: number[]) => out.push(...a, ...b, ...c)
  for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu; i++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1)
    tri(a, b, c); tri(a, c, d)
  }
  if (capBottom) for (let i = 0; i < nu; i++) tri(capBottom, P(i + 1, 0), P(i, 0))
  if (capTop) for (let i = 0; i < nu; i++) tri(capTop, P(i, nv - 1), P(i + 1, nv - 1))
  return new Float32Array(out)
}

export function sampleCube(s = 20): Float32Array {
  const v = [[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0], [0, 0, s], [s, 0, s], [s, s, s], [0, s, s]]
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]
  return new Float32Array(f.flatMap((t) => t.flatMap((i) => v[i])))
}

export function sampleTorus(R = 30, r = 10, nu = 96, nv = 48): Float32Array {
  const out: number[] = []
  const P = (i: number, j: number) => {
    const u = ((i % nu) / nu) * Math.PI * 2, v = ((j % nv) / nv) * Math.PI * 2
    return [(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v) + r]
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1)
    out.push(...a, ...b, ...c, ...a, ...c, ...d)
  }
  return new Float32Array(out)
}

/** Twisted, fluted vase (solid, watertight). */
export function sampleVase(): Float32Array {
  const H = 80
  return gridMesh(
    128, 60,
    (u, v) => {
      const a = u * Math.PI * 2 + v * 1.2
      const r = 18 + 8 * Math.sin(v * Math.PI * 1.3) + 2.2 * Math.cos(u * Math.PI * 2 * 8)
      return [r * Math.cos(a), r * Math.sin(a), v * H]
    },
    [0, 0, 0],
    [0, 0, H],
  )
}
