// A simplified dichotomous key (written for this tool) for ~30 common house and garden plants.
// Every question has exactly two options; `to` is either another node id or `p:<plant id>`.

export interface Opt { t: string; icon: string; to: string }
export interface KeyNode { q: string; hint?: string; opts: [Opt, Opt] }
export interface Plant {
  name: string
  latin: string
  where: 'Indoor' | 'Garden' | 'Indoor & garden'
  icon: string
  features: string
  care: string
  pets: 'toxic' | 'mild' | 'safe'
  look?: string
}

export const ROOT = 'start'

export const NODES: Record<string, KeyNode> = {
  start: { q: 'Is the plant succulent — thick, fleshy, water-storing leaves or stems, or spines?', hint: 'Squeeze a leaf gently: succulents feel firm and juicy, not papery.', opts: [
    { t: 'Yes, fleshy or spiny', icon: 'succulent', to: 'succ' }, { t: 'No, ordinary leaves', icon: 'broad', to: 'shape' }] },
  succ: { q: 'Is it built from flat, jointed segments (pads) stacked on each other?', opts: [
    { t: 'Yes, flat jointed pads', icon: 'pads', to: 'pads' }, { t: 'No, distinct leaves', icon: 'succulent', to: 'rosette' }] },
  pads: { q: 'Do the pads carry dots of tiny spines and stand upright?', opts: [
    { t: 'Yes, spine dots (glochids), upright oval pads', icon: 'opuntia', to: 'p:opuntia' }, { t: 'No spines; scalloped segments that droop, flowers at the tips', icon: 'pads', to: 'p:schlumbergera' }] },
  rosette: { q: 'Do the leaves form a rosette from a single base?', opts: [
    { t: 'Yes, a rosette', icon: 'aloe', to: 'ros2' }, { t: 'No, oval leaves along woody branches like a mini tree', icon: 'jade', to: 'p:jade' }] },
  ros2: { q: 'What are the leaves like?', opts: [
    { t: 'Long, tapering, with soft teeth on the edges and clear gel inside', icon: 'aloe', to: 'p:aloe' }, { t: 'Short, plump, spoon-shaped, packed like a flower', icon: 'succulent', to: 'p:echeveria' }] },
  shape: { q: 'Are the leaves needle-like, or finely divided like a fern or palm frond?', opts: [
    { t: 'Needles or fronds', icon: 'frond', to: 'fine' }, { t: 'No — broad, strap-like or normal leaves', icon: 'broad', to: 'strap' }] },
  fine: { q: 'Is it a small woody shrub with narrow, strongly aromatic leaves?', hint: 'Rub a leaf and smell your fingers.', opts: [
    { t: 'Yes, woody and aromatic', icon: 'needle', to: 'herb' }, { t: 'No, large divided fronds', icon: 'frond', to: 'frond' }] },
  herb: { q: 'Which describes the leaves and flowers?', opts: [
    { t: 'Dark green needles, white underneath, pine scent, small blue flowers', icon: 'needle', to: 'p:rosemary' }, { t: 'Soft grey-green narrow leaves, purple flower spikes on long stalks', icon: 'lavender', to: 'p:lavender' }] },
  frond: { q: 'How do the fronds grow?', opts: [
    { t: 'Arching straight from the soil, many small leaflets, no flowers', icon: 'frond', to: 'p:fern' }, { t: 'Feather-shaped fronds on yellowish cane-like stems', icon: 'palm', to: 'p:areca' }] },
  strap: { q: 'Are the leaves long and narrow (strap- or grass-like), all rising from the base?', opts: [
    { t: 'Yes, strap-like from the base', icon: 'strap', to: 'strap2' }, { t: 'No, leaves on stems or stalks', icon: 'broad', to: 'vine' }] },
  strap2: { q: 'Are the leaves stiff and upright like swords?', opts: [
    { t: 'Yes, stiff and sword-like, often banded', icon: 'strap', to: 'p:snake' }, { t: 'No, flexible or arching', icon: 'arching', to: 'strap3' }] },
  strap3: { q: 'Are the leaves thin and grass-like?', opts: [
    { t: 'Yes, striped and arching, baby plants dangle on runners', icon: 'arching', to: 'p:spider' }, { t: 'No, broad and thick', icon: 'orchid', to: 'strap4' }] },
  strap4: { q: 'Where and how does it flower?', opts: [
    { t: 'Indoors; a few thick glossy leaves, flowers on an arching spike, silvery aerial roots', icon: 'orchid', to: 'p:orchid' }, { t: 'Outdoors from a bulb; one cup-shaped flower per stem in spring', icon: 'tulip', to: 'p:tulip' }] },
  vine: { q: 'Is it a climbing or trailing vine?', opts: [
    { t: 'Yes, long trailing or climbing stems', icon: 'vine', to: 'vine2' }, { t: 'No, upright or bushy', icon: 'broad', to: 'compound' }] },
  vine2: { q: 'What shape are the leaves?', opts: [
    { t: 'Lobed with 3–5 points, stems cling with tiny rootlets', icon: 'ivy', to: 'p:ivy' }, { t: 'Heart-shaped, or with holes and splits', icon: 'heart', to: 'vine3' }] },
  vine3: { q: 'Do mature leaves have holes or deep splits?', opts: [
    { t: 'Yes, large leaves with splits and holes', icon: 'monstera', to: 'p:monstera' }, { t: 'No, plain heart-shaped leaves', icon: 'heart', to: 'vine4' }] },
  vine4: { q: 'Look at the leaves closely:', opts: [
    { t: 'Thick, waxy, often marbled yellow or white', icon: 'pothos', to: 'p:pothos' }, { t: 'Thin, soft, plain green; new leaves unfurl from a sheath', icon: 'heart', to: 'p:philodendron' }] },
  compound: { q: 'Is each leaf divided into separate leaflets (compound)?', hint: 'A true leaf has a bud where its stalk meets the stem; leaflets do not.', opts: [
    { t: 'Yes, leaflets', icon: 'compound', to: 'comp2' }, { t: 'No, single undivided blades', icon: 'broad', to: 'square' }] },
  comp2: { q: 'How many leaflets per leaf?', opts: [
    { t: 'Exactly three, toothed; plant sends out runners', icon: 'trio', to: 'p:strawberry' }, { t: 'Five or more', icon: 'compound', to: 'comp3' }] },
  comp3: { q: 'Does the stem have thorns or prickles?', opts: [
    { t: 'Yes, prickly woody canes', icon: 'thorn', to: 'p:rose' }, { t: 'No thorns', icon: 'compound', to: 'comp4' }] },
  comp4: { q: 'What is the texture of the leaflets?', opts: [
    { t: 'Very glossy and waxy, on thick upright stalks from the soil', icon: 'zz', to: 'p:zz' }, { t: 'Soft and scented when touched', icon: 'cutleaf', to: 'comp5' }] },
  comp5: { q: 'Which matches?', opts: [
    { t: 'Large irregular hairy leaflets, "tomato" smell, yellow star flowers then fruit', icon: 'tomato', to: 'p:tomato' }, { t: 'Finely cut feathery leaves, pungent, orange or yellow pom-pom flowers', icon: 'cutleaf', to: 'p:marigold' }] },
  square: { q: 'Roll the stem between your fingers: is it square, with leaves in opposite pairs?', opts: [
    { t: 'Yes, square stem, opposite leaves', icon: 'square', to: 'mint' }, { t: 'No, round stem', icon: 'broad', to: 'fuzzy' }] },
  mint: { q: 'How does a crushed leaf smell and look?', opts: [
    { t: 'Cool minty; wrinkled toothed leaves; spreads aggressively', icon: 'square', to: 'p:mint' }, { t: 'Sweet, clove-like; smooth glossy cupped leaves', icon: 'basil', to: 'p:basil' }] },
  fuzzy: { q: 'Are the leaves hairy, fuzzy or rough to the touch?', opts: [
    { t: 'Yes, fuzzy or rough', icon: 'fuzzy', to: 'fuzzy2' }, { t: 'No, smooth', icon: 'broad', to: 'coin' }] },
  fuzzy2: { q: 'How big is the plant?', opts: [
    { t: 'Small rosette of velvety leaves with violet, pink or white flowers', icon: 'fuzzy', to: 'p:violet' }, { t: 'Tall stem with coarse leaves and a huge yellow flower head', icon: 'sunflower', to: 'p:sunflower' }] },
  coin: { q: 'Are the leaves round like coins, with the stalk attached under the middle?', opts: [
    { t: 'Yes, round "pancake" leaves', icon: 'coin', to: 'p:pilea' }, { t: 'No', icon: 'broad', to: 'tree' }] },
  tree: { q: 'Do the leaves grow along a single woody trunk, like a small tree?', opts: [
    { t: 'Yes, tree-like', icon: 'tree', to: 'tree2' }, { t: 'No, leaves rise from the base or a shrub', icon: 'hosta', to: 'pattern' }] },
  tree2: { q: 'Leaf shape?', opts: [
    { t: 'Oval, thick and very glossy; new leaves in a red sheath', icon: 'tree', to: 'p:rubber' }, { t: 'Large and violin-shaped with wavy edges and bold veins', icon: 'fiddle', to: 'p:fiddle' }] },
  pattern: { q: 'Are the leaves boldly painted (stripes, blotches, red veins) and do they fold up at night?', opts: [
    { t: 'Yes, patterned and moving', icon: 'pattern', to: 'p:prayer' }, { t: 'No', icon: 'broad', to: 'shrub' }] },
  shrub: { q: 'Is it a woody outdoor shrub with toothed opposite leaves and large flower balls?', opts: [
    { t: 'Yes', icon: 'shrub', to: 'p:hydrangea' }, { t: 'No, a soft clump of leaves from the ground', icon: 'hosta', to: 'clump' }] },
  clump: { q: 'Where does it grow and flower?', opts: [
    { t: 'Indoors; glossy dark leaves, white hood-like flowers', icon: 'spathe', to: 'p:peace' }, { t: 'Shady garden; ribbed, often variegated leaves; dies back in winter; lilac flower spikes', icon: 'hosta', to: 'p:hosta' }] },
}

export const PLANTS: Record<string, Plant> = {
  opuntia: { name: 'Bunny-ear / prickly pear cactus', latin: 'Opuntia spp.', where: 'Indoor & garden', icon: 'opuntia', features: 'Flat oval pads covered in dots of hair-fine barbed spines (glochids).', care: 'Full sun, gritty soil, water only when bone dry.', pets: 'mild', look: 'Christmas cactus (no spines).' },
  schlumbergera: { name: 'Christmas cactus', latin: 'Schlumbergera spp.', where: 'Indoor', icon: 'pads', features: 'Drooping chains of flat scalloped segments; flowers at the tips in winter.', care: 'Bright indirect light; keep slightly moist; cool nights trigger blooming.', pets: 'safe', look: 'Thanksgiving cactus (pointed teeth on segments).' },
  jade: { name: 'Jade plant', latin: 'Crassula ovata', where: 'Indoor', icon: 'jade', features: 'Thick oval glossy leaves on stout branching stems; looks like a bonsai tree.', care: 'Bright light, let soil dry fully between waterings.', pets: 'toxic' },
  aloe: { name: 'Aloe vera', latin: 'Aloe vera', where: 'Indoor & garden', icon: 'aloe', features: 'Rosette of long, tapering, toothed leaves filled with clear gel.', care: 'Bright light, sandy soil, water deeply but rarely.', pets: 'toxic', look: 'Haworthia (smaller, white bands).' },
  echeveria: { name: 'Echeveria', latin: 'Echeveria spp.', where: 'Indoor & garden', icon: 'succulent', features: 'Tight, flower-like rosette of plump, often powdery blue-grey leaves.', care: 'Full sun, very well-drained soil, avoid water in the rosette.', pets: 'safe', look: 'Hens-and-chicks (Sempervivum, frost-hardy).' },
  rosemary: { name: 'Rosemary', latin: 'Salvia rosmarinus', where: 'Garden', icon: 'needle', features: 'Woody shrub with dark green needle-like leaves, white beneath; piney scent.', care: 'Full sun, lean well-drained soil; dislikes wet roots.', pets: 'safe' },
  lavender: { name: 'Lavender', latin: 'Lavandula spp.', where: 'Garden', icon: 'lavender', features: 'Grey-green narrow leaves; purple flower spikes on long bare stalks.', care: 'Full sun, poor gritty soil; prune after flowering.', pets: 'mild' },
  fern: { name: 'Boston fern', latin: 'Nephrolepis exaltata', where: 'Indoor', icon: 'frond', features: 'Arching fronds with many small leaflets, no flowers; spores under the leaflets.', care: 'Bright indirect light, constant moisture and humidity.', pets: 'safe' },
  areca: { name: 'Areca palm', latin: 'Dypsis lutescens', where: 'Indoor', icon: 'palm', features: 'Clumps of yellowish canes with arching feather-shaped fronds.', care: 'Bright indirect light; keep lightly moist; brown tips mean dry air or salts.', pets: 'safe', look: 'Parlor palm (smaller, darker green).' },
  snake: { name: 'Snake plant', latin: 'Dracaena trifasciata', where: 'Indoor', icon: 'strap', features: 'Stiff upright sword leaves, often banded grey-green with yellow edges.', care: 'Any light; water every 2–6 weeks. Nearly indestructible.', pets: 'toxic' },
  spider: { name: 'Spider plant', latin: 'Chlorophytum comosum', where: 'Indoor', icon: 'arching', features: 'Arching grass-like leaves, often striped; plantlets on long runners.', care: 'Bright indirect light; keep evenly moist.', pets: 'safe' },
  orchid: { name: 'Moth orchid', latin: 'Phalaenopsis spp.', where: 'Indoor', icon: 'orchid', features: 'A few thick broad leaves, silvery aerial roots, flat flowers on an arching spike.', care: 'Bright indirect light; bark mix; soak then drain weekly.', pets: 'safe' },
  tulip: { name: 'Tulip', latin: 'Tulipa spp.', where: 'Garden', icon: 'tulip', features: 'Broad grey-green leaves from a bulb; one cup-shaped flower per stem in spring.', care: 'Plant bulbs in autumn, full sun, well-drained soil.', pets: 'toxic' },
  ivy: { name: 'English ivy', latin: 'Hedera helix', where: 'Indoor & garden', icon: 'ivy', features: 'Lobed leaves with 3–5 points; climbs with small aerial rootlets.', care: 'Shade to bright light; keep lightly moist. Can be invasive outdoors.', pets: 'toxic' },
  monstera: { name: 'Monstera (Swiss cheese plant)', latin: 'Monstera deliciosa', where: 'Indoor', icon: 'monstera', features: 'Huge glossy leaves with splits and holes; thick aerial roots.', care: 'Bright indirect light; water when the top third is dry; give a pole.', pets: 'toxic', look: 'Split-leaf philodendron, Rhaphidophora (mini monstera).' },
  pothos: { name: 'Golden pothos', latin: 'Epipremnum aureum', where: 'Indoor', icon: 'pothos', features: 'Waxy heart-shaped leaves marbled with yellow; trailing stems.', care: 'Low to bright indirect light; water when the top inch is dry.', pets: 'toxic', look: 'Heartleaf philodendron (thinner leaves).' },
  philodendron: { name: 'Heartleaf philodendron', latin: 'Philodendron hederaceum', where: 'Indoor', icon: 'heart', features: 'Thin, soft, glossy heart leaves; new leaves emerge from a papery sheath.', care: 'Medium indirect light; keep lightly moist.', pets: 'toxic', look: 'Pothos (thicker, ridged leaves).' },
  strawberry: { name: 'Strawberry', latin: 'Fragaria × ananassa', where: 'Garden', icon: 'trio', features: 'Toothed leaves in threes, runners with baby plants, white flowers then red fruit.', care: 'Full sun, rich soil, mulch; renew plants every 3 years.', pets: 'safe' },
  rose: { name: 'Rose', latin: 'Rosa spp.', where: 'Garden', icon: 'thorn', features: 'Prickly woody canes; 5–7 toothed leaflets per leaf; fragrant flowers.', care: 'Full sun, rich soil, water at the base; prune in late winter.', pets: 'safe' },
  zz: { name: 'ZZ plant', latin: 'Zamioculcas zamiifolia', where: 'Indoor', icon: 'zz', features: 'Upright stalks lined with very glossy oval leaflets; potato-like rhizomes below.', care: 'Low to bright light; water only when completely dry.', pets: 'toxic' },
  tomato: { name: 'Tomato', latin: 'Solanum lycopersicum', where: 'Garden', icon: 'tomato', features: 'Hairy sticky stems, irregular leaflets with a strong smell, yellow star flowers.', care: 'Full sun, deep regular watering, support with a cage or stake.', pets: 'toxic' },
  marigold: { name: 'French marigold', latin: 'Tagetes patula', where: 'Garden', icon: 'cutleaf', features: 'Finely cut pungent leaves; orange, yellow or red pom-pom flowers.', care: 'Full sun, any soil; deadhead to keep it flowering.', pets: 'mild' },
  mint: { name: 'Mint', latin: 'Mentha spp.', where: 'Garden', icon: 'square', features: 'Square stems, opposite wrinkled toothed leaves, cool minty smell; spreads by runners.', care: 'Sun or part shade, moist soil — grow in a pot to contain it.', pets: 'mild' },
  basil: { name: 'Sweet basil', latin: 'Ocimum basilicum', where: 'Indoor & garden', icon: 'basil', features: 'Square stem, smooth glossy cupped leaves, sweet clove scent.', care: 'Warm sun, keep moist, pinch tips before it flowers.', pets: 'safe' },
  violet: { name: 'African violet', latin: 'Streptocarpus sect. Saintpaulia', where: 'Indoor', icon: 'fuzzy', features: 'Low rosette of velvety leaves; small violet, pink or white flowers.', care: 'Bright indirect light; water from below with room-temperature water.', pets: 'safe' },
  sunflower: { name: 'Sunflower', latin: 'Helianthus annuus', where: 'Garden', icon: 'sunflower', features: 'Tall rough-hairy stem, large coarse leaves, huge yellow flower head.', care: 'Full sun; sow directly after frost; stake tall varieties.', pets: 'safe' },
  pilea: { name: 'Chinese money plant', latin: 'Pilea peperomioides', where: 'Indoor', icon: 'coin', features: 'Round coin-like leaves with the stalk attached under the centre.', care: 'Bright indirect light; rotate weekly; water when half dry.', pets: 'safe' },
  rubber: { name: 'Rubber plant', latin: 'Ficus elastica', where: 'Indoor', icon: 'tree', features: 'Thick, oval, very glossy leaves on a trunk; new leaves in a red sheath; milky sap.', care: 'Bright indirect light; let the top 5 cm dry out.', pets: 'toxic' },
  fiddle: { name: 'Fiddle-leaf fig', latin: 'Ficus lyrata', where: 'Indoor', icon: 'fiddle', features: 'Large violin-shaped leaves with wavy edges and bold veins on a trunk.', care: 'Bright light near a window; consistent watering; hates moving.', pets: 'toxic' },
  prayer: { name: 'Prayer plant', latin: 'Maranta leuconeura', where: 'Indoor', icon: 'pattern', features: 'Oval leaves with painted patterns and red veins; fold upward at night.', care: 'Medium indirect light, humidity, keep evenly moist with soft water.', pets: 'safe', look: 'Calathea (related; also pet-safe).' },
  hydrangea: { name: 'Hydrangea', latin: 'Hydrangea macrophylla', where: 'Garden', icon: 'shrub', features: 'Woody shrub, large toothed opposite leaves, big balls or lace-caps of flowers.', care: 'Morning sun, moist rich soil; flower colour depends on soil pH.', pets: 'toxic' },
  peace: { name: 'Peace lily', latin: 'Spathiphyllum spp.', where: 'Indoor', icon: 'spathe', features: 'Glossy dark green leaves from the base; white hood-like spathe flowers.', care: 'Low to medium light; droops dramatically when thirsty.', pets: 'toxic' },
  hosta: { name: 'Hosta', latin: 'Hosta spp.', where: 'Garden', icon: 'hosta', features: 'Clumps of broad ribbed leaves, often variegated; lilac flower spikes; dies back in winter.', care: 'Shade to part sun, moist soil; protect from slugs.', pets: 'toxic' },
}

export interface Step { node: string; choice: 0 | 1 }

/** The sequence of answers that leads from the root to a plant (null if unreachable). */
export function pathTo(plant: string, node = ROOT, acc: Step[] = []): Step[] | null {
  const n = NODES[node]
  if (!n) return null
  for (const choice of [0, 1] as const) {
    const to = n.opts[choice].to
    const here = [...acc, { node, choice }]
    if (to === `p:${plant}`) return here
    if (!to.startsWith('p:')) {
      const r = pathTo(plant, to, here)
      if (r) return r
    }
  }
  return null
}

/** Checks structure: every target exists, every plant appears exactly once, every node is reachable. */
export function validate(): string[] {
  const errs: string[] = []
  const seenPlants: Record<string, number> = {}
  const seenNodes = new Set<string>()
  const walk = (id: string) => {
    if (seenNodes.has(id)) return errs.push(`cycle or shared node ${id}`)
    seenNodes.add(id)
    for (const o of NODES[id].opts) {
      if (o.to.startsWith('p:')) {
        const p = o.to.slice(2)
        if (!PLANTS[p]) errs.push(`missing plant ${p}`)
        seenPlants[p] = (seenPlants[p] ?? 0) + 1
      } else if (!NODES[o.to]) errs.push(`missing node ${o.to}`)
      else walk(o.to)
    }
  }
  walk(ROOT)
  for (const id of Object.keys(NODES)) if (!seenNodes.has(id)) errs.push(`unreachable node ${id}`)
  for (const p of Object.keys(PLANTS)) if (seenPlants[p] !== 1) errs.push(`plant ${p} reached ${seenPlants[p] ?? 0}×`)
  return errs
}
