// Water supply pipe sizing: fixture units → demand (Hunter curve, IPC Table E103.3(3)), Hazen-Williams friction, velocity.

export interface Fixture { name: string; priv: number; pub: number; valve?: boolean }

/** Water supply fixture units (total, hot + cold), after IPC Table E103.3(2) / UPC. */
export const FIXTURES: Fixture[] = [
  { name: 'Bathroom group (tank WC)', priv: 3.6, pub: 0 },
  { name: 'Water closet, flush tank', priv: 2.2, pub: 5 },
  { name: 'Water closet, flushometer valve', priv: 6, pub: 10, valve: true },
  { name: 'Urinal, flushometer valve', priv: 0, pub: 5, valve: true },
  { name: 'Lavatory', priv: 0.7, pub: 2 },
  { name: 'Bathtub / tub-shower', priv: 1.4, pub: 4 },
  { name: 'Shower head', priv: 1.4, pub: 4 },
  { name: 'Kitchen sink', priv: 1.4, pub: 4 },
  { name: 'Dishwasher', priv: 1.4, pub: 1.4 },
  { name: 'Clothes washer', priv: 1.4, pub: 4 },
  { name: 'Laundry tray', priv: 1.4, pub: 4 },
  { name: 'Service / mop sink', priv: 0, pub: 4 },
  { name: 'Bar sink', priv: 1, pub: 2 },
  { name: 'Drinking fountain', priv: 0, pub: 0.25 },
  { name: 'Hose bibb', priv: 2.5, pub: 2.5 },
]

// [WSFU, gpm] — predominantly flush tanks / flush valves.
const TANK: [number, number][] = [[0, 0], [1, 3], [2, 5], [3, 6.5], [4, 8], [5, 9.4], [6, 10.7], [7, 11.8], [8, 12.8], [9, 13.7], [10, 14.6], [12, 16], [14, 17], [16, 18], [18, 18.8], [20, 19.6], [25, 21.5], [30, 23.3], [35, 24.9], [40, 26.3], [45, 27.7], [50, 29.1], [60, 32], [70, 35], [80, 38], [90, 41], [100, 43.5], [120, 48], [140, 52.5], [160, 57], [180, 61], [200, 65], [225, 70], [250, 75], [275, 80], [300, 85], [400, 105], [500, 124], [750, 170], [1000, 208], [1250, 239], [1500, 269], [1750, 297], [2000, 325], [2500, 380], [3000, 433], [4000, 525], [5000, 593]]
const VALVE: [number, number][] = [[0, 0], [5, 15], [6, 17.4], [7, 18.8], [8, 20.2], [9, 21.5], [10, 22.7], [12, 24.8], [14, 26.6], [16, 28.4], [18, 30], [20, 31.6], [25, 35], [30, 38], [35, 40.5], [40, 43], [45, 45], [50, 47], [60, 51], [70, 55], [80, 58.5], [90, 62], [100, 64.3], [120, 69], [140, 73.5], [160, 77], [180, 81], [200, 85.5], [225, 90], [250, 95.5], [275, 100], [300, 104.5], [400, 124], [500, 143], [750, 177], [1000, 208], [1250, 239], [1500, 269], [1750, 297], [2000, 325], [2500, 380], [3000, 433], [4000, 525], [5000, 593]]

/** Probable peak demand in gpm for a fixture-unit load. Flush-valve systems with < 5 WSFU use the tank curve. */
export function demandGpm(wsfu: number, flushValves: boolean): number {
  if (!(wsfu > 0)) return 0
  const t = flushValves && wsfu >= 5 ? VALVE : TANK
  if (wsfu >= t[t.length - 1][0]) {
    const [a, b] = [t[t.length - 2], t[t.length - 1]]
    return b[1] + ((wsfu - b[0]) * (b[1] - a[1])) / (b[0] - a[0])
  }
  for (let i = 1; i < t.length; i++)
    if (wsfu <= t[i][0]) {
      const [x0, y0] = t[i - 1], [x1, y1] = t[i]
      return y0 + ((wsfu - x0) * (y1 - y0)) / (x1 - x0)
    }
  return 0
}

export const SIZES = ['1/2', '3/4', '1', '1-1/4', '1-1/2', '2', '2-1/2', '3', '4']

export interface Material { name: string; C: number; id: number[]; hotV: number; coldV: number }

const ctsOD = [0.625, 0.875, 1.125, 1.375, 1.625, 2.125, 2.625, 3.125, 4.125]
const sch40 = [0.622, 0.824, 1.049, 1.38, 1.61, 2.067, 2.469, 3.068, 4.026]

/** Inside diameters in inches for each nominal size. */
export const MATERIALS: Material[] = [
  { name: 'Copper type L', C: 140, id: [0.545, 0.785, 1.025, 1.265, 1.505, 1.985, 2.465, 2.945, 3.905], coldV: 8, hotV: 5 },
  { name: 'Copper type M', C: 140, id: [0.569, 0.811, 1.055, 1.291, 1.527, 2.009, 2.495, 2.981, 3.935], coldV: 8, hotV: 5 },
  { name: 'PEX (SDR 9, CTS)', C: 150, id: ctsOD.map((d) => +(d * 7 / 9).toFixed(3)), coldV: 8, hotV: 8 },
  { name: 'CPVC (SDR 11, CTS)', C: 150, id: ctsOD.map((d) => +(d * 9 / 11).toFixed(3)), coldV: 8, hotV: 8 },
  { name: 'PVC Schedule 40', C: 150, id: sch40, coldV: 8, hotV: 5 },
  { name: 'Galvanized steel Sch 40 (aged)', C: 100, id: sch40, coldV: 8, hotV: 5 },
]

/** Hazen-Williams friction loss in psi per 100 ft (Q gpm, d inches). */
export const frictionPsi100 = (q: number, d: number, C: number) => (q > 0 ? (100 * 4.52 * q ** 1.852) / (C ** 1.852 * d ** 4.8704) : 0)
/** Mean velocity in ft/s. */
export const velocityFps = (q: number, d: number) => (0.4085 * q) / (d * d)

export interface Budget { supply: number; elevation: number; minPressure: number; meterLoss: number; otherLoss: number; length: number; fittingPct: number }

/** Pressure available for pipe friction and allowable loss per 100 ft of developed length. */
export function budget(b: Budget): { static: number; available: number; equivLength: number; allowable: number } {
  const st = 0.433 * b.elevation
  const available = b.supply - st - b.minPressure - b.meterLoss - b.otherLoss
  const equivLength = b.length * (1 + b.fittingPct / 100)
  return { static: st, available, equivLength, allowable: equivLength > 0 ? (available / equivLength) * 100 : Infinity }
}

export interface Row { size: string; id: number; v: number; f: number; drop: number; okV: boolean; okF: boolean }

export function evaluateSizes(q: number, m: Material, vmax: number, allowable: number, equivLength: number): Row[] {
  return SIZES.map((size, i) => {
    const d = m.id[i]
    const v = velocityFps(q, d), f = frictionPsi100(q, d, m.C)
    return { size, id: d, v, f, drop: (f * equivLength) / 100, okV: v <= vmax, okF: f <= allowable }
  })
}

/** Maximum flow (gpm) a size can carry within both limits; used for the WSFU capacity table. */
export function maxFlow(d: number, C: number, vmax: number, allowable: number): number {
  const qv = (vmax * d * d) / 0.4085
  const qf = allowable > 0 ? ((allowable * C ** 1.852 * d ** 4.8704) / 452) ** (1 / 1.852) : 0
  return Math.min(qv, qf)
}

/** Inverse of demandGpm (largest WSFU whose demand ≤ q). */
export function wsfuFor(q: number, flushValves: boolean): number {
  let lo = 0, hi = 20000
  if (demandGpm(hi, flushValves) <= q) return hi
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2
    if (demandGpm(m, flushValves) <= q) lo = m
    else hi = m
  }
  return lo
}
