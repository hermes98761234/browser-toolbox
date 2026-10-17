// Panel / service load calculation: demand factors, continuous 125 %, largest motor 25 %,
// per-phase (per-leg) balancing and service size selection.

export type Sys = 'split' | '208' | '480' | '230' | '400'
export interface SysInfo {
  name: string
  phases: ('A' | 'B' | 'C')[]
  vln: number // line-to-neutral voltage
  vll: number // line-to-line voltage
  three: boolean
}
export const SYSTEMS: Record<Sys, SysInfo> = {
  split: { name: '120/240 V split-phase', phases: ['A', 'B'], vln: 120, vll: 240, three: false },
  '208': { name: '208Y/120 V 3-phase', phases: ['A', 'B', 'C'], vln: 120, vll: 208, three: true },
  '480': { name: '480Y/277 V 3-phase', phases: ['A', 'B', 'C'], vln: 277, vll: 480, three: true },
  '230': { name: '230 V single-phase', phases: ['A'], vln: 230, vll: 230, three: false },
  '400': { name: '400/230 V 3-phase', phases: ['A', 'B', 'C'], vln: 230, vll: 400, three: true },
}

export type Kind = 'Lighting' | 'Receptacles' | 'Appliance' | 'Motor' | 'Heating' | 'Cooling' | 'EV charger' | 'Other'
export const KINDS: Kind[] = ['Lighting', 'Receptacles', 'Appliance', 'Motor', 'Heating', 'Cooling', 'EV charger', 'Other']
export const DEFAULT_DEMAND: Record<Kind, number> = { Lighting: 100, Receptacles: 50, Appliance: 75, Motor: 100, Heating: 100, Cooling: 100, 'EV charger': 100, Other: 100 }

/** Phase connection: one letter = line-to-neutral, two = line-to-line, three = 3-phase. */
export type Conn = string

export interface Load {
  id: string
  name: string
  kind: Kind
  va: number // per unit
  qty: number
  conn: Conn
  demand: number // %
  continuous: boolean
}

export interface Result {
  rows: { id: string; connected: number; demand: number; sizing: number }[]
  phaseVA: Record<string, number>
  phaseAmps: Record<string, number>
  connected: number
  demand: number
  sizing: number // demand + continuous 25 % + largest motor 25 %
  motorAdder: number
  amps: number // max phase / leg current
  imbalance: number // (max − min) / mean
  service: number
}

export const SERVICE_SIZES = [60, 100, 125, 150, 200, 225, 300, 400, 600, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000]

/** Valid connections for a system: single letters, pairs and (3-phase) ABC. */
export function connections(sys: Sys): Conn[] {
  const p = SYSTEMS[sys].phases
  if (p.length === 1) return ['A']
  if (p.length === 2) return ['A', 'B', 'AB']
  return ['A', 'B', 'C', 'AB', 'BC', 'CA', 'ABC']
}

export function compute(loads: Load[], sys: Sys): Result {
  const S = SYSTEMS[sys]
  const amps: Record<string, number> = Object.fromEntries(S.phases.map((p) => [p, 0]))
  let connected = 0, demand = 0, sizing = 0, largestMotor = 0
  const rows = loads.map((l) => {
    const c = Math.max(0, l.va) * Math.max(0, l.qty)
    const d = (c * Math.max(0, l.demand)) / 100
    const z = d * (l.continuous ? 1.25 : 1)
    connected += c
    demand += d
    sizing += z
    if (l.kind === 'Motor') largestMotor = Math.max(largestMotor, Math.max(0, l.va))
    const conn = [...(l.conn || 'A')].filter((p) => p in amps)
    const legs = conn.length ? conn : [S.phases[0]]
    // line current: L-N → VA/Vln, L-L → VA/Vll on both lines, 3-phase → VA/(3·Vln) per line
    const v = legs.length === 1 ? S.vln : legs.length === 2 ? S.vll : 3 * S.vln
    for (const p of legs) amps[p] += z / v
    return { id: l.id, connected: c, demand: d, sizing: z }
  })
  const motorAdder = largestMotor * 0.25
  sizing += motorAdder
  // spread the motor adder over all phases so per-phase totals match the sizing figure
  for (const p of S.phases) amps[p] += motorAdder / S.phases.length / S.vln
  const phaseAmps = amps
  const phaseVA = Object.fromEntries(S.phases.map((p) => [p, amps[p] * S.vln]))
  const vals = Object.values(phaseAmps)
  const maxA = Math.max(...vals)
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const imbalance = vals.length > 1 && mean > 0 ? (Math.max(...vals) - Math.min(...vals)) / mean : 0
  const service = SERVICE_SIZES.find((s) => s >= maxA) ?? SERVICE_SIZES[SERVICE_SIZES.length - 1]
  return { rows, phaseVA, phaseAmps, connected, demand, sizing, motorAdder, amps: maxA, imbalance, service }
}

/** Greedy balancing: largest loads first, each to the least-loaded phase (or pair). Keeps the pole count. */
export function autoBalance(loads: Load[], sys: Sys): Load[] {
  const S = SYSTEMS[sys]
  if (S.phases.length === 1) return loads
  const acc: Record<string, number> = Object.fromEntries(S.phases.map((p) => [p, 0]))
  const pairs = S.phases.length === 3 ? ['AB', 'BC', 'CA'] : ['AB']
  const out = loads.map((l) => ({ ...l }))
  const z = (l: Load) => l.va * l.qty * (l.demand / 100) * (l.continuous ? 1.25 : 1)
  const order = [...out].sort((a, b) => z(b) - z(a))
  for (const l of order) {
    const poles = Math.min(S.phases.length, Math.max(1, (l.conn || 'A').length))
    let conn: string
    if (poles === S.phases.length) conn = S.phases.join('')
    else if (poles === 2) conn = pairs.reduce((b, p) => (acc[p[0]] + acc[p[1]] < acc[b[0]] + acc[b[1]] ? p : b))
    else conn = S.phases.reduce((b, p) => (acc[p] < acc[b] ? p : b))
    const v = conn.length === 1 ? S.vln : conn.length === 2 ? S.vll : 3 * S.vln
    for (const p of conn) acc[p] += z(l) / v
    l.conn = conn
  }
  return out
}

/** NEC 220.82 optional dwelling method: general load 10 kVA @100 % + rest @40 %, plus the larger of heating/cooling @100 %. */
export function necOptional(loads: Load[], vll = 240): { va: number; amps: number } {
  let general = 0, heat = 0, cool = 0
  for (const l of loads) {
    const c = Math.max(0, l.va) * Math.max(0, l.qty)
    if (l.kind === 'Heating') heat += c
    else if (l.kind === 'Cooling') cool += c
    else general += c
  }
  const va = Math.min(general, 10000) + Math.max(0, general - 10000) * 0.4 + Math.max(heat, cool)
  return { va, amps: va / vll }
}
