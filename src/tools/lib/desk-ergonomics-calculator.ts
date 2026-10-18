// Desk ergonomics: body dimensions estimated from stature with typical anthropometric proportions
// (segment ratios in the spirit of Drillis & Contini and adult survey means), then workstation targets.
// All lengths in centimetres.

export interface Body {
  stature: number
  popliteal: number // floor → underside of thigh behind the knee, seated, barefoot
  elbowRest: number // seat → underside of elbow, seated, upper arm vertical
  eyeSeated: number // seat → eye
  shoulderSeated: number // seat → shoulder
  buttockPopliteal: number // back of buttock → back of knee
  hipBreadth: number
  elbowStanding: number // floor → elbow, standing
  eyeStanding: number // floor → eye, standing
}

/** Ratios of stature (unitless). */
export const RATIO = {
  popliteal: 0.248,
  elbowRest: 0.137,
  eyeSeated: 0.447,
  shoulderSeated: 0.337,
  buttockPopliteal: 0.277,
  hipBreadth: 0.213,
  elbowStanding: 0.63,
  eyeStanding: 0.936,
}

export function body(stature: number): Body {
  const b = { stature } as Body
  for (const [k, r] of Object.entries(RATIO)) (b as unknown as Record<string, number>)[k] = stature * r
  return b
}

export interface Opts {
  stature: number
  shoe: number // heel height of usual shoes
  keyboard: number // keyboard height above desk surface (home row)
  diagonal: number // monitor diagonal, inches
  aspect: [number, number]
  bifocal: boolean
  laptopOnly: boolean
}

export interface Targets {
  b: Body
  seat: [number, number] // recommended range, floor → seat top
  seatIdeal: number
  seatDepthMax: number
  seatWidthMin: number
  deskSit: number // floor → desk surface
  deskStand: number
  monitorTopSit: number // floor → top edge of the screen's visible area
  monitorTopStand: number
  monitorCenterSit: number
  screenW: number
  screenH: number
  distance: [number, number] // eye → screen
  distanceIdeal: number
  tilt: number // backward tilt, degrees
  gazeDown: number // gaze angle to screen centre, degrees below horizontal
}

/** Visible width/height (cm) of a screen with diagonal in inches. */
export function screenSize(diagonal: number, aspect: [number, number]): { w: number; h: number } {
  const d = diagonal * 2.54
  const k = Math.hypot(aspect[0], aspect[1])
  return { w: (d * aspect[0]) / k, h: (d * aspect[1]) / k }
}

export function targets(o: Opts): Targets {
  const b = body(o.stature)
  const seatIdeal = b.popliteal + o.shoe
  const deskSit = seatIdeal + b.elbowRest - o.keyboard
  const deskStand = b.elbowStanding + o.shoe - o.keyboard
  const { w, h } = screenSize(o.diagonal, o.aspect)
  // Screen should span roughly 40–60° of horizontal view; never closer than ~50 cm.
  const dist = (fov: number) => w / 2 / Math.tan((fov / 2) * (Math.PI / 180))
  const distanceIdeal = Math.max(50, Math.min(100, dist(48)))
  const distance: [number, number] = [Math.max(45, Math.min(95, dist(60))), Math.max(60, Math.min(110, dist(38)))]
  // Top of screen at or slightly below eye level; bifocal wearers look through the lower segment.
  const drop = o.bifocal ? 12 : 3
  const eyeSit = seatIdeal + b.eyeSeated
  const monitorTopSit = o.laptopOnly ? deskSit + o.keyboard + h : eyeSit - drop
  const monitorTopStand = o.laptopOnly ? deskStand + o.keyboard + h : b.eyeStanding + o.shoe - drop
  const monitorCenterSit = monitorTopSit - h / 2
  const gazeDown = (Math.atan2(eyeSit - monitorCenterSit, distanceIdeal) * 180) / Math.PI
  return {
    b, seatIdeal, seat: [seatIdeal - 3, seatIdeal + 2],
    seatDepthMax: b.buttockPopliteal - 6, seatWidthMin: b.hipBreadth + 5,
    deskSit, deskStand, monitorTopSit, monitorTopStand, monitorCenterSit,
    screenW: w, screenH: h, distance, distanceIdeal, tilt: o.bifocal ? 20 : 12, gazeDown,
  }
}

export interface Check { ok: boolean; text: string }
export interface Fit { seatForDesk: number; footrest: number; checks: Check[] }

/** Compares a fixed desk/chair with the targets and suggests the fix (raise chair + footrest, etc.). */
export function checkSetup(t: Targets, o: Opts, desk: number, chair: number, monitorTop: number): Fit {
  // Seat height that puts the elbows level with the keyboard on this desk.
  const seatForDesk = desk + o.keyboard - t.b.elbowRest
  const footrest = Math.max(0, seatForDesk - t.seatIdeal)
  const checks: Check[] = []
  const dDesk = desk - t.deskSit
  checks.push(Math.abs(dDesk) <= 2.5
    ? { ok: true, text: `Desk height is within 2.5 cm of your seated target.` }
    : { ok: false, text: `Desk is ${Math.abs(dDesk).toFixed(1)} cm ${dDesk > 0 ? 'too high' : 'too low'} for you.${dDesk > 0 ? ` Raise the chair to ${seatForDesk.toFixed(0)} cm and use a ${footrest.toFixed(0)} cm footrest, or use a keyboard tray.` : ' Raise the desk (blocks or adjustable legs), or lower the chair only if your thighs stay level.'}` })
  const dChair = chair - (dDesk > 2.5 ? seatForDesk : t.seatIdeal)
  checks.push(Math.abs(dChair) <= 2.5
    ? { ok: true, text: 'Chair height lets your feet rest flat with thighs about level.' }
    : { ok: false, text: `Chair is ${Math.abs(dChair).toFixed(1)} cm ${dChair > 0 ? 'too high: feet will dangle or thighs get pressure' : 'too low: knees above hips and elbows below the desk'}.` })
  const eye = chair + t.b.eyeSeated
  const dTop = monitorTop - (eye - (o.bifocal ? 12 : 3))
  checks.push(Math.abs(dTop) <= 4
    ? { ok: true, text: 'Top of the screen is at or just below eye level.' }
    : { ok: false, text: `Screen top is ${Math.abs(dTop).toFixed(0)} cm ${dTop > 0 ? 'too high (neck extension)' : 'too low (neck flexion)'} for your eye height at this chair setting.` })
  return { seatForDesk, footrest, checks }
}

export const cmToIn = (cm: number) => cm / 2.54
