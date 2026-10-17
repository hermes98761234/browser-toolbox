// Pet toxicity reference (foods, plants, household items) and search.
// Severity per species, order: dog, cat, bird, rabbit, horse.
//   E = emergency (can be life-threatening), T = toxic, C = caution (mild/irritant or risky in amount), S = generally safe in moderation, ? = not well documented — avoid.
import { fuzzyScore } from './food-diary'

export const SPECIES = ['dog', 'cat', 'bird', 'rabbit', 'horse'] as const
export type Species = (typeof SPECIES)[number]
export type Sev = 'E' | 'T' | 'C' | 'S' | '?'
export type Kind = 'food' | 'plant' | 'household'
export interface Item { name: string; aliases: string; kind: Kind; sev: Record<Species, Sev>; agent: string; signs: string; note: string }

const RAW = `
Chocolate|cocoa, cacao, brownies, baking chocolate|food|EETTT|Theobromine and caffeine (methylxanthines)|Vomiting, restlessness, racing heart, tremors, seizures|Dark and baking chocolate and cocoa powder are far more dangerous than milk chocolate.
Xylitol|birch sugar, sugar-free gum, sugar-free sweets, some peanut butters, E967|food|E????|Xylitol (sugar alcohol)|Weakness, collapse and seizures from low blood sugar within an hour; liver failure later|Very small amounts can be dangerous to dogs. Check labels of gum, mints, baked goods, toothpaste and nut butters.
Grapes and raisins|currants, sultanas, raisin bread, fruit cake, hot cross buns|food|ET???|Unknown agent (tartaric acid suspected)|Vomiting, lethargy, reduced urination; acute kidney injury|No known safe amount for dogs; reactions are unpredictable.
Onion|onion powder, shallots, spring onion, scallion|food|TETTT|N-propyl disulfide and thiosulfates (Allium)|Weakness, pale gums, red/brown urine from destruction of red blood cells (may appear days later)|Cooked, dried and powdered forms (soups, baby food, gravy) are all toxic.
Garlic|garlic powder, garlic bread|food|TETTT|Thiosulfates (Allium) — more potent than onion|Anaemia signs: weakness, pale gums, fast breathing, dark urine|Cats are especially sensitive to the onion family.
Leeks and chives|leek, chive, wild garlic, ramps|food|TETTT|Allium compounds|Gastrointestinal upset and anaemia|Same plant family as onion and garlic.
Macadamia nuts|macadamia cookies|food|T????|Unknown|Weakness (often hind legs), tremors, fever, vomiting within 12 h|Usually recovers with care; worse if combined with chocolate.
Avocado|guacamole, avocado leaves, avocado pit|food|CCETT|Persin (leaves, skin, pit, fruit)|Birds: breathing difficulty, heart damage, sudden death. Horses/rabbits: heart and mammary tissue damage|Never feed avocado to pet birds. In dogs the pit is also a choking/obstruction hazard.
Alcohol|beer, wine, spirits, liqueur desserts, rum cake|food|EEEEE|Ethanol|Wobbliness, vomiting, low blood sugar and temperature, slowed breathing|Small animals can be poisoned by small amounts.
Caffeine|coffee, coffee grounds, tea bags, energy drinks, caffeine pills|food|TTTTT|Methylxanthines|Hyperactivity, vomiting, rapid heart rate, tremors|Grounds, beans and pills are far more concentrated than a drink.
Raw yeast dough|bread dough, pizza dough|food|ET???|Expanding dough + ethanol from fermentation|Bloated painful belly, retching, drunkenness|The stomach can bloat dangerously; this is an emergency.
Hops|brewing hops, spent hops|food|E????|Unknown|Dangerously high body temperature, panting, racing heart|Greyhounds and retrievers appear especially susceptible.
Salty snacks and salt dough|salt, playdough, salt dough ornaments, rock salt, seawater|household|TTETT|Sodium (salt poisoning)|Thirst, vomiting, tremors, seizures|Homemade playdough and salt-dough ornaments are a common cause in dogs; birds are very sensitive to salt.
Moldy food|mouldy bread, compost, spoiled leftovers, moldy nuts|food|ET?TT|Tremorgenic mycotoxins|Tremors, agitation, high temperature, seizures (dogs often within hours)|Keep compost bins secured.
Fatty scraps|fat trimmings, bacon grease, gravy, fried food|food|CC?CC|High fat load|Vomiting, painful abdomen (pancreatitis)|Not a poison as such, but a frequent cause of pancreatitis in dogs.
Cooked bones|chicken bones, rib bones|food|CC???|Physical hazard|Choking, broken teeth, gut injury or blockage|Cooked bones splinter.
Corn on the cob|corn cob|food|CC???|Physical hazard|Vomiting, no appetite — intestinal blockage|Cobs often need surgery to remove.
Nutmeg|mace|food|CC???|Myristicin|Disorientation, fast heart rate, high blood pressure|Large amounts (e.g. a whole nut or baked goods with lots of spice).
Milk and dairy|milk, cream, ice cream, cheese|food|CC?CC|Lactose|Diarrhoea, gas|Most adult cats and dogs are lactose-intolerant to some degree.
Fruit pits and seeds|cherry pits, apricot kernels, peach stones, plum stones, apple seeds|food|TTTTT|Cyanogenic glycosides (in pits, seeds, stems and leaves)|Dilated pupils, difficulty breathing, bright red gums; pits can also block the gut|The flesh of apple, cherry and peach is fine; remove pits, stems and seeds.
Rhubarb leaves|rhubarb|plant|TT?TT|Soluble calcium oxalates|Drooling, vomiting, tremors; kidney damage|Leaves are the most toxic part.
Tomato plant|tomato leaves, tomato stems, green tomatoes|plant|CC?CC|Solanine (green parts)|Stomach upset, weakness, slow heart rate|Ripe red tomato flesh is generally fine.
Green or raw potatoes|potato sprouts, potato leaves, green potato skin|food|CC?TC|Solanine|Stomach upset, drowsiness|Plain cooked potato is not toxic to dogs.
Star fruit|carambola|food|TT???|Soluble calcium oxalates|Low calcium, tremors, kidney failure|ASPCA lists star fruit as toxic to dogs and cats.
Wild mushrooms|toadstools, death cap, amanita|food|EEEEE|Amatoxins and other mushroom toxins (species dependent)|Vomiting, diarrhoea, liver failure, seizures — sometimes delayed by 6–24 h|Treat any wild mushroom ingestion as an emergency; bring a sample to the vet.
Citrus peel and plants|lemon tree, orange peel, lime, grapefruit|plant|CC??C|Essential oils and psoralens|Vomiting, diarrhoea, skin sensitivity|The fruit flesh in small amounts is not usually dangerous.
Lilies (true lilies)|easter lily, tiger lily, asiatic lily, stargazer, lilium|plant|CE???|Unknown nephrotoxin|Cats: vomiting, drooling, no appetite, then acute kidney failure within 1–3 days|Every part — petals, leaves, pollen, even the vase water — can be fatal to cats.
Daylilies|hemerocallis|plant|CE???|Unknown nephrotoxin|Cats: kidney failure|Not a true lily but equally dangerous to cats.
Lily of the valley|convallaria|plant|EE??E|Cardiac glycosides|Vomiting, irregular heart rhythm, collapse|Affects the heart; emergency.
Sago palm|cycad, cycas revoluta, coontie palm|plant|EE??T|Cycasin|Vomiting, then liver failure; seeds are most toxic|Even a seed or two can be fatal to a dog.
Oleander|nerium oleander|plant|EEEEE|Cardiac glycosides|Drooling, vomiting, abnormal heart rhythm, death|All parts, including dried leaves and clippings.
Foxglove|digitalis|plant|EE?EE|Cardiac glycosides|Vomiting, heart rhythm problems|All parts are toxic.
Yew|taxus, english yew, japanese yew|plant|EE?EE|Taxine alkaloids|Trembling, breathing difficulty, sudden death (horses within hours)|Clippings thrown over a fence are a classic cause of horse deaths.
Azalea and rhododendron|azalea, rhododendron|plant|TT?TT|Grayanotoxins|Vomiting, drooling, weakness, heart problems|A few leaves can make a small animal seriously ill.
Castor bean|ricinus, castor oil plant|plant|EEEEE|Ricin|Severe vomiting and diarrhoea, dehydration, organ failure|The seeds are the most dangerous part.
Autumn crocus|colchicum, meadow saffron|plant|EE??E|Colchicine|Bloody vomiting and diarrhoea, organ damage, bone marrow suppression|Different from spring crocus, which only causes stomach upset.
Tulips and hyacinths|tulip bulbs, hyacinth bulbs|plant|TT??T|Tulipalin / allergenic lactones (concentrated in bulbs)|Drooling, vomiting, diarrhoea|Dogs digging up bulbs is the usual route.
Daffodil|narcissus, jonquil|plant|TT??T|Lycorine and other alkaloids (bulb most toxic)|Vomiting, drooling, diarrhoea; large amounts: heart and breathing problems|Bulbs are the most dangerous part.
Cyclamen|sowbread|plant|TT??T|Terpenoid saponins (tubers)|Drooling, vomiting, diarrhoea|Tubers/roots are most toxic.
Kalanchoe|mother of millions, flaming katy|plant|TT??T|Bufadienolides (cardiac glycosides)|Vomiting, diarrhoea; rarely heart rhythm problems|Popular houseplant.
Dieffenbachia|dumb cane|plant|CC?C?|Insoluble calcium oxalates|Mouth pain, drooling, pawing at mouth, swelling|Painful but rarely life-threatening.
Pothos and philodendron|devil's ivy, epipremnum, philodendron, monstera|plant|CC?C?|Insoluble calcium oxalates|Mouth irritation, drooling, vomiting|Common houseplants; usually mild.
Aloe vera|aloe|plant|CC??C|Saponins and anthraquinones|Vomiting, diarrhoea, lethargy|The clear inner gel is less of a concern than the latex under the skin.
English ivy|hedera helix|plant|CC??C|Triterpenoid saponins|Vomiting, abdominal pain, drooling|Leaves are more toxic than berries.
Poinsettia|euphorbia pulcherrima|plant|CC???|Irritant sap|Mild drooling or vomiting|Its danger is often overstated — usually mild.
Cannabis|marijuana, edibles, weed|household|TT???|THC|Wobbliness, dribbling urine, sensitivity to noise, slow heart rate|Edibles may also contain chocolate or xylitol.
Ragwort|senecio, tansy ragwort|plant|????E|Pyrrolizidine alkaloids|Weight loss, liver failure, often months after eating|Dangerous dried in hay too; damage is cumulative and irreversible.
Red maple leaves|acer rubrum, wilted maple leaves|plant|????E|Unknown oxidant in wilted/dried leaves|Severe anaemia, dark urine, weakness|Horses only; wilted leaves after storms are the risk.
Acorns and oak leaves|oak, quercus, acorns|plant|C???T|Gallotannins|Colic, constipation then bloody diarrhoea, kidney damage|Some horses seek them out in autumn.
Bracken fern|pteridium|plant|????T|Thiaminase|Incoordination, trembling (thiamine deficiency)|Cumulative over weeks.
Black walnut shavings|juglans nigra bedding|household|????T|Unknown (juglone suspected)|Laminitis, limb swelling within hours|Never use black walnut shavings as bedding.
Lawn clippings|grass clippings, mower cuttings|plant|???CT|Rapid fermentation; may hide toxic plants|Colic, choke, laminitis|Feeding clipped grass to horses is a known colic risk; graze instead.
Non-stick pan fumes|PTFE, teflon, overheated non-stick cookware|household|??E??|Polymer fumes|Sudden breathing distress and death in minutes|Birds only; keep them out of the kitchen and never overheat non-stick pans.
Raw fish (regular feeding)|raw fish|food|CC???|Thiaminase|Thiamine deficiency: wobbliness, seizures|An occasional bite is fine; a diet based on raw fish is not.
Carrots|carrot|food|SSSSS|—|—|Plain, in sensible pieces; good low-calorie treat. Sugary for rabbits, so treat-sized.
Apple (no seeds)|apple slices|food|SSSSS|—|—|Remove core and seeds.
Blueberries|blueberry|food|SSSSS|—|—|Small, low-calorie treat.
Plain cooked chicken|chicken breast|food|SS???|—|—|Boneless, skinless, unseasoned (no onion or garlic).
Pumpkin (plain)|pumpkin purée|food|SS?S?|—|—|Plain pumpkin, not pie filling (spices, sugar, sometimes xylitol).
Hay|timothy hay, meadow hay|food|??SSS|—|—|The staple of rabbit and horse diets — check it is free of ragwort and mould.
Cucumber|cucumber|food|SSSSS|—|—|Watery, low-calorie treat.
`

const SEV_KEY: Record<string, Sev> = { E: 'E', T: 'T', C: 'C', S: 'S', '?': '?' }

export const ITEMS: Item[] = RAW.trim().split('\n').map((l) => {
  const [name, aliases, kind, sev, agent, signs, note] = l.split('|')
  const rec = {} as Record<Species, Sev>
  SPECIES.forEach((sp, i) => (rec[sp] = SEV_KEY[sev[i]] ?? '?'))
  return { name, aliases, kind: kind as Kind, sev: rec, agent, signs, note }
})

export const SEV_INFO: Record<Sev, { label: string; tone: string; rank: number }> = {
  E: { label: 'Emergency', tone: '#dc2626', rank: 4 },
  T: { label: 'Toxic', tone: '#ea580c', rank: 3 },
  C: { label: 'Caution', tone: '#ca8a04', rank: 2 },
  '?': { label: 'Unknown — avoid', tone: '#64748b', rank: 1 },
  S: { label: 'Generally safe', tone: '#16a34a', rank: 0 },
}

export function search(q: string, items: Item[] = ITEMS): Item[] {
  if (!q.trim()) return items
  return items
    .map((it) => ({ it, s: Math.max(fuzzyScore(q, it.name) * 1.2, ...it.aliases.split(',').map((a) => fuzzyScore(q, a.trim()))) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.it)
}

export function worst(it: Item, species: Species[]): Sev {
  return species.map((s) => it.sev[s]).sort((a, b) => SEV_INFO[b].rank - SEV_INFO[a].rank)[0] ?? '?'
}
