// Safe minimum internal temperatures from the USDA Food Safety and Inspection Service (FSIS)
// "Safe Minimum Internal Temperature Chart", plus common cook's doneness preferences.
// Doneness levels are taste preferences, NOT safety values; any level below the USDA minimum is flagged.

export type Group = 'Beef, veal & lamb' | 'Pork & ham' | 'Poultry' | 'Ground meat' | 'Fish & seafood' | 'Game' | 'Eggs & leftovers'

export interface Doneness { name: string; f: number }
export interface Food {
  id: string
  name: string
  group: Group
  /** USDA FSIS safe minimum internal temperature, °F (null = judged visually). */
  safeF: number | null
  /** Rest time in minutes required by FSIS (3 min for whole cuts of red meat). */
  restMin: number
  /** Visual cue when no temperature applies, or an extra safety note. */
  cue?: string
  /** Cook's doneness preferences (final temperature after resting). */
  doneness?: Doneness[]
  /** Typical carry-over rise while resting, °F (pull this much earlier). */
  carry?: number
  tags?: string
}

const RED: Doneness[] = [
  { name: 'Rare', f: 125 },
  { name: 'Medium-rare', f: 135 },
  { name: 'Medium', f: 145 },
  { name: 'Medium-well', f: 150 },
  { name: 'Well done', f: 160 },
]
const PORK: Doneness[] = [
  { name: 'Medium (slightly pink)', f: 145 },
  { name: 'Medium-well', f: 150 },
  { name: 'Well done', f: 160 },
]

export const FOODS: Food[] = [
  { id: 'beef-steak', name: 'Beef steak', group: 'Beef, veal & lamb', safeF: 145, restMin: 3, doneness: RED, carry: 5, tags: 'ribeye sirloin strip filet t-bone' },
  { id: 'beef-roast', name: 'Beef roast', group: 'Beef, veal & lamb', safeF: 145, restMin: 3, doneness: RED, carry: 10, tags: 'prime rib tenderloin brisket roast beef' },
  { id: 'brisket', name: 'Brisket / pulled beef (tender)', group: 'Beef, veal & lamb', safeF: 145, restMin: 3, doneness: [{ name: 'Sliceable', f: 195 }, { name: 'Probe-tender', f: 203 }], carry: 5, tags: 'bbq smoked low and slow chuck short rib' },
  { id: 'veal', name: 'Veal chops & roasts', group: 'Beef, veal & lamb', safeF: 145, restMin: 3, doneness: RED.slice(1), carry: 5 },
  { id: 'lamb', name: 'Lamb chops, leg & rack', group: 'Beef, veal & lamb', safeF: 145, restMin: 3, doneness: RED, carry: 5, tags: 'mutton' },
  { id: 'lamb-shoulder', name: 'Lamb shoulder (pulled)', group: 'Beef, veal & lamb', safeF: 145, restMin: 3, doneness: [{ name: 'Pull-apart', f: 195 }], carry: 5 },
  { id: 'pork-chop', name: 'Pork chops & tenderloin', group: 'Pork & ham', safeF: 145, restMin: 3, doneness: PORK, carry: 5, tags: 'loin' },
  { id: 'pork-roast', name: 'Pork roast', group: 'Pork & ham', safeF: 145, restMin: 3, doneness: PORK, carry: 10 },
  { id: 'pulled-pork', name: 'Pork shoulder / butt (pulled)', group: 'Pork & ham', safeF: 145, restMin: 3, doneness: [{ name: 'Sliceable', f: 185 }, { name: 'Pull-apart', f: 200 }], carry: 5, tags: 'bbq boston butt carnitas' },
  { id: 'ribs', name: 'Pork ribs', group: 'Pork & ham', safeF: 145, restMin: 3, doneness: [{ name: 'Tender', f: 195 }], tags: 'spare ribs baby back bbq' },
  { id: 'ham-fresh', name: 'Ham, fresh or smoked (uncooked)', group: 'Pork & ham', safeF: 145, restMin: 3, carry: 5 },
  { id: 'ham-cooked', name: 'Fully cooked ham, reheating', group: 'Pork & ham', safeF: 140, restMin: 0, cue: 'Hams repackaged outside a USDA plant and leftover ham: reheat to 165°F.', tags: 'spiral holiday' },
  { id: 'chicken-whole', name: 'Whole chicken or turkey', group: 'Poultry', safeF: 165, restMin: 0, cue: 'Check the thickest part of the thigh and the breast, away from bone.', carry: 5, tags: 'roast turkey thanksgiving' },
  { id: 'chicken-breast', name: 'Chicken / turkey breast', group: 'Poultry', safeF: 165, restMin: 0, carry: 3 },
  { id: 'chicken-dark', name: 'Thighs, legs & wings', group: 'Poultry', safeF: 165, restMin: 0, doneness: [{ name: 'Safe minimum', f: 165 }, { name: 'Tender (cook’s choice)', f: 180 }], cue: 'Dark meat is safe at 165°F; many cooks go to 175–185°F so connective tissue softens.', tags: 'drumstick wing' },
  { id: 'duck', name: 'Duck & goose', group: 'Poultry', safeF: 165, restMin: 0, doneness: [{ name: 'Pink breast (restaurant style)', f: 135 }, { name: 'USDA safe', f: 165 }], tags: 'magret' },
  { id: 'stuffing', name: 'Stuffing (alone or in the bird)', group: 'Poultry', safeF: 165, restMin: 0, cue: 'Cooking stuffing separately is safer; inside a bird it must also reach 165°F.' },
  { id: 'ground-beef', name: 'Ground beef, pork, veal, lamb', group: 'Ground meat', safeF: 160, restMin: 0, cue: 'Burgers, meatballs, meatloaf, sausages. Colour is not a reliable indicator.', tags: 'burger hamburger meatball meatloaf sausage mince' },
  { id: 'ground-poultry', name: 'Ground chicken or turkey', group: 'Ground meat', safeF: 165, restMin: 0, tags: 'turkey burger chicken sausage' },
  { id: 'fish', name: 'Fin fish', group: 'Fish & seafood', safeF: 145, restMin: 0, doneness: [{ name: 'Silky (salmon, chef style)', f: 125 }, { name: 'Flaky', f: 140 }, { name: 'USDA safe', f: 145 }], cue: 'Or until flesh is opaque and separates easily with a fork.', tags: 'salmon cod tuna trout halibut' },
  { id: 'shrimp', name: 'Shrimp, lobster, crab', group: 'Fish & seafood', safeF: null, restMin: 0, cue: 'Cook until flesh is pearly and opaque.', tags: 'prawns crayfish' },
  { id: 'scallops', name: 'Scallops', group: 'Fish & seafood', safeF: null, restMin: 0, cue: 'Cook until flesh is milky white or opaque and firm.' },
  { id: 'shellfish', name: 'Clams, oysters, mussels', group: 'Fish & seafood', safeF: null, restMin: 0, cue: 'Cook until shells open; throw away any that do not open.' },
  { id: 'venison', name: 'Venison & game steaks/roasts', group: 'Game', safeF: 145, restMin: 3, doneness: RED.slice(1, 4), carry: 5, tags: 'deer elk bison rabbit wild boar' },
  { id: 'game-ground', name: 'Ground venison & game', group: 'Game', safeF: 160, restMin: 0 },
  { id: 'game-birds', name: 'Wild game birds', group: 'Game', safeF: 165, restMin: 0, tags: 'pheasant quail grouse' },
  { id: 'eggs', name: 'Eggs', group: 'Eggs & leftovers', safeF: null, restMin: 0, cue: 'Cook until yolk and white are firm.' },
  { id: 'egg-dishes', name: 'Egg dishes & casseroles', group: 'Eggs & leftovers', safeF: 160, restMin: 0, tags: 'quiche frittata custard' },
  { id: 'leftovers', name: 'Leftovers & casseroles', group: 'Eggs & leftovers', safeF: 165, restMin: 0, cue: 'Reheat sauces, soups and gravies to a rolling boil.' },
]

export const GROUPS: Group[] = ['Beef, veal & lamb', 'Pork & ham', 'Poultry', 'Ground meat', 'Fish & seafood', 'Game', 'Eggs & leftovers']

export const fToC = (f: number) => ((f - 32) * 5) / 9
export const cToF = (c: number) => (c * 9) / 5 + 32
/** Display a °F value in the chosen unit, rounded like the USDA chart (145°F → 63°C). */
export const showT = (f: number, unit: 'F' | 'C') => (unit === 'F' ? `${Math.round(f)}°F` : `${Math.round(fToC(f))}°C`)

export function search(q: string, group: string): Food[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  return FOODS.filter((f) => (group === 'all' || f.group === group) && words.every((w) => `${f.name} ${f.group} ${f.tags ?? ''}`.toLowerCase().includes(w)))
}

/** Is a doneness level at or above the safety minimum? */
export const isSafe = (food: Food, d: Doneness) => food.safeF === null || d.f >= food.safeF
