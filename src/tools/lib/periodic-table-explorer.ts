// Element dataset (compact) plus table position, electron configuration and phase helpers.

export type Cat = 'am' | 'ae' | 'tm' | 'pt' | 'ml' | 'nm' | 'ha' | 'ng' | 'la' | 'ac' | 'un'

export const CATS: Record<Cat, [string, string]> = {
  am: ['Alkali metal', '#f87171'],
  ae: ['Alkaline earth metal', '#fb923c'],
  tm: ['Transition metal', '#facc15'],
  pt: ['Post-transition metal', '#4ade80'],
  ml: ['Metalloid', '#2dd4bf'],
  nm: ['Reactive nonmetal', '#60a5fa'],
  ha: ['Halogen', '#a78bfa'],
  ng: ['Noble gas', '#e879f9'],
  la: ['Lanthanide', '#f9a8d4'],
  ac: ['Actinide', '#fda4af'],
  un: ['Unknown properties', '#cbd5e1'],
}

export interface El {
  z: number
  sym: string
  name: string
  mass: number
  cat: Cat
  en?: number // Pauling electronegativity
  ie?: number // first ionization energy, kJ/mol
  mp?: number // melting point, K
  bp?: number // boiling point, K
  density?: number // g/cm³ (gases at STP)
}

// sym|name|mass|cat|EN|IE1|mp|bp|density  (empty = unknown)
const RAW = `H|Hydrogen|1.008|nm|2.20|1312|14.01|20.28|0.00008988
He|Helium|4.0026|ng||2372|0.95|4.22|0.0001785
Li|Lithium|6.94|am|0.98|520|453.69|1615|0.534
Be|Beryllium|9.0122|ae|1.57|900|1560|2742|1.85
B|Boron|10.81|ml|2.04|801|2349|4200|2.34
C|Carbon|12.011|nm|2.55|1086|3823|4098|2.267
N|Nitrogen|14.007|nm|3.04|1402|63.15|77.36|0.0012506
O|Oxygen|15.999|nm|3.44|1314|54.36|90.20|0.001429
F|Fluorine|18.998|ha|3.98|1681|53.53|85.03|0.001696
Ne|Neon|20.180|ng||2081|24.56|27.07|0.0008999
Na|Sodium|22.990|am|0.93|496|370.87|1156|0.971
Mg|Magnesium|24.305|ae|1.31|738|923|1363|1.738
Al|Aluminium|26.982|pt|1.61|578|933.47|2792|2.698
Si|Silicon|28.085|ml|1.90|787|1687|3538|2.3296
P|Phosphorus|30.974|nm|2.19|1012|317.3|550|1.82
S|Sulfur|32.06|nm|2.58|1000|388.36|717.87|2.067
Cl|Chlorine|35.45|ha|3.16|1251|171.6|239.11|0.003214
Ar|Argon|39.948|ng||1521|83.80|87.30|0.0017837
K|Potassium|39.098|am|0.82|419|336.53|1032|0.862
Ca|Calcium|40.078|ae|1.00|590|1115|1757|1.54
Sc|Scandium|44.956|tm|1.36|633|1814|3109|2.989
Ti|Titanium|47.867|tm|1.54|659|1941|3560|4.54
V|Vanadium|50.942|tm|1.63|651|2183|3680|6.11
Cr|Chromium|51.996|tm|1.66|653|2180|2944|7.15
Mn|Manganese|54.938|tm|1.55|717|1519|2334|7.44
Fe|Iron|55.845|tm|1.83|763|1811|3134|7.874
Co|Cobalt|58.933|tm|1.88|760|1768|3200|8.86
Ni|Nickel|58.693|tm|1.91|737|1728|3186|8.912
Cu|Copper|63.546|tm|1.90|745|1357.77|2835|8.96
Zn|Zinc|65.38|tm|1.65|906|692.68|1180|7.134
Ga|Gallium|69.723|pt|1.81|579|302.91|2477|5.907
Ge|Germanium|72.630|ml|2.01|762|1211.4|3106|5.323
As|Arsenic|74.922|ml|2.18|947|1090|887|5.776
Se|Selenium|78.971|nm|2.55|941|494|958|4.809
Br|Bromine|79.904|ha|2.96|1140|265.8|332.0|3.122
Kr|Krypton|83.798|ng|3.00|1351|115.79|119.93|0.003733
Rb|Rubidium|85.468|am|0.82|403|312.46|961|1.532
Sr|Strontium|87.62|ae|0.95|550|1050|1655|2.64
Y|Yttrium|88.906|tm|1.22|600|1799|3609|4.469
Zr|Zirconium|91.224|tm|1.33|640|2128|4682|6.506
Nb|Niobium|92.906|tm|1.6|652|2750|5017|8.57
Mo|Molybdenum|95.95|tm|2.16|684|2896|4912|10.28
Tc|Technetium|98|tm|1.9|702|2430|4538|11
Ru|Ruthenium|101.07|tm|2.2|710|2607|4423|12.45
Rh|Rhodium|102.91|tm|2.28|720|2237|3968|12.41
Pd|Palladium|106.42|tm|2.20|804|1828.05|3236|12.023
Ag|Silver|107.87|tm|1.93|731|1234.93|2435|10.501
Cd|Cadmium|112.41|tm|1.69|868|594.22|1040|8.69
In|Indium|114.82|pt|1.78|558|429.75|2345|7.31
Sn|Tin|118.71|pt|1.96|709|505.08|2875|7.287
Sb|Antimony|121.76|ml|2.05|834|903.78|1860|6.685
Te|Tellurium|127.60|ml|2.1|869|722.66|1261|6.232
I|Iodine|126.90|ha|2.66|1008|386.85|457.4|4.93
Xe|Xenon|131.29|ng|2.6|1170|161.4|165.03|0.005887
Cs|Caesium|132.91|am|0.79|376|301.59|944|1.873
Ba|Barium|137.33|ae|0.89|503|1000|2170|3.594
La|Lanthanum|138.91|la|1.10|538|1193|3737|6.145
Ce|Cerium|140.12|la|1.12|534|1068|3716|6.77
Pr|Praseodymium|140.91|la|1.13|527|1208|3793|6.773
Nd|Neodymium|144.24|la|1.14|533|1297|3347|7.007
Pm|Promethium|145|la|1.13|540|1315|3273|7.26
Sm|Samarium|150.36|la|1.17|545|1345|2067|7.52
Eu|Europium|151.96|la|1.2|547|1099|1802|5.243
Gd|Gadolinium|157.25|la|1.20|593|1585|3546|7.895
Tb|Terbium|158.93|la|1.2|566|1629|3503|8.229
Dy|Dysprosium|162.50|la|1.22|573|1680|2840|8.55
Ho|Holmium|164.93|la|1.23|581|1734|2993|8.795
Er|Erbium|167.26|la|1.24|589|1802|3141|9.066
Tm|Thulium|168.93|la|1.25|597|1818|2223|9.321
Yb|Ytterbium|173.05|la|1.1|603|1097|1469|6.965
Lu|Lutetium|174.97|la|1.27|524|1925|3675|9.84
Hf|Hafnium|178.49|tm|1.3|659|2506|4876|13.31
Ta|Tantalum|180.95|tm|1.5|761|3290|5731|16.654
W|Tungsten|183.84|tm|2.36|770|3695|5828|19.25
Re|Rhenium|186.21|tm|1.9|760|3459|5869|21.02
Os|Osmium|190.23|tm|2.2|840|3306|5285|22.59
Ir|Iridium|192.22|tm|2.20|880|2719|4701|22.56
Pt|Platinum|195.08|tm|2.28|870|2041.4|4098|21.45
Au|Gold|196.97|tm|2.54|890|1337.33|3129|19.3
Hg|Mercury|200.59|tm|2.00|1007|234.43|629.88|13.534
Tl|Thallium|204.38|pt|1.62|589|577|1746|11.85
Pb|Lead|207.2|pt|2.33|716|600.61|2022|11.34
Bi|Bismuth|208.98|pt|2.02|703|544.7|1837|9.78
Po|Polonium|209|pt|2.0|812|527|1235|9.196
At|Astatine|210|ha|2.2|899|575|610|
Rn|Radon|222|ng|2.2|1037|202|211.3|0.00973
Fr|Francium|223|am|0.7|380|300|950|
Ra|Radium|226|ae|0.9|509|973|2010|5.5
Ac|Actinium|227|ac|1.1|499|1323|3471|10.07
Th|Thorium|232.04|ac|1.3|587|2023|5061|11.72
Pa|Protactinium|231.04|ac|1.5|568|1841|4300|15.37
U|Uranium|238.03|ac|1.38|598|1405.3|4404|19.1
Np|Neptunium|237|ac|1.36|605|917|4273|20.45
Pu|Plutonium|244|ac|1.28|585|912.5|3501|19.816
Am|Americium|243|ac|1.3|578|1449|2880|12
Cm|Curium|247|ac|1.3|581|1613|3383|13.51
Bk|Berkelium|247|ac|1.3|601|1259|2900|14.78
Cf|Californium|251|ac|1.3|608|1173|1743|15.1
Es|Einsteinium|252|ac|1.3|619|1133||8.84
Fm|Fermium|257|ac|1.3|627|1800||
Md|Mendelevium|258|ac|1.3|635|1100||
No|Nobelium|259|ac|1.3|642|1100||
Lr|Lawrencium|266|ac|1.3|470|1900||
Rf|Rutherfordium|267|tm||580|||
Db|Dubnium|268|tm||665|||
Sg|Seaborgium|269|tm||757|||
Bh|Bohrium|270|tm||740|||
Hs|Hassium|277|tm||730|||
Mt|Meitnerium|278|un||||
Ds|Darmstadtium|281|un||||
Rg|Roentgenium|282|un||||
Cn|Copernicium|285|tm||||
Nh|Nihonium|286|un||||
Fl|Flerovium|289|un||||
Mc|Moscovium|290|un||||
Lv|Livermorium|293|un||||
Ts|Tennessine|294|un||||
Og|Oganesson|294|un||||`

const opt = (s: string | undefined) => (s === undefined || s === '' ? undefined : Number(s))

export const ELEMENTS: El[] = RAW.split('\n').map((l, i) => {
  const [sym, name, mass, cat, en, ie, mp, bp, density] = l.split('|')
  return { z: i + 1, sym, name, mass: Number(mass), cat: cat as Cat, en: opt(en), ie: opt(ie), mp: opt(mp), bp: opt(bp), density: opt(density) }
})

const PERIOD_END = [2, 10, 18, 36, 54, 86, 118]

/** Period (1–7) and group (1–18; 3 for La–Lu/Ac–Lr, which sit in the f-block rows). */
export function position(z: number): { period: number; group: number; fRow?: number; fCol?: number } {
  const period = PERIOD_END.findIndex((e) => z <= e) + 1
  const start = period === 1 ? 1 : PERIOD_END[period - 2] + 1
  const k = z - start // 0-based index in the period
  if (period === 1) return { period, group: z === 1 ? 1 : 18 }
  if (period <= 3) return { period, group: k < 2 ? k + 1 : k + 11 }
  if (period <= 5) return { period, group: k + 1 }
  if (k < 2) return { period, group: k + 1 }
  if (k < 17) return { period, group: 3, fRow: period === 6 ? 1 : 2, fCol: k - 2 } // La..Lu / Ac..Lr
  return { period, group: k - 13 }
}

const ORDER = ['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p', '5s', '4d', '5p', '6s', '4f', '5d', '6p', '7s', '5f', '6d', '7p']
const CAP: Record<string, number> = { s: 2, p: 6, d: 10, f: 14 }
const L_ORDER = 'spdf'
const NOBLE: [number, string][] = [[86, 'Rn'], [54, 'Xe'], [36, 'Kr'], [18, 'Ar'], [10, 'Ne'], [2, 'He']]

// Ground states that break the Madelung rule (changes relative to the Aufbau filling).
const EXC: Record<number, Record<string, number>> = {
  24: { '4s': 1, '3d': 5 }, 29: { '4s': 1, '3d': 10 }, 41: { '5s': 1, '4d': 4 }, 42: { '5s': 1, '4d': 5 }, 44: { '5s': 1, '4d': 7 },
  45: { '5s': 1, '4d': 8 }, 46: { '5s': 0, '4d': 10 }, 47: { '5s': 1, '4d': 10 }, 57: { '4f': 0, '5d': 1 }, 58: { '4f': 1, '5d': 1 },
  64: { '4f': 7, '5d': 1 }, 78: { '6s': 1, '5d': 9 }, 79: { '6s': 1, '5d': 10 }, 89: { '5f': 0, '6d': 1 }, 90: { '5f': 0, '6d': 2 },
  91: { '5f': 2, '6d': 1 }, 92: { '5f': 3, '6d': 1 }, 93: { '5f': 4, '6d': 1 }, 96: { '5f': 7, '6d': 1 }, 103: { '6d': 0, '7p': 1 },
}

/** Orbital occupation map, e.g. {1s:2, 2s:2, …}. */
export function orbitals(z: number): Record<string, number> {
  const occ: Record<string, number> = {}
  let left = z
  for (const o of ORDER) {
    if (left <= 0) break
    const n = Math.min(CAP[o[1]], left)
    occ[o] = n
    left -= n
  }
  if (EXC[z]) for (const [o, n] of Object.entries(EXC[z])) occ[o] = n
  for (const o of Object.keys(occ)) if (!occ[o]) delete occ[o]
  return occ
}

const sortOrb = (a: string, b: string) => Number(a[0]) - Number(b[0]) || L_ORDER.indexOf(a[1]) - L_ORDER.indexOf(b[1])

/** Noble-gas shorthand, e.g. "[Ar] 3d6 4s2". */
export function config(z: number): string {
  const occ = orbitals(z)
  const core = NOBLE.find(([n]) => n < z)
  const coreOcc = core ? orbitals(core[0]) : {}
  const tail = Object.keys(occ)
    .filter((o) => occ[o] !== (coreOcc[o] ?? 0) || !(o in coreOcc))
    .sort(sortOrb)
    .map((o) => `${o}${occ[o]}`)
  return `${core ? `[${core[1]}] ` : ''}${tail.join(' ')}`.trim()
}

/** Electrons per shell (K, L, M, …). */
export function shells(z: number): number[] {
  const out: number[] = []
  for (const [o, n] of Object.entries(orbitals(z))) out[Number(o[0]) - 1] = (out[Number(o[0]) - 1] ?? 0) + n
  return Array.from(out, (x) => x ?? 0)
}

export function stateAt(e: El, T: number): 'solid' | 'liquid' | 'gas' | 'unknown' {
  if (e.mp === undefined) return 'unknown'
  if (T < e.mp) return 'solid'
  if (e.bp === undefined || T < e.bp) return e.bp === undefined ? 'unknown' : 'liquid'
  return 'gas'
}
