// Procedural mannequin for the stretching routine builder: joint-angle poses, mirroring,
// forward kinematics (joint positions in metres, y up, the figure faces +z, its left is +x),
// eased interpolation and a timed routine timeline.

export const JOINTS = ['rx', 'ry', 'rz', 'spF', 'spS', 'spT', 'nF', 'nS', 'nT', 'lsF', 'lsA', 'lsR', 'rsF', 'rsA', 'rsR', 'le', 're', 'lhF', 'lhA', 'lhR', 'rhF', 'rhA', 'rhR', 'lk', 'rk'] as const
export type Joint = (typeof JOINTS)[number]
/** Degrees per joint; missing joints are 0 (standing, arms by the sides). */
export type Angles = Partial<Record<Joint, number>>

export interface Pose {
  id: string
  name: string
  /** Muscles / area stretched. */
  area: string
  cue: string
  /** Done once per side (the angles describe the left side; the right side is mirrored). */
  sided?: boolean
  a: Angles
}

const ARMS: Angles = { lsA: 8, rsA: 8 }

export const POSES: Pose[] = [
  { id: 'stand', name: 'Neutral stand', area: 'Reset', cue: 'Stand tall, shoulders soft, breathe slowly.', a: ARMS },
  { id: 'reach', name: 'Overhead reach', area: 'Lats, side body', cue: 'Reach both arms high, lengthen through the fingertips.', a: { lsF: 172, rsF: 172, spF: -6, nF: -8 } },
  { id: 'side', name: 'Standing side bend', area: 'Obliques, lats', cue: 'Reach one arm over and lean sideways without twisting.', sided: true, a: { spS: 28, rsA: 158, lsA: 14, nS: 8, rhA: 3, lhA: 3 } },
  { id: 'twist', name: 'Standing twist', area: 'Thoracic spine', cue: 'Keep hips square and rotate the rib cage, arms loose.', sided: true, a: { spT: 45, nT: 20, lsA: 45, rsA: 30, lsF: 20, rsF: 70, le: 70, re: 80 } },
  { id: 'neck', name: 'Neck side stretch', area: 'Upper trapezius', cue: 'Ear towards shoulder, the opposite shoulder stays down.', sided: true, a: { nS: 38, rsA: 12, lsF: 25, lsA: 150, le: 110 } },
  { id: 'chest', name: 'Chest opener', area: 'Pecs, front shoulders', cue: 'Clasp hands behind you, lift the chest and draw arms back.', a: { lsF: -45, rsF: -45, lsA: -8, rsA: -8, spF: -12, nF: -10 } },
  { id: 'cross', name: 'Cross-body shoulder', area: 'Rear deltoid', cue: 'Pull the straight arm across the chest with the other hand.', sided: true, a: { lsF: 88, lsA: -60, rsF: 70, rsA: -10, re: 110, spT: 8 } },
  { id: 'triceps', name: 'Overhead triceps', area: 'Triceps, lats', cue: 'Elbow up by the ear, hand reaching down the back.', sided: true, a: { lsF: 170, lsA: -5, le: 150, rsF: 160, rsA: 20, re: 120 } },
  { id: 'fold', name: 'Standing forward fold', area: 'Hamstrings, lower back', cue: 'Hinge at the hips, let the head and arms hang heavy.', a: { rx: 62, lhF: 62, rhF: 62, spF: 42, nF: 15, lsF: 104, rsF: 104, lsA: 5, rsA: 5, lk: 6, rk: 6 } },
  { id: 'quad', name: 'Standing quad stretch', area: 'Quadriceps, hip flexors', cue: 'Hold the ankle behind you, knees together, tuck the pelvis.', sided: true, a: { lk: 150, lhF: -8, lsF: -38, lsA: 10, le: 40, rsA: 40, rsF: 10 } },
  { id: 'calf', name: 'Wall calf stretch', area: 'Calves, Achilles', cue: 'Back heel down, lean into the wall with straight back leg.', sided: true, a: { rx: 12, lhF: -24, rhF: 30, rk: 30, lsF: 80, rsF: 80, le: 30, re: 30, spF: 2 } },
  { id: 'lunge', name: 'Kneeling hip flexor', area: 'Hip flexors, quads', cue: 'Back knee down, tuck the tailbone and shift forward.', sided: true, a: { rhF: 85, rk: 92, lhF: -22, lk: 95, lsF: 165, rsF: 165, spF: -6 } },
  { id: 'hamstring', name: 'Seated forward fold', area: 'Hamstrings, calves', cue: 'Legs long, fold from the hips and reach for the toes.', a: { rx: 32, lhF: 122, rhF: 122, spF: 30, nF: 12, lsF: 145, rsF: 145, lsA: 6, rsA: 6 } },
  { id: 'butterfly', name: 'Butterfly', area: 'Inner thighs, groin', cue: 'Soles together, let the knees drop, sit tall.', a: { rx: 6, lhF: 80, rhF: 80, lhA: 50, rhA: 50, lhR: 85, rhR: 85, lk: 135, rk: 135, spF: 8, lsF: 45, rsF: 45, lsA: -6, rsA: -6, le: 25, re: 25 } },
  { id: 'child', name: "Child's pose", area: 'Back, lats, hips', cue: 'Sit back on the heels, arms long, forehead down.', a: { rx: 78, lhF: 128, rhF: 128, lk: 155, rk: 155, spF: 18, nF: 10, lsF: 170, rsF: 170, lsA: 8, rsA: 8 } },
  { id: 'cat', name: 'Cat', area: 'Spine flexion', cue: 'On all fours, round the back up, chin to chest.', a: { rx: 90, lhF: 90, rhF: 90, lk: 90, rk: 90, spF: 22, nF: 40, lsF: 112, rsF: 112 } },
  { id: 'cow', name: 'Cow', area: 'Spine extension', cue: 'Drop the belly, lift the chest and gaze forward.', a: { rx: 90, lhF: 90, rhF: 90, lk: 90, rk: 90, spF: -20, nF: -40, lsF: 70, rsF: 70 } },
  { id: 'sphinx', name: 'Sphinx', area: 'Abs, lower back', cue: 'Forearms down, lift the chest, hips heavy.', a: { rx: 90, spF: -42, nF: -18, lsF: 48, rsF: 48, le: 92, re: 92, lsA: 6, rsA: 6 } },
  { id: 'kneehug', name: 'Knees to chest', area: 'Lower back, glutes', cue: 'On your back, hug both knees in, rock gently.', a: { rx: -90, lhF: 118, rhF: 118, lk: 125, rk: 125, lsF: 52, rsF: 52, le: 70, re: 70, lsA: -10, rsA: -10 } },
  { id: 'supinetwist', name: 'Supine twist', area: 'Spine, glutes', cue: 'Knees fall to one side, shoulders stay on the floor.', sided: true, a: { rx: -90, ry: 55, spT: -55, lhF: 90, rhF: 90, lk: 90, rk: 90, lsA: 88, rsA: 88 } },
]

export const poseById = (id: string) => POSES.find((p) => p.id === id) ?? POSES[0]

const SWAP: [Joint, Joint][] = [['lsF', 'rsF'], ['lsA', 'rsA'], ['lsR', 'rsR'], ['le', 're'], ['lhF', 'rhF'], ['lhA', 'rhA'], ['lhR', 'rhR'], ['lk', 'rk']]
const NEG: Joint[] = ['ry', 'rz', 'spS', 'spT', 'nS', 'nT']

/** Left/right mirror image of a pose. */
export function mirror(a: Angles): Angles {
  const out: Angles = { ...a }
  for (const [l, r] of SWAP) {
    out[l] = a[r]
    out[r] = a[l]
  }
  for (const k of NEG) if (a[k] !== undefined) out[k] = -a[k]!
  return out
}

export const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10))

/** Eased blend between two poses, u in [0, 1]. */
export function blend(a: Angles, b: Angles, u: number): Angles {
  const e = smooth(u)
  const out: Angles = {}
  for (const k of JOINTS) out[k] = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * e
  return out
}

// ---------- forward kinematics ----------

type V = [number, number, number]
type M = number[] // 3x3 row-major
const D = Math.PI / 180
const mul = (a: M, b: M): M => {
  const r = new Array<number>(9)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]
  return r
}
const ap = (m: M, v: V): V => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const rx = (d: number): M => { const c = Math.cos(d * D), s = Math.sin(d * D); return [1, 0, 0, 0, c, -s, 0, s, c] }
const ry = (d: number): M => { const c = Math.cos(d * D), s = Math.sin(d * D); return [c, 0, s, 0, 1, 0, -s, 0, c] }
const rz = (d: number): M => { const c = Math.cos(d * D), s = Math.sin(d * D); return [c, -s, 0, s, c, 0, 0, 0, 1] }
/** Flex about x, then side about z, then twist about the bone's own y axis. */
const E = (x: number, z: number, y: number) => mul(mul(rx(x), rz(z)), ry(y))

export const POINTS = ['pelvis', 'chest', 'neck', 'head', 'nose', 'lSh', 'rSh', 'lEl', 'rEl', 'lWr', 'rWr', 'lHand', 'rHand', 'lHip', 'rHip', 'lKn', 'rKn', 'lAn', 'rAn', 'lToe', 'rToe'] as const
export type Point = (typeof POINTS)[number]
export type Skeleton = Record<Point, V>

/** Bone segments with radius, used for drawing and for ground contact. */
export const BONES: [Point, Point, number][] = [
  ['lHip', 'rHip', 0.085], ['pelvis', 'chest', 0.115], ['lSh', 'rSh', 0.075], ['chest', 'neck', 0.045],
  ['lSh', 'lEl', 0.05], ['lEl', 'lWr', 0.042], ['rSh', 'rEl', 0.05], ['rEl', 'rWr', 0.042],
  ['lHip', 'lKn', 0.068], ['lKn', 'lAn', 0.052], ['rHip', 'rKn', 0.068], ['rKn', 'rAn', 0.052],
  ['lAn', 'lToe', 0.04], ['rAn', 'rToe', 0.04],
]
export const HEAD_R = 0.11
export const HAND_R = 0.045

/** Joint positions; the lowest surface sits on y = 0 and the figure is centred over the origin. */
export function skeleton(a: Angles): Skeleton {
  const g = (k: Joint) => a[k] ?? 0
  const R0 = E(g('rx'), g('rz'), g('ry'))
  const P: V = [0, 0, 0]
  const Rs = mul(R0, E(g('spF'), -g('spS'), g('spT')))
  const C = add(P, ap(Rs, [0, 0.47, 0]))
  const N = add(C, ap(Rs, [0, 0.07, 0]))
  const Rn = mul(Rs, E(g('nF'), -g('nS'), g('nT')))
  const H = add(N, ap(Rn, [0, 0.12, 0.01]))
  const nose = add(H, ap(Rn, [0, 0, HEAD_R]))
  const arm = (side: 1 | -1, f: number, ab: number, rot: number, el: number) => {
    const S = add(C, ap(Rs, [0.19 * side, -0.02, 0]))
    const R1 = mul(Rs, E(-f, ab * side, rot * side))
    const El = add(S, ap(R1, [0, -0.29, 0]))
    const R2 = mul(R1, rx(-el))
    const W = add(El, ap(R2, [0, -0.25, 0]))
    return [S, El, W, add(W, ap(R2, [0, -0.06, 0]))]
  }
  const leg = (side: 1 | -1, f: number, ab: number, rot: number, kn: number) => {
    const Hp = add(P, ap(R0, [0.1 * side, -0.07, 0]))
    const R1 = mul(R0, E(-f, ab * side, rot * side))
    const K = add(Hp, ap(R1, [0, -0.44, 0]))
    const R2 = mul(R1, rx(kn))
    const A = add(K, ap(R2, [0, -0.41, 0]))
    return [Hp, K, A, add(A, ap(R2, [0, -0.04, 0.16]))]
  }
  const [lSh, lEl, lWr, lHand] = arm(1, g('lsF'), g('lsA'), g('lsR'), g('le'))
  const [rSh, rEl, rWr, rHand] = arm(-1, g('rsF'), g('rsA'), g('rsR'), g('re'))
  const [lHip, lKn, lAn, lToe] = leg(1, g('lhF'), g('lhA'), g('lhR'), g('lk'))
  const [rHip, rKn, rAn, rToe] = leg(-1, g('rhF'), g('rhA'), g('rhR'), g('rk'))
  const sk: Skeleton = { pelvis: P, chest: C, neck: N, head: H, nose, lSh, rSh, lEl, rEl, lWr, rWr, lHand, rHand, lHip, rHip, lKn, rKn, lAn, rAn, lToe, rToe }
  // ground contact: lowest point of any bone surface, the head or the hands
  let lo = H[1] - HEAD_R
  for (const [p, q, r] of BONES) lo = Math.min(lo, sk[p][1] - r, sk[q][1] - r)
  lo = Math.min(lo, lHand[1] - HAND_R, rHand[1] - HAND_R)
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const k of POINTS) {
    x0 = Math.min(x0, sk[k][0]); x1 = Math.max(x1, sk[k][0])
    z0 = Math.min(z0, sk[k][2]); z1 = Math.max(z1, sk[k][2])
  }
  const off: V = [-(x0 + x1) / 2, -lo, -(z0 + z1) / 2]
  for (const k of POINTS) sk[k] = add(sk[k], off)
  return sk
}

// ---------- routine timeline ----------

export interface Step {
  id: string
  pose: string
  hold: number
}

export interface Segment {
  start: number
  dur: number
  kind: 'move' | 'hold'
  from: Angles
  to: Angles
  label: string
  /** Index of the step in the routine. */
  step: number
  side?: 'left' | 'right'
}

/** Expands steps into move/hold segments (sided poses get a left and a right hold). Starts and ends standing. */
export function timeline(steps: Step[], transition: number): Segment[] {
  const segs: Segment[] = []
  let t = 0
  let prev = poseById('stand').a
  const push = (to: Angles, hold: number, label: string, step: number, side?: 'left' | 'right') => {
    const tr = Math.max(0.5, transition)
    segs.push({ start: t, dur: tr, kind: 'move', from: prev, to, label, step, side })
    t += tr
    segs.push({ start: t, dur: Math.max(1, hold), kind: 'hold', from: to, to, label, step, side })
    t += Math.max(1, hold)
    prev = to
  }
  steps.forEach((s, i) => {
    const p = poseById(s.pose)
    if (p.sided) {
      push(p.a, s.hold, p.name, i, 'left')
      push(mirror(p.a), s.hold, p.name, i, 'right')
    } else push(p.a, s.hold, p.name, i)
  })
  if (segs.length) {
    const tr = Math.max(0.5, transition)
    segs.push({ start: t, dur: tr, kind: 'move', from: prev, to: poseById('stand').a, label: 'Finish', step: steps.length })
  }
  return segs
}

export const totalTime = (segs: Segment[]) => (segs.length ? segs[segs.length - 1].start + segs[segs.length - 1].dur : 0)

/** Segment index at time t (clamped). */
export function segmentAt(segs: Segment[], t: number): number {
  let i = 0
  while (i < segs.length - 1 && t >= segs[i].start + segs[i].dur) i++
  return i
}

export function anglesAt(segs: Segment[], t: number): Angles {
  if (!segs.length) return poseById('stand').a
  const s = segs[segmentAt(segs, t)]
  return s.kind === 'hold' ? s.to : blend(s.from, s.to, (t - s.start) / s.dur)
}

export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
