import { useMemo, useState, type DragEvent } from 'react'
import { BarChart, Btn, CsvButton, JsonButtons, money, Note, Num, Panel, pct, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { columnStats, daysBetween, forecastByMonth, placeDeal, summary, type Deal, type Stage } from './lib/sales-pipeline-board'

interface State { currency: string; stages: Stage[]; deals: Deal[] }

const iso = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
const STAGE_COLORS = ['#64748b', '#0ea5e9', '#6366f1', '#a855f7', '#f59e0b', '#10b981', '#ef4444']

function sample(): State {
  const stages: Stage[] = [
    { id: 'lead', name: 'Lead', prob: 10, kind: 'open' },
    { id: 'qual', name: 'Qualified', prob: 25, kind: 'open' },
    { id: 'prop', name: 'Proposal', prob: 50, kind: 'open' },
    { id: 'nego', name: 'Negotiation', prob: 75, kind: 'open' },
    { id: 'won', name: 'Won', prob: 100, kind: 'won' },
    { id: 'lost', name: 'Lost', prob: 0, kind: 'lost' },
  ]
  const raw: [string, string, string, number, string, number, number][] = [
    ['Website redesign', 'Northwind Traders', 'Alex', 18000, 'lead', 45, -3],
    ['Annual support plan', 'Contoso Ltd', 'Maria', 9600, 'lead', 60, -1],
    ['Data migration', 'Fabrikam', 'Sam', 32000, 'qual', 38, -12],
    ['Mobile app MVP', 'Tailspin Toys', 'Alex', 54000, 'qual', 70, -20],
    ['CRM integration', 'Litware', 'Maria', 21500, 'prop', 21, -25],
    ['Security audit', 'Woodgrove Bank', 'Sam', 15000, 'prop', -4, -40],
    ['Cloud cost review', 'Adventure Works', 'Alex', 7800, 'nego', 9, -33],
    ['Training workshops', 'Coho Winery', 'Maria', 12400, 'nego', 16, -28],
    ['E-commerce plugin', 'Wide World Importers', 'Sam', 26000, 'won', -6, -51],
    ['SEO retainer', 'Proseware', 'Alex', 6000, 'won', -18, -64],
    ['BI dashboards', 'Fourth Coffee', 'Maria', 19000, 'lost', -10, -47],
  ]
  return {
    currency: '$',
    stages,
    deals: raw.map(([title, company, owner, value, stage, close, created]) => ({ id: uid(), title, company, owner, value, stage, close: iso(close), created: iso(created), note: '' })),
  }
}
const DEF = sample()

export default function SalesPipelineBoard() {
  const [s, set, reset] = useToolState('sales-pipeline-board', DEF)
  const [edit, setEdit] = useState<string | null>(null)
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [owner, setOwner] = useState('All')
  const m = (x: number) => money(x, s.currency, 0)
  const now = iso(0)

  const owners = useMemo(() => ['All', ...[...new Set(s.deals.map((d) => d.owner).filter(Boolean))].sort()], [s.deals])
  const visible = s.deals.filter((d) => (owner === 'All' || d.owner === owner) && (!q || `${d.title} ${d.company} ${d.note}`.toLowerCase().includes(q.toLowerCase())))
  const sum = summary(visible, s.stages)
  const fc = forecastByMonth(visible, s.stages)
  const openStages = s.stages.filter((st) => st.kind === 'open')
  const colorOf = (i: number) => STAGE_COLORS[i % STAGE_COLORS.length]
  const deal = s.deals.find((d) => d.id === edit)

  const patch = (id: string, p: Partial<Deal>) => set({ deals: s.deals.map((d) => (d.id === id ? { ...d, ...p } : d)) })
  const add = (stage: string) => {
    const d: Deal = { id: uid(), title: 'New deal', company: '', owner: owner === 'All' ? '' : owner, value: 5000, stage, close: iso(30), created: now, note: '' }
    set({ deals: [...s.deals, d] })
    setEdit(d.id)
  }
  const drop = (e: DragEvent, stage: string, beforeId: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    if (drag) set({ deals: placeDeal(s.deals, drag, stage, beforeId) })
    setDrag(null)
    setOver(null)
  }
  const patchStage = (id: string, p: Partial<Stage>) => set({ stages: s.stages.map((st) => (st.id === id ? { ...st, ...p } : st)) })

  return (
    <div>
      <Stats>
        <Stat label="Open pipeline" value={m(sum.openValue)} sub={`${sum.openCount} open deals`} />
        <Stat label="Weighted forecast" value={m(sum.weighted)} sub="value × stage probability" tone="accent" />
        <Stat label="Won" value={m(sum.wonValue)} sub={`${sum.wonCount} deals · avg ${Number.isFinite(sum.avgWon) ? m(sum.avgWon) : '—'}`} tone="good" />
        <Stat label="Win rate" value={pct(sum.winRate, 0)} sub={`${sum.wonCount} won / ${sum.lostCount} lost`} />
      </Stats>

      <Panel
        title="Pipeline"
        actions={
          <>
            <CsvButton name="pipeline.csv" rows={() => [['Deal', 'Company', 'Owner', 'Stage', 'Probability %', 'Value', 'Weighted', 'Expected close', 'Created', 'Note'], ...s.deals.map((d) => { const st = s.stages.find((x) => x.id === d.stage); return [d.title, d.company, d.owner, st?.name ?? '', st?.prob ?? 0, d.value, ((st?.prob ?? 0) * d.value) / 100, d.close, d.created, d.note] })]} />
            <JsonButtons name="pipeline.json" data={s} onLoad={(d) => d && Array.isArray(d.deals) && set(d)} />
            <Btn kind="ghost" onClick={() => { reset(); setEdit(null) }}>Reset</Btn>
          </>
        }
      >
        <Row>
          <Txt label="Search" value={q} onChange={setQ} placeholder="deal, company or note" />
          <Select label="Owner" value={owner} onChange={setOwner} options={owners} />
        </Row>
        {deal && (
          <div style={{ border: '2px solid var(--accent)', borderRadius: 12, padding: 12, margin: '10px 0', background: 'var(--panel2)' }}>
            <Row>
              <Txt label="Deal" value={deal.title} onChange={(title) => patch(deal.id, { title })} />
              <Txt label="Company" value={deal.company} onChange={(company) => patch(deal.id, { company })} />
              <Txt label="Owner" value={deal.owner} onChange={(o) => patch(deal.id, { owner: o })} />
            </Row>
            <Row>
              <Num label="Value" value={deal.value} onChange={(value) => patch(deal.id, { value: Math.max(0, value) })} unit={s.currency} min={0} />
              <Select label="Stage" value={deal.stage} onChange={(stage) => patch(deal.id, { stage })} options={s.stages.map((st) => [st.id, `${st.name} (${st.prob}%)`] as [string, string])} />
              <Txt label="Expected close" type="date" value={deal.close} onChange={(close) => patch(deal.id, { close })} />
            </Row>
            <Txt label="Next step / note" value={deal.note} onChange={(note) => patch(deal.id, { note })} placeholder="e.g. send revised quote on Friday" />
            <Row>
              <Btn kind="primary" onClick={() => setEdit(null)}>Done</Btn>
              <Btn kind="danger" onClick={() => { set({ deals: s.deals.filter((d) => d.id !== deal.id) }); setEdit(null) }}>Delete deal</Btn>
            </Row>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, marginTop: 8 }}>
          {s.stages.map((st, si) => {
            const cs = columnStats(visible, st)
            const cards = visible.filter((d) => d.stage === st.id)
            return (
              <div
                key={st.id}
                onDragOver={(e) => { e.preventDefault(); setOver(st.id) }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => drop(e, st.id, null)}
                style={{ flex: '1 0 185px', minWidth: 185, background: over === st.id ? 'color-mix(in srgb, var(--accent) 10%, var(--panel2))' : 'var(--panel2)', borderRadius: 12, padding: 8, borderTop: `4px solid ${colorOf(si)}` }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <b>{st.name}</b>
                  <span className="muted" style={{ fontSize: 12 }}>{st.prob}% · {cs.count}</span>
                </div>
                <div style={{ fontSize: 13, margin: '2px 0 8px' }}>
                  {m(cs.total)} {st.kind === 'open' && <span className="muted">→ {m(cs.weighted)} weighted</span>}
                </div>
                {cards.map((d) => {
                  const late = st.kind === 'open' && d.close && d.close < now
                  const age = daysBetween(d.created, now)
                  return (
                    <div
                      key={d.id}
                      draggable
                      onDragStart={(e) => { setDrag(d.id); e.dataTransfer.effectAllowed = 'move' }}
                      onDragEnd={() => { setDrag(null); setOver(null) }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => drop(e, st.id, d.id)}
                      onClick={() => setEdit(d.id)}
                      style={{ background: 'var(--panel)', border: `1px solid ${edit === d.id ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 10, padding: '8px 10px', marginBottom: 8, cursor: 'grab', opacity: drag === d.id ? 0.4 : 1, boxShadow: 'var(--shadow)' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                        <b style={{ fontSize: 14 }}>{d.title}</b>
                        {d.owner && <span title={d.owner} style={{ flex: 'none', width: 24, height: 24, borderRadius: 12, background: colorOf(d.owner.charCodeAt(0)), color: '#fff', fontSize: 11, display: 'grid', placeItems: 'center', fontWeight: 700 }}>{d.owner.slice(0, 2).toUpperCase()}</span>}
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>{d.company || '—'}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
                        <b>{m(d.value)}</b>
                        <span style={{ color: late ? 'var(--err)' : 'var(--muted)' }} title={`Created ${d.created}, ${age} days ago`}>{late ? '⚠ ' : ''}{d.close ? new Date(d.close + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'no date'}</span>
                      </div>
                      {d.note && <div style={{ fontSize: 12, marginTop: 4 }}>→ {d.note}</div>}
                    </div>
                  )
                })}
                {st.kind === 'open' && <Btn kind="ghost" onClick={() => add(st.id)}>+ Add deal</Btn>}
              </div>
            )
          })}
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Drag cards between columns (or click a card and change its stage). Red dates are open deals past their expected close.</p>
      </Panel>

      <Split>
        <div>
        <Panel title="Weighted forecast by expected close month">
          {fc.length ? (
            <BarChart bars={fc.map((f) => ({ label: new Date(f.month + '-01T00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), value: f.parts }))} stacks={openStages.map((st) => ({ name: st.name, color: colorOf(s.stages.indexOf(st)) }))} fy={m} />
          ) : (
            <Note>No open deals with an expected close date.</Note>
          )}
          <Table head={['Month', 'Weighted', 'Deals']} rows={fc.map((f) => [f.month, m(f.parts.reduce((a, b) => a + b, 0)), visible.filter((d) => d.close.startsWith(f.month) && openStages.some((st) => st.id === d.stage)).length])} />
        </Panel>
        </div>
        <div>
        <Panel title="Stages & probabilities" actions={<Btn onClick={() => set({ stages: [...s.stages.slice(0, openStages.length), { id: uid(), name: 'New stage', prob: 60, kind: 'open' }, ...s.stages.slice(openStages.length)] })}>+ Stage</Btn>}>
          <Table
            head={['Stage', 'Win %', 'Type', '']}
            rows={s.stages.map((st, i) => [
              <input key="n" value={st.name} onChange={(e) => patchStage(st.id, { name: e.target.value })} aria-label="Stage name" style={{ borderLeft: `4px solid ${colorOf(i)}` }} />,
              <input key="p" type="number" min={0} max={100} value={st.prob} onChange={(e) => patchStage(st.id, { prob: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} aria-label="Probability" style={{ width: 70 }} disabled={st.kind !== 'open'} />,
              st.kind,
              <Row key="a" wrap={false}>
                <Btn kind="ghost" disabled={i === 0} onClick={() => { const n = s.stages.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; set({ stages: n }) }} title="Move left">◀</Btn>
                <Btn kind="ghost" disabled={st.kind !== 'open' || s.deals.some((d) => d.stage === st.id)} onClick={() => set({ stages: s.stages.filter((x) => x.id !== st.id) })} title="Delete (only empty open stages)">✕</Btn>
              </Row>,
            ])}
          />
          <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
          <p className="muted" style={{ fontSize: 13 }}>
            Weighted forecast = Σ deal value × stage win probability. Calibrate the percentages from your own history: of the deals that reached a stage, how many were won?
          </p>
        </Panel>
        </div>
      </Split>
    </div>
  )
}
