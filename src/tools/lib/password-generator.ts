// Cryptographically secure password, passphrase and PIN generation with entropy estimates.

/** 1296 (= 6⁴) short, common English words: 4 dice rolls pick one word, log2(1296) ≈ 10.34 bits each. */
export const WORDS: string[] = (
  'able acid acorn acre act actor adapt add adult afar agent agile aging agree ahead aid aim air aisle alarm album alert algae alias alibi alien align ' +
  'alike alive alley allow alloy aloe alone alpha altar amber amend amino ample amuse angel angle ankle annex anvil apple apron aqua arch arena argue arm ' +
  'armor army aroma arrow art ash aside ask aspen asset atlas atom attic audio audit aunt avid avoid awake award aware axis baby bacon badge bag bagel ' +
  'bake baker balm band bank barn baron basil basin bat batch bath baton beach bead beak beam bean bear beard beast beat bed beef beep beet begin bell ' +
  'belt bench berry bike bin bird birth bison bit blade blank blast blaze blend bless blimp blind bliss block blog bloom blot blue blur blush board boat ' +
  'body boil bold bolt bone bonus book boost boot booth boss bow bowl box brain brake brass brave bread break brick bride brief bring brisk broad brook ' +
  'broom brown brush buddy bug build bulb bulk bull bumpy bunch bunny burst bus bush busy buzz cabin cable cage cake calf call calm camel camp canal ' +
  'candy cane canoe cape car card cargo carol cart case cash cat catch cave cedar cell cello chair chalk champ chant charm chart chase cheek cheer chef ' +
  'chess chest chick chief child chili chimp chin chip choir chop chord cider city civic claim clam clap clash class claw clay clean clear clerk click ' +
  'cliff climb clock close cloth cloud clove clown club clue coach coast coat cobra cocoa code coil coin cola cold colt comet comic comma coral cord core ' +
  'corn couch count court cove cover cow crab craft crane crate crazy cream creek crest crew crisp crop cross crow crowd crown crumb crust cube cup curb ' +
  'cure curl curry curve cycle daily dairy daisy dance dash data date dawn deal debit debut decal decoy deer delta demo denim dense depth desk dial diary ' +
  'dice diet digit dime diner dingo dish ditch dive dock dodge dog doll dome donor donut door dose dot dough dove draft drain drama dream dress drift ' +
  'drill drink drive drum duck duet dune dust duty dwarf eagle early earth easel east echo edge eel egg elbow elder elect elf elk elm ember empty enjoy ' +
  'entry envoy epic equal era erase essay ethic event exact exam exit extra fable face fact fade fair fairy faith fame fan fancy farm fast fault fawn ' +
  'feast fence fern ferry fiber field fig film final finch find fine fire firm fish fist five fix flag flake flame flash flask flat fleet flex flint flip ' +
  'float flock flood floor flour fluid flute foam focus fog foil folk font food foot force fork form fort forum fox frame fresh frog front frost fruit ' +
  'fudge fuel fun funny fur fuse gala game gap gas gate gauge gecko gem genie giant gift girl given glad glass glide globe glove glow glue goal goat gold ' +
  'golf gong good goose grace grade grain grand grape graph grass gravy great green grid grill grin grip grove growl guard guess guest guide gulf gull ' +
  'gum guru gust habit hair half hall halo ham hand happy hare harp hatch hawk hazel head heap heart heat hedge heel help hen herb hero heron hill hint ' +
  'hippo hobby hold holly home honey hood hook hope horn horse hose host hotel hound hour house hub hug human humor hunt hut hymn ice icon idea igloo ' +
  'image inch index ink inlet input iron item ivory ivy jade jam jar jazz jeans jelly jet jewel job jog join joke jolly joy judge juice jumbo jump jury ' +
  'kale kayak keen keep key kick kid king kiosk kit kite kiwi knee knife knock knot koala label lace lake lamb lamp land lane large laser latch lava lawn ' +
  'layer leaf lean learn lease leash lemon lens level lever lid light lilac lily limb lime limit line linen lion lip list liter llama load loaf lobby ' +
  'local lock lodge loft logic long loop lotus loud love loyal lucky lunar lunch lyric macro magic maid mail major mango manor map maple march mare mask ' +
  'mason mast match math maze meal medal media melon memo menu mercy merit mesa metal meter metro mild milk mill mime mind mint minus mist mix mixer moat ' +
  'model modem mole money monk month moon moose moral motor motto mound mount mouse mouth movie mud mule mural music nail name navy neck neon nerve nest ' +
  'net never new news night ninja noble nod noise north nose note novel nurse nut nylon oak oasis oat ocean odd offer oil olive omega onion open opera ' +
  'orbit order organ otter ounce outer oval oven owl owner pace pack page pail paint pair palm panda panel paper park party pasta paste patch path patio ' +
  'pause pave peace peach peak pear pearl pecan pedal pen penny perch pet petal phone photo piano pie piece pig pilot pine pink pint pipe pitch pivot ' +
  'pixel pizza place plain plan plank plant plate play plaza plot plow plum plus poem poet point polar pole polka pond pony pool poppy porch port pose ' +
  'post pot pouch pound power press price pride prime print prism prize probe prose proud prune pulse puma pump punch pupil puppy purse quail quake quart ' +
  'queen quest quick quiet quill quilt quiz quota quote race radar radio raft rail rain rake rally ramp ranch range rapid raven ray razor reach ready ' +
  'realm rebel red reef relay relic rent reply rhino rhyme rib rice rider ridge ring rinse river road roast robe robin robot rock rodeo roof room root ' +
  'rope rose rover royal ruby rug ruler rumor rural rust sack safe saga sage sail salad salon salsa salt sand satin sauce sauna savor scale scarf scene ' +
  'scent scoop scope score scout scrap sea seal seat seed self sense serum set shade shark sharp shed sheep shelf shell shift shine ship shirt shoe shore ' +
  'short show shrub sign silk simple siren sister sketch ski skill skin skirt sky slate sled sleep sleeve slice slide slope sloth smile smoke snack snail ' +
  'snake snow soap soccer sock soda sofa soft solar solid solo sonic soup south space spark spice spider spike spine spirit splash spoon sport spot spray ' +
  'spring sprout spruce squad squid stable stack staff stage stair stamp stand star start state steam steel stem step stew stick still sting stone stool ' +
  'storm story stove straw stream street stripe studio style sugar suit summer summit sun sunny super surf sushi swamp swan sweet swift swim swing switch ' +
  'sword symbol syrup table tablet tackle taco tail talent tango tank tape target task taste taxi tea team teapot temple tempo tennis tent term test text ' +
  'thank theme thorn thread throne thumb ticket tide tiger tile timber time tiny tip tire toast today toe token tomato tone tongue tool tooth topic torch ' +
  'total totem touch tour towel tower town toy track trade trail train tray treat tree trend trial tribe trick trip trophy truck trunk trust truth tuba ' +
  'tulip tumble tuna tune tunnel turkey turn turtle tutor tweed twig twin type uncle union unit upper urban usage user utmost vacuum valid valley value ' +
  'valve van vapor vase vault vector velvet vendor venue verb verse vessel vest video view villa vine vinyl violin viper visit visor vista vital vivid ' +
  'vocal voice volume vote voyage wafer wagon waist walk wall walnut walrus wand warm wash wasp watch water wave wax way wealth weasel web wedge weed ' +
  'week weight whale wheat wheel whip whisk white wick wide widget wild willow wind window wine wing wink winner winter wire wise wish wit wizard wolf ' +
  'wombat wood wool word work world worm wrap wreath wren wrist yacht yak yard yarn year yeast yellow yeti yield yoga yogurt young youth yummy zebra zero ' +
  'zest zigzag zinc zipper zone zoom'
).trim().split(/\s+/)

export type Rng = (n: number) => Uint32Array

export const cryptoRng: Rng = (n) => crypto.getRandomValues(new Uint32Array(n))

/** Unbiased integer in [0, n) using rejection sampling. */
export function randomInt(n: number, rng: Rng = cryptoRng): number {
  if (n <= 0) throw new Error('n must be positive')
  const limit = Math.floor(0x100000000 / n) * n
  for (;;) {
    const v = rng(1)[0]
    if (v < limit) return v % n
  }
}

export function shuffle<T>(arr: T[], rng: Rng = cryptoRng): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, rng)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const SETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~',
}
const AMBIGUOUS = /[Il1|O0o`'"]/g

export interface CharOptions {
  length: number
  upper: boolean
  lower: boolean
  digits: boolean
  symbols: boolean
  symbolSet: string
  excludeAmbiguous: boolean
  requireEach: boolean
}

export function pools(o: CharOptions): string[] {
  const p: string[] = []
  const clean = (s: string) => [...new Set((o.excludeAmbiguous ? s.replace(AMBIGUOUS, '') : s).split(''))].join('')
  if (o.upper) p.push(clean(SETS.upper))
  if (o.lower) p.push(clean(SETS.lower))
  if (o.digits) p.push(clean(SETS.digits))
  if (o.symbols && o.symbolSet) p.push(clean(o.symbolSet))
  return p.filter(Boolean)
}

export function generatePassword(o: CharOptions, rng: Rng = cryptoRng): string {
  const ps = pools(o)
  if (!ps.length) return ''
  const all = [...new Set(ps.join('').split(''))]
  const len = Math.max(1, Math.min(256, Math.round(o.length)))
  const chars: string[] = []
  if (o.requireEach && len >= ps.length) for (const p of ps) chars.push(p[randomInt(p.length, rng)])
  while (chars.length < len) chars.push(all[randomInt(all.length, rng)])
  return shuffle(chars, rng).join('')
}

/** Entropy in bits of a random password drawn uniformly from `pool` symbols. */
export const charEntropy = (length: number, pool: number) => (pool > 1 ? length * Math.log2(pool) : 0)

export interface PhraseOptions {
  words: number
  separator: string
  capitalize: boolean
  addNumber: boolean
  addSymbol: boolean
}

export function generatePassphrase(o: PhraseOptions, rng: Rng = cryptoRng): { text: string; bits: number } {
  const n = Math.max(1, Math.min(20, Math.round(o.words)))
  const parts = Array.from({ length: n }, () => WORDS[randomInt(WORDS.length, rng)]).map((w) => (o.capitalize ? w[0].toUpperCase() + w.slice(1) : w))
  let bits = n * Math.log2(WORDS.length)
  if (o.addNumber) {
    const i = randomInt(n, rng)
    parts[i] += String(randomInt(10, rng))
    bits += Math.log2(10) + Math.log2(n)
  }
  if (o.addSymbol) {
    const sy = '!@#$%&*?'
    const i = randomInt(n, rng)
    parts[i] += sy[randomInt(sy.length, rng)]
    bits += Math.log2(sy.length) + Math.log2(n)
  }
  return { text: parts.join(o.separator), bits }
}

export function generatePin(length: number, rng: Rng = cryptoRng): string {
  return Array.from({ length: Math.max(1, Math.min(32, Math.round(length))) }, () => String(randomInt(10, rng))).join('')
}

/** Rough entropy of an arbitrary typed password (character classes × length, minus obvious patterns). */
export function estimateEntropy(pw: string): { bits: number; notes: string[] } {
  if (!pw) return { bits: 0, notes: [] }
  const notes: string[] = []
  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/[0-9]/.test(pw)) pool += 10
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33
  let len = pw.length
  if (/(.)\1{2,}/.test(pw)) {
    notes.push('Repeated characters')
    len -= (pw.match(/(.)\1{2,}/g) ?? []).reduce((a, m) => a + m.length - 1, 0)
  }
  if (/(?:abc|bcd|cde|123|234|345|456|567|678|789|qwe|wer|asd|zxc)/i.test(pw)) {
    notes.push('Keyboard or alphabet sequence')
    len -= 2
  }
  if (/^(?:password|qwerty|letmein|admin|welcome|iloveyou|monkey|dragon|111111|123456)/i.test(pw)) {
    notes.push('Starts with a very common password')
    len = Math.min(len, 3)
  }
  if (/(19|20)\d\d/.test(pw)) notes.push('Contains a year')
  if (len < 8) notes.push('Shorter than 8 characters')
  return { bits: Math.max(0, len) * Math.log2(Math.max(pool, 2)), notes }
}

export function strength(bits: number): { label: string; tone: 'bad' | 'accent' | 'good'; level: number } {
  if (bits < 36) return { label: 'Very weak', tone: 'bad', level: 0.15 }
  if (bits < 50) return { label: 'Weak', tone: 'bad', level: 0.35 }
  if (bits < 64) return { label: 'Fair', tone: 'accent', level: 0.55 }
  if (bits < 80) return { label: 'Strong', tone: 'good', level: 0.78 }
  return { label: 'Very strong', tone: 'good', level: 1 }
}

/** Human-readable average time to guess (half the key space) at `rate` guesses per second. */
export function crackTime(bits: number, rate: number): string {
  const sec = 2 ** (bits - 1) / rate
  if (!Number.isFinite(sec)) return '≫ age of universe'
  const units: [number, string][] = [[1, 'second'], [60, 'minute'], [3600, 'hour'], [86400, 'day'], [31557600, 'year'], [31557600e3, 'thousand years'], [31557600e6, 'million years'], [31557600e9, 'billion years']]
  if (sec < 1) return 'instantly'
  if (sec > 31557600e9 * 1000) return '≫ age of universe'
  let best = units[0]
  for (const u of units) if (sec >= u[0]) best = u
  const v = sec / best[0]
  const r = v < 10 ? Math.round(v * 10) / 10 : Math.round(v)
  return `${r} ${best[1]}${r === 1 || best[1].includes('years') ? '' : 's'}`
}
