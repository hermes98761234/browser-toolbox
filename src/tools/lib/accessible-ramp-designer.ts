// Wheelchair ramp planner (ADA 2010 §405 defaults). All lengths in metres.

export type Layout = 'straight' | 'l-shape' | 'switchback'

export interface RampInput {
  rise: number
  /** run : rise, e.g. 12 for 1:12 */
  ratio: number
  /** max rise of a single run between landings (ADA 0.76 m = 30 in) */
  maxSegRise: number
  /** landing length (ADA 1.525 m = 60 in) */
  landing: number
  /** clear width between handrails (ADA ≥ 0.915 m = 36 in) */
  width: number
  layout: Layout
  /** gap between the two runs of a switchback */
  gap: number
}

export interface Piece {
  kind: 'ramp' | 'landing'
  /** centre on the ground plane */
  cx: number
  cz: number
  /** heading of the piece's length axis, radians about +y (0 = +x) */
  yaw: number
  len: number
  wid: number
  y0: number
  y1: number
  label: string
}

export interface Plan {
  segments: { rise: number; run: number }[]
  slopePct: number
  angleDeg: number
  totalRun: number
  pieces: Piece[]
  landings: number
  /** bounding box of the footprint */
  footprint: { x: number; z: number; w: number; d: number }
  /** walking length along the path, including landings */
  pathLength: number
  /** both sides, along ramps and intermediate landings, plus 0.305 m extensions top and bottom */
  handrail: number
  handrailsRequired: boolean
}

export const IN = 0.0254

export function planRamp(p: RampInput): Plan {
  const rise = Math.max(0, p.rise)
  const n = rise > 0 ? Math.max(1, Math.ceil(rise / p.maxSegRise - 1e-9)) : 0
  const segRise = n ? rise / n : 0
  const segRun = segRise * p.ratio
  const segments = Array.from({ length: n }, () => ({ rise: segRise, run: segRun }))
  const pieces: Piece[] = []
  const W = p.width
  let x = 0, z = 0, yaw = 0, y = 0
  const dir = () => [Math.cos(yaw), -Math.sin(yaw)] as const // three.js: yaw about +y turns +x towards −z
  const add = (kind: Piece['kind'], len: number, wid: number, dy: number, label: string, lateral = 0) => {
    const [dx, dz] = dir()
    // lateral offset is to the left of the heading (counter-clockwise seen from above)
    const lx = dz * lateral, lz = -dx * lateral
    pieces.push({ kind, cx: x + (dx * len) / 2 + lx, cz: z + (dz * len) / 2 + lz, yaw, len, wid, y0: y, y1: y + dy, label })
    x += dx * len
    z += dz * len
    y += dy
  }
  add('landing', p.landing, W, 0, 'Bottom landing')
  const turnAt = Math.ceil(n / 2)
  for (let i = 0; i < n; i++) {
    add('ramp', segRun, W, segRise, `Run ${i + 1}`)
    if (i === n - 1) break
    if (p.layout === 'straight' || (p.layout === 'l-shape' && i + 1 !== turnAt)) {
      add('landing', p.landing, W, 0, `Landing ${i + 1}`)
    } else if (p.layout === 'l-shape') {
      // square turning landing, then turn left 90°
      const side = Math.max(p.landing, W)
      add('landing', side, side, 0, `Turning landing ${i + 1}`)
      const [dx, dz] = dir()
      const cx = x - (dx * side) / 2, cz = z - (dz * side) / 2
      yaw += Math.PI / 2
      const [ex, ez] = dir()
      x = cx + (ex * side) / 2
      z = cz + (ez * side) / 2
    } else {
      // switchback: landing spans both runs, then turn 180° into the parallel lane
      const span = 2 * W + p.gap
      const depth = Math.max(p.landing, W)
      add('landing', depth, span, 0, `Turning landing ${i + 1}`, (W + p.gap) / 2)
      const [dx, dz] = dir()
      x -= dx * depth
      z -= dz * depth
      // move to the other lane (to the left), then reverse
      x += dz * (W + p.gap)
      z += -dx * (W + p.gap)
      yaw += Math.PI
    }
  }
  add('landing', p.landing, W, 0, 'Top landing')
  // footprint
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const q of pieces) {
    const c = Math.abs(Math.cos(q.yaw)), s = Math.abs(Math.sin(q.yaw))
    const hx = (q.len * c + q.wid * s) / 2, hz = (q.len * s + q.wid * c) / 2
    x0 = Math.min(x0, q.cx - hx); x1 = Math.max(x1, q.cx + hx)
    z0 = Math.min(z0, q.cz - hz); z1 = Math.max(z1, q.cz + hz)
  }
  const rampLen = segments.reduce((a, s) => a + Math.hypot(s.run, s.rise), 0)
  const midLandings = pieces.filter((q) => q.kind === 'landing').slice(1, -1)
  const pathLength = pieces.reduce((a, q) => a + (q.kind === 'ramp' ? Math.hypot(q.len, q.y1 - q.y0) : q.len), 0)
  const handrailsRequired = rise > 6 * IN
  return {
    segments,
    slopePct: 100 / p.ratio,
    angleDeg: (Math.atan(1 / p.ratio) * 180) / Math.PI,
    totalRun: segRun * n,
    pieces,
    landings: n + 1,
    footprint: { x: x0, z: z0, w: x1 - x0, d: z1 - z0 },
    pathLength,
    handrail: handrailsRequired ? 2 * (rampLen + midLandings.reduce((a, q) => a + q.len, 0) + 2 * 12 * IN) : 0,
    handrailsRequired,
  }
}

export interface Check {
  ok: boolean
  warn?: boolean
  text: string
}

export function checks(p: RampInput, plan: Plan, available?: number): Check[] {
  const out: Check[] = [
    { ok: p.ratio >= 12, text: `Running slope 1:${+p.ratio.toFixed(2)} (${plan.slopePct.toFixed(2)}%) ${p.ratio >= 12 ? '≤' : '>'} 1:12 maximum` },
    { ok: p.maxSegRise <= 30 * IN + 1e-9, text: `Rise per run ${(plan.segments[0]?.rise ?? 0) / IN > 0 ? ((plan.segments[0]?.rise ?? 0) / IN).toFixed(1) : 0} in (max 30 in / 760 mm)` },
    { ok: p.width >= 36 * IN - 1e-9, text: `Clear width ${(p.width / IN).toFixed(1)} in (min 36 in / 915 mm)` },
    { ok: p.landing >= 60 * IN - 1e-9, text: `Landing length ${(p.landing / IN).toFixed(1)} in (min 60 in / 1525 mm)` },
  ]
  if (p.layout !== 'straight') out.push({ ok: Math.max(p.landing, p.width) >= 60 * IN - 1e-9, text: 'Turning landings at least 60 × 60 in' })
  out.push(plan.handrailsRequired
    ? { ok: true, warn: true, text: 'Rise > 6 in: handrails on both sides, 34–38 in high, extending 12 in past top and bottom' }
    : { ok: true, text: 'Rise ≤ 6 in: handrails not required' })
  out.push({ ok: true, warn: true, text: 'Edge protection: 4 in curb or barrier, or extend the surface 12 in past the rail' })
  if (available && available > 0) {
    const need = Math.max(plan.footprint.w, plan.footprint.d)
    out.push({ ok: need <= available + 1e-9, text: `Longest footprint side ${need.toFixed(2)} m vs available ${available.toFixed(2)} m` })
  }
  return out
}
