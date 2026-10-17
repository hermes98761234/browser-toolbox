// Mini CRM model + pure helpers (pipeline maths, follow-up buckets, timeline).

export const STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'] as const
export type Stage = (typeof STAGES)[number]
/** Default win probability per stage (used for the weighted pipeline). */
export const PROB: Record<Stage, number> = { Lead: 0.1, Qualified: 0.25, Proposal: 0.5, Negotiation: 0.75, Won: 1, Lost: 0 }

export interface Contact { id: string; name: string; company: string; email: string; phone: string; tags: string; created: string }
export interface Deal { id: string; contactId: string; title: string; value: number; stage: Stage; close: string }
export interface Activity { id: string; contactId: string; date: string; kind: 'note' | 'call' | 'email' | 'meeting'; text: string }
export interface FollowUp { id: string; contactId: string; due: string; text: string; done: boolean }
export interface Crm { contacts: Contact[]; deals: Deal[]; activities: Activity[]; followUps: FollowUp[] }

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000)
}

export function pipeline(deals: Deal[]) {
  const open = deals.filter((d) => d.stage !== 'Won' && d.stage !== 'Lost')
  const won = deals.filter((d) => d.stage === 'Won')
  const lost = deals.filter((d) => d.stage === 'Lost')
  const sum = (xs: Deal[]) => xs.reduce((a, d) => a + d.value, 0)
  return {
    openValue: sum(open),
    weighted: open.reduce((a, d) => a + d.value * PROB[d.stage], 0),
    wonValue: sum(won),
    winRate: won.length + lost.length ? won.length / (won.length + lost.length) : NaN,
    byStage: STAGES.map((s) => ({ stage: s, count: deals.filter((d) => d.stage === s).length, value: sum(deals.filter((d) => d.stage === s)) })),
  }
}

export type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'done'
export function bucket(f: FollowUp, today: string): Bucket {
  if (f.done) return 'done'
  const d = daysBetween(today, f.due)
  return d < 0 ? 'overdue' : d === 0 ? 'today' : d <= 7 ? 'week' : 'later'
}

export function relDay(iso: string, today: string): string {
  const d = daysBetween(today, iso)
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d === -1) return 'yesterday'
  return d < 0 ? `${-d} days ago` : `in ${d} days`
}

/** Last-touch date per contact (latest activity), for "going cold" hints. */
export function lastTouch(c: Contact, acts: Activity[]): string {
  return acts.filter((a) => a.contactId === c.id).reduce((m, a) => (a.date > m ? a.date : m), c.created)
}
