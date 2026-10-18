// Fishing knots: schematic step diagrams (SVG paths in a 320×170 box) and approximate strength data.

/** Stroke roles: S standing line, T tag end, G second line, H hardware, A arrow. */
export type Role = 'S' | 'T' | 'G' | 'A'
export interface El { d: string; r: Role; anim?: boolean; dbl?: boolean }
export interface Step { text: string; els: El[]; labels?: [number, number, string][] }
export type Use = 'hook' | 'join' | 'loop' | 'spool'
export type LineType = 'mono' | 'fluoro' | 'braid'
export interface Knot {
  id: string; name: string; use: Use; difficulty: 1 | 2 | 3
  /** Approximate knot strength as % of the unknotted line's breaking strength (varies with line, tying and testing). */
  strength: [number, number]
  lines: Record<LineType, 0 | 1 | 2> // 0 not advised, 1 ok, 2 good
  base: 'hook' | 'spool' | 'none'
  about: string; tips: string[]; steps: Step[]
}

/** Helix wraps drawn as a sine between x0 and x1 around y (as an "L…" continuation). */
export function coil(x0: number, x1: number, y: number, turns: number, amp: number, phase = 0): string {
  const n = Math.max(8, Math.round(turns * 12))
  let d = ''
  for (let i = 0; i <= n; i++) {
    const t = i / n
    d += ` L${(x0 + (x1 - x0) * t).toFixed(1)},${(y + amp * Math.cos(2 * Math.PI * turns * t + phase)).toFixed(1)}`
  }
  return d
}

const EYE_IN = 'M74,77 C52,73 52,89 74,86'
const S_EYE: El = { d: 'M320,77 H74', r: 'S' }
const PAL = 'M320,79 H220 C180,79 170,130 200,132 C230,134 228,96 204,90 C170,82 120,80 78,80'

export const KNOTS: Knot[] = [
  {
    id: 'clinch', name: 'Improved clinch knot', use: 'hook', difficulty: 1, strength: [75, 95], lines: { mono: 2, fluoro: 1, braid: 0 }, base: 'hook',
    about: 'The classic way to tie monofilament to a hook, lure or swivel. Quick to learn; slips in braid.',
    tips: ['Use 5–7 wraps for light line, 3–4 for line over ~30 lb.', 'Always moisten before tightening — heat from friction weakens mono.', 'Make sure the coils sit in a neat spiral, not crossing over each other.'],
    steps: [
      { text: 'Pass 15–20 cm of line through the hook eye.', els: [S_EYE, { d: `${EYE_IN} H210`, r: 'T', anim: true }] },
      { text: 'Wrap the tag end around the standing line 5–7 times.', els: [S_EYE, { d: `${EYE_IN} H90${coil(90, 190, 81, 6, 6, 0)}`, r: 'T', anim: true }], labels: [[140, 66, '× 6']] },
      { text: 'Bring the tag back and pass it through the small loop next to the eye.', els: [S_EYE, { d: `${EYE_IN} H90${coil(90, 190, 81, 6, 6, 0)}`, r: 'T' }, { d: 'M190,87 C240,130 100,140 84,86', r: 'T', anim: true }] },
      { text: 'Improved step: tuck the tag through the big loop you just formed.', els: [S_EYE, { d: `${EYE_IN} H90${coil(90, 190, 81, 6, 6, 0)}`, r: 'T' }, { d: 'M190,87 C240,130 100,140 84,86', r: 'T' }, { d: 'M84,86 C100,58 168,60 150,112 L158,150', r: 'T', anim: true }] },
      { text: 'Moisten, pull the standing line so the coils spiral onto the eye, and trim the tag to ~3 mm.', els: [{ d: 'M320,81 H112', r: 'S' }, { d: `${EYE_IN}${coil(76, 112, 81, 6, 6, 0)} L122,96`, r: 'T', anim: true }], labels: [[128, 112, '✂ trim']] },
    ],
  },
  {
    id: 'palomar', name: 'Palomar knot', use: 'hook', difficulty: 1, strength: [85, 95], lines: { mono: 2, fluoro: 2, braid: 2 }, base: 'hook',
    about: 'Very strong and simple; the go-to for braid to a hook. Awkward with big lures because the whole lure must pass through the loop.',
    tips: ['Double about 15 cm of line.', 'Keep the overhand loose so the hook fits through.', 'Pull both the standing line and tag together when seating.'],
    steps: [
      { text: 'Double 15 cm of line into a loop and push the loop through the hook eye.', els: [{ d: 'M320,73 H86 C70,73 66,80 66,94 V140 C66,154 82,154 82,140 V94 C82,88 86,86 96,86 H320', r: 'S', anim: true }] },
      { text: 'Tie a loose overhand knot with the doubled line; let the hook hang from it.', els: [{ d: `${PAL} C62,80 58,98 60,120 C62,142 86,144 88,124`, r: 'S', dbl: true, anim: true }] },
      { text: 'Pass the end of the loop over the entire hook.', els: [{ d: PAL, r: 'S', dbl: true }, { d: 'M78,80 C60,80 40,64 20,72 C2,80 0,112 10,128 C20,142 44,138 54,124', r: 'S', dbl: true, anim: true }, { d: 'M110,150 C80,166 30,160 14,140', r: 'A', anim: true }] },
      { text: 'Moisten, pull the standing line and tag together to tighten; trim.', els: [{ d: 'M320,77 H96', r: 'S' }, { d: `M96,77 C78,72 74,74 74,77${coil(76, 96, 81, 2, 5, 0)} L104,98`, r: 'T', dbl: true, anim: true }], labels: [[110, 114, '✂ trim']] },
    ],
  },
  {
    id: 'uni', name: 'Uni knot', use: 'hook', difficulty: 2, strength: [80, 95], lines: { mono: 2, fluoro: 2, braid: 2 }, base: 'hook',
    about: 'One knot that works with every line type. Leave it slightly loose before seating for a free-swinging loop knot.',
    tips: ['6 turns for mono, 8–10 for braid.', 'Snug the coils with the tag first, then slide the knot down with the standing line.'],
    steps: [
      { text: 'Pass the line through the eye and run the tag back parallel to the standing line.', els: [S_EYE, { d: `${EYE_IN} H200`, r: 'T', anim: true }] },
      { text: 'Bring the tag back toward the eye to form a loop over the doubled line.', els: [S_EYE, { d: `${EYE_IN} H200`, r: 'T' }, { d: 'M200,86 C246,86 252,36 196,36 C148,36 134,64 150,82', r: 'T', anim: true }] },
      { text: 'Wrap the tag 6 times around both lines, through the loop each time.', els: [S_EYE, { d: `${EYE_IN} H200 C246,86 252,36 196,36 C148,36 134,64 150,82`, r: 'T' }, { d: `M150,82${coil(150, 96, 82, 6, 11, 0)}`, r: 'T', anim: true }], labels: [[124, 60, '× 6']] },
      { text: 'Pull the tag to snug the coils, then pull the standing line to slide the knot to the eye. Trim.', els: [{ d: 'M320,79 H112', r: 'S' }, { d: `${EYE_IN}${coil(78, 112, 81, 6, 7, 0)} L120,98`, r: 'T', anim: true }, { d: 'M210,64 H140', r: 'A', anim: true }], labels: [[126, 116, '✂ trim']] },
    ],
  },
  {
    id: 'doubleuni', name: 'Double uni knot', use: 'join', difficulty: 2, strength: [75, 90], lines: { mono: 2, fluoro: 2, braid: 2 }, base: 'none',
    about: 'Joins two lines of similar or different diameter and material — the easy way to tie braid main line to a mono or fluoro leader.',
    tips: ['Use more turns on the thinner or slicker line (braid 8, mono 5).', 'Seat each uni firmly before sliding them together.'],
    steps: [
      { text: 'Overlap the two lines by about 20 cm.', els: [{ d: 'M0,76 H250', r: 'S', anim: true }, { d: 'M320,86 H70', r: 'G', anim: true }] },
      { text: 'With the first tag, tie a uni knot around both lines.', els: [{ d: 'M0,76 H250 C285,76 290,32 250,32 C210,32 200,62 214,81', r: 'S' }, { d: 'M320,86 H70', r: 'G' }, { d: `M214,81${coil(214, 174, 81, 5, 11, 0)}`, r: 'S', anim: true }], labels: [[194, 60, '× 5']] },
      { text: 'Repeat with the second tag on the other side.', els: [{ d: `M0,76 H250 C285,76 290,32 250,32 C210,32 200,62 214,81${coil(214, 174, 81, 5, 11, 0)}`, r: 'S' }, { d: 'M320,86 H70 C35,86 30,130 70,130 C110,130 120,100 106,81', r: 'G' }, { d: `M106,81${coil(106, 146, 81, 5, 11, Math.PI)}`, r: 'G', anim: true }] },
      { text: 'Pull each knot tight, then pull the standing lines so the knots slide together. Trim both tags.', els: [{ d: `M0,81 H132${coil(132, 160, 81, 5, 7, 0)} L166,66`, r: 'S', anim: true }, { d: `M320,81 H188${coil(188, 160, 81, 5, 7, Math.PI)} L154,96`, r: 'G', anim: true }, { d: 'M40,110 H110', r: 'A', anim: true }, { d: 'M280,110 H210', r: 'A', anim: true }] },
    ],
  },
  {
    id: 'blood', name: 'Blood (barrel) knot', use: 'join', difficulty: 3, strength: [75, 90], lines: { mono: 2, fluoro: 1, braid: 0 }, base: 'none',
    about: 'A slim, symmetrical join for two monofilament lines of similar diameter — the traditional leader and tippet knot.',
    tips: ['Lines should be within ~20 % of each other in diameter.', 'Hold the centre gap open with a toothpick or fingernail.', '5 turns each side for most line.'],
    steps: [
      { text: 'Overlap the two lines by 15 cm.', els: [{ d: 'M0,76 H230', r: 'S', anim: true }, { d: 'M320,86 H90', r: 'G', anim: true }] },
      { text: 'Wrap the first tag 5 times around the second line, then poke it back through the centre gap.', els: [{ d: 'M0,76 H160', r: 'S' }, { d: 'M320,86 H90', r: 'G' }, { d: `M160,76${coil(162, 226, 81, 5, 7, Math.PI)} C250,126 176,128 160,86 L158,60`, r: 'S', anim: true }], labels: [[194, 62, '× 5']] },
      { text: 'Repeat on the other side with the second tag, through the same gap in the opposite direction.', els: [{ d: `M0,76 H160${coil(162, 226, 81, 5, 7, Math.PI)} C250,126 176,128 160,86 L158,60`, r: 'S' }, { d: 'M320,86 H160', r: 'G' }, { d: `M160,86${coil(158, 94, 81, 5, 7, 0)} C70,36 144,34 160,76 L162,104`, r: 'G', anim: true }], labels: [[126, 106, '× 5']] },
      { text: 'Moisten and pull the standing lines apart so the coils pack together. Trim the tags close.', els: [{ d: `M0,81 H140${coil(140, 160, 81, 5, 6, 0)} L162,64`, r: 'S', anim: true }, { d: `M320,81 H180${coil(180, 160, 81, 5, 6, 0)} L158,98`, r: 'G', anim: true }] },
    ],
  },
  {
    id: 'surgeon', name: 'Double surgeon’s knot', use: 'join', difficulty: 1, strength: [75, 95], lines: { mono: 2, fluoro: 2, braid: 1 }, base: 'none',
    about: 'The fastest strong join for lines of very different diameter, e.g. a heavy fluorocarbon leader to lighter line.',
    tips: ['The whole leader must pass through the loop, so tie it before attaching the hook.', 'Pull all four ends evenly.', 'A third pass makes a triple surgeon’s for slick lines.'],
    steps: [
      { text: 'Overlap the main line and leader by 15–20 cm.', els: [{ d: 'M0,77 H240', r: 'S', anim: true }, { d: 'M320,85 H80', r: 'G', anim: true }] },
      { text: 'Holding both lines together, form a loop.', els: [{ d: 'M0,77 H40', r: 'S' }, { d: 'M320,85 H260', r: 'G' }, { d: 'M40,81 H130 C190,81 200,30 160,30 C120,30 120,80 150,110 C170,130 210,100 260,85', r: 'S', dbl: true, anim: true }] },
      { text: 'Pass both tag ends (and the whole leader) through the loop twice.', els: [{ d: 'M0,77 H40', r: 'S' }, { d: 'M320,85 H260', r: 'G' }, { d: 'M40,81 H120 C175,81 190,36 160,36 C130,36 128,104 160,104 C192,104 190,56 160,56 C138,56 140,82 200,84 L260,85', r: 'S', dbl: true, anim: true }], labels: [[180, 128, 'twice through']] },
      { text: 'Moisten, pull all four ends evenly to seat the knot, and trim the two tags.', els: [{ d: `M0,81 H140${coil(140, 176, 81, 2, 8, 0)} L184,66`, r: 'S', anim: true }, { d: `M320,81 H176${coil(176, 140, 81, 2, 8, Math.PI)} L132,98`, r: 'G', anim: true }] },
    ],
  },
  {
    id: 'perfection', name: 'Perfection loop', use: 'loop', difficulty: 2, strength: [70, 90], lines: { mono: 2, fluoro: 2, braid: 0 }, base: 'none',
    about: 'A small, straight fixed loop in the end of a line — used for loop-to-loop leader connections and drop shots.',
    tips: ['Loop size is set in step 4; pull slowly to adjust before seating.', 'The finished tag sticks out at a right angle — trim it close.'],
    steps: [
      { text: 'Make a loop by passing the tag end behind the standing line.', els: [{ d: 'M320,80 H150 C108,80 100,36 140,36 C178,36 178,80 160,100 L150,124', r: 'S', anim: true }], labels: [[134, 28, '1']] },
      { text: 'Wrap the tag around in front to make a second, smaller loop.', els: [{ d: 'M320,80 H150 C108,80 100,36 140,36 C178,36 178,80 160,100 L150,124', r: 'S' }, { d: 'M150,124 C130,150 104,118 124,98 C140,84 170,100 168,122 L178,140', r: 'T', anim: true }], labels: [[134, 28, '1'], [112, 120, '2']] },
      { text: 'Lay the tag between the two loops.', els: [{ d: 'M320,80 H150 C108,80 100,36 140,36 C178,36 178,80 160,100 L150,124 C130,150 104,118 124,98 C140,84 170,100 168,122 L178,140', r: 'S' }, { d: 'M178,140 C206,120 196,74 160,58', r: 'T', anim: true }] },
      { text: 'Pull loop 2 through loop 1.', els: [{ d: 'M320,80 H150 C108,80 100,36 140,36 C178,36 178,80 160,100 L150,124 C130,150 104,118 124,98 C140,84 170,100 168,122 L178,140 C206,120 196,74 160,58', r: 'S' }, { d: 'M118,112 C80,96 70,70 98,52', r: 'A', anim: true }] },
      { text: 'Pull the loop and standing line to seat; trim the tag at right angles.', els: [{ d: 'M320,80 H172', r: 'S' }, { d: `M172,80${coil(172, 150, 80, 1.5, 6, 0)} C110,52 40,56 40,80 C40,104 110,108 150,84 L160,100`, r: 'S', anim: true }] },
    ],
  },
  {
    id: 'arbor', name: 'Arbor knot', use: 'spool', difficulty: 1, strength: [0, 0], lines: { mono: 2, fluoro: 2, braid: 1 }, base: 'spool',
    about: 'Attaches line to an empty reel spool. It only needs to hold during spooling — never rely on it under load.',
    tips: ['For braid, first wrap a few turns of mono backing (or tape) so the braid can’t spin on the spool.', 'Keep the stopper knot right at the tag end.'],
    steps: [
      { text: 'Pass the line around the spool arbor.', els: [{ d: 'M320,58 H70 A22,22 0 0 0 70,102 H200', r: 'S', anim: true }] },
      { text: 'Tie an overhand knot with the tag around the standing line.', els: [{ d: 'M320,58 H70 A22,22 0 0 0 70,102 H200', r: 'S' }, { d: 'M200,102 C244,102 250,44 214,46 C188,48 194,78 226,82 L250,82', r: 'T', anim: true }] },
      { text: 'Tie a second overhand in the tag end itself as a stopper.', els: [{ d: 'M320,58 H70 A22,22 0 0 0 70,102 H200 C244,102 250,44 214,46 C188,48 194,78 226,82 L250,82', r: 'S' }, { d: 'M250,82 C272,82 280,62 266,60 C252,58 254,84 282,86 L296,86', r: 'T', anim: true }] },
      { text: 'Pull the standing line: the knot slides down and the stopper jams it against the spool. Trim.', els: [{ d: 'M320,58 H70 A22,22 0 0 0 70,102 H94', r: 'S', anim: true }, { d: `M94,102${coil(94, 104, 102, 1, 5, 0)} L108,100 C114,94 118,108 112,108 L118,116`, r: 'T', anim: true }, { d: 'M250,130 H130', r: 'A', anim: true }] },
    ],
  },
]

export const USES: [Use | 'all', string][] = [['all', 'All'], ['hook', 'Hook / lure'], ['join', 'Line to line'], ['loop', 'Loop'], ['spool', 'Spool']]

/** Approximate breaking strength range of a knotted line. */
export function knotStrength(lineStrength: number, k: Knot): [number, number] {
  return [(lineStrength * k.strength[0]) / 100, (lineStrength * k.strength[1]) / 100]
}

export function filterKnots(use: Use | 'all', line: LineType | 'any', q: string): Knot[] {
  const s = q.trim().toLowerCase()
  return KNOTS.filter((k) => (use === 'all' || k.use === use) && (line === 'any' || k.lines[line] > 0) && (!s || k.name.toLowerCase().includes(s) || k.about.toLowerCase().includes(s)))
}
