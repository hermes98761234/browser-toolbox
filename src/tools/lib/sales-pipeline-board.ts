// Pipeline maths for the Sales Pipeline Board.

export interface Stage { id: string; name: string; prob: number; kind: 'open' | 'won' | 'lost' }
export interface Deal { id: string; title: string; company: string; owner: string; value: number; stage: string; close: string; created: string; note: string }

export interface ColumnStats { count: number; total: number; weighted: number }

export function columnStats(deals: Deal[], stage: Stage): ColumnStats {
  const ds = deals.filter((d) => d.stage === stage.id)
  const total = ds.reduce((a, d) => a + d.value, 0)
  return { count: ds.length, total, weighted: (total * stage.prob) / 100 }
}

export function summary(deals: Deal[], stages: Stage[]) {
  const by = new Map(stages.map((s) => [s.id, s]))
  const open = deals.filter((d) => by.get(d.stage)?.kind === 'open')
  const won = deals.filter((d) => by.get(d.stage)?.kind === 'won')
  const lost = deals.filter((d) => by.get(d.stage)?.kind === 'lost')
  const sum = (l: Deal[]) => l.reduce((a, d) => a + d.value, 0)
  const weighted = open.reduce((a, d) => a + (d.value * (by.get(d.stage)?.prob ?? 0)) / 100, 0)
  const closed = won.length + lost.length
  return {
    openCount: open.length,
    openValue: sum(open),
    weighted,
    wonValue: sum(won),
    wonCount: won.length,
    lostCount: lost.length,
    winRate: closed ? won.length / closed : NaN,
    avgWon: won.length ? sum(won) / won.length : NaN,
  }
}

/** Weighted value of open deals per expected-close month (YYYY-MM), split by stage. */
export function forecastByMonth(deals: Deal[], stages: Stage[]): { month: string; parts: number[] }[] {
  const openStages = stages.filter((s) => s.kind === 'open')
  const map = new Map<string, number[]>()
  for (const d of deals) {
    const si = openStages.findIndex((s) => s.id === d.stage)
    if (si < 0 || !/^\d{4}-\d{2}/.test(d.close)) continue
    const m = d.close.slice(0, 7)
    if (!map.has(m)) map.set(m, openStages.map(() => 0))
    map.get(m)![si] += (d.value * openStages[si].prob) / 100
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, parts]) => ({ month, parts }))
}

/** Whole days between two ISO dates (b − a). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

/** Moves a deal into a stage, placing it before `beforeId` (or at the end of that column). */
export function placeDeal(deals: Deal[], id: string, stage: string, beforeId: string | null): Deal[] {
  const d = deals.find((x) => x.id === id)
  if (!d) return deals
  const rest = deals.filter((x) => x.id !== id)
  const moved = { ...d, stage }
  const at = beforeId ? rest.findIndex((x) => x.id === beforeId) : -1
  if (at >= 0) return [...rest.slice(0, at), moved, ...rest.slice(at)]
  return [...rest, moved]
}
