// Schematic human anatomy built from primitives (decimetre units, y up, +z = front, +x = the subject's left).
// Positions and sizes are simplified for orientation and teaching; they are NOT medically accurate.

export type Layer = 'skin' | 'skeleton' | 'organs' | 'circulatory' | 'nervous'
export type P3 = [number, number, number]
export type Shape =
  | { t: 'ellip'; c: P3; r: P3; rot?: P3 }
  | { t: 'cap'; a: P3; b: P3; r: number }
  | { t: 'tube'; pts: P3[]; r: number }
  | { t: 'box'; c: P3; s: P3; rot?: P3 }
  | { t: 'ribs' }
  | { t: 'spine' }
  | { t: 'pelvis' }

export interface Part { id: string; name: string; layer: Layer; color: string; shapes: Shape[]; info: string; label?: P3 }

export const LAYERS: [Layer, string, string][] = [
  ['skin', 'Skin / outline', '#f1c7a8'],
  ['skeleton', 'Skeleton', '#e7e1cf'],
  ['organs', 'Organs', '#e11d48'],
  ['circulatory', 'Circulatory', '#dc2626'],
  ['nervous', 'Nervous', '#facc15'],
]

const both = (f: (s: number) => Shape[]) => [...f(1), ...f(-1)]
const BONE = '#e7e1cf'

export const SPINE: P3[] = [[0, 15.3, -0.15], [0, 14.4, -0.3], [0, 13.2, -0.65], [0, 12, -0.7], [0, 10.9, -0.5], [0, 10.1, -0.55], [0, 9.6, -0.75]]

export const PARTS: Part[] = [
  // ---------- skin (translucent outline) ----------
  {
    id: 'skin', name: 'Skin (body outline)', layer: 'skin', color: '#f1c7a8', info: 'The largest organ (~16 % of body weight): a waterproof, temperature-regulating barrier with touch, pain and heat receptors.',
    shapes: [
      { t: 'ellip', c: [0, 16.2, 0.05], r: [0.95, 1.15, 1.05] },
      { t: 'cap', a: [0, 15, -0.05], b: [0, 14.2, 0], r: 0.55 },
      { t: 'ellip', c: [0, 12.2, 0], r: [1.85, 2.4, 1.15] },
      { t: 'ellip', c: [0, 9.8, 0], r: [1.65, 1.35, 1.1] },
      ...both((s) => [{ t: 'cap', a: [s * 2, 14, 0], b: [s * 2.3, 11.2, 0], r: 0.45 }, { t: 'cap', a: [s * 2.3, 11.2, 0], b: [s * 2.45, 8.8, 0.1], r: 0.38 }, { t: 'ellip', c: [s * 2.48, 8.2, 0.1], r: [0.2, 0.55, 0.35] }] as Shape[]),
      ...both((s) => [{ t: 'cap', a: [s * 0.9, 9.4, 0], b: [s * 0.78, 5, 0.1], r: 0.72 }, { t: 'cap', a: [s * 0.78, 5, 0.1], b: [s * 0.74, 1, 0], r: 0.5 }, { t: 'box', c: [s * 0.76, 0.35, 0.55], s: [0.75, 0.6, 2.2] }] as Shape[]),
    ],
  },
  // ---------- skeleton ----------
  { id: 'skull', name: 'Skull (cranium)', layer: 'skeleton', color: BONE, label: [0.9, 17, 0], info: '22 bones; 8 cranial bones fuse to protect the brain, 14 facial bones shape the face.', shapes: [{ t: 'ellip', c: [0, 16.3, 0], r: [0.78, 0.92, 0.92] }, { t: 'ellip', c: [0, 15.75, 0.45], r: [0.55, 0.45, 0.45] }] },
  { id: 'mandible', name: 'Mandible (jaw)', layer: 'skeleton', color: BONE, info: 'The only movable skull bone and the strongest bone of the face; holds the lower teeth.', shapes: [{ t: 'box', c: [0, 15.25, 0.5], s: [0.85, 0.28, 0.55] }] },
  { id: 'spine', name: 'Vertebral column', layer: 'skeleton', color: BONE, label: [-0.9, 13.5, -0.8], info: '33 vertebrae: 7 cervical, 12 thoracic, 5 lumbar, 5 fused sacral and 4 coccygeal. Its S-curve absorbs shock.', shapes: [{ t: 'spine' }] },
  { id: 'ribs', name: 'Rib cage', layer: 'skeleton', color: BONE, label: [2.1, 12.4, 0.2], info: '12 pairs of ribs: 7 true ribs join the sternum directly, 3 false ribs join via cartilage, 2 floating ribs stay free at the front.', shapes: [{ t: 'ribs' }] },
  { id: 'sternum', name: 'Sternum', layer: 'skeleton', color: BONE, info: 'Flat breastbone (manubrium, body, xiphoid process) anchoring the ribs; a common site for bone-marrow samples.', shapes: [{ t: 'box', c: [0, 12.9, 0.95], s: [0.32, 1.7, 0.12], rot: [-0.12, 0, 0] }] },
  { id: 'clavicle', name: 'Clavicles', layer: 'skeleton', color: BONE, info: 'The collarbones brace the shoulders; the most commonly fractured bone in falls onto an outstretched hand.', shapes: both((s) => [{ t: 'cap', a: [s * 0.25, 14.25, 0.6], b: [s * 1.85, 14.35, 0.05], r: 0.09 }]) },
  { id: 'humerus', name: 'Humerus', layer: 'skeleton', color: BONE, label: [2.8, 12.6, 0], info: 'Upper-arm bone from shoulder to elbow; the radial nerve wraps around its shaft.', shapes: both((s) => [{ t: 'cap', a: [s * 2, 13.9, 0], b: [s * 2.3, 11.25, 0], r: 0.15 }]) },
  { id: 'forearm', name: 'Radius & ulna', layer: 'skeleton', color: BONE, info: 'Forearm bones: the radius (thumb side) rotates around the ulna to turn the palm up or down.', shapes: both((s) => [{ t: 'cap', a: [s * 2.3, 11.1, 0.12], b: [s * 2.5, 8.75, 0.25], r: 0.09 }, { t: 'cap', a: [s * 2.3, 11.15, -0.12], b: [s * 2.38, 8.75, -0.05], r: 0.08 }]) },
  { id: 'hand', name: 'Hand bones', layer: 'skeleton', color: BONE, info: '27 bones per hand: 8 carpals, 5 metacarpals and 14 phalanges.', shapes: both((s) => [{ t: 'box', c: [s * 2.48, 8.15, 0.1], s: [0.12, 0.9, 0.5] }]) },
  { id: 'pelvis', name: 'Pelvis', layer: 'skeleton', color: BONE, label: [1.9, 9.9, 0.4], info: 'Hip bones (ilium, ischium, pubis) plus sacrum and coccyx; transfers upper-body weight to the legs.', shapes: [{ t: 'pelvis' }] },
  { id: 'femur', name: 'Femur', layer: 'skeleton', color: BONE, label: [1.6, 7.2, 0], info: 'Thigh bone — the longest and strongest bone, about a quarter of body height.', shapes: both((s) => [{ t: 'ellip', c: [s * 0.78, 9.35, 0], r: [0.22, 0.22, 0.22] }, { t: 'cap', a: [s * 0.95, 9.2, 0], b: [s * 0.78, 5.05, 0.05], r: 0.17 }]) },
  { id: 'patella', name: 'Patella', layer: 'skeleton', color: BONE, info: 'Kneecap: a sesamoid bone inside the quadriceps tendon that increases its leverage.', shapes: both((s) => [{ t: 'ellip', c: [s * 0.78, 4.95, 0.32], r: [0.16, 0.2, 0.08] }]) },
  { id: 'leg', name: 'Tibia & fibula', layer: 'skeleton', color: BONE, label: [1.5, 2.8, 0], info: 'Shin bones: the tibia carries the weight, the thin fibula mainly anchors muscles and stabilises the ankle.', shapes: both((s) => [{ t: 'cap', a: [s * 0.76, 4.75, 0.08], b: [s * 0.72, 0.95, 0.05], r: 0.14 }, { t: 'cap', a: [s * 1, 4.6, -0.08], b: [s * 0.95, 1, -0.08], r: 0.07 }]) },
  { id: 'foot', name: 'Foot bones', layer: 'skeleton', color: BONE, info: '26 bones per foot (7 tarsals incl. the heel bone, 5 metatarsals, 14 phalanges) forming load-bearing arches.', shapes: both((s) => [{ t: 'box', c: [s * 0.76, 0.35, 0.5], s: [0.5, 0.32, 1.8] }]) },
  // ---------- organs ----------
  { id: 'brain', name: 'Brain', layer: 'organs', color: '#f9a8d4', label: [-1.1, 16.8, 0], info: '~1.4 kg, ~86 billion neurons; uses about 20 % of the body’s energy at rest.', shapes: [{ t: 'ellip', c: [0, 16.45, -0.05], r: [0.66, 0.58, 0.8] }] },
  { id: 'lungs', name: 'Lungs', layer: 'organs', color: '#fb7185', label: [-1.6, 13.4, 0.5], info: 'Right lung has 3 lobes, the left has 2 to make room for the heart; ~300 million alveoli exchange gas.', shapes: [{ t: 'ellip', c: [-0.78, 12.9, 0.1], r: [0.66, 1.3, 0.75] }, { t: 'ellip', c: [0.82, 12.85, 0.05], r: [0.58, 1.2, 0.72] }] },
  { id: 'heart', name: 'Heart', layer: 'organs', color: '#dc2626', label: [1.3, 12.3, 1], info: 'Four-chambered muscular pump, about fist-sized; beats ~100 000 times a day, tilted to the left of the midline.', shapes: [{ t: 'ellip', c: [0.25, 12.5, 0.45], r: [0.42, 0.52, 0.38], rot: [0, 0, 0.5] }] },
  { id: 'trachea', name: 'Trachea & oesophagus', layer: 'organs', color: '#fda4af', info: 'The windpipe (front, ringed with cartilage) carries air; the oesophagus behind it carries food to the stomach.', shapes: [{ t: 'tube', pts: [[0, 15.1, 0.3], [0, 14, 0.35], [0, 13.5, 0.3]], r: 0.11 }, { t: 'tube', pts: [[0, 15, 0.05], [0, 13.5, 0], [0.1, 12, -0.05], [0.45, 11.35, 0.3]], r: 0.08 }] },
  { id: 'liver', name: 'Liver', layer: 'organs', color: '#9f1239', label: [-1.9, 11.4, 0.6], info: 'Largest internal organ (~1.5 kg) on the right side; makes bile, stores glycogen and filters the blood. It can regrow.', shapes: [{ t: 'ellip', c: [-0.55, 11.2, 0.35], r: [1.0, 0.48, 0.7], rot: [0, 0, -0.15] }] },
  { id: 'stomach', name: 'Stomach', layer: 'organs', color: '#fdba74', label: [1.7, 11.0, 0.7], info: 'J-shaped muscular bag on the left; holds about 1–1.5 L and mixes food with acid (pH ~2).', shapes: [{ t: 'ellip', c: [0.6, 11.0, 0.45], r: [0.52, 0.38, 0.32], rot: [0, 0, 0.6] }] },
  { id: 'spleen', name: 'Spleen', layer: 'organs', color: '#7c3aed', info: 'Fist-sized organ behind the stomach that recycles old red blood cells and helps fight infection.', shapes: [{ t: 'ellip', c: [1.15, 11.3, -0.25], r: [0.22, 0.4, 0.2] }] },
  { id: 'pancreas', name: 'Pancreas', layer: 'organs', color: '#fde047', info: 'Makes digestive enzymes and the hormones insulin and glucagon that control blood sugar.', shapes: [{ t: 'cap', a: [-0.25, 10.65, 0.15], b: [0.95, 10.85, 0.05], r: 0.12 }] },
  { id: 'kidneys', name: 'Kidneys', layer: 'organs', color: '#92400e', label: [-1.6, 10.5, -0.6], info: 'Bean-shaped filters at the back of the abdomen; together they filter ~180 L of blood plasma a day into ~1.5 L of urine.', shapes: both((s) => [{ t: 'ellip', c: [s * 0.62, 10.65 + (s < 0 ? -0.1 : 0), -0.45], r: [0.24, 0.42, 0.2] }]) },
  { id: 'intestine', name: 'Small intestine', layer: 'organs', color: '#fca5a5', label: [-1.5, 9.8, 1.1], info: 'About 6 m long (duodenum, jejunum, ileum); villi give it a surface area of ~30 m² for absorbing nutrients.', shapes: [{ t: 'tube', pts: Array.from({ length: 40 }, (_, i): P3 => [0.75 * Math.sin(i * 1.3) * (0.6 + 0.4 * Math.cos(i * 0.37)), 10.3 - i * 0.022 + 0.18 * Math.cos(i * 1.3), 0.55 + 0.18 * Math.sin(i * 0.8)]), r: 0.12 }] },
  { id: 'colon', name: 'Large intestine', layer: 'organs', color: '#d97706', info: 'About 1.5 m framing the small intestine (ascending, transverse, descending, sigmoid colon); absorbs water and salts.', shapes: [{ t: 'tube', pts: [[-1.05, 9.3, 0.4], [-1.15, 10.2, 0.45], [-1.0, 10.6, 0.55], [0, 10.55, 0.75], [1.0, 10.6, 0.55], [1.15, 10.0, 0.45], [1.0, 9.35, 0.4], [0.4, 9.15, 0.3], [0.05, 9.0, 0.0]], r: 0.2 }] },
  { id: 'bladder', name: 'Urinary bladder', layer: 'organs', color: '#fcd34d', info: 'Stretchy muscular sac in the pelvis; the urge to urinate usually starts at ~200–300 mL.', shapes: [{ t: 'ellip', c: [0, 9.05, 0.5], r: [0.3, 0.26, 0.26] }] },
  // ---------- circulatory ----------
  {
    id: 'arteries', name: 'Aorta & major arteries', layer: 'circulatory', color: '#ef4444', label: [0.9, 14.6, 0.4], info: 'The aorta leaves the left ventricle, arches over the heart and runs down the spine, branching to the head, arms, organs and legs.',
    shapes: [
      { t: 'tube', pts: [[0.2, 12.7, 0.45], [0.1, 13.35, 0.35], [0.15, 13.55, 0], [0.2, 13.1, -0.35], [0.12, 11.8, -0.4], [0.1, 10.3, -0.3], [0, 9.9, -0.2]], r: 0.11 },
      ...both((s) => [
        { t: 'tube', pts: [[s * 0.1, 13.5, 0.15], [s * 0.3, 14.6, 0.2], [s * 0.35, 15.6, 0.3]], r: 0.05 },
        { t: 'tube', pts: [[s * 0.15, 13.5, 0.05], [s * 1.2, 13.9, 0.05], [s * 2.05, 13.4, 0.1], [s * 2.3, 11.2, 0.2], [s * 2.45, 8.9, 0.3]], r: 0.05 },
        { t: 'tube', pts: [[0, 9.9, -0.2], [s * 0.6, 9.4, 0.2], [s * 0.85, 8.6, 0.35], [s * 0.82, 5.2, -0.2], [s * 0.78, 1.0, 0.1]], r: 0.06 },
      ] as Shape[]),
    ],
  },
  {
    id: 'veins', name: 'Venae cavae & major veins', layer: 'circulatory', color: '#2563eb', info: 'The superior and inferior venae cavae return oxygen-poor blood to the right atrium; veins hold ~65 % of the blood volume.',
    shapes: [
      { t: 'tube', pts: [[-0.2, 12.6, 0.3], [-0.3, 13.5, 0.15], [-0.35, 14.2, 0.1]], r: 0.09 },
      { t: 'tube', pts: [[-0.2, 12.3, 0.3], [-0.25, 11.5, -0.1], [-0.2, 10.3, -0.25], [-0.1, 9.85, -0.2]], r: 0.1 },
      ...both((s) => [
        { t: 'tube', pts: [[s * -0.35, 14.2, 0.1], [s * -0.5, 15.5, 0.35]], r: 0.05 },
        { t: 'tube', pts: [[-0.1, 9.85, -0.2], [s * 0.5, 9.3, 0.1], [s * 0.7, 8.6, 0.3], [s * 0.7, 5.2, -0.3], [s * 0.66, 1.0, -0.05]], r: 0.06 },
      ] as Shape[]),
    ],
  },
  // ---------- nervous ----------
  { id: 'cord', name: 'Spinal cord', layer: 'nervous', color: '#facc15', label: [-1, 11.5, -1], info: '~45 cm long, ending around the first lumbar vertebra; below it the nerve roots continue as the cauda equina.', shapes: [{ t: 'tube', pts: [[0, 15.8, -0.1], ...SPINE.slice(0, 5).map((p): P3 => [p[0], p[1], p[2] - 0.12])], r: 0.07 }] },
  {
    id: 'nerves', name: 'Peripheral nerves', layer: 'nervous', color: '#fde047', info: 'Including the brachial plexus to the arms and the sciatic nerve — the thickest nerve, about finger-width — down each leg.',
    shapes: both((s) => [
      { t: 'tube', pts: [[0, 14.5, -0.35], [s * 1.1, 14.1, -0.1], [s * 2.0, 13.6, -0.05], [s * 2.3, 11.2, -0.05], [s * 2.45, 8.6, 0.05]], r: 0.035 },
      { t: 'tube', pts: [[0, 10.1, -0.6], [s * 0.6, 9.2, -0.5], [s * 0.85, 8.5, -0.3], [s * 0.82, 5.2, -0.15], [s * 0.85, 1.0, -0.1]], r: 0.05 },
    ] as Shape[]),
  },
]

/** Case-insensitive search over names and descriptions. */
export function searchParts(q: string): Part[] {
  const s = q.trim().toLowerCase()
  if (!s) return PARTS
  return PARTS.filter((p) => p.name.toLowerCase().includes(s) || p.info.toLowerCase().includes(s) || p.layer.includes(s))
}

/** Plane constant for a cut at fraction t (−1…1) across [lo, hi]. */
export const cutAt = (t: number, lo: number, hi: number) => lo + ((t + 1) / 2) * (hi - lo)
