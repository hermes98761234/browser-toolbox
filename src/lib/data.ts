import raw from '../data/catalog.json'
import { classify, type RawCat, type RawTool, type Tool } from './catalog'

export const CATS: RawCat[] = raw.cats
export const TOOLS: Tool[] = (raw.tools as RawTool[]).map(classify)
export const BY_SLUG = new Map(TOOLS.map((t) => [t.slug, t]))
export const CAT_BY_ID = new Map(CATS.map((c) => [c.id, c]))

/** Icon and hue for every category (indexed by category id). */
export const CAT_STYLE: Record<number, { icon: string; hue: number }> = {
  1: { icon: '💰', hue: 145 }, 2: { icon: '🏃', hue: 10 }, 3: { icon: '🍳', hue: 30 }, 4: { icon: '🛠️', hue: 25 },
  5: { icon: '🌱', hue: 110 }, 6: { icon: '🧭', hue: 195 }, 7: { icon: '👨‍👩‍👧', hue: 330 }, 8: { icon: '⏱️', hue: 260 },
  9: { icon: '🐾', hue: 35 }, 10: { icon: '🚗', hue: 215 }, 11: { icon: '✍️', hue: 280 }, 12: { icon: '📄', hue: 0 },
  13: { icon: '🖼️', hue: 300 }, 14: { icon: '🎬', hue: 350 }, 15: { icon: '📊', hue: 170 }, 16: { icon: '🏪', hue: 45 },
  17: { icon: '📣', hue: 320 }, 18: { icon: '💼', hue: 225 }, 19: { icon: '⚖️', hue: 40 }, 20: { icon: '🧾', hue: 160 },
  21: { icon: '🌐', hue: 200 }, 22: { icon: '🖥️', hue: 240 }, 23: { icon: '🤖', hue: 270 }, 24: { icon: '⚙️', hue: 205 },
  25: { icon: '🏗️', hue: 30 }, 26: { icon: '🔌', hue: 50 }, 27: { icon: '🏭', hue: 190 }, 28: { icon: '🧪', hue: 175 },
  29: { icon: '📐', hue: 250 }, 30: { icon: '🔒', hue: 0 }, 31: { icon: '🎨', hue: 310 }, 32: { icon: '🧊', hue: 210 },
  33: { icon: '📷', hue: 20 }, 34: { icon: '🎵', hue: 285 }, 35: { icon: '🍎', hue: 5 }, 36: { icon: '🎓', hue: 230 },
  37: { icon: '🩺', hue: 355 }, 38: { icon: '🚜', hue: 90 }, 39: { icon: '📦', hue: 35 }, 40: { icon: '🧶', hue: 340 },
}
