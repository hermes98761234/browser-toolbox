// Machining cycle-time estimate: spindle speed from cutting speed, feed rate, cut time per operation,
// rapid moves, tool changes, part handling and batch totals.

export type Units = 'metric' | 'inch'
export type OpType = 'face' | 'mill' | 'turn' | 'drill' | 'tap' | 'bore' | 'feed'

export interface Op {
  id: string
  name: string
  type: OpType
  /** Tool diameter (milling/drilling/tapping) or work diameter (turning/boring): mm or in. */
  d: number
  /** Number of teeth (milling). */
  z: number
  /** Cutting speed: m/min or SFM. For 'feed' ops: the feed rate directly (mm/min or in/min). */
  vc: number
  /** Feed per tooth (milling) or per revolution (turning, drilling, boring); thread pitch for tapping. */
  f: number
  /** Cut length per pass or hole depth. */
  len: number
  /** Approach + overrun added to each pass. */
  extra: number
  passes: number
  /** Repetitions (holes, features). */
  count: number
  /** Rapid traverse per repetition. */
  rapid: number
  /** Peck depth for drilling (0 = no pecking). */
  peck: number
  newTool: boolean
}

export interface Machine {
  units: Units
  maxRpm: number
  /** Rapid traverse rate: mm/min or in/min. */
  rapidRate: number
  /** Tool change, seconds (chip-to-chip). */
  toolChange: number
  /** Load + unload per part, seconds. */
  handling: number
  /** Setup per batch, minutes. */
  setup: number
  batch: number
  /** Machine + operator rate per hour. */
  rate: number
  /** Tapping retract speed multiplier (1 = same as feed). */
  tapReturn: number
}

export interface OpResult { id: string; name: string; rpm: number; feed: number; cut: number; rapid: number; change: number; total: number; capped: boolean }

export function rpmFor(vc: number, d: number, units: Units): number {
  if (!(d > 0)) return 0
  return units === 'metric' ? (1000 * vc) / (Math.PI * d) : (12 * vc) / (Math.PI * d)
}

/** Times in minutes. */
export function opTime(o: Op, m: Machine): OpResult {
  let rpm = 0, feed: number, capped = false
  if (o.type === 'feed') feed = o.vc
  else {
    rpm = rpmFor(o.vc, o.d, m.units)
    if (m.maxRpm > 0 && rpm > m.maxRpm) { rpm = m.maxRpm; capped = true }
    feed = o.type === 'face' || o.type === 'mill' ? o.f * Math.max(1, o.z) * rpm : o.f * rpm
  }
  const reps = Math.max(1, o.count)
  let cutLen = (o.len + o.extra) * Math.max(1, o.passes)
  let rapidLen = o.rapid
  let cut = 0
  if (o.type === 'drill') {
    // point allowance for a 118° drill ≈ 0.3·D
    const depth = o.len + 0.3 * o.d
    cutLen = depth + o.extra
    if (o.peck > 0 && o.peck < depth) {
      const pecks = Math.ceil(depth / o.peck)
      // retract to the start after every peck and rapid back down (approximate)
      let back = 0
      for (let i = 1; i < pecks; i++) back += 2 * Math.min(depth, i * o.peck)
      rapidLen += back
    }
    rapidLen += depth + o.extra // final retract
    cut = feed > 0 ? cutLen / feed : Infinity
  } else if (o.type === 'tap') {
    const inT = feed > 0 ? (o.len + o.extra) / feed : Infinity
    cut = inT + inT / Math.max(0.1, m.tapReturn)
  } else {
    cut = feed > 0 ? cutLen / feed : Infinity
    // rapid back between passes
    if (o.passes > 1) rapidLen += (o.passes - 1) * (o.len + o.extra)
  }
  const rapid = m.rapidRate > 0 ? rapidLen / m.rapidRate : 0
  const change = o.newTool ? m.toolChange / 60 : 0
  return { id: o.id, name: o.name, rpm, feed, cut: cut * reps, rapid: rapid * reps, change, total: cut * reps + rapid * reps + change, capped }
}

export function cycle(ops: Op[], m: Machine) {
  const rows = ops.map((o) => opTime(o, m))
  const sum = (k: 'cut' | 'rapid' | 'change') => rows.reduce((a, r) => a + r[k], 0)
  const cut = sum('cut'), rapid = sum('rapid'), change = sum('change')
  const handling = m.handling / 60
  const part = cut + rapid + change + handling
  const batchMin = m.setup + part * Math.max(1, m.batch)
  const perPart = batchMin / Math.max(1, m.batch)
  return { rows, cut, rapid, change, handling, part, batchMin, perPart, perHour: part > 0 ? 60 / part : 0, cost: (perPart / 60) * m.rate, spindleUtil: part > 0 ? cut / part : 0 }
}

export function fmtMin(min: number): string {
  if (!Number.isFinite(min)) return '—'
  const s = Math.round(min * 60)
  if (s < 60) return `${s} s`
  const h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60
  return h ? `${h} h ${mm} min` : `${mm}:${String(ss).padStart(2, '0')}`
}
