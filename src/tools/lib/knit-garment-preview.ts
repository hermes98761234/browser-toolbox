// Knitting chart helpers: presets, gauge maths and repeat fitting for the 3D sweater preview.

export const PRESETS: Record<string, { name: string; rows: string[] }> = {
  star: {
    name: 'Fair Isle star',
    rows: ['000000000000', '000001100000', '000011110000', '010011110010', '011101101110', '001111111100', '000111111000', '001111111100', '011101101110', '010011110010', '000011110000', '000001100000'],
  },
  peerie: { name: 'Peerie band', rows: ['00000000', '22222222', '00100010', '01110111', '00100010', '22222222', '00000000', '00000000'] },
  stripes: { name: 'Breton stripes', rows: ['0000', '0000', '0000', '1111', '1111', '0000'] },
  check: { name: 'Gingham check', rows: ['11002200', '11002200', '22003300', '22003300', '00000000', '00000000'].map((r) => r.replace(/3/g, '1')) },
  houndstooth: { name: 'Houndstooth', rows: ['11110001', '11100011', '11000111', '10001111', '00001111', '00011111', '00111110', '01111100'].map((r) => r.replace(/1/g, 'x').replace(/0/g, '1').replace(/x/g, '0')) },
  heart: { name: 'Hearts', rows: ['0000000000', '0110001100', '1111011110', '1111111110', '1111111110', '0111111100', '0011111000', '0001110000', '0000100000', '0000000000'] },
  argyle: { name: 'Argyle diamonds', rows: ['2000000002', '1200000021', '1120000211', '1112002111', '1111221111', '1111221111', '1112002111', '1120000211', '1200000021', '2000000002'] },
}

export type Chart = number[][] // [row][col] colour index, row 0 = top

export const parseRows = (rows: string[]): Chart => rows.map((r) => [...r].map(Number))

/** Stitches cast on for a circumference (cm) at `sts` stitches per 10 cm. */
export const castOn = (circ: number, sts: number) => Math.round((circ * sts) / 10)

/** Nearest stitch counts that are exact multiples of the repeat width. */
export function fitRepeat(stitches: number, width: number): { repeats: number; exact: boolean; lower: number; upper: number } {
  const lower = Math.floor(stitches / width) * width
  const upper = Math.ceil(stitches / width) * width
  return { repeats: stitches / width, exact: stitches % width === 0, lower, upper }
}

/** Fraction of chart cells per colour index. */
export function colourShare(chart: Chart, colours: number): number[] {
  const n = chart.reduce((a, r) => a + r.length, 0) || 1
  const out = new Array<number>(colours).fill(0)
  for (const r of chart) for (const c of r) if (c < colours) out[c]++
  return out.map((x) => x / n)
}

/** Longest run of the same colour in any row (Fair Isle float length). */
export function longestFloat(chart: Chart): number {
  let best = 0
  for (const r of chart) {
    // rows are worked in the round: wrap around the repeat
    const w = r.length
    for (let s = 0; s < w; s++) {
      let n = 1
      while (n < w && r[(s + n) % w] === r[s]) n++
      if (n < w) best = Math.max(best, n)
    }
  }
  return best
}
