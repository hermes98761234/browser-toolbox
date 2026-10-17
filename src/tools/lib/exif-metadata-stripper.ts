// Privacy audit for photo metadata: per-field risk ratings, selective EXIF rebuild, GPS → nearest city.
import { writeTiff, type Tag, type WEntry } from './exif-viewer'

export type Risk = 'high' | 'medium' | 'low'
export type Cat = 'Location' | 'Identity' | 'Device' | 'Time' | 'Camera settings' | 'Image'

const RULES: [RegExp, Risk, Cat, string][] = [
  [/^GPS/, 'high', 'Location', 'Pinpoints where the photo was taken — often your home.'],
  [/^(BodySerialNumber|LensSerialNumber)$/, 'high', 'Device', 'Unique serial links every photo you take to the same camera.'],
  [/^ImageUniqueID$/, 'high', 'Identity', 'Unique ID that can track the file across sites.'],
  [/^CameraOwnerName$/, 'high', 'Identity', 'Your name as set in the camera.'],
  [/^(UserComment|ImageDescription)$/, 'high', 'Identity', 'Free text — may contain names, places or notes.'],
  [/^MakerNote$/, 'high', 'Device', 'Opaque vendor block; can hide serials, face data or location.'],
  [/^(Artist|Copyright)$/, 'medium', 'Identity', 'Names the author — keep only if you want attribution.'],
  [/^(DateTime|DateTimeOriginal|DateTimeDigitized|SubSecTime.*|OffsetTime.*)$/, 'medium', 'Time', 'Reveals when — and with the offset, roughly where — the photo was taken.'],
  [/^(Make|Model|LensMake|LensModel|LensSpecification)$/, 'medium', 'Device', 'Identifies your device; helps link photos together.'],
  [/^Software$/, 'medium', 'Device', 'Phone OS / editor version.'],
  [/^(Orientation|XResolution|YResolution|ResolutionUnit|YCbCrPositioning|ColorSpace|PixelXDimension|PixelYDimension|ImageWidth|ImageHeight)$/, 'low', 'Image', 'Technical; needed for correct display.'],
]

export function riskOf(name: string): { risk: Risk; cat: Cat; why: string } {
  for (const [re, risk, cat, why] of RULES) if (re.test(name)) return { risk, cat, why }
  return { risk: 'low', cat: 'Camera settings', why: 'Exposure / lens settings; harmless for most people.' }
}

export const WEIGHT: Record<Risk, number> = { high: 20, medium: 6, low: 1 }

/** 0–100 exposure score from tag names and metadata block kinds. GPS counts once (40). */
export function exposureScore(names: string[], blocks: { kind: string }[], hasThumb: boolean): number {
  let s = names.some((n) => n.startsWith('GPS')) ? 40 : 0
  for (const n of names) if (!n.startsWith('GPS')) s += WEIGHT[riskOf(n).risk]
  for (const b of blocks) if (/XMP|IPTC/.test(b.kind)) s += 10
  else if (/Comment|Text/.test(b.kind)) s += 6
  if (hasThumb) s += 10
  return Math.min(100, s)
}

export const level = (score: number): Risk => (score >= 40 ? 'high' : score >= 12 ? 'medium' : 'low')

const WRITABLE = new Set([2, 3, 4, 5, 10])
const POINTER = /Pointer$/

/** Can this tag be re-written into a fresh EXIF block? */
export const keepable = (t: Tag) => WRITABLE.has(t.type) && !POINTER.test(t.name) && t.ifd !== 'IFD1' && t.ifd !== 'Interop'

/** Builds a TIFF block containing only `keep` tags (by name). Returns null when nothing is kept. */
export function keptTiff(tags: Tag[], keep: Set<string>): Uint8Array | null {
  const out: Record<'IFD0' | 'Exif' | 'GPS', WEntry[]> = { IFD0: [], Exif: [], GPS: [] }
  for (const t of tags) {
    if (!keep.has(t.name) || !keepable(t) || !(t.ifd in out)) continue
    let value: WEntry['value']
    if (t.type === 2) value = String(t.value)
    else if (t.type === 5 || t.type === 10) value = t.value as [number, number][]
    else value = Array.isArray(t.value) ? (t.value as number[]) : [Number(t.value)]
    out[t.ifd as 'IFD0' | 'Exif' | 'GPS'].push({ id: t.id, type: t.type as WEntry['type'], value })
  }
  for (const k of ['IFD0', 'Exif', 'GPS'] as const) out[k].sort((a, b) => a.id - b.id)
  if (!out.IFD0.length && !out.Exif.length && !out.GPS.length) return null
  // GPS/Exif sub-IFDs need a parent IFD0; an empty IFD0 is legal in TIFF
  return writeTiff(out.IFD0, out.Exif, out.GPS)
}

export const PRESETS: Record<string, (names: string[]) => string[]> = {
  'Strip everything': (n) => n.filter((x) => x === 'Orientation'),
  'Privacy-safe': (n) => n.filter((x) => riskOf(x).risk === 'low'),
  Photographer: (n) => n.filter((x) => riskOf(x).risk === 'low' || x === 'Artist' || x === 'Copyright'),
  'Keep all but location': (n) => n.filter((x) => !x.startsWith('GPS')),
}

// ---------- geography ----------

export function haversine(la1: number, lo1: number, la2: number, lo2: number): number {
  const r = Math.PI / 180
  const a = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)))
}

const CITY_DATA =
  'London 51.507 -0.128|Paris 48.857 2.352|Berlin 52.52 13.405|Madrid 40.417 -3.704|Rome 41.903 12.496|Amsterdam 52.368 4.904|Brussels 50.85 4.352|Vienna 48.208 16.373|Prague 50.075 14.438|Warsaw 52.23 21.012|Kyiv 50.45 30.524|Lviv 49.84 24.03|Kharkiv 49.993 36.231|Odesa 46.482 30.723|Budapest 47.498 19.04|Bucharest 44.427 26.103|Athens 37.984 23.728|Istanbul 41.008 28.978|Stockholm 59.329 18.069|Oslo 59.914 10.752|Copenhagen 55.676 12.568|Helsinki 60.17 24.938|Dublin 53.35 -6.26|Lisbon 38.722 -9.139|Barcelona 41.385 2.173|Milan 45.464 9.19|Munich 48.135 11.582|Zurich 47.377 8.541|Moscow 55.756 37.617|New York 40.713 -74.006|Los Angeles 34.052 -118.244|Chicago 41.878 -87.63|San Francisco 37.775 -122.419|Seattle 47.606 -122.332|Miami 25.762 -80.192|Toronto 43.653 -79.383|Vancouver 49.283 -123.121|Mexico City 19.433 -99.133|São Paulo -23.551 -46.633|Rio de Janeiro -22.907 -43.173|Buenos Aires -34.604 -58.382|Lima -12.046 -77.043|Bogotá 4.711 -74.072|Cairo 30.044 31.236|Lagos 6.524 3.379|Nairobi -1.292 36.822|Johannesburg -26.204 28.047|Cape Town -33.925 18.424|Casablanca 33.573 -7.59|Dubai 25.205 55.271|Tel Aviv 32.085 34.782|Mumbai 19.076 72.878|Delhi 28.704 77.102|Bangalore 12.972 77.595|Bangkok 13.756 100.502|Singapore 1.352 103.82|Jakarta -6.209 106.846|Manila 14.6 120.984|Hong Kong 22.32 114.169|Shanghai 31.23 121.474|Beijing 39.904 116.407|Seoul 37.567 126.978|Tokyo 35.676 139.65|Osaka 34.694 135.502|Sydney -33.869 151.209|Melbourne -37.814 144.963|Auckland -36.848 174.763|Honolulu 21.307 -157.858|Reykjavik 64.147 -21.942|Anchorage 61.218 -149.9'
export const CITIES: [string, number, number][] = CITY_DATA.split('|').map((s) => {
  const p = s.split(' ')
  return [p.slice(0, -2).join(' '), Number(p[p.length - 2]), Number(p[p.length - 1])]
})

export function nearestCity(lat: number, lon: number): { name: string; km: number; bearing: string } {
  let best = CITIES[0], bd = Infinity
  for (const c of CITIES) {
    const d = haversine(lat, lon, c[1], c[2])
    if (d < bd) { bd = d; best = c }
  }
  const r = Math.PI / 180
  const y = Math.sin((lon - best[2]) * r) * Math.cos(lat * r)
  const x = Math.cos(best[1] * r) * Math.sin(lat * r) - Math.sin(best[1] * r) * Math.cos(lat * r) * Math.cos((lon - best[2]) * r)
  const deg = (Math.atan2(y, x) / r + 360) % 360
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return { name: best[0], km: bd, bearing: dirs[Math.round(deg / 45) % 8] }
}

/** Web-Mercator tile coordinates (fractional) for a point. */
export function tileXY(lat: number, lon: number, z: number): [number, number] {
  const n = 2 ** z
  const x = ((lon + 180) / 360) * n
  const lr = (lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n
  return [x, y]
}

/** Very coarse continent outlines (lon, lat) for an offline world map. */
export const LAND: [number, number][][] = [
  [[-168, 66], [-162, 70], [-140, 70], [-120, 72], [-95, 72], [-80, 73], [-62, 66], [-55, 52], [-66, 45], [-70, 42], [-76, 35], [-81, 31], [-80, 25], [-82, 29], [-90, 30], [-97, 27], [-97, 22], [-92, 18], [-87, 21], [-88, 16], [-83, 10], [-79, 8], [-86, 12], [-92, 15], [-105, 20], [-110, 24], [-115, 30], [-117, 33], [-122, 37], [-124, 42], [-124, 48], [-130, 54], [-140, 60], [-152, 58], [-165, 60]],
  [[-45, 60], [-20, 70], [-18, 80], [-40, 83], [-60, 82], [-72, 78], [-55, 70]],
  [[-80, 9], [-75, 11], [-62, 11], [-50, 0], [-35, -5], [-39, -15], [-48, -25], [-58, -35], [-65, -42], [-68, -52], [-72, -54], [-75, -45], [-72, -30], [-71, -18], [-77, -12], [-81, -5], [-80, 0], [-78, 7]],
  [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [2, 51], [8, 54], [10, 58], [5, 62], [15, 69], [28, 71], [40, 67], [60, 69], [70, 73], [80, 73], [100, 78], [115, 74], [140, 73], [160, 70], [180, 68], [178, 64], [163, 60], [156, 51], [142, 52], [135, 43], [129, 35], [127, 39], [122, 40], [121, 31], [117, 24], [108, 21], [106, 10], [100, 13], [100, 3], [104, 1], [98, 8], [97, 17], [92, 22], [88, 22], [80, 15], [77, 8], [73, 20], [67, 25], [57, 25], [56, 27], [50, 30], [48, 29], [52, 24], [56, 24], [59, 22], [55, 17], [44, 12], [43, 15], [38, 22], [34, 28], [32, 31], [35, 36], [27, 37], [26, 41], [23, 40], [20, 40], [16, 38], [12, 44], [8, 44], [3, 43], [-1, 37], [-6, 36]],
  [[-17, 21], [-16, 12], [-12, 7], [-8, 4], [0, 5], [9, 4], [10, -1], [13, -10], [12, -17], [18, -35], [25, -34], [33, -27], [35, -20], [40, -15], [40, -5], [44, 1], [51, 11], [44, 11], [39, 16], [33, 28], [30, 31], [20, 32], [10, 37], [0, 36], [-6, 36], [-10, 30]],
  [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [146, -39], [138, -35], [132, -32], [115, -34]],
  [[-5, 50], [1, 51], [2, 53], [-2, 57], [-3, 59], [-6, 58], [-5, 55], [-3, 54], [-5, 52]],
  [[130, 31], [136, 34], [141, 36], [142, 40], [140, 42], [145, 44], [142, 45], [140, 41], [136, 37], [130, 34]],
  [[44, -25], [47, -25], [50, -15], [49, -12], [44, -17]],
  [[109, 1], [117, 7], [119, 1], [116, -4], [110, -3]],
  [[95, 5], [106, -6], [103, -5]],
  [[172, -34], [178, -38], [174, -41], [167, -46]],
]
