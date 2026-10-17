// Packing list templates and quantity scaling.

export interface TemplateItem { cat: string; name: string; base: number; perDay: number; max: number }
export interface Settings { days: number; activities: string[]; climate: 'hot' | 'mild' | 'cold'; laundry: boolean; laundryEvery: number; international: boolean }

// "Category|Item|base|perDay|max" — max 0 means no cap
const T: Record<string, string> = {
  essentials: `Documents|ID / passport|1|0|0
Documents|Wallet & cards|1|0|0
Documents|Tickets & booking confirmations|1|0|0
Documents|Travel insurance details|1|0|0
Electronics|Phone|1|0|0
Electronics|Phone charger|1|0|0
Electronics|Power bank|1|0|0
Clothes|Underwear|1|1|0
Clothes|Socks (pairs)|1|1|0
Clothes|T-shirts / tops|1|0.7|0
Clothes|Pants / trousers|1|0.2|4
Clothes|Sleepwear|1|0|0
Clothes|Comfortable shoes (pair)|1|0|0
Toiletries|Toothbrush|1|0|0
Toiletries|Toothpaste|1|0|0
Toiletries|Deodorant|1|0|0
Toiletries|Shampoo (travel size)|1|0|0
Toiletries|Hairbrush / comb|1|0|0
Health|Prescription meds (days + 2 spare)|2|1|0
Health|Pain relievers|1|0|0
Misc|Reusable water bottle|1|0|0
Misc|Laundry bags|1|0.15|4`,
  beach: `Clothes|Swimsuit|1|0.15|3
Clothes|Flip-flops (pair)|1|0|0
Clothes|Sun hat|1|0|0
Clothes|Cover-up / sarong|1|0|0
Toiletries|Sunscreen SPF 30+ (bottle)|1|0.1|0
Toiletries|After-sun lotion|1|0|0
Misc|Sunglasses|1|0|0
Misc|Beach towel|1|0|0
Misc|Beach bag|1|0|0
Misc|Waterproof phone pouch|1|0|0`,
  city: `Clothes|Walking shoes (pair)|1|0|0
Clothes|Evening outfit|1|0.15|3
Misc|Day bag|1|0|0
Misc|Compact umbrella|1|0|0
Electronics|Offline maps downloaded|1|0|0
Electronics|Headphones|1|0|0`,
  hiking: `Clothes|Hiking boots (pair)|1|0|0
Clothes|Rain jacket|1|0|0
Clothes|Fleece / insulating layer|1|0|0
Clothes|Hiking socks (pairs)|1|1|7
Clothes|Quick-dry shirts|1|0.5|5
Gear|Backpack|1|0|0
Gear|Headlamp + spare batteries|1|0|0
Gear|Map & compass|1|0|0
Gear|Multi-tool / knife|1|0|0
Gear|Water filter|1|0|0
Gear|Tent|1|0|0
Gear|Sleeping bag|1|0|0
Gear|Sleeping pad|1|0|0
Food|Trail snacks (portions)|0|2|0
Health|First-aid kit|1|0|0
Health|Insect repellent|1|0|0
Health|Blister plasters|1|0|0`,
  business: `Clothes|Suit / blazer|1|0.25|3
Clothes|Dress shirts|1|1|7
Clothes|Dress shoes (pair)|1|0|0
Clothes|Belt|1|0|0
Clothes|Ties / accessories|1|0.3|4
Electronics|Laptop + charger|1|0|0
Electronics|Presentation adapter / USB-C dongle|1|0|0
Documents|Business cards|1|0|0
Misc|Notebook & pen|1|0|0`,
  ski: `Clothes|Ski jacket|1|0|0
Clothes|Ski pants|1|0|0
Clothes|Thermal base layers|1|0.5|4
Clothes|Ski socks (pairs)|1|1|7
Clothes|Ski gloves|1|0|0
Clothes|Neck gaiter|1|0|0
Gear|Goggles|1|0|0
Gear|Helmet|1|0|0
Toiletries|Lip balm with SPF|1|0|0
Misc|Hand warmers (pairs)|0|2|0`,
  kids: `Kids|Diapers|0|6|0
Kids|Baby wipes (packs)|1|0.3|0
Kids|Kids' outfits|1|1.5|0
Kids|Kids' snacks|0|3|0
Kids|Toys & books|3|0|0
Kids|Stroller / carrier|1|0|0
Kids|Children's fever reducer|1|0|0
Kids|Kids' sunscreen / hat|1|0|0`,
  hot: `Clothes|Shorts|1|0.3|5
Clothes|Light breathable shirts|1|0.3|5
Toiletries|Sunscreen SPF 30+ (bottle)|1|0.1|0
Misc|Sunglasses|1|0|0`,
  cold: `Clothes|Warm coat|1|0|0
Clothes|Beanie|1|0|0
Clothes|Gloves|1|0|0
Clothes|Scarf|1|0|0
Clothes|Thermal underwear|1|0.3|3
Clothes|Warm sweater|1|0.2|3`,
  international: `Electronics|Travel adapter plug|1|0|0
Documents|Visa / entry documents|1|0|0
Documents|Some local cash|1|0|0
Documents|Copies of passport (paper + photo)|1|0|0`,
}

export const ACTIVITIES: [string, string][] = [['beach', '🏖 Beach'], ['city', '🏙 City'], ['hiking', '🥾 Hiking & camping'], ['business', '💼 Business'], ['ski', '⛷ Ski'], ['kids', '👶 With kids']]

export const parseTemplate = (src: string): TemplateItem[] =>
  src.split('\n').map((l) => {
    const [cat, name, base, perDay, max] = l.split('|')
    return { cat, name, base: +base, perDay: +perDay, max: +max }
  })

/** Quantity for a trip: base + perDay × days (clothes capped by the laundry cycle), rounded up, capped by max. */
export function quantity(it: TemplateItem, s: Settings): number {
  const laundryCapped = it.cat === 'Clothes' || it.cat === 'Kids' ? s.laundry : false
  const days = laundryCapped ? Math.min(s.days, Math.max(1, s.laundryEvery)) : s.days
  const q = Math.ceil(it.base + it.perDay * days - 1e-9)
  return Math.max(it.base > 0 || it.perDay > 0 ? 1 : 0, it.max > 0 ? Math.min(it.max, q) : q)
}

export interface GenItem { cat: string; name: string; qty: number }

/** Builds the merged list (duplicates keep the larger quantity). */
export function generate(s: Settings): GenItem[] {
  const keys = ['essentials', ...s.activities, ...(s.climate === 'mild' ? [] : [s.climate]), ...(s.international ? ['international'] : [])]
  const map = new Map<string, GenItem>()
  for (const k of keys) {
    if (!T[k]) continue
    for (const it of parseTemplate(T[k])) {
      const qty = quantity(it, s)
      const prev = map.get(it.name)
      if (!prev || prev.qty < qty) map.set(it.name, { cat: it.cat, name: it.name, qty })
    }
  }
  return [...map.values()]
}

export const CATS = ['Documents', 'Clothes', 'Toiletries', 'Health', 'Electronics', 'Gear', 'Food', 'Kids', 'Misc']
