// Water heater sizing: first-hour rating for tanks, flow × temperature rise for tankless units.
// Internal units: US gallons, °F, BTU. 1 gal water ≈ 8.34 lb; 1 BTU heats 1 lb by 1 °F.

export const LB_PER_GAL = 8.34
export const BTU_PER_KWH = 3412.14
export const L_PER_GAL = 3.78541
export const fToC = (f: number) => ((f - 32) * 5) / 9
export const cToF = (c: number) => (c * 9) / 5 + 32

export interface Activity { name: string; gal: number; mixed: boolean; count: number }
export interface Fixture { name: string; gpm: number; mixed: boolean; count: number }

/** Typical hot-water use per activity (gallons, at the tap) — peak-hour planning values. */
export const ACTIVITIES: Activity[] = [
  { name: 'Shower (8 min, 2.0 gpm head)', gal: 16, mixed: true, count: 2 },
  { name: 'Bath', gal: 20, mixed: true, count: 0 },
  { name: 'Hand & face washing', gal: 2, mixed: true, count: 3 },
  { name: 'Shaving', gal: 2, mixed: true, count: 1 },
  { name: 'Hand dishwashing', gal: 4, mixed: true, count: 0 },
  { name: 'Dishwasher cycle', gal: 6, mixed: false, count: 1 },
  { name: 'Food preparation', gal: 5, mixed: true, count: 1 },
  { name: 'Clothes washer (warm, HE)', gal: 7, mixed: false, count: 0 },
]

/** Fixture flow rates for simultaneous (tankless) demand, gpm at the outlet. */
export const FIXTURES: Fixture[] = [
  { name: 'Shower head', gpm: 2.0, mixed: true, count: 2 },
  { name: 'Bathroom faucet', gpm: 1.2, mixed: true, count: 0 },
  { name: 'Kitchen faucet', gpm: 1.8, mixed: true, count: 1 },
  { name: 'Bathtub spout', gpm: 4.0, mixed: true, count: 0 },
  { name: 'Dishwasher', gpm: 1.5, mixed: false, count: 0 },
  { name: 'Clothes washer', gpm: 2.0, mixed: false, count: 0 },
]

/** Fraction of mixed water that comes from the heater: (Tuse − Tin) / (Thot − Tin), clamped to [0, 1]. */
export function hotFraction(tUse: number, tIn: number, tHot: number): number {
  if (tHot <= tIn) return 1
  return Math.min(1, Math.max(0, (tUse - tIn) / (tHot - tIn)))
}

/** Peak-hour hot water drawn from the heater (gal). */
export function peakHourDemand(acts: Activity[], tUse: number, tIn: number, tHot: number): number {
  const f = hotFraction(tUse, tIn, tHot)
  return acts.reduce((a, x) => a + x.count * x.gal * (x.mixed ? f : 1), 0)
}

/** Simultaneous hot flow through a tankless heater (gpm). */
export function tanklessFlow(fx: Fixture[], tUse: number, tIn: number, tHot: number): number {
  const f = hotFraction(tUse, tIn, tHot)
  return fx.reduce((a, x) => a + x.count * x.gpm * (x.mixed ? f : 1), 0)
}

/** Output power to heat a flow by ΔT: BTU/h = 500.4 · gpm · ΔT°F (8.34 lb/gal × 60 min). */
export const heatBtuh = (gpm: number, dT: number) => LB_PER_GAL * 60 * gpm * dT
/** Input power, given efficiency (0–1). */
export const inputBtuh = (gpm: number, dT: number, eff: number) => heatBtuh(gpm, dT) / eff
/** Max flow a unit can heat (gpm) for a given input and rise. */
export const maxFlow = (inputBtu: number, dT: number, eff: number) => (inputBtu * eff) / (LB_PER_GAL * 60 * dT)

export type Fuel = 'gas' | 'electric' | 'heatpump'

export interface TankSpec { gal: number; inputBtuh: number; eff: number }

/** Typical inputs for residential tanks by nominal size. */
export function tankSpec(fuel: Fuel, gal: number): TankSpec {
  if (fuel === 'gas') return { gal, inputBtuh: gal <= 30 ? 32000 : gal <= 40 ? 38000 : gal <= 50 ? 40000 : gal <= 75 ? 75000 : 76000, eff: 0.78 }
  if (fuel === 'electric') return { gal, inputBtuh: 4500 * 3.41214, eff: 0.98 }
  // heat pump: ~1.4 kW of heat from the compressor (heat-pump-only mode)
  return { gal, inputBtuh: 1400 * 3.41214, eff: 1 }
}

/** Recovery rate (gal/h) at a temperature rise. */
export const recoveryGph = (t: TankSpec, dT: number) => (t.inputBtuh * t.eff) / (LB_PER_GAL * dT)

/**
 * First-hour rating approximation: usable stored hot water (≈70 % of nominal, scaled up when
 * stored hotter than delivered through a mixing valve) plus one hour of recovery.
 */
export function firstHourRating(t: TankSpec, dT: number, storeBoost = 1): number {
  return 0.7 * t.gal * storeBoost + recoveryGph(t, dT)
}

/** Storage above delivery temperature with a mixing valve: extra usable volume factor. */
export const mixingBoost = (tStore: number, tIn: number, tDeliver: number) => (tStore > tDeliver && tDeliver > tIn ? (tStore - tIn) / (tDeliver - tIn) : 1)

export const TANK_SIZES = [30, 40, 50, 65, 80, 100, 120]

export function recommendTank(fuel: Fuel, demand: number, dT: number, boost = 1): { gal: number; fhr: number } | null {
  for (const gal of TANK_SIZES) {
    const fhr = firstHourRating(tankSpec(fuel, gal), dT, boost)
    if (fhr >= demand) return { gal, fhr }
  }
  return null
}

/** Annual energy to heat a daily volume (gal/day) by dT with a uniform energy factor. Returns kWh. */
export function annualKwh(galPerDay: number, dT: number, uef: number): number {
  return (galPerDay * 365 * LB_PER_GAL * dT) / uef / BTU_PER_KWH
}

/** Electric tankless: kW and amps (at a voltage) for a flow and rise. */
export function electricTankless(gpm: number, dT: number, volts = 240, eff = 0.99) {
  const kw = inputBtuh(gpm, dT, eff) / BTU_PER_KWH
  return { kw, amps: (kw * 1000) / volts }
}
