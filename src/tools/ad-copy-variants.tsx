import { useMemo, useState } from 'react'
import { Area, Bar, Btn, Check, CopyButton, CsvButton, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { applyCase, applyVars, count, expand, LIMITS, parse, parseVars, type CaseMode } from './lib/ad-copy-variants'

interface Slot { id: string; name: string; tpl: string; limit: string; custom: number }

const DEF = {
  vars: 'brand = Trailhead\nproduct = hiking boots\ndiscount = 25%',
  slots: [
    { id: 'h', name: 'Headline', tpl: '{Save {{discount}}|Get {{discount}} off|{{discount}} off} {{product}} {today|this week|{now|} at {{brand}}}', limit: 'gads-h', custom: 30 },
    { id: 'd', name: 'Description', tpl: '{Waterproof|Lightweight|Trail-tested} {{product}} built for {every summit|long weekends|rough terrain}. {Free shipping & returns.|Ships in 24h.|30-day fit guarantee.} {Shop now|Find your pair|Order today}!', limit: 'gads-d', custom: 90 },
  ] as Slot[],
  mode: 'asis' as CaseMode,
  max: 500,
  seed: 1,
  hideOver: false,
  sort: 'length' as 'length' | 'alpha' | 'none',
  stars: [] as string[],
  q: '',
}

const EXAMPLES: [string, string][] = [
  ['SaaS', '{Ship|Launch|Deploy} {faster|2× faster|in minutes} with {{brand}}'],
  ['E-commerce', '{New|Fresh|Just in}: {{product}} {from|starting at} {$29|$39}'],
  ['Local', '{Best|Top-rated|Trusted} {plumber|plumbing pros} in {Austin|Round Rock|Cedar Park}'],
]

export default function AdCopyVariants() {
  const [s, set, reset] = useToolState('ad-copy-variants', DEF)
  const [active, setActive] = useState(s.slots[0]?.id ?? '')
  const vars = useMemo(() => parseVars(s.vars), [s.vars])
  const slot = s.slots.find((x) => x.id === active) ?? s.slots[0]

  const results = useMemo(
    () =>
      s.slots.map((sl) => {
        const src = applyVars(sl.tpl, vars)
        const missing = [...new Set([...src.matchAll(/\{\{\s*([\w -]+?)\s*\}\}/g)].map((m) => m[1]))]
        const { seq, error } = parse(src.replace(/\{\{\s*([\w -]+?)\s*\}\}/g, '[$1]'))
        const total = count(seq)
        const lim = sl.limit === 'custom' ? sl.custom : (LIMITS.find((l) => l.key === sl.limit)?.max ?? 0)
        const items = expand(seq, Math.max(1, Math.min(5000, s.max)), s.seed).map((t) => applyCase(t, s.mode))
        const rows = items.map((t) => ({ t, len: [...t].length, ok: !lim || [...t].length <= lim }))
        return { sl, total, rows, lim, error, missing, fit: rows.filter((r) => r.ok).length }
      }),
    [s.slots, vars, s.max, s.seed, s.mode],
  )
  const cur = results.find((r) => r.sl.id === slot?.id) ?? results[0]
  const shown = useMemo(() => {
    if (!cur) return []
    let r = cur.rows.filter((x) => (!s.hideOver || x.ok) && (!s.q || x.t.toLowerCase().includes(s.q.toLowerCase())))
    if (s.sort === 'length') r = [...r].sort((a, b) => a.len - b.len)
    else if (s.sort === 'alpha') r = [...r].sort((a, b) => a.t.localeCompare(b.t))
    return r
  }, [cur, s.hideOver, s.q, s.sort])

  const editSlot = (p: Partial<Slot>) => set({ slots: s.slots.map((x) => (x.id === slot.id ? { ...x, ...p } : x)) })
  const star = (t: string) => set({ stars: s.stars.includes(t) ? s.stars.filter((x) => x !== t) : [...s.stars, t] })
  const lens = cur?.rows.map((r) => r.len) ?? []

  return (
    <Split wide="right">
      <div>
        <Panel title="Templates" actions={<><Btn onClick={() => { const id = uid(); set({ slots: [...s.slots, { id, name: `Field ${s.slots.length + 1}`, tpl: '{Hello|Hi} {world|there}', limit: 'meta-h', custom: 40 }] }); setActive(id) }}>+ Field</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Seg value={slot?.id ?? ''} onChange={setActive} options={s.slots.map((x) => [x.id, x.name] as [string, string])} />
          {slot && (
            <>
              <Row>
                <Txt label="Field name" value={slot.name} onChange={(name) => editSlot({ name })} />
                <Select label="Length limit" value={slot.limit} onChange={(limit) => editSlot({ limit })} options={LIMITS.map((l) => [l.key, l.max ? `${l.label} · ${l.max}` : l.label] as [string, string])} />
                {slot.limit === 'custom' && <Num label="Max chars" value={slot.custom} onChange={(custom) => editSlot({ custom })} min={1} />}
              </Row>
              <Area label="Spintax template" value={slot.tpl} onChange={(tpl) => editSlot({ tpl })} rows={5} mono />
              <Row>
                {EXAMPLES.map(([n, t]) => <Btn key={n} kind="ghost" onClick={() => editSlot({ tpl: t })}>{n} example</Btn>)}
                {s.slots.length > 1 && <Btn kind="danger" onClick={() => { set({ slots: s.slots.filter((x) => x.id !== slot.id) }); setActive(s.slots[0].id) }}>Remove field</Btn>}
              </Row>
              {cur?.error && <Note tone="err">{cur.error}</Note>}
              {cur && cur.missing.length > 0 && <Note tone="warn">Undefined variable{cur.missing.length > 1 ? 's' : ''}: {cur.missing.join(', ')} — shown as [name].</Note>}
            </>
          )}
          <Note>
            <b>Syntax:</b> <code>{'{a|b|c}'}</code> picks one option, groups nest <code>{'{Save {big|more}|Deals}'}</code>, an empty option makes words optional <code>{'{great |}'}</code>,
            <code>{' {{brand}} '}</code> inserts a variable, <code>\{'{'}</code> is a literal brace.
          </Note>
        </Panel>
        <Panel title="Variables & options">
          <Area label="Variables (name = value per line)" value={s.vars} onChange={(v) => set({ vars: v })} rows={4} mono />
          <p className="k-label" style={{ margin: '10px 0 6px' }}>Capitalization</p>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['asis', 'As typed'], ['title', 'Title Case'], ['sentence', 'Sentence'], ['upper', 'UPPER']]} />
          <Row>
            <Num label="Max variants per field" value={s.max} onChange={(max) => set({ max })} min={1} max={5000} hint="Larger sets are sampled uniformly" />
          </Row>
          <Btn onClick={() => set({ seed: s.seed + 1 })}>🎲 New random sample</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Combinations" value={cur ? (cur.total > 1e12 ? cur.total.toExponential(2) : cur.total.toLocaleString('en-US')) : '—'} sub={cur && cur.total > cur.rows.length ? `showing a sample of ${cur.rows.length}` : 'all expanded'} />
          <Stat label="Unique variants" value={cur?.rows.length ?? 0} />
          <Stat label={`Within ${cur?.lim || '∞'} chars`} value={cur ? `${cur.fit}` : '—'} sub={cur && cur.rows.length ? `${Math.round((cur.fit / cur.rows.length) * 100)}% fit` : undefined} tone={cur && cur.fit === cur.rows.length ? 'good' : 'accent'} />
          <Stat label="Length range" value={lens.length ? `${Math.min(...lens)}–${Math.max(...lens)}` : '—'} sub="characters" />
        </Stats>
        <Panel
          title={`${slot?.name ?? ''} variants`}
          actions={
            <>
              <CopyButton text={() => shown.filter((r) => r.ok).map((r) => r.t).join('\n')} label="Copy fitting" />
              <CsvButton name="ad-copy-variants.csv" rows={() => [['field', 'text', 'length', 'limit', 'fits', 'starred'], ...results.flatMap((r) => r.rows.map((x) => [r.sl.name, x.t, x.len, r.lim || '', x.ok ? 'yes' : 'no', s.stars.includes(x.t) ? 'yes' : '']))]} />
            </>
          }
        >
          <Row>
            <Txt label="Filter" value={s.q} onChange={(q) => set({ q })} placeholder="contains…" />
            <Select label="Sort" value={s.sort} onChange={(sort) => set({ sort })} options={[['length', 'Shortest first'], ['alpha', 'A → Z'], ['none', 'Generated order']]} />
          </Row>
          <Check label="Hide variants over the limit" value={s.hideOver} onChange={(hideOver) => set({ hideOver })} />
          <div style={{ maxHeight: 520, overflow: 'auto', marginTop: 8 }}>
            {shown.slice(0, 1000).map((r) => (
              <div key={r.t} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 92px', gap: 8, alignItems: 'center', padding: '6px 4px', borderBottom: '1px solid var(--line)' }}>
                <button type="button" onClick={() => star(r.t)} aria-label="Star" style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 17, color: s.stars.includes(r.t) ? '#f59e0b' : 'var(--muted)' }}>{s.stars.includes(r.t) ? '★' : '☆'}</button>
                <span style={{ color: r.ok ? undefined : 'var(--err)' }}>{r.t}</span>
                <span style={{ fontSize: 12, textAlign: 'right' }}>
                  <b style={{ color: r.ok ? 'var(--ok)' : 'var(--err)' }}>{r.len}</b>
                  {cur.lim ? <span className="muted"> / {cur.lim}</span> : null}
                  {cur.lim ? <Bar value={r.len} max={cur.lim} color={r.ok ? 'var(--ok)' : 'var(--err)'} /> : null}
                </span>
              </div>
            ))}
            {!shown.length && <p className="muted">No variants match.</p>}
            {shown.length > 1000 && <p className="muted">Showing 1000 of {shown.length}; export CSV for all.</p>}
          </div>
        </Panel>
        {s.stars.length > 0 && (
          <Panel title={`Shortlist (${s.stars.length})`} actions={<><CopyButton text={s.stars.join('\n')} /><Btn kind="ghost" onClick={() => set({ stars: [] })}>Clear</Btn></>}>
            {s.stars.map((t) => (
              <div key={t} style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}>★ {t} <span className="muted">({[...t].length})</span></div>
            ))}
          </Panel>
        )}
      </div>
    </Split>
  )
}
