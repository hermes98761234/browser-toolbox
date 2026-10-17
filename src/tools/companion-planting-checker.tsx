import { useMemo, useState } from 'react'
import { Btn, CopyButton, Note, Panel, Row, Seg, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { analyse, bestRow, byId, foes, friends, PLANTS, rel, suggestions, type Kind } from './lib/companion-planting-checker'

const PRESETS: [string, string[]][] = [
  ['Three Sisters', ['corn', 'bean', 'squash']],
  ['Salsa garden', ['tomato', 'pepper', 'onion', 'garlic', 'basil', 'marigold']],
  ['Salad bed', ['lettuce', 'radish', 'carrot', 'spinach', 'chives', 'pea']],
  ['Brassica patch', ['cabbage', 'broccoli', 'kale', 'dill', 'rosemary', 'nasturtium', 'strawberry']],
]
const DEF = { sel: ['tomato', 'basil', 'carrot', 'onion', 'bean', 'potato', 'marigold', 'lettuce'], focus: 'tomato' }
const GOOD = '#10b981', BAD = '#ef4444'
const nm = (id: string) => byId.get(id)?.name ?? id
const em = (id: string) => byId.get(id)?.emoji ?? '🌱'

export default function CompanionPlantingChecker() {
  const [s, set, reset] = useToolState('companion-planting-checker', DEF)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'all' | Kind>('all')
  const sel = s.sel.filter((id) => byId.has(id))
  const a = useMemo(() => analyse(sel), [sel])
  const row = useMemo(() => bestRow(sel), [sel])
  const sug = useMemo(() => suggestions(sel), [sel])
  const toggle = (id: string) => set({ sel: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id], focus: id })
  const shown = PLANTS.filter((p) => (kind === 'all' || p.kind === kind) && p.name.toLowerCase().includes(q.toLowerCase()))
  const focus = byId.get(s.focus) ?? PLANTS[0]
  const report = () => [
    `Companion check: ${sel.map(nm).join(', ')}`,
    `Good pairs: ${a.good.map(([x, y]) => `${nm(x)} + ${nm(y)}`).join('; ') || 'none'}`,
    `Conflicts: ${a.bad.map(([x, y]) => `${nm(x)} × ${nm(y)}`).join('; ') || 'none'}`,
    `Suggested row: ${row.order.map(nm).join(' → ')}`,
  ].join('\n')

  return (
    <Split wide="right">
      <div>
        <Panel title="Your plants" actions={<><Btn kind="ghost" onClick={() => set({ sel: [] })}>Clear</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Row>{PRESETS.map(([n, ids]) => <Btn key={n} onClick={() => set({ sel: ids, focus: ids[0] })}>{n}</Btn>)}</Row>
          <Txt label="" value={q} onChange={setQ} placeholder="Search plants…" />
          <Seg value={kind} onChange={setKind} options={[['all', 'All'], ['Vegetable', 'Veg'], ['Herb', 'Herbs'], ['Flower', 'Flowers'], ['Fruit', 'Fruit']]} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
            {shown.map((p) => {
              const on = sel.includes(p.id)
              const conflict = !on && sel.some((x) => rel(x, p.id) === -1)
              const helps = !on && sel.some((x) => rel(x, p.id) === 1)
              return (
                <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={on}
                  title={conflict ? 'Conflicts with a selected plant' : helps ? 'Good companion for your selection' : p.family}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', textAlign: 'left', fontSize: 13.5,
                    border: `2px solid ${on ? 'var(--accent)' : conflict ? BAD + '88' : helps ? GOOD + '88' : 'var(--line)'}`,
                    background: on ? 'var(--accent)' : 'var(--panel)', color: on ? 'var(--on-accent)' : 'var(--fg)', fontWeight: on ? 700 : 500,
                  }}>
                  <span>{p.emoji}</span><span style={{ flex: 1 }}>{p.name}</span>
                  {!on && (conflict ? <span style={{ color: BAD }}>✗</span> : helps ? <span style={{ color: GOOD }}>✓</span> : null)}
                </button>
              )
            })}
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>Unselected plants are marked <span style={{ color: GOOD }}>✓</span> if they help something you grow and <span style={{ color: BAD }}>✗</span> if they clash.</p>
        </Panel>
        <Panel title={<>{focus.emoji} {focus.name} <span className="muted" style={{ fontWeight: 400 }}>· {focus.family}</span></>}>
          <div style={{ fontWeight: 700, color: GOOD, margin: '4px 0' }}>Grows well with</div>
          <Row>{friends(focus.id).map((p) => <Btn key={p.id} kind="ghost" onClick={() => set({ focus: p.id })}>{p.emoji} {p.name}</Btn>)}</Row>
          <div style={{ fontWeight: 700, color: BAD, margin: '8px 0 4px' }}>Keep away from</div>
          {foes(focus.id).length ? <Row>{foes(focus.id).map((p) => <Btn key={p.id} kind="ghost" onClick={() => set({ focus: p.id })}>{p.emoji} {p.name}</Btn>)}</Row> : <p className="muted">No known antagonists.</p>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Harmony score" value={sel.length > 1 ? `${Math.max(0, Math.min(100, a.score))}/100` : '—'} tone={a.bad.length ? 'bad' : 'good'} sub={`${a.pairs} pairs checked`} />
          <Stat label="Good pairs" value={a.good.length} tone="good" />
          <Stat label="Conflicts" value={a.bad.length} tone={a.bad.length ? 'bad' : undefined} />
          <Stat label="Same family" value={a.family.length} sub="rotate separately" />
        </Stats>
        <Panel title="Compatibility grid" actions={<CopyButton text={report} label="Copy summary" />}>
          {sel.length < 2 ? <Note>Pick at least two plants to see the grid.</Note> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 3, fontSize: 13 }}>
                <thead>
                  <tr>
                    <th />
                    {sel.map((id) => (
                      <th key={id} style={{ height: 96, verticalAlign: 'bottom', padding: 0 }}>
                        <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', fontWeight: 600, margin: '0 auto' }}>{em(id)} {nm(id)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sel.map((r) => (
                    <tr key={r}>
                      <th style={{ textAlign: 'right', whiteSpace: 'nowrap', paddingRight: 6, fontWeight: 600 }}>
                        <button type="button" onClick={() => set({ focus: r })} style={{ background: 'none', border: 0, color: 'var(--fg)', cursor: 'pointer', font: 'inherit' }}>{em(r)} {nm(r)}</button>
                      </th>
                      {sel.map((c) => {
                        const v = rel(r, c)
                        const same = r === c
                        return (
                          <td key={c} title={same ? nm(r) : `${nm(r)} + ${nm(c)}: ${v === 1 ? 'good companions' : v === -1 ? 'avoid planting together' : 'neutral'}`}
                            style={{ width: 34, height: 30, textAlign: 'center', borderRadius: 6, fontWeight: 800, color: v ? '#fff' : 'var(--muted)',
                              background: same ? 'transparent' : v === 1 ? GOOD : v === -1 ? BAD : 'var(--panel2)' }}>
                            {same ? '' : v === 1 ? '✓' : v === -1 ? '✗' : '·'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        {a.bad.length > 0 && (
          <Panel title="Conflicts to fix">
            {a.bad.map(([x, y]) => (
              <Note key={x + y} tone="err">
                <b>{em(x)} {nm(x)} × {em(y)} {nm(y)}</b>: plant them in separate beds, or at least 1 m apart.
                {(() => {
                  const alt = friends(x).filter((p) => !sel.includes(p.id) && sel.every((i) => rel(i, p.id) !== -1)).slice(0, 3)
                  return alt.length ? <> Instead of {nm(y)}, {nm(x)} likes {alt.map((p) => p.name).join(', ')}.</> : null
                })()}
              </Note>
            ))}
          </Panel>
        )}
        {sel.length > 2 && (
          <Panel title="Suggested row order">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
              {row.order.map((id, i) => {
                const r = i ? rel(row.order[i - 1], id) : 0
                return (
                  <span key={id} style={{ display: 'contents' }}>
                    {i > 0 && <span style={{ color: r === 1 ? GOOD : r === -1 ? BAD : 'var(--muted)', fontWeight: 800 }}>{r === 1 ? '⇄' : r === -1 ? '✗' : '—'}</span>}
                    <span style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--panel2)' }}>{em(id)} {nm(id)}</span>
                  </span>
                )
              })}
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>Neighbours chosen so helpful pairs touch and clashing plants are never side by side.</p>
          </Panel>
        )}
        {sug.length > 0 && (
          <Panel title="Good additions">
            <Row>
              {sug.map(({ p, good }) => (
                <Btn key={p.id} onClick={() => toggle(p.id)} title={`Helps ${good} of your plants, no conflicts`}>+ {p.emoji} {p.name} <span className="muted">({good})</span></Btn>
              ))}
            </Row>
          </Panel>
        )}
        {a.family.length > 0 && (
          <Note tone="warn">
            Same-family plants share pests and diseases: {a.family.map(([x, y]) => `${nm(x)} & ${nm(y)}`).join(', ')}. Don't follow one with the other in the same spot next year.
          </Note>
        )}
        <Note>Companion planting is based on gardening tradition and limited trials. Treat it as a guide; sun, spacing and soil matter more.</Note>
      </div>
    </Split>
  )
}
