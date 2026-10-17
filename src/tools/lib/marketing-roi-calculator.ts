// Marketing ROI Calculator: per-channel funnel and return metrics.

export interface Channel { id: string; name: string; spend: number; impressions: number; clicks: number; leads: number; customers: number; revenue: number }
export interface Econ { margin: number; arpu: number; lifetime: number; fixed: number }

export interface Metrics {
  roas: number; roi: number; profitRoi: number; grossProfit: number; net: number
  cac: number; cpl: number; cpc: number; cpm: number; ctr: number; leadRate: number; closeRate: number
  ltv: number; ltvCac: number; payback: number; aov: number
}

const div = (a: number, b: number) => (b > 0 ? a / b : NaN)

/** margin as a fraction (0.6 = 60 %); arpu = monthly revenue per customer; lifetime in months. */
export function metrics(c: Channel, e: Econ): Metrics {
  const grossProfit = c.revenue * e.margin
  const ltv = e.arpu * e.margin * e.lifetime
  const cac = div(c.spend, c.customers)
  return {
    roas: div(c.revenue, c.spend),
    roi: div(c.revenue - c.spend, c.spend),
    profitRoi: div(grossProfit - c.spend, c.spend),
    grossProfit,
    net: grossProfit - c.spend,
    cac,
    cpl: div(c.spend, c.leads),
    cpc: div(c.spend, c.clicks),
    cpm: div(c.spend * 1000, c.impressions),
    ctr: div(c.clicks, c.impressions),
    leadRate: div(c.leads, c.clicks),
    closeRate: div(c.customers, c.leads),
    ltv,
    ltvCac: div(ltv, cac),
    payback: div(cac, e.arpu * e.margin),
    aov: div(c.revenue, c.customers),
  }
}

export function total(chs: Channel[], name = 'All channels'): Channel {
  const s = (k: keyof Channel) => chs.reduce((a, c) => a + (c[k] as number), 0)
  return { id: 'total', name, spend: s('spend'), impressions: s('impressions'), clicks: s('clicks'), leads: s('leads'), customers: s('customers'), revenue: s('revenue') }
}

/** ROAS needed to cover cost of goods: 1 / margin. */
export const breakEvenRoas = (margin: number) => div(1, margin)

/** Blended ROI including fixed costs (tools, salaries, agency fees) on top of media spend. */
export function blended(chs: Channel[], e: Econ): { roi: number; net: number } {
  const t = total(chs)
  const cost = t.spend + e.fixed
  const gp = t.revenue * e.margin
  return { roi: div(gp - cost, cost), net: gp - cost }
}
