export interface Code {
  name: string
  maxRiser: number // mm
  minRiser: number
  minTread: number
  headroom: number
  maxPitch: number // degrees
  comfort: [number, number] // 2R + T range, mm
}

export const CODES: Record<string, Code> = {
  irc: { name: 'IRC (US residential)', maxRiser: 196, minRiser: 0, minTread: 254, headroom: 2032, maxPitch: 45, comfort: [600, 650] },
  ibc: { name: 'IBC (US commercial)', maxRiser: 178, minRiser: 102, minTread: 279, headroom: 2032, maxPitch: 35, comfort: [600, 650] },
  uk: { name: 'UK Part K (private)', maxRiser: 220, minRiser: 150, minTread: 220, headroom: 2000, maxPitch: 42, comfort: [550, 700] },
  nbc: { name: 'NBC Canada (dwelling)', maxRiser: 200, minRiser: 125, minTread: 255, headroom: 1950, maxPitch: 45, comfort: [600, 650] },
}

export interface Input {
  rise: number // finished floor to finished floor, mm
  tread: number // horizontal run per tread (going), mm
  risers: number // 0 = auto from code max riser
  maxRiser: number
  treadThick: number // mm (first riser is shortened by this)
  board: number // stringer stock width, mm (2x12 = 286)
  floorThick: number // upper floor structure depth for headroom, mm
  headroom: number
}

export interface Result {
  n: number
  riser: number
  treads: number
  totalRun: number
  pitch: number
  blondel: number
  notchDepth: number
  throat: number
  lineLength: number
  boardLength: number
  openingLength: number
  firstRiser: number
}

export function compute(i: Input): Result {
  const n = i.risers > 0 ? Math.round(i.risers) : Math.max(1, Math.ceil(i.rise / i.maxRiser - 1e-9))
  const riser = i.rise / n
  const treads = n - 1
  const totalRun = treads * i.tread
  const pitch = (Math.atan2(riser, i.tread) * 180) / Math.PI
  const notchDepth = (riser * i.tread) / Math.hypot(riser, i.tread)
  // Opening: the nosing line is at height x·R/T; the ceiling underside sits at rise − floorThick.
  // Headroom must exist wherever the ceiling is above the stair, so the opening starts where
  // x·R/T + headroom > rise − floorThick.
  const x0 = Math.max(0, ((i.rise - i.floorThick - i.headroom) * i.tread) / riser)
  return {
    n,
    riser,
    treads,
    totalRun,
    pitch,
    blondel: 2 * riser + i.tread,
    notchDepth,
    throat: i.board - notchDepth,
    lineLength: Math.hypot(i.rise, totalRun),
    boardLength: Math.hypot(i.rise, totalRun + i.tread),
    openingLength: Math.max(0, totalRun - x0),
    firstRiser: riser - i.treadThick,
  }
}

export interface Check { label: string; ok: boolean; detail: string }

export function checks(r: Result, i: Input, c: Code, fmt: (mm: number) => string): Check[] {
  return [
    { label: 'Riser height', ok: r.riser <= c.maxRiser + 0.01 && r.riser >= c.minRiser, detail: `${fmt(r.riser)} (allowed ${c.minRiser ? fmt(c.minRiser) + '–' : '≤ '}${fmt(c.maxRiser)})` },
    { label: 'Tread depth', ok: i.tread >= c.minTread - 0.01, detail: `${fmt(i.tread)} (min ${fmt(c.minTread)})` },
    { label: 'Pitch', ok: r.pitch <= c.maxPitch + 0.01, detail: `${r.pitch.toFixed(1)}° (max ${c.maxPitch}°)` },
    { label: 'Comfort 2R + T', ok: r.blondel >= c.comfort[0] && r.blondel <= c.comfort[1], detail: `${fmt(r.blondel)} (ideal ${fmt(c.comfort[0])}–${fmt(c.comfort[1])})` },
    { label: 'Stringer throat', ok: r.throat >= 89, detail: `${fmt(r.throat)} left after notching (keep ≥ ${fmt(89)})` },
  ]
}

/** Stringer outline (x along the run, y up) in mm: sawtooth top edge, starting at the floor. */
export function stringerProfile(r: Result, tread: number, treadThick: number): [number, number][] {
  const pts: [number, number][] = [[0, 0], [0, r.firstRiser]]
  let x = 0
  let y = r.firstRiser
  for (let k = 0; k < r.treads; k++) {
    x += tread
    pts.push([x, y])
    y += r.riser
    pts.push([x, y])
  }
  // y now = rise − treadThick: the stringer top meets the header below the upper floor
  void treadThick
  return pts
}
