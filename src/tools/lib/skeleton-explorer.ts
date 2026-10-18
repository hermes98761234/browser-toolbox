// Schematic human skeleton built from primitives (decimetre units, y up, +z = front, +x = the subject's left).
// Shapes are simplified for learning bone names and positions; they are NOT anatomically accurate.

export type P3 = [number, number, number]
export type Shape =
  | { t: 'ellip'; c: P3; r: P3; rot?: P3 }
  | { t: 'cap'; a: P3; b: P3; r: number }
  | { t: 'tube'; pts: P3[]; r: number }
  | { t: 'box'; c: P3; s: P3; rot?: P3 }
  | { t: 'vert'; u0: number; u1: number; n: number; r0: number; r1: number }
  | { t: 'ribs'; side: 1 | -1; from: number; to: number }

export type Region = 'skull' | 'spine' | 'thorax' | 'arm' | 'hand' | 'pelvis' | 'leg' | 'foot'
export const REGIONS: [Region, string][] = [
  ['skull', 'Skull'], ['spine', 'Spine'], ['thorax', 'Chest'], ['arm', 'Shoulder & arm'], ['hand', 'Hand'], ['pelvis', 'Pelvis'], ['leg', 'Leg'], ['foot', 'Foot'],
]
export type Kind = 'long' | 'short' | 'flat' | 'irregular' | 'sesamoid' | 'group'

export interface Bone { id: string; name: string; region: Region; kind: Kind; info: string; count: number; side: 'L' | 'R' | 'mid'; shapes: Shape[] }

/** Spine centreline (top of atlas → tip of coccyx). */
export const SPINE: P3[] = [[0, 15.35, -0.18], [0, 14.6, -0.22], [0, 13.8, -0.5], [0, 12.4, -0.72], [0, 11.1, -0.55], [0, 10.3, -0.5], [0, 9.75, -0.68], [0, 9.35, -0.6]]

type Def = [id: string, name: string, region: Region, kind: Kind, count: number, info: string, shapes: (s: 1 | -1) => Shape[]]

const MID: Def[] = [
  ['frontal', 'Frontal bone', 'skull', 'flat', 1, 'Forms the forehead and the roofs of the eye sockets; contains the frontal sinuses.', () => [{ t: 'ellip', c: [0, 16.55, 0.42], r: [0.64, 0.6, 0.5] }]],
  ['occipital', 'Occipital bone', 'skull', 'flat', 1, 'Back and base of the skull. The spinal cord passes through its large opening, the foramen magnum.', () => [{ t: 'ellip', c: [0, 16.15, -0.6], r: [0.55, 0.6, 0.32] }]],
  ['maxilla', 'Maxilla', 'skull', 'irregular', 2, 'Upper jaw (two fused halves): holds the upper teeth and forms part of the eye sockets, nose and palate.', () => [{ t: 'ellip', c: [0, 15.55, 0.62], r: [0.42, 0.25, 0.3] }]],
  ['mandible', 'Mandible', 'skull', 'irregular', 1, 'Lower jaw — the only skull bone that moves freely, hinging at the temporomandibular joints.', () => [{ t: 'tube', pts: [[-0.56, 15.75, -0.02], [-0.52, 15.2, 0.3], [0, 15.02, 0.86], [0.52, 15.2, 0.3], [0.56, 15.75, -0.02]], r: 0.08 }]],
  ['hyoid', 'Hyoid bone', 'skull', 'irregular', 1, 'U-shaped bone in the neck that anchors the tongue. Unusually, it does not touch any other bone.', () => [{ t: 'tube', pts: [[-0.22, 14.85, 0.28], [0, 14.8, 0.5], [0.22, 14.85, 0.28]], r: 0.035 }]],
  ['atlas', 'Atlas (C1)', 'spine', 'irregular', 1, 'First cervical vertebra: a ring with no body that cradles the skull — the "yes" nodding joint.', () => [{ t: 'vert', u0: 0, u1: 0, n: 1, r0: 0.2, r1: 0.2 }]],
  ['axis', 'Axis (C2)', 'spine', 'irregular', 1, 'Second cervical vertebra; its peg (dens) lets the atlas rotate — the "no" head-shaking joint.', () => [{ t: 'vert', u0: 0.03, u1: 0.03, n: 1, r0: 0.16, r1: 0.16 }]],
  ['cervical', 'Cervical vertebrae C3–C7', 'spine', 'group', 5, 'The rest of the neck vertebrae: small and mobile, with holes that carry the vertebral arteries.', () => [{ t: 'vert', u0: 0.06, u1: 0.17, n: 5, r0: 0.13, r1: 0.15 }]],
  ['thoracic', 'Thoracic vertebrae T1–T12', 'spine', 'group', 12, 'Chest vertebrae; each one joins a pair of ribs, which limits twisting and protects the heart and lungs.', () => [{ t: 'vert', u0: 0.2, u1: 0.58, n: 12, r0: 0.15, r1: 0.19 }]],
  ['lumbar', 'Lumbar vertebrae L1–L5', 'spine', 'group', 5, 'The largest vertebrae, carrying most of the upper-body weight; a common source of back pain.', () => [{ t: 'vert', u0: 0.61, u1: 0.78, n: 5, r0: 0.21, r1: 0.23 }]],
  ['sacrum', 'Sacrum', 'spine', 'irregular', 1, 'Five vertebrae fused into a triangular wedge that locks the spine into the pelvis.', () => [{ t: 'ellip', c: [0, 9.72, -0.66], r: [0.36, 0.42, 0.13], rot: [-0.35, 0, 0] }]],
  ['coccyx', 'Coccyx', 'spine', 'irregular', 1, 'Tailbone: 3–5 tiny fused vertebrae that anchor pelvic-floor muscles.', () => [{ t: 'cap', a: [0, 9.32, -0.6], b: [0, 9.12, -0.48], r: 0.06 }]],
  ['manubrium', 'Manubrium', 'thorax', 'flat', 1, 'Top part of the breastbone; the clavicles and first ribs attach here.', () => [{ t: 'box', c: [0, 13.85, 0.9], s: [0.38, 0.45, 0.1], rot: [-0.15, 0, 0] }]],
  ['sternum', 'Body of sternum', 'thorax', 'flat', 1, 'Long middle part of the breastbone where ribs 2–7 attach through costal cartilage.', () => [{ t: 'box', c: [0, 13.0, 0.98], s: [0.28, 1.2, 0.1], rot: [-0.1, 0, 0] }]],
  ['xiphoid', 'Xiphoid process', 'thorax', 'irregular', 1, 'Small pointed tip of the sternum; cartilage in youth, it usually ossifies by middle age.', () => [{ t: 'cap', a: [0, 12.36, 1.03], b: [0, 12.12, 0.98], r: 0.045 }]],
]

const PAIRED: Def[] = [
  ['parietal', 'Parietal bone', 'skull', 'flat', 1, 'Forms the top and sides of the cranium; the two meet along the sagittal suture.', (s) => [{ t: 'ellip', c: [s * 0.36, 16.75, -0.12], r: [0.42, 0.55, 0.7] }]],
  ['temporal', 'Temporal bone', 'skull', 'irregular', 1, 'Side of the skull at the ear; houses the tiny hearing bones and the balance organ.', (s) => [{ t: 'ellip', c: [s * 0.72, 16.05, -0.02], r: [0.14, 0.38, 0.45] }]],
  ['zygomatic', 'Zygomatic bone', 'skull', 'irregular', 1, 'Cheekbone: forms the prominence of the cheek and the outer rim of the eye socket.', (s) => [{ t: 'ellip', c: [s * 0.5, 15.85, 0.62], r: [0.2, 0.12, 0.18] }]],
  ['nasal', 'Nasal bone', 'skull', 'flat', 1, 'Two small bones forming the bridge of the nose; the rest of the nose is cartilage.', (s) => [{ t: 'cap', a: [s * 0.05, 16.05, 0.86], b: [s * 0.08, 15.82, 0.96], r: 0.04 }]],
  ['trueribs', 'True ribs 1–7', 'thorax', 'group', 7, 'Ribs joined directly to the sternum by their own costal cartilage.', (s) => [{ t: 'ribs', side: s, from: 0, to: 6 }]],
  ['falseribs', 'False ribs 8–10', 'thorax', 'group', 3, 'Ribs whose cartilage joins the cartilage above rather than the sternum itself.', (s) => [{ t: 'ribs', side: s, from: 7, to: 9 }]],
  ['floatribs', 'Floating ribs 11–12', 'thorax', 'group', 2, 'Short ribs with free front ends, attached only to the spine.', (s) => [{ t: 'ribs', side: s, from: 10, to: 11 }]],
  ['clavicle', 'Clavicle', 'arm', 'long', 1, 'Collarbone: an S-shaped strut holding the shoulder out from the chest.', (s) => [{ t: 'tube', pts: [[s * 0.22, 14.22, 0.72], [s * 0.8, 14.32, 0.6], [s * 1.4, 14.3, 0.3], [s * 1.88, 14.38, 0.02]], r: 0.075 }]],
  ['scapula', 'Scapula', 'arm', 'flat', 1, 'Shoulder blade: a triangular plate on the back of the ribs that anchors 17 muscles.', (s) => [{ t: 'ellip', c: [s * 1.2, 13.25, -0.78], r: [0.48, 0.78, 0.07], rot: [0, s * -0.4, s * 0.12] }, { t: 'cap', a: [s * 1.25, 14.0, -0.8], b: [s * 1.85, 14.3, -0.3], r: 0.06 }]],
  ['humerus', 'Humerus', 'arm', 'long', 1, 'Upper-arm bone from shoulder to elbow; the "funny bone" tingle is the ulnar nerve passing behind its lower end.', (s) => [{ t: 'ellip', c: [s * 1.97, 13.92, -0.05], r: [0.22, 0.22, 0.22] }, { t: 'cap', a: [s * 2.0, 13.85, 0], b: [s * 2.3, 11.25, 0], r: 0.13 }]],
  ['radius', 'Radius', 'arm', 'long', 1, 'Forearm bone on the thumb side; it rolls over the ulna to turn the palm down.', (s) => [{ t: 'cap', a: [s * 2.32, 11.08, 0.12], b: [s * 2.5, 8.75, 0.25], r: 0.08 }]],
  ['ulna', 'Ulna', 'arm', 'long', 1, 'Forearm bone on the little-finger side; its hook (olecranon) is the point of the elbow.', (s) => [{ t: 'cap', a: [s * 2.28, 11.2, -0.12], b: [s * 2.38, 8.75, -0.05], r: 0.075 }]],
  ['carpals', 'Carpals', 'hand', 'short', 8, 'Eight small wrist bones in two rows, including the scaphoid — the most often broken one.', (s) => [{ t: 'ellip', c: [s * 2.48, 8.55, 0.12], r: [0.13, 0.17, 0.24] }]],
  ['metacarpals', 'Metacarpals', 'hand', 'long', 5, 'Five palm bones; their heads form the knuckles of a fist.', (s) => [...[-0.06, 0.04, 0.14, 0.24].map((z): Shape => ({ t: 'cap', a: [s * 2.49, 8.38, z], b: [s * 2.52, 7.82, z + 0.02], r: 0.032 })), { t: 'cap', a: [s * 2.45, 8.42, 0.3], b: [s * 2.38, 8.06, 0.44], r: 0.036 }]],
  ['handphal', 'Phalanges of the hand', 'hand', 'long', 14, 'Finger bones: three in each finger and two in the thumb.', (s) => [...[-0.06, 0.04, 0.14, 0.24].map((z, j): Shape => ({ t: 'cap', a: [s * 2.52, 7.74, z + 0.02], b: [s * 2.53, 7.74 - [0.42, 0.52, 0.56, 0.5][j], z + 0.03], r: 0.026 })), { t: 'cap', a: [s * 2.37, 8.0, 0.46], b: [s * 2.33, 7.72, 0.56], r: 0.03 }]],
  ['ilium', 'Ilium', 'pelvis', 'flat', 1, 'The large wing of the hip bone — the bony crest you feel at your waist.', (s) => [{ t: 'ellip', c: [s * 0.82, 9.98, -0.1], r: [0.56, 0.5, 0.13], rot: [0, s * 0.7, 0] }]],
  ['ischium', 'Ischium', 'pelvis', 'irregular', 1, 'Lower back part of the hip bone; its tuberosities are the "sit bones" that take your weight on a chair.', (s) => [{ t: 'cap', a: [s * 0.58, 9.32, -0.18], b: [s * 0.45, 8.95, -0.08], r: 0.11 }]],
  ['pubis', 'Pubis', 'pelvis', 'irregular', 1, 'Front part of the hip bone; left and right meet at the cartilage joint called the pubic symphysis.', (s) => [{ t: 'cap', a: [s * 0.62, 9.35, 0.25], b: [s * 0.08, 9.22, 0.55], r: 0.09 }]],
  ['femur', 'Femur', 'leg', 'long', 1, 'Thigh bone: the longest and strongest bone, roughly a quarter of body height.', (s) => [{ t: 'ellip', c: [s * 0.72, 9.4, 0.05], r: [0.2, 0.2, 0.2] }, { t: 'cap', a: [s * 0.95, 9.2, 0], b: [s * 0.78, 5.1, 0.05], r: 0.15 }, { t: 'ellip', c: [s * 0.78, 5.05, 0.02], r: [0.27, 0.16, 0.22] }]],
  ['patella', 'Patella', 'leg', 'sesamoid', 1, 'Kneecap: a sesamoid bone that grows inside the quadriceps tendon and improves its leverage.', (s) => [{ t: 'ellip', c: [s * 0.78, 4.95, 0.32], r: [0.15, 0.19, 0.07] }]],
  ['tibia', 'Tibia', 'leg', 'long', 1, 'Shinbone: the main weight-bearing bone of the lower leg; its inner end forms the inner ankle bump.', (s) => [{ t: 'ellip', c: [s * 0.76, 4.75, 0.06], r: [0.25, 0.12, 0.2] }, { t: 'cap', a: [s * 0.76, 4.7, 0.08], b: [s * 0.72, 0.98, 0.05], r: 0.12 }]],
  ['fibula', 'Fibula', 'leg', 'long', 1, 'Thin outer lower-leg bone; carries little weight but steadies the ankle (the outer ankle bump).', (s) => [{ t: 'cap', a: [s * 1.0, 4.58, -0.08], b: [s * 0.95, 0.9, -0.08], r: 0.06 }]],
  ['talus', 'Talus', 'foot', 'short', 1, 'Ankle bone that transfers weight from the tibia to the foot; no muscles attach to it.', (s) => [{ t: 'ellip', c: [s * 0.78, 0.72, 0.02], r: [0.18, 0.12, 0.22] }]],
  ['calcaneus', 'Calcaneus', 'foot', 'short', 1, 'Heel bone, the largest bone of the foot; the Achilles tendon attaches to its back.', (s) => [{ t: 'ellip', c: [s * 0.78, 0.36, -0.3], r: [0.19, 0.22, 0.34] }]],
  ['tarsals', 'Navicular, cuboid & cuneiforms', 'foot', 'group', 5, 'The other five tarsal bones that build the arch of the midfoot.', (s) => [{ t: 'box', c: [s * 0.78, 0.42, 0.36], s: [0.46, 0.24, 0.34], rot: [0.15, 0, 0] }]],
  ['metatarsals', 'Metatarsals', 'foot', 'long', 5, 'Five long bones of the forefoot; the second is a common site of stress fractures in runners.', (s) => [0.58, 0.68, 0.78, 0.88, 0.98].map((x, j): Shape => ({ t: 'cap', a: [s * x, 0.32, 0.56], b: [s * (x + (j - 2) * 0.03), 0.16, 1.18 - j * 0.05], r: j === 0 ? 0.055 : 0.035 }))],
  ['footphal', 'Phalanges of the foot', 'foot', 'long', 14, 'Toe bones: two in the big toe and three in each of the others.', (s) => [0.58, 0.68, 0.78, 0.88, 0.98].map((x, j): Shape => ({ t: 'cap', a: [s * (x + (j - 2) * 0.03), 0.14, 1.26 - j * 0.05], b: [s * (x + (j - 2) * 0.035), 0.1, 1.55 - j * 0.09], r: j === 0 ? 0.05 : 0.03 }))],
]

export const BONES: Bone[] = [
  ...MID.map(([id, name, region, kind, count, info, f]): Bone => ({ id, name, region, kind, count, info, side: 'mid', shapes: f(1) })),
  ...PAIRED.flatMap(([id, name, region, kind, count, info, f]): Bone[] =>
    ([[1, 'L', 'left'], [-1, 'R', 'right']] as const).map(([s, side, word]) => ({ id: `${id}-${side.toLowerCase()}`, name: `${name} (${word})`, region, kind, count, info, side, shapes: f(s) })),
  ),
]

/** Total individual bones represented (an adult has about 206). */
export const BONE_TOTAL = BONES.reduce((a, b) => a + b.count, 0)

/** Rib centreline (index 0 = rib 1) for one side; front ends start near the sternum for true ribs. */
export function ribPoints(i: number, side: 1 | -1): P3[] {
  const y0 = 14 - i * 0.36
  const rx = 0.75 + 0.55 * Math.sin(Math.min(1, (i + 1) / 5) * (Math.PI / 2)) - (i > 8 ? (i - 8) * 0.1 : 0)
  const th0 = i < 7 ? 0.14 : 0.14 + (i - 6) * 0.3
  const pts: P3[] = []
  for (let k = 0; k <= 16; k++) {
    const th = th0 + ((Math.PI - 0.12 - th0) * k) / 16
    pts.push([side * rx * Math.sin(th), y0 - 0.6 * (1 - th / Math.PI), -0.05 + 0.88 * Math.cos(th)])
  }
  return pts
}

/** Normalises text for search (case, accents, punctuation). */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ')

export function searchBones(q: string, region: Region | 'all' = 'all'): Bone[] {
  const words = norm(q).split(/\s+/).filter(Boolean)
  return BONES.filter((b) => (region === 'all' || b.region === region) && words.every((w) => norm(`${b.name} ${b.info} ${b.kind} ${b.region}`).includes(w)))
}

/** Picks n distinct distractor names for a multiple-choice question, preferring the same region. */
export function choices(target: Bone, n: number, rnd: () => number = Math.random): Bone[] {
  const base = (b: Bone) => b.name.replace(/ \((left|right)\)$/, '')
  const pool = BONES.filter((b) => base(b) !== base(target))
  const same = pool.filter((b) => b.region === target.region)
  const pick: Bone[] = []
  const seen = new Set<string>([base(target)])
  for (const src of [same, pool]) {
    const arr = [...src].sort(() => rnd() - 0.5)
    for (const b of arr) {
      if (pick.length >= n) break
      if (!seen.has(base(b))) { seen.add(base(b)); pick.push(b) }
    }
  }
  const all = [...pick, target]
  return all.sort(() => rnd() - 0.5)
}
