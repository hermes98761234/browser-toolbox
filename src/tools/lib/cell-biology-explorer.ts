// Cell biology explorer content: organelles of typical (schematic) animal and plant cells, with
// descriptions, plus quiz question generation.

export type CellType = 'animal' | 'plant'
export interface Organelle { id: string; name: string; cells: CellType[]; color: string; what: string; job: string; fact: string; hint: string }

export const ORGANELLES: Organelle[] = [
  { id: 'membrane', name: 'Plasma membrane', cells: ['animal', 'plant'], color: '#93c5fd', what: 'A phospholipid bilayer with embedded proteins that encloses the cell.', job: 'Controls what enters and leaves the cell; carries receptors for signals.', fact: 'It is only about 7–10 nm thick.', hint: 'controls what enters and leaves the cell' },
  { id: 'wall', name: 'Cell wall', cells: ['plant'], color: '#65a30d', what: 'A rigid layer of cellulose fibres outside the plasma membrane.', job: 'Gives shape and support, and stops the cell bursting when it takes in water.', fact: 'Cellulose is the most abundant organic polymer on Earth.', hint: 'a rigid cellulose layer that supports plant cells' },
  { id: 'cytoplasm', name: 'Cytoplasm', cells: ['animal', 'plant'], color: '#bae6fd', what: 'The gel-like cytosol plus everything suspended in it, inside the membrane.', job: 'Site of many metabolic reactions such as glycolysis.', fact: 'Cytosol is roughly 70–80% water.', hint: 'the gel where glycolysis happens' },
  { id: 'nucleus', name: 'Nucleus', cells: ['animal', 'plant'], color: '#8b5cf6', what: 'A double-membrane compartment that holds the chromosomes (DNA).', job: 'Stores genetic information and controls gene expression.', fact: 'Unfolded, the DNA of one human cell would be about 2 m long.', hint: 'stores the DNA and controls the cell' },
  { id: 'nucleolus', name: 'Nucleolus', cells: ['animal', 'plant'], color: '#4c1d95', what: 'A dense region inside the nucleus, not bound by a membrane.', job: 'Makes ribosomal RNA and assembles ribosome subunits.', fact: 'Busy cells can have several nucleoli.', hint: 'makes ribosome subunits inside the nucleus' },
  { id: 'envelope', name: 'Nuclear envelope & pores', cells: ['animal', 'plant'], color: '#c4b5fd', what: 'Two membranes around the nucleus, perforated by nuclear pore complexes.', job: 'Separates DNA from the cytoplasm; pores let mRNA out and proteins in.', fact: 'A typical nucleus has a few thousand pores.', hint: 'double membrane with pores around the DNA' },
  { id: 'rer', name: 'Rough endoplasmic reticulum', cells: ['animal', 'plant'], color: '#f472b6', what: 'Flattened membrane sacs studded with ribosomes, continuous with the nuclear envelope.', job: 'Makes and folds proteins for membranes and secretion.', fact: 'Antibody-secreting plasma cells are packed with rough ER.', hint: 'ribosome-studded sacs that make proteins for export' },
  { id: 'ser', name: 'Smooth endoplasmic reticulum', cells: ['animal', 'plant'], color: '#fb923c', what: 'A network of membrane tubes without ribosomes.', job: 'Makes lipids and steroids, detoxifies drugs and stores calcium.', fact: 'Liver cells expand their smooth ER when exposed to some drugs.', hint: 'makes lipids and detoxifies drugs' },
  { id: 'golgi', name: 'Golgi apparatus', cells: ['animal', 'plant'], color: '#facc15', what: 'A stack of flattened membrane discs (cisternae) with vesicles around it.', job: 'Modifies, sorts and packages proteins and lipids for delivery.', fact: 'Named after Camillo Golgi, who described it in 1898.', hint: 'the cell’s post office: sorts and packages proteins' },
  { id: 'mito', name: 'Mitochondrion', cells: ['animal', 'plant'], color: '#f97316', what: 'A double-membrane organelle with a folded inner membrane (cristae) and its own DNA.', job: 'Aerobic respiration: makes most of the cell’s ATP.', fact: 'Mitochondria are inherited from the mother in humans.', hint: 'makes ATP by aerobic respiration' },
  { id: 'ribosome', name: 'Ribosomes', cells: ['animal', 'plant'], color: '#1e293b', what: 'Tiny RNA–protein machines, free in the cytosol or on the rough ER.', job: 'Translate mRNA into proteins.', fact: 'Eukaryotic ribosomes are 80S; those inside mitochondria are smaller (70S-like).', hint: 'translate mRNA into protein' },
  { id: 'lysosome', name: 'Lysosome', cells: ['animal'], color: '#a855f7', what: 'A small vesicle full of digestive enzymes at acidic pH (~4.5–5).', job: 'Breaks down worn-out organelles, food particles and microbes.', fact: 'Plant cells do this job mostly in the vacuole.', hint: 'digests waste with acidic enzymes' },
  { id: 'peroxisome', name: 'Peroxisome', cells: ['animal', 'plant'], color: '#22c55e', what: 'A single-membrane vesicle with oxidative enzymes such as catalase.', job: 'Breaks down fatty acids and turns hydrogen peroxide into water and oxygen.', fact: 'In leaves, peroxisomes take part in photorespiration.', hint: 'breaks down hydrogen peroxide' },
  { id: 'centrosome', name: 'Centrosome (centrioles)', cells: ['animal'], color: '#0ea5e9', what: 'A pair of barrel-shaped centrioles at right angles, near the nucleus.', job: 'Organises microtubules and the spindle during cell division.', fact: 'Most flowering-plant cells divide without centrioles.', hint: 'organises the spindle for cell division' },
  { id: 'vesicle', name: 'Vesicles', cells: ['animal', 'plant'], color: '#fde68a', what: 'Small membrane bubbles budding from the ER and Golgi.', job: 'Carry cargo between organelles and to the membrane (exocytosis).', fact: 'Neurotransmitters are released from vesicles.', hint: 'small bubbles that carry cargo' },
  { id: 'vacuole', name: 'Central vacuole', cells: ['plant'], color: '#38bdf8', what: 'A large sac of cell sap bounded by the tonoplast membrane.', job: 'Stores water, ions and pigments; its pressure (turgor) keeps the plant rigid.', fact: 'It can fill up to 90% of a mature plant cell.', hint: 'large sap-filled sac that keeps the cell turgid' },
  { id: 'chloroplast', name: 'Chloroplast', cells: ['plant'], color: '#16a34a', what: 'A double-membrane plastid with stacks of thylakoids (grana) holding chlorophyll.', job: 'Photosynthesis: turns light, CO₂ and water into sugar and oxygen.', fact: 'Like mitochondria, chloroplasts have their own DNA.', hint: 'captures light energy for photosynthesis' },
  { id: 'plasmodesmata', name: 'Plasmodesmata', cells: ['plant'], color: '#a3e635', what: 'Narrow channels through the cell wall that link neighbouring cells.', job: 'Let water, small molecules and signals pass between plant cells.', fact: 'A single cell can have thousands of them.', hint: 'channels through the wall that join neighbouring cells' },
]

export const byId = (id: string) => ORGANELLES.find((o) => o.id === id)
export const forCell = (c: CellType) => ORGANELLES.filter((o) => o.cells.includes(c))

export interface Question { kind: 'find' | 'choice'; answer: string; prompt: string; options: string[] }

/** Deterministic PRNG (mulberry32) so a quiz can be replayed from its seed. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One question: either "click the X in 3D" or "which organelle …?" with 4 options. */
export function makeQuestion(cell: CellType, r: () => number, kind?: 'find' | 'choice'): Question {
  const pool = forCell(cell).filter((o) => o.id !== 'cytoplasm')
  const ans = pool[Math.floor(r() * pool.length)]
  const k = kind ?? (r() < 0.5 ? 'find' : 'choice')
  if (k === 'find') return { kind: 'find', answer: ans.id, prompt: `Click the ${ans.name.toLowerCase()} in the 3D cell.`, options: [] }
  const others = pool.filter((o) => o.id !== ans.id)
  const opts = [ans.id]
  while (opts.length < 4 && others.length) opts.push(others.splice(Math.floor(r() * others.length), 1)[0].id)
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[opts[i], opts[j]] = [opts[j], opts[i]]
  }
  return { kind: 'choice', answer: ans.id, prompt: `Which structure ${ans.hint}?`, options: opts }
}

/** Animal vs plant comparison rows: [structure, animal, plant]. */
export const COMPARE: [string, string, string][] = [
  ['Cell wall', 'No', 'Yes (cellulose)'],
  ['Chloroplasts', 'No', 'Yes, in green tissue'],
  ['Vacuole', 'Small, temporary', 'Large central vacuole'],
  ['Centrioles', 'Yes', 'Usually absent'],
  ['Lysosomes', 'Yes', 'Rare (vacuole does it)'],
  ['Shape', 'Rounded, flexible', 'Boxy, fixed by the wall'],
  ['Energy storage', 'Glycogen', 'Starch'],
]
