// Tire code parsing, dimensions, speedometer error and plus-size suggestions.

export interface Tire {
  code: string; kind: 'metric' | 'flotation'; prefix: string
  width: number; aspect: number; rim: number // mm, %, inches
  sidewall: number; diameter: number; circumference: number // mm
  revsPerKm: number; revsPerMile: number
  load?: number; speed?: string
}

const IN = 25.4
export const SPEED: Record<string, number> = { L: 120, M: 130, N: 140, P: 150, Q: 160, R: 170, S: 180, T: 190, U: 200, H: 210, V: 240, W: 270, Y: 300, Z: 240 }
const LI0 = 70
const LI = [335, 345, 355, 365, 375, 387, 400, 412, 425, 437, 450, 462, 475, 487, 500, 515, 530, 545, 560, 580, 600, 615, 630, 650, 670, 690, 710, 730, 750, 775, 800, 825, 850, 875, 900, 925, 950, 975, 1000, 1030, 1060, 1090, 1120, 1150, 1180, 1215, 1250, 1285, 1320, 1360, 1400, 1450, 1500, 1550, 1600, 1650, 1700]
/** Maximum load per tire (kg) for a load index, 70–126. */
export const loadKg = (li: number) => (li >= LI0 && li < LI0 + LI.length ? LI[li - LI0] : NaN)

function build(code: string, kind: Tire['kind'], prefix: string, width: number, aspect: number, rim: number, sidewall: number, load?: number, speed?: string): Tire {
  const diameter = rim * IN + 2 * sidewall
  const circumference = Math.PI * diameter
  return { code, kind, prefix, width, aspect, rim, sidewall, diameter, circumference, revsPerKm: 1e6 / circumference, revsPerMile: 1609344 / circumference, load, speed }
}

/** Parses "225/45R17 94W", "P215/65R16", "LT265/75R16", "225/45ZR17", "33x12.50R15" (flotation). */
export function parseTire(input: string): Tire | null {
  const s = input.trim().toUpperCase().replace(/\s+/g, ' ')
  const tail = (rest: string) => {
    const m = /^\s*(\d{2,3})(?:\/\d{2,3})?\s*\(?([A-Z])\)?/.exec(rest)
    return m ? { load: Number(m[1]), speed: m[2] } : {}
  }
  let m = /^(P|LT|ST|T)?\s*(\d{3})\s*\/\s*(\d{2,3})\s*(Z?R|-|B|D)?\s*(Z?)\s*(\d{2}(?:\.\d)?)(.*)$/.exec(s)
  if (m) {
    const width = Number(m[2]), aspect = Number(m[3]), rim = Number(m[6])
    if (width < 100 || width > 445 || aspect < 20 || aspect > 95 || rim < 10 || rim > 26) return null
    const t = tail(m[7])
    return build(s, 'metric', m[1] ?? '', width, aspect, rim, (width * aspect) / 100, t.load, t.speed ?? (m[4]?.startsWith('Z') ? 'Z' : undefined))
  }
  m = /^(\d{2}(?:\.\d+)?)\s*[X×]\s*(\d{1,2}(?:\.\d+)?)\s*(?:R|-|LT|\s)*\s*(\d{2}(?:\.\d)?)(.*)$/.exec(s)
  if (m) {
    const dia = Number(m[1]), w = Number(m[2]), rim = Number(m[3])
    if (dia <= rim || dia > 50 || w > 20) return null
    const side = ((dia - rim) / 2) * IN
    const t = tail(m[4])
    return build(s, 'flotation', '', w * IN, (side / (w * IN)) * 100, rim, side, t.load, t.speed)
  }
  return null
}

/** New tire relative to the original: diameter ratio drives the speedometer. */
export function compare(a: Tire, b: Tire) {
  const ratio = b.diameter / a.diameter
  return {
    ratio,
    diaPct: (ratio - 1) * 100,
    widthMm: b.width - a.width,
    sidewallMm: b.sidewall - a.sidewall,
    clearanceMm: (b.diameter - a.diameter) / 2,
    /** True speed when the speedometer (calibrated for a) shows `shown`. */
    actual: (shown: number) => shown * ratio,
  }
}

/** Sizes that keep overall diameter within `tol` % of the original, for rims from −1 to +3 inches. */
export function plusSizes(a: Tire, tol = 1.5) {
  const out: { code: string; t: Tire; diff: number; plus: number }[] = []
  for (let plus = -1; plus <= 3; plus++) {
    const rim = a.rim + plus
    if (rim < 13 || rim > 24) continue
    for (let w = Math.round(a.width / 5) * 5 - 20; w <= a.width + 40; w += 10) {
      if ((w - 5) % 10 !== 0) continue // real sizes end in 5 (205, 215, …)
      for (let ar = 25; ar <= 80; ar += 5) {
        const t = parseTire(`${w}/${ar}R${rim}`)
        if (!t) continue
        const diff = (t.diameter / a.diameter - 1) * 100
        if (Math.abs(diff) <= tol) out.push({ code: t.code, t, diff, plus })
      }
    }
  }
  return out.sort((x, y) => x.plus - y.plus || Math.abs(x.diff) - Math.abs(y.diff))
}

/** Rough rim-width range (inches) commonly approved for a section width. */
export function rimRange(widthMm: number): [number, number] {
  const r = (x: number) => Math.round(x * 2) / 2
  return [r((widthMm * 0.75) / IN), r((widthMm * 0.95) / IN)]
}
