// Pure helpers for the 3D format converter: format sniffing, names, sizes, unit scales.

export type Fmt3D = 'obj' | 'stl' | 'ply' | 'glb'
export const FORMATS: Fmt3D[] = ['obj', 'stl', 'ply', 'glb']

/** Detects a model format from the file name, falling back to magic bytes. */
export function detectFormat(name: string, head: Uint8Array): Fmt3D | 'gltf' | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  const ascii = String.fromCharCode(...head.slice(0, 16))
  if (ascii.startsWith('glTF')) return 'glb'
  if (ascii.startsWith('ply')) return 'ply'
  if (ext === 'gltf') return 'gltf'
  if (ext === 'obj' || ext === 'stl' || ext === 'ply' || ext === 'glb') return ext
  if (/^solid\s/.test(ascii)) return 'stl'
  if (/^(#|v |o |g |mtllib)/.test(ascii)) return 'obj'
  return null
}

/** Binary STL check: 84-byte header + 50 bytes per triangle must match the file length. */
export function isBinaryStl(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 84) return false
  const n = new DataView(buf).getUint32(80, true)
  return 84 + n * 50 === buf.byteLength
}

/** Swaps (or appends) the extension. */
export function outName(name: string, fmt: Fmt3D): string {
  const base = name.replace(/\.[^./\\]+$/, '') || 'model'
  return `${base}.${fmt}`
}

/** Makes names unique inside a ZIP: a.stl, a (2).stl, … */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((n) => {
    const k = n.toLowerCase()
    const c = (seen.get(k) ?? 0) + 1
    seen.set(k, c)
    return c === 1 ? n : n.replace(/(\.[^.]+)?$/, (e) => ` (${c})${e}`)
  })
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 ** 2).toFixed(2)} MB`
}

/** Scale factors between length units (to metres). */
export const UNITS = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 } as const
export type Unit = keyof typeof UNITS
export const unitScale = (from: Unit, to: Unit) => UNITS[from] / UNITS[to]

/** Expected binary STL size for a triangle count. */
export const stlBinarySize = (tris: number) => 84 + 50 * tris
