// Side-view posture geometry: ear (tragus), shoulder (acromion / C7 proxy) and hip (greater trochanter)
// marked on a photo in image coordinates (x right, y down).

export interface Pt {
  x: number
  y: number
}

export interface Landmarks {
  ear: Pt
  shoulder: Pt
  hip: Pt
}

export type Facing = 'left' | 'right'
export type Grade = 'good' | 'fair' | 'poor'

const DEG = 180 / Math.PI

/**
 * Signed inclination of the segment from `base` up to `top`, in degrees from vertical.
 * Positive = leaning towards the direction the person faces.
 */
export function inclination(base: Pt, top: Pt, facing: Facing): number {
  const dx = (top.x - base.x) * (facing === 'right' ? 1 : -1)
  const up = base.y - top.y
  return Math.atan2(dx, up) * DEG
}

/** Craniovertebral angle: between the horizontal through the shoulder and the shoulder→ear line. */
export function craniovertebral(ear: Pt, shoulder: Pt, facing: Facing): number {
  const dx = (ear.x - shoulder.x) * (facing === 'right' ? 1 : -1)
  const up = shoulder.y - ear.y
  return Math.atan2(up, dx) * DEG
}

/** Approximate effective load the neck carries at a given forward head tilt (Hansraj 2014, kg). */
const LOAD: [number, number][] = [[0, 5], [15, 12.2], [30, 18.1], [45, 22.2], [60, 27.2]]
export function neckLoadKg(neckDeg: number): number {
  const a = Math.max(0, Math.min(60, neckDeg))
  for (let i = 1; i < LOAD.length; i++) {
    const [x0, y0] = LOAD[i - 1], [x1, y1] = LOAD[i]
    if (a <= x1) return y0 + ((a - x0) / (x1 - x0)) * (y1 - y0)
  }
  return LOAD[LOAD.length - 1][1]
}

/** Neck inclination ≤ 25° is upright; > 40° (CVA < 50°) is a clear forward-head posture. */
export const gradeNeck = (deg: number): Grade => (Math.abs(deg) <= 25 ? 'good' : Math.abs(deg) <= 40 ? 'fair' : 'poor')
export const gradeTorso = (deg: number): Grade => (Math.abs(deg) <= 10 ? 'good' : Math.abs(deg) <= 20 ? 'fair' : 'poor')

export interface Analysis {
  neck: number
  torso: number
  cva: number
  /** Ear ahead of the shoulder, as a fraction of torso length. */
  forwardHead: number
  loadKg: number
  grades: { neck: Grade; torso: Grade }
  score: number
  overall: Grade
}

const PTS: Record<Grade, number> = { good: 1, fair: 0.55, poor: 0.15 }

export function analyse(l: Landmarks, facing: Facing): Analysis {
  const neck = inclination(l.shoulder, l.ear, facing)
  const torso = inclination(l.hip, l.shoulder, facing)
  const cva = craniovertebral(l.ear, l.shoulder, facing)
  const torsoLen = Math.hypot(l.shoulder.x - l.hip.x, l.shoulder.y - l.hip.y) || 1
  const forwardHead = ((l.ear.x - l.shoulder.x) * (facing === 'right' ? 1 : -1)) / torsoLen
  const grades = { neck: gradeNeck(neck), torso: gradeTorso(torso) }
  const score = Math.round(100 * (0.6 * PTS[grades.neck] + 0.4 * PTS[grades.torso]))
  const overall: Grade = score >= 80 ? 'good' : score >= 50 ? 'fair' : 'poor'
  return { neck, torso, cva, forwardHead, loadKg: neckLoadKg(neck), grades, score, overall }
}

/** Landmarks of a synthetic side-view figure (facing right) for a given neck/torso lean, origin at hip. */
export function synthLandmarks(neckDeg: number, torsoDeg: number, hip: Pt, torsoLen: number, neckLen: number): Landmarks {
  const t = torsoDeg / DEG, n = neckDeg / DEG
  const shoulder = { x: hip.x + Math.sin(t) * torsoLen, y: hip.y - Math.cos(t) * torsoLen }
  const ear = { x: shoulder.x + Math.sin(n) * neckLen, y: shoulder.y - Math.cos(n) * neckLen }
  return { ear, shoulder, hip }
}
