import { TOOLS } from '../lib/data'
import { isReady } from '../tools'

let last = '#/'
/** The catalog view (filters + page) the user came from. */
export const lastCatalog = () => last
export const rememberCatalog = (hash: string) => {
  last = hash
}

export function randomToolHref(): string {
  const ready = TOOLS.filter((t) => isReady(t.slug))
  const pool = ready.length ? ready : TOOLS
  return `#/tool/${pool[Math.floor(Math.random() * pool.length)].slug}`
}
