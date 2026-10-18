// 2-D projectile with quadratic air drag (and optional horizontal wind), integrated with classical RK4.

export interface Launch {
  v0: number // m/s
  angle: number // degrees above horizontal
  h0: number // launch height (m)
  mass: number // kg
  diameter: number // m
  cd: number // drag coefficient
  rho: number // air density kg/m³
  g: number // m/s²
  wind: number // horizontal wind speed (m/s, + = tailwind)
  drag: boolean
}

export interface Sample { t: number; x: number; y: number; vx: number; vy: number }
export interface Flight {
  path: Sample[]
  range: number
  apex: number
  apexX: number
  time: number
  impactSpeed: number
  impactAngle: number // degrees below horizontal
}

type S4 = [number, number, number, number]

export function simulate(L: Launch, dt = 0.002, maxT = 600): Flight {
  const area = (Math.PI * L.diameter * L.diameter) / 4
  const k = L.drag ? (0.5 * L.rho * L.cd * area) / L.mass : 0
  const f = (s: S4): S4 => {
    const rvx = s[2] - L.wind, rvy = s[3]
    const v = Math.hypot(rvx, rvy)
    return [s[2], s[3], -k * v * rvx, -L.g - k * v * rvy]
  }
  const a = (L.angle * Math.PI) / 180
  let s: S4 = [0, L.h0, L.v0 * Math.cos(a), L.v0 * Math.sin(a)]
  let t = 0
  const path: Sample[] = [{ t, x: s[0], y: s[1], vx: s[2], vy: s[3] }]
  let apex = s[1], apexX = 0
  const every = Math.max(1, Math.round(0.01 / dt))
  let n = 0
  while (t < maxT) {
    const k1 = f(s)
    const k2 = f(s.map((v, i) => v + (dt / 2) * k1[i]) as S4)
    const k3 = f(s.map((v, i) => v + (dt / 2) * k2[i]) as S4)
    const k4 = f(s.map((v, i) => v + dt * k3[i]) as S4)
    const nx = s.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) as S4
    if (nx[1] < 0 && nx[3] < 0) {
      // interpolate to ground (y = 0)
      const r = s[1] / (s[1] - nx[1])
      const fin = s.map((v, i) => v + (nx[i] - v) * r) as S4
      t += dt * r
      path.push({ t, x: fin[0], y: 0, vx: fin[2], vy: fin[3] })
      s = fin
      break
    }
    s = nx
    t += dt
    if (s[1] > apex) {
      apex = s[1]
      apexX = s[0]
    }
    if (++n % every === 0) path.push({ t, x: s[0], y: s[1], vx: s[2], vy: s[3] })
  }
  const last = path[path.length - 1]
  return {
    path, range: last.x, apex, apexX, time: last.t,
    impactSpeed: Math.hypot(last.vx, last.vy),
    impactAngle: (Math.atan2(-last.vy, last.vx) * 180) / Math.PI,
  }
}

/** Launch angle (°) that maximises horizontal range, by golden-section search. */
export function bestAngle(L: Launch): number {
  let a = 1, b = 89
  const r = (x: number) => simulate({ ...L, angle: x }, 0.005).range
  const gr = (Math.sqrt(5) - 1) / 2
  let c = b - gr * (b - a), d = a + gr * (b - a)
  let fc = r(c), fd = r(d)
  for (let i = 0; i < 30; i++) {
    if (fc > fd) {
      b = d; d = c; fd = fc; c = b - gr * (b - a); fc = r(c)
    } else {
      a = c; c = d; fc = fd; d = a + gr * (b - a); fd = r(d)
    }
  }
  return (a + b) / 2
}

export const terminalVelocity = (L: Launch) => Math.sqrt((2 * L.mass * L.g) / (L.rho * L.cd * (Math.PI * L.diameter * L.diameter) / 4))

export const PRESETS: { name: string; mass: number; diameter: number; cd: number; v0: number }[] = [
  { name: 'Baseball (pitched/hit)', mass: 0.145, diameter: 0.074, cd: 0.35, v0: 45 },
  { name: 'Golf ball (drive)', mass: 0.0459, diameter: 0.0427, cd: 0.25, v0: 70 },
  { name: 'Soccer ball (long kick)', mass: 0.43, diameter: 0.22, cd: 0.25, v0: 30 },
  { name: 'Table-tennis ball', mass: 0.0027, diameter: 0.04, cd: 0.5, v0: 20 },
  { name: 'Shot put (7.26 kg)', mass: 7.26, diameter: 0.12, cd: 0.47, v0: 14 },
  { name: 'Cannonball (6 kg iron)', mass: 6, diameter: 0.115, cd: 0.47, v0: 200 },
  { name: 'Water balloon', mass: 0.3, diameter: 0.09, cd: 0.47, v0: 15 },
]

export const PLANETS: [string, number, number][] = [
  ['Earth (sea level)', 9.80665, 1.225],
  ['Earth (Denver, 1600 m)', 9.80665, 1.05],
  ['Moon', 1.62, 0],
  ['Mars', 3.71, 0.02],
  ['Titan', 1.352, 5.3],
]
