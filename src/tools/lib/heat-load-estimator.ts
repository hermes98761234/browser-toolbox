// Steady-state room heating / cooling load estimate (simplified ASHRAE-style method).
// Fabric: Q = U · A · ΔT (ΔT reduced for ground / unheated adjacency); infiltration sensible Q = 0.33 · ACH · V · ΔT (W);
// solar through glass Q = A · SHGC · peak irradiance(orientation) · shading; internal gains from people, lights, equipment;
// latent: people + infiltration Q = 3.01 · airflow(L/s) · Δw(g/kg).

export type Kind = 'wall' | 'window' | 'door' | 'roof' | 'floor'
export type Adj = 'outside' | 'ground' | 'unheated'
export type Orient = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'H'

export interface Surface { id: string; name: string; kind: Kind; area: number; u: number; adj: Adj; orient: Orient; shgc: number; shade: number }
export interface Room { id: string; name: string; l: number; w: number; h: number; ach: number; people: number; equip: number; light: number; surfaces: Surface[] }
export interface Climate { tinHeat: number; toutHeat: number; tinCool: number; toutCool: number; tground: number; dw: number; solarAllowance: boolean }

/** Peak solar irradiance on glazing by orientation (W/m², mid-latitude northern hemisphere summer, clear sky). */
export const PEAK_SOLAR: Record<Orient, number> = { N: 120, NE: 400, E: 550, SE: 450, S: 350, SW: 450, W: 550, NW: 400, H: 800 }

export const U_PRESETS: Record<Kind, [string, number][]> = {
  wall: [['Solid brick, uninsulated', 2.1], ['Cavity wall, empty', 1.5], ['Cavity, insulated', 0.55], ['Modern insulated (2010s)', 0.28], ['Passive house', 0.12], ['Interior partition', 1.8]],
  window: [['Single glazing', 5.7], ['Double glazing (old)', 2.8], ['Double low-e argon', 1.4], ['Triple glazing', 0.8]],
  door: [['Solid timber', 3.0], ['Insulated door', 1.4]],
  roof: [['Uninsulated', 2.3], ['100 mm insulation', 0.35], ['250 mm insulation', 0.16]],
  floor: [['Uninsulated slab', 0.7], ['Insulated slab', 0.25], ['Suspended timber', 0.8]],
}

const AIR = 0.33 // W per (m³/h · K): ρ·cp = 1.2 kg/m³ · 1005 J/kgK / 3600

/** Effective temperature difference for heating. */
export function dtHeat(s: Surface, c: Climate): number {
  if (s.adj === 'ground') return c.tinHeat - c.tground
  if (s.adj === 'unheated') return 0.5 * (c.tinHeat - c.toutHeat)
  return c.tinHeat - c.toutHeat
}
/** Effective temperature difference for cooling (sol-air allowance on sunlit opaque surfaces). */
export function dtCool(s: Surface, c: Climate): number {
  if (s.adj === 'ground') return 0
  if (s.adj === 'unheated') return 0.5 * (c.toutCool - c.tinCool)
  const base = c.toutCool - c.tinCool
  if (!c.solarAllowance || s.kind === 'window') return base
  return base + (s.kind === 'roof' ? 12 : s.kind === 'wall' || s.kind === 'door' ? (s.orient === 'N' ? 2 : 5) : 0)
}

export interface Load {
  floor: number
  volume: number
  heat: { fabric: number; infiltration: number; total: number }
  cool: { fabric: number; solar: number; infiltration: number; people: number; lights: number; equip: number; sensible: number; latent: number; total: number }
  parts: { name: string; ua: number; heat: number; cool: number; solar: number }[]
}

export function roomLoad(r: Room, c: Climate): Load {
  const floor = r.l * r.w, volume = floor * r.h
  const parts = r.surfaces.map((s) => {
    const ua = s.u * s.area
    return {
      name: s.name,
      ua,
      heat: Math.max(0, ua * dtHeat(s, c)),
      cool: ua * dtCool(s, c),
      solar: s.kind === 'window' && s.adj === 'outside' ? s.area * s.shgc * PEAK_SOLAR[s.orient] * s.shade : 0,
    }
  })
  const fabricH = parts.reduce((a, p) => a + p.heat, 0)
  const infH = AIR * r.ach * volume * (c.tinHeat - c.toutHeat)
  const fabricC = parts.reduce((a, p) => a + p.cool, 0)
  const solar = parts.reduce((a, p) => a + p.solar, 0)
  const infC = AIR * r.ach * volume * (c.toutCool - c.tinCool)
  const people = r.people * 75, lights = r.light * floor, equip = r.equip
  const sensible = Math.max(0, fabricC + solar + infC + people + lights + equip)
  const latent = r.people * 55 + 3.01 * ((r.ach * volume) / 3.6) * Math.max(0, c.dw)
  return {
    floor, volume, parts,
    heat: { fabric: fabricH, infiltration: Math.max(0, infH), total: fabricH + Math.max(0, infH) },
    cool: { fabric: fabricC, solar, infiltration: infC, people, lights, equip, sensible, latent, total: sensible + latent },
  }
}

export const W_TO_BTUH = 3.412142
