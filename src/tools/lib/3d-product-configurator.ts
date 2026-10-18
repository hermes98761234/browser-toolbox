// Product/part definitions, material presets and config validation for the 3D product configurator.

export type MatKind = 'matte' | 'satin' | 'gloss' | 'metal' | 'brushed' | 'rubber' | 'fabric' | 'leather' | 'glass'
export interface MatParams { roughness: number; metalness: number; clearcoat: number; sheen: number; transmission: number; opacity: number }

export const MATS: Record<MatKind, [label: string, p: MatParams]> = {
  matte: ['Matte plastic', { roughness: 0.85, metalness: 0, clearcoat: 0, sheen: 0, transmission: 0, opacity: 1 }],
  satin: ['Satin', { roughness: 0.45, metalness: 0, clearcoat: 0.2, sheen: 0, transmission: 0, opacity: 1 }],
  gloss: ['Gloss lacquer', { roughness: 0.12, metalness: 0, clearcoat: 1, sheen: 0, transmission: 0, opacity: 1 }],
  metal: ['Polished metal', { roughness: 0.18, metalness: 1, clearcoat: 0, sheen: 0, transmission: 0, opacity: 1 }],
  brushed: ['Brushed metal', { roughness: 0.42, metalness: 1, clearcoat: 0, sheen: 0, transmission: 0, opacity: 1 }],
  rubber: ['Rubber', { roughness: 0.95, metalness: 0, clearcoat: 0, sheen: 0, transmission: 0, opacity: 1 }],
  fabric: ['Fabric / knit', { roughness: 1, metalness: 0, clearcoat: 0, sheen: 1, transmission: 0, opacity: 1 }],
  leather: ['Leather', { roughness: 0.6, metalness: 0, clearcoat: 0.35, sheen: 0.3, transmission: 0, opacity: 1 }],
  glass: ['Glass / clear', { roughness: 0.04, metalness: 0, clearcoat: 1, sheen: 0, transmission: 0.92, opacity: 1 }],
}

export interface PartDef { id: string; name: string; color: string; mat: MatKind; mats: MatKind[] }
export interface PartCfg { color: string; mat: MatKind }
export type ProductId = 'sneaker' | 'chair' | 'bottle'

const P = (id: string, name: string, color: string, mat: MatKind, mats: MatKind[]): PartDef => ({ id, name, color, mat, mats })
export const PRODUCTS: Record<ProductId, { name: string; parts: PartDef[]; presets: Record<string, Record<string, string>> }> = {
  sneaker: {
    name: 'Sneaker',
    parts: [
      P('upper', 'Upper', '#c9d3df', 'fabric', ['fabric', 'leather', 'satin', 'matte']),
      P('accent', 'Side panel', '#1f6feb', 'leather', ['leather', 'satin', 'gloss', 'fabric', 'metal']),
      P('midsole', 'Midsole', '#ffffff', 'matte', ['matte', 'satin', 'gloss', 'rubber']),
      P('outsole', 'Outsole', '#2b2b2b', 'rubber', ['rubber', 'matte', 'glass']),
      P('laces', 'Laces', '#ffffff', 'fabric', ['fabric', 'satin']),
      P('lining', 'Collar lining', '#2b2f36', 'fabric', ['fabric', 'leather']),
      P('heel', 'Heel tab', '#1f6feb', 'leather', ['leather', 'satin', 'metal', 'gloss']),
    ],
    presets: {
      Classic: { upper: '#c9d3df', accent: '#1f6feb', midsole: '#ffffff', outsole: '#2b2b2b', laces: '#ffffff', lining: '#2b2f36', heel: '#1f6feb' },
      Midnight: { upper: '#1c1f26', accent: '#3a3f4b', midsole: '#24272e', outsole: '#0f1013', laces: '#1c1f26', lining: '#3a3f4b', heel: '#c9a227' },
      Neon: { upper: '#e9ff70', accent: '#ff3d7f', midsole: '#ffffff', outsole: '#7a5cff', laces: '#ff3d7f', lining: '#7a5cff', heel: '#ff3d7f' },
      Earth: { upper: '#c8b08a', accent: '#6b4f2a', midsole: '#efe6d2', outsole: '#4a3a24', laces: '#6b4f2a', lining: '#8a6d45', heel: '#6b4f2a' },
    },
  },
  chair: {
    name: 'Lounge chair',
    parts: [
      P('frame', 'Legs & frame', '#c08a52', 'satin', ['satin', 'matte', 'metal', 'brushed', 'gloss']),
      P('seat', 'Seat shell', '#2f3e46', 'satin', ['satin', 'matte', 'gloss', 'leather']),
      P('back', 'Backrest', '#2f3e46', 'satin', ['satin', 'matte', 'gloss', 'leather']),
      P('cushion', 'Cushion', '#e07a5f', 'fabric', ['fabric', 'leather']),
    ],
    presets: {
      Walnut: { frame: '#7a4e2d', seat: '#2f3e46', back: '#2f3e46', cushion: '#e07a5f' },
      Scandi: { frame: '#e3c99a', seat: '#f2efe9', back: '#f2efe9', cushion: '#9fb8ad' },
      Industrial: { frame: '#3b3b3b', seat: '#8d8d8d', back: '#8d8d8d', cushion: '#2a2a2a' },
      Retro: { frame: '#d9a441', seat: '#c1440e', back: '#c1440e', cushion: '#f3d6a4' },
    },
  },
  bottle: {
    name: 'Bottle',
    parts: [
      P('body', 'Bottle', '#cfe8ef', 'glass', ['glass', 'gloss', 'matte', 'brushed', 'metal']),
      P('liquid', 'Contents', '#e2a72e', 'glass', ['glass', 'gloss', 'matte']),
      P('cap', 'Cap', '#1d1d1f', 'matte', ['matte', 'gloss', 'metal', 'brushed', 'rubber']),
      P('label', 'Label', '#fbf6ec', 'matte', ['matte', 'satin', 'gloss', 'metal']),
    ],
    presets: {
      Honey: { body: '#cfe8ef', liquid: '#e2a72e', cap: '#1d1d1f', label: '#fbf6ec' },
      Ocean: { body: '#bfe3ff', liquid: '#2a7fff', cap: '#f5f5f5', label: '#0b2545' },
      Forest: { body: '#a9c5a0', liquid: '#3f6b2a', cap: '#b08d57', label: '#efe6d2' },
      Steel: { body: '#c0c4c8', liquid: '#999999', cap: '#202020', label: '#ff5a36' },
    },
  },
}

export const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s)

/** Fills missing parts with defaults and drops invalid colours/materials (e.g. from a hand-edited share link). */
export function normalize(defs: PartDef[], cfg: Record<string, Partial<PartCfg>> | undefined): Record<string, PartCfg> {
  const out: Record<string, PartCfg> = {}
  for (const d of defs) {
    const c = cfg?.[d.id]
    out[d.id] = { color: isHex(c?.color) ? c.color.toLowerCase() : d.color, mat: c?.mat && c.mat in MATS ? c.mat : d.mat }
  }
  return out
}

/** Distinct, readable part ids for an uploaded model's materials. */
export function partIds(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((n, i) => {
    const base = (n || `Material ${i + 1}`).trim().slice(0, 40) || `Material ${i + 1}`
    const k = seen.get(base) ?? 0
    seen.set(base, k + 1)
    return k ? `${base} (${k + 1})` : base
  })
}

/** Plain-text spec sheet for the current configuration. */
export function spec(title: string, defs: PartDef[], cfg: Record<string, PartCfg>): string {
  const w = Math.max(...defs.map((d) => d.name.length))
  return [`${title} — configuration`, ...defs.map((d) => `${d.name.padEnd(w)}  ${cfg[d.id].color.toUpperCase()}  ${MATS[cfg[d.id].mat][0]}`)].join('\n')
}

/** Relative luminance (sRGB) — used to pick readable label text on the bottle label. */
export function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
}
