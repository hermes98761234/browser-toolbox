// 3D Logo Extruder: studio presets, material recipes, animation timing and GLB inspection.
// Pure data/maths so it can be unit-tested without WebGL.

export type StudioId = 'turntable' | 'hero' | 'floating' | 'neon' | 'flat'
export type Anim = 'spin' | 'bob' | 'sway' | 'none'

export interface Studio {
  label: string
  bg: [string, string]
  floor: 'shadow' | 'mirror' | 'none'
  /** Camera position as multiples of the logo size (logo spans ±2 units). */
  cam: [number, number, number]
  key: { pos: [number, number, number]; intensity: number; color: string }
  fill: number
  rim: { intensity: number; color: string }
  env: number
  anim: Anim
  exposure: number
}

export const STUDIOS: Record<StudioId, Studio> = {
  turntable: { label: 'Turntable', bg: ['#f1f5f9', '#cbd5e1'], floor: 'shadow', cam: [0, 1.6, 7.5], key: { pos: [4, 7, 5], intensity: 2.2, color: '#ffffff' }, fill: 0.7, rim: { intensity: 1.2, color: '#e0f2fe' }, env: 1, anim: 'spin', exposure: 1 },
  hero: { label: 'Hero shot', bg: ['#1e293b', '#020617'], floor: 'mirror', cam: [2.6, 0.9, 6.4], key: { pos: [-5, 4, 4], intensity: 3, color: '#fff7ed' }, fill: 0.25, rim: { intensity: 3.2, color: '#93c5fd' }, env: 0.8, anim: 'sway', exposure: 1.1 },
  floating: { label: 'Floating', bg: ['#fdf2f8', '#e0e7ff'], floor: 'shadow', cam: [0, 0.6, 7.8], key: { pos: [3, 8, 6], intensity: 1.8, color: '#ffffff' }, fill: 0.9, rim: { intensity: 0.8, color: '#fbcfe8' }, env: 1.1, anim: 'bob', exposure: 1 },
  neon: { label: 'Neon night', bg: ['#0a0a1a', '#000000'], floor: 'mirror', cam: [0, 0.8, 7.2], key: { pos: [0, 6, 6], intensity: 0.4, color: '#c4b5fd' }, fill: 0.1, rim: { intensity: 1.5, color: '#f0abfc' }, env: 0.25, anim: 'sway', exposure: 1.2 },
  flat: { label: 'Clean front', bg: ['#ffffff', '#ffffff'], floor: 'none', cam: [0, 0, 8], key: { pos: [2, 4, 8], intensity: 2, color: '#ffffff' }, fill: 1, rim: { intensity: 0.5, color: '#ffffff' }, env: 1, anim: 'none', exposure: 1 },
}

export type MatId = 'svg' | 'chrome' | 'gold' | 'brushed' | 'glass' | 'clay' | 'neon' | 'plastic'
export interface MatRecipe {
  label: string
  /** null = keep each SVG path colour. */
  color: string | null
  metalness: number
  roughness: number
  transmission?: number
  thickness?: number
  ior?: number
  clearcoat?: number
  emissive?: boolean
  emissiveIntensity?: number
}
export const MATERIALS: Record<MatId, MatRecipe> = {
  svg: { label: 'SVG colours (satin)', color: null, metalness: 0.1, roughness: 0.38, clearcoat: 0.4 },
  plastic: { label: 'Glossy plastic', color: '#ef4444', metalness: 0, roughness: 0.18, clearcoat: 1 },
  chrome: { label: 'Polished chrome', color: '#f1f5f9', metalness: 1, roughness: 0.06 },
  gold: { label: 'Gold', color: '#f5c451', metalness: 1, roughness: 0.22 },
  brushed: { label: 'Brushed aluminium', color: '#cbd5e1', metalness: 1, roughness: 0.45 },
  glass: { label: 'Frosted glass', color: '#e0f2fe', metalness: 0, roughness: 0.12, transmission: 1, thickness: 0.6, ior: 1.5 },
  clay: { label: 'Matte clay', color: '#f5f5f4', metalness: 0, roughness: 0.92 },
  neon: { label: 'Neon glow', color: null, metalness: 0, roughness: 0.4, emissive: true, emissiveIntensity: 2.4 },
}

/** Uniform scale so the larger side of a w × h box becomes `target` units. */
export const fitScale = (w: number, h: number, target = 4) => (w > 0 || h > 0 ? target / Math.max(w, h) : 1)

/** Pose of the logo at time t (seconds) for an animation that loops every `period` seconds. */
export function pose(anim: Anim, t: number, period = 6): { rotY: number; y: number; rotX: number } {
  const p = ((t % period) + period) % period / period
  if (anim === 'spin') return { rotY: p * Math.PI * 2, y: 0, rotX: 0 }
  if (anim === 'bob') return { rotY: Math.sin(p * Math.PI * 2) * 0.35, y: Math.sin(p * Math.PI * 4) * 0.18, rotX: Math.sin(p * Math.PI * 2 + 1) * 0.06 }
  if (anim === 'sway') return { rotY: Math.sin(p * Math.PI * 2) * 0.5, y: 0, rotX: 0 }
  return { rotY: 0, y: 0, rotX: 0 }
}

/** Frame timestamps for a loop of `sec` seconds at `fps` (end exclusive so the loop is seamless). */
export function frameTimes(sec: number, fps: number): number[] {
  const n = Math.max(1, Math.round(sec * fps))
  return Array.from({ length: n }, (_, i) => (i * sec) / n)
}

/** Bevel size must stay below half the thinnest stroke or the outline self-intersects. */
export const safeBevel = (bevel: number, minFeature: number) => Math.max(0, Math.min(bevel, minFeature * 0.45))

export interface GlbInfo { version: number; length: number; chunks: { type: string; length: number }[]; json: { asset?: { version?: string; generator?: string }; meshes?: unknown[]; materials?: unknown[]; nodes?: unknown[] } }

/** Validates a binary glTF (GLB) container and reads its JSON chunk. */
export function inspectGlb(b: Uint8Array): GlbInfo {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (b.length < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB file')
  const version = dv.getUint32(4, true), length = dv.getUint32(8, true)
  if (length !== b.length) throw new Error('GLB length mismatch')
  const chunks: GlbInfo['chunks'] = []
  let json: GlbInfo['json'] = {}
  for (let o = 12; o + 8 <= length; ) {
    const len = dv.getUint32(o, true)
    const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]).replace(/\0/g, '')
    if (type === 'JSON') json = JSON.parse(new TextDecoder().decode(b.subarray(o + 8, o + 8 + len)))
    chunks.push({ type, length: len })
    o += 8 + len
  }
  return { version, length, chunks, json }
}

export const SAMPLES: Record<string, string> = {
  'Orbit mark': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <path fill="#6366f1" fill-rule="evenodd" d="M100 10 A90 90 0 1 1 99.9 10 Z M100 34 A66 66 0 1 0 100.1 34 Z"/>
  <path fill="#f59e0b" d="M100 58 L112 88 L144 90 L119 110 L128 142 L100 124 L72 142 L81 110 L56 90 L88 88 Z"/>
</svg>`,
  'Peak & co': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">
  <path fill="#0ea5e9" d="M10 150 L80 30 L120 95 L145 60 L230 150 Z"/>
  <path fill="#f8fafc" d="M80 30 L98 61 L86 55 L76 66 L66 54 Z"/>
  <path fill="#10b981" d="M10 150 L230 150 L230 158 L10 158 Z"/>
</svg>`,
  'Bolt badge': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <path fill="#ef4444" fill-rule="evenodd" d="M100 8 L180 54 L180 146 L100 192 L20 146 L20 54 Z M100 34 L42 67 L42 133 L100 166 L158 133 L158 67 Z"/>
  <path fill="#facc15" d="M112 46 L66 112 L94 112 L84 156 L136 86 L106 86 L120 46 Z"/>
</svg>`,
}
