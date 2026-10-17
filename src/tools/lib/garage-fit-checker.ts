// Garage fit maths (all lengths in metres): side/front clearances, door-opening angle against a wall, garage door opening.

export interface Car { name: string; length: number; width: number; mirrors: number; height: number; door: number }
export interface Garage { name: string; width: number; depth: number; height: number; doorW: number; doorH: number }

// Typical dimensions per vehicle class (exact figures vary by model and year — edit to match yours).
export const CARS: Car[] = [
  { name: 'City car', length: 3.6, width: 1.65, mirrors: 1.9, height: 1.5, door: 1.0 },
  { name: 'Compact hatchback', length: 4.28, width: 1.79, mirrors: 2.03, height: 1.46, door: 1.1 },
  { name: 'Midsize sedan', length: 4.88, width: 1.84, mirrors: 2.1, height: 1.45, door: 1.15 },
  { name: 'Sports coupe', length: 4.5, width: 1.85, mirrors: 2.04, height: 1.3, door: 1.35 },
  { name: 'Compact SUV', length: 4.6, width: 1.86, mirrors: 2.12, height: 1.68, door: 1.15 },
  { name: 'Midsize SUV (3-row)', length: 4.95, width: 1.95, mirrors: 2.2, height: 1.78, door: 1.2 },
  { name: 'Minivan', length: 5.15, width: 2.0, mirrors: 2.25, height: 1.78, door: 1.2 },
  { name: 'Full-size SUV', length: 5.35, width: 2.06, mirrors: 2.33, height: 1.94, door: 1.25 },
  { name: 'Full-size pickup (crew cab)', length: 5.9, width: 2.03, mirrors: 2.44, height: 1.98, door: 1.25 },
]

export const GARAGES: Garage[] = [
  { name: 'UK single (2.4 × 4.8 m)', width: 2.4, depth: 4.8, height: 2.3, doorW: 2.13, doorH: 1.98 },
  { name: 'Single (3.0 × 6.0 m)', width: 3.0, depth: 6.0, height: 2.5, doorW: 2.4, doorH: 2.1 },
  { name: 'US 1-car (12 × 22 ft)', width: 3.66, depth: 6.71, height: 2.44, doorW: 2.74, doorH: 2.13 },
  { name: 'US 2-car (20 × 20 ft)', width: 6.1, depth: 6.1, height: 2.44, doorW: 4.88, doorH: 2.13 },
  { name: 'US 2-car deep (24 × 24 ft)', width: 7.32, depth: 7.32, height: 2.74, doorW: 4.88, doorH: 2.44 },
  { name: 'Carport / large (4 × 7 m)', width: 4.0, depth: 7.0, height: 2.7, doorW: 3.5, doorH: 2.4 },
]

/** Maximum door opening angle (deg) before the door's outer edge touches a wall `gap` metres from the car side. */
export function doorAngle(gap: number, doorLen: number): number {
  if (gap <= 0) return 0
  if (gap >= doorLen) return 90
  return (Math.asin(gap / doorLen) * 180) / Math.PI
}

/** Gap needed beside the car to open a door to `deg` degrees. */
export const gapForAngle = (deg: number, doorLen: number) => doorLen * Math.sin((Math.min(90, deg) * Math.PI) / 180)

export interface Fit {
  left: number; right: number // gap between car body and walls (car offset applied)
  front: number // free space in front of bumper (towards back wall), after rear clearance
  head: number // overhead clearance inside
  doorSide: number; doorHead: number // garage door opening clearance per side (mirrors) and above roof
  leftAngle: number; rightAngle: number
  fits: boolean; doorFits: boolean; canExit: boolean
}

/** `offset` shifts the car towards the right wall (m, + right); `rear` = space left behind the car at the door. */
export function fit(car: Car, g: Garage, offset = 0, rear = 0.3, roofExtra = 0, n = 1): Fit {
  const totalW = car.width * n
  const free = g.width - totalW
  const left = free / (n + 1) + offset
  const right = free / (n + 1) - offset
  const front = g.depth - car.length - rear
  const head = g.height - car.height - roofExtra
  const mirrorW = car.mirrors
  const doorSide = (g.doorW - mirrorW) / 2
  const doorHead = g.doorH - car.height - roofExtra
  const leftAngle = doorAngle(left, car.door)
  const rightAngle = doorAngle(right, car.door)
  const fits = left > 0 && right > 0 && front >= 0 && rear >= 0 && head > 0
  return { left, right, front, head, doorSide, doorHead, leftAngle, rightAngle, fits, doorFits: doorSide > 0 && doorHead > 0, canExit: Math.max(leftAngle, rightAngle) >= 30 }
}

export function verdict(angle: number): 'comfortable' | 'tight' | 'squeeze' | 'blocked' {
  if (angle >= 45) return 'comfortable'
  if (angle >= 30) return 'tight'
  if (angle > 15) return 'squeeze'
  return 'blocked'
}
