// Local-only user data: favourites and recently opened tools. Nothing leaves the browser.
import { useSyncExternalStore } from 'react'

interface Data {
  fav: string[]
  recent: string[]
}

const KEY = 'toolbox:data'
let data: Data = { fav: [], recent: [] }
try {
  data = { ...data, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
} catch {
  /* private mode or corrupt data: start fresh */
}
const subs = new Set<() => void>()

function save(next: Data) {
  data = next
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* ignore quota / private mode */
  }
  for (const s of subs) s()
}

export function useStore(): Data {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => data,
    () => data,
  )
}

export const toggleFav = (slug: string) =>
  save({ ...data, fav: data.fav.includes(slug) ? data.fav.filter((x) => x !== slug) : [slug, ...data.fav] })

export const markOpened = (slug: string) => {
  if (data.recent[0] !== slug) save({ ...data, recent: [slug, ...data.recent.filter((x) => x !== slug)].slice(0, 30) })
}
