// IPC-2221 trace current capacity: I = k · ΔT^0.44 · A^0.725, A = cross-section in mil², ΔT in °C.
// k = 0.048 for external (outer) layers, 0.024 for internal layers.

export const MIL_PER_OZ = 1.378 // copper thickness per oz/ft²
export const UM_PER_MIL = 25.4
export const RHO_CU = 1.724e-8 // Ω·m at 20 °C (annealed copper)
export const ALPHA_CU = 0.00393 // 1/°C

export type Layer = 'external' | 'internal'
export const kOf = (layer: Layer) => (layer === 'external' ? 0.048 : 0.024)

/** Required cross-section area (mil²) for current I (A) at temperature rise dT (°C). */
export const areaFor = (I: number, dT: number, layer: Layer) => (I / (kOf(layer) * dT ** 0.44)) ** (1 / 0.725)

/** Required trace width (mil) for current I with copper `oz` thick. */
export const widthFor = (I: number, dT: number, oz: number, layer: Layer) => areaFor(I, dT, layer) / (oz * MIL_PER_OZ)

/** Maximum current (A) for a trace of `widthMil` width. */
export const currentFor = (widthMil: number, dT: number, oz: number, layer: Layer) => kOf(layer) * dT ** 0.44 * (widthMil * oz * MIL_PER_OZ) ** 0.725

/** DC resistance (Ω) of a trace: width/length in mil, thickness from oz, at temperature tC. */
export function resistance(widthMil: number, lengthMil: number, oz: number, tC: number): number {
  const m = UM_PER_MIL * 1e-6
  const area = widthMil * m * oz * MIL_PER_OZ * m
  return ((RHO_CU * lengthMil * m) / area) * (1 + ALPHA_CU * (tC - 20))
}

export interface TraceResult { area: number; width: number; R: number; drop: number; power: number; tTrace: number }

export function solve(I: number, dT: number, oz: number, layer: Layer, lengthMil: number, ambient: number, widthMil?: number): TraceResult {
  const width = widthMil ?? widthFor(I, dT, oz, layer)
  const tTrace = ambient + dT
  const R = resistance(width, lengthMil, oz, tTrace)
  return { area: width * oz * MIL_PER_OZ, width, R, drop: I * R, power: I * I * R, tTrace }
}

/** Temperature rise (°C) a given width reaches at current I (inverse of currentFor). */
export const riseFor = (I: number, widthMil: number, oz: number, layer: Layer) => (I / (kOf(layer) * (widthMil * oz * MIL_PER_OZ) ** 0.725)) ** (1 / 0.44)
