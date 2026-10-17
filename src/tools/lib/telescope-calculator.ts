// Telescope optics: magnification, exit pupil, true field, resolution, limiting magnitude, image scale.

export interface Scope { aperture: number; focal: number; obstruction: number } // mm, mm, fraction of diameter
export interface Eyepiece { focal: number; afov: number; fieldStop?: number } // mm, degrees, mm

export const focalRatio = (s: Scope) => s.focal / s.aperture
export const magnification = (scopeFocal: number, epFocal: number, barlow = 1) => (scopeFocal * barlow) / epFocal
export const exitPupil = (aperture: number, mag: number) => aperture / mag

/** True field (degrees): field stop method when known (more exact), else apparent field / magnification. */
export function trueField(s: Scope, e: Eyepiece, barlow = 1): number {
  if (e.fieldStop && e.fieldStop > 0) return ((e.fieldStop / (s.focal * barlow)) * 180) / Math.PI
  return e.afov / magnification(s.focal, e.focal, barlow)
}

/** Dawes' limit (arcsec) for double stars. */
export const dawes = (aperture: number) => 116 / aperture
/** Rayleigh criterion (arcsec) at 550 nm. */
export const rayleigh = (aperture: number) => (1.22 * 550e-6 / aperture) * 206265

/** Approximate visual limiting magnitude: 2.7 + 5·log10(D mm) (≈ 13.2 for 125 mm). */
export const limitingMag = (aperture: number) => 2.7 + 5 * Math.log10(aperture)

/** Light grasp relative to a dark-adapted eye pupil, accounting for the central obstruction. */
export const lightGrasp = (s: Scope, eye = 7) => ((s.aperture / eye) ** 2) * (1 - s.obstruction ** 2)

/** Highest useful magnification (~2× aperture in mm) and lowest (exit pupil = eye pupil). */
export const maxUseful = (aperture: number) => 2 * aperture
export const minUseful = (aperture: number, eye = 7) => aperture / eye

/** Camera image scale in arcsec per pixel (pixel size in µm). */
export const imageScale = (focal: number, pixelUm: number) => (206.265 * pixelUm) / focal

/** What an exit pupil is good for. */
export function pupilUse(ep: number, eye = 7): { label: string; tone: 'ok' | 'warn' | 'err' } {
  if (ep > eye + 0.05) return { label: 'Wasted light (exit pupil larger than your eye)', tone: 'err' }
  if (ep >= 4) return { label: 'Wide-field, faint nebulae, finding', tone: 'ok' }
  if (ep >= 2) return { label: 'Galaxies, clusters, general use', tone: 'ok' }
  if (ep >= 1) return { label: 'Planetary nebulae, small galaxies, the Moon', tone: 'ok' }
  if (ep >= 0.5) return { label: 'Planets and double stars (steady seeing)', tone: 'ok' }
  return { label: 'Empty magnification (too high)', tone: 'warn' }
}

/** Typical dark-adapted pupil by age (approximation of Winn et al. 1994). */
export const pupilForAge = (age: number) => Math.max(4, Math.min(7.5, 7.5 - Math.max(0, age - 20) * 0.043))
