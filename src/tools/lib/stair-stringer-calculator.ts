// Stair geometry (all lengths in inches) and building-code checks.

export interface StairIn {
  rise: number // finished floor to finished floor
  maxRiser: number
  tread: number // run per tread (excluding nosing)
  nosing: number
  stock: number // stringer board width, e.g. 11.25 for a 2×12
  treadThk: number
  flushTop: boolean // true: top tread is the upper floor (n−1 treads)
}

export interface StairOut {
  n: number // risers
  treads: number
  riser: number
  run: number // total horizontal run
  angle: number // degrees
  hyp: number // diagonal along the stringer between the first and last nosing lines
  stringerLen: number // board length needed (incl. bottom and top cuts)
  throat: number // remaining depth below notches
  drop: number // bottom drop for tread thickness
  twoRT: number
  rPlusT: number
  rTimesT: number
}

export function compute(i: StairIn): StairOut {
  const n = Math.max(1, Math.ceil(i.rise / i.maxRiser - 1e-9))
  const riser = i.rise / n
  const treads = i.flushTop ? n - 1 : n
  const run = treads * i.tread
  const angleR = Math.atan2(riser, i.tread)
  const step = Math.hypot(riser, i.tread)
  // Throat: perpendicular distance from the inside corner of a notch to the bottom edge of the board.
  const throat = i.stock - (riser * i.tread) / step
  const hyp = Math.hypot(n * riser, run)
  // Board length: the board's axis runs at angleR; it spans from the foot of the first riser cut to the
  // upper end of the top plumb cut at (run, n·riser) — project that point onto the board axis.
  const x0 = ((i.stock / Math.cos(angleR) - riser) * i.tread) / riser // where the bottom edge meets the floor
  const stringerLen = run * Math.cos(angleR) + n * riser * Math.sin(angleR) - Math.min(0, x0 * Math.cos(angleR))
  return {
    n, treads, riser, run, angle: (angleR * 180) / Math.PI, hyp, stringerLen, throat, drop: i.treadThk,
    twoRT: 2 * riser + i.tread, rPlusT: riser + i.tread, rTimesT: riser * i.tread,
  }
}

export interface Code { name: string; maxRiser: number; minRiser: number; minTread: number; minHead: number; minWidth: number; nosing: [number, number] | null; minThroat: number }
export const CODES: Record<string, Code> = {
  irc: { name: 'IRC (US residential)', maxRiser: 7.75, minRiser: 4, minTread: 10, minHead: 80, minWidth: 36, nosing: [0.75, 1.25], minThroat: 3.5 },
  ibc: { name: 'IBC (US commercial)', maxRiser: 7, minRiser: 4, minTread: 11, minHead: 80, minWidth: 44, nosing: [0, 1.25], minThroat: 3.5 },
  ukpriv: { name: 'UK Part K (private)', maxRiser: 220 / 25.4, minRiser: 150 / 25.4, minTread: 220 / 25.4, minHead: 2000 / 25.4, minWidth: 0, nosing: [16 / 25.4, 50 / 25.4], minThroat: 3.5 },
  nbc: { name: 'Canada NBC (dwelling)', maxRiser: 200 / 25.4, minRiser: 125 / 25.4, minTread: 255 / 25.4, minHead: 1950 / 25.4, minWidth: 860 / 25.4, nosing: [0, 25 / 25.4], minThroat: 3.5 },
}

export interface Check { label: string; ok: boolean | null; detail: string }

export function checks(i: StairIn, o: StairOut, c: Code, head: number, width: number, uk = false): Check[] {
  const f = (x: number) => fmtIn(x)
  const out: Check[] = [
    { label: 'Riser height', ok: o.riser <= c.maxRiser + 1e-9 && o.riser >= c.minRiser - 1e-9, detail: `${f(o.riser)} (allowed ${f(c.minRiser)} – ${f(c.maxRiser)})` },
    { label: 'Tread depth', ok: i.tread >= c.minTread - 1e-9, detail: `${f(i.tread)} (min ${f(c.minTread)})` },
    { label: 'Headroom', ok: head >= c.minHead - 1e-9, detail: `${f(head)} (min ${f(c.minHead)})` },
    { label: 'Stair width', ok: c.minWidth ? width >= c.minWidth - 1e-9 : null, detail: c.minWidth ? `${f(width)} (min ${f(c.minWidth)})` : 'no minimum for private stairs' },
    { label: 'Stringer throat', ok: o.throat >= c.minThroat - 1e-9, detail: `${f(o.throat)} of wood left below notches (≥ ${f(c.minThroat)} recommended)` },
    { label: 'Comfort 2R + T', ok: o.twoRT >= 24 - 1e-9 && o.twoRT <= 25.5 + 1e-9 ? true : uk ? o.twoRT * 25.4 >= 550 && o.twoRT * 25.4 <= 700 : false, detail: `${o.twoRT.toFixed(2)}″ (comfortable 24–25½″${uk ? ', UK 550–700 mm' : ''})` },
    { label: 'Handrail', ok: null, detail: o.n >= 4 ? `Required: ${o.n} risers (4 or more), 34–38″ above nosings` : 'Not required for fewer than 4 risers (recommended anyway)' },
  ]
  if (c.nosing && c.nosing[1] > 0) out.push({ label: 'Nosing projection', ok: i.nosing === 0 && c.nosing[0] === 0 ? true : i.nosing >= c.nosing[0] - 1e-9 && i.nosing <= c.nosing[1] + 1e-9, detail: `${f(i.nosing)} (${f(c.nosing[0])} – ${f(c.nosing[1])})` })
  if (uk) out.push({ label: 'Pitch', ok: o.angle <= 42 + 1e-9, detail: `${o.angle.toFixed(1)}° (max 42° private stair)` })
  else out.push({ label: 'Pitch', ok: o.angle <= 42 + 1e-9 && o.angle >= 20, detail: `${o.angle.toFixed(1)}° (typical 30–37°)` })
  return out
}

/** 7 5/16″ style formatting rounded to 1/16. */
export function fmtIn(x: number, denom = 16): string {
  if (!Number.isFinite(x)) return '—'
  const neg = x < 0
  let v = Math.round(Math.abs(x) * denom)
  const whole = Math.floor(v / denom)
  v -= whole * denom
  let num = v, den = denom
  while (num && num % 2 === 0) {
    num /= 2
    den /= 2
  }
  return `${neg ? '−' : ''}${whole || !num ? whole : ''}${num ? `${whole ? ' ' : ''}${num}/${den}` : ''}″`
}

export const fmtFtIn = (x: number) => {
  const ft = Math.floor((x + 1 / 32) / 12)
  return `${ft}′ ${fmtIn(x - ft * 12)}`
}

/** Shortest standard lumber length (ft) that fits `inches`. */
export const lumber = (inches: number) => [8, 10, 12, 14, 16, 18, 20].find((ft) => ft * 12 >= inches) ?? Math.ceil(inches / 12)
