import { useState } from 'react'
import { Btn, Note, Panel, Seg, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { FOODS, type Food, GROUPS, isSafe, search, showT } from './lib/meat-temperature-guide'

interface State { unit: 'F' | 'C'; group: string; q: string; sel: string; done: Record<string, number> }
const DEF: State = { unit: 'F', group: 'all', q: '', sel: 'beef-steak', done: { 'beef-steak': 2 } }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function printChart(unit: 'F' | 'C') {
  const rows = GROUPS.map((g) => {
    const items = FOODS.filter((f) => f.group === g)
    return `<tr class="g"><td colspan="3">${esc(g)}</td></tr>` + items.map((f) => `<tr><td>${esc(f.name)}</td><td><b>${f.safeF === null ? '—' : showT(f.safeF, unit)}</b>${f.restMin ? ` + ${f.restMin} min rest` : ''}</td><td>${esc(f.cue ?? '')}</td></tr>`).join('')
  }).join('')
  const w = window.open('', '_blank')
  if (!w) return alert('Allow pop-ups to print the chart.')
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Safe minimum internal temperatures</title><style>
    body{font:13px system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 12px;color:#444}
    table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #ddd;padding:5px 8px;vertical-align:top}
    tr.g td{background:#f2f2f2;font-weight:700;border-top:2px solid #999}td:nth-child(2){white-space:nowrap}</style></head><body>
    <h1>Safe minimum internal temperatures</h1><p>Source: USDA Food Safety and Inspection Service. Measure with a food thermometer in the thickest part, away from bone, fat and gristle.</p>
    <table>${rows}</table><p style="margin-top:12px">Rest time: let the meat stand for the stated minutes after removing it from heat; the temperature stays constant or keeps rising, which destroys pathogens.</p>
    <script>onload=()=>print()</script></body></html>`)
  w.document.close()
}

/** Vertical thermometer with doneness marks and the USDA safe line. */
function Gauge({ food, unit, pick }: { food: Food; unit: 'F' | 'C'; pick?: number }) {
  const lo = 110, hi = 210
  const H = 300, top = 14, bot = 34, x = 80
  const sy = (f: number) => top + (1 - (Math.min(hi, Math.max(lo, f)) - lo) / (hi - lo)) * (H - top - bot)
  const marks = food.doneness ?? []
  // Label positions: hottest at the top, at least 15 px apart.
  const labelY: number[] = []
  marks.map((d, i) => ({ d, i })).sort((a, b) => b.d.f - a.d.f).reduce((prev, { d, i }) => (labelY[i] = Math.max(prev + 15, sy(d.f) + 4)), -Infinity)
  const safeY = food.safeF !== null ? sy(food.safeF) : null
  const target = pick !== undefined ? marks[pick]?.f : food.safeF ?? undefined
  return (
    <svg width="100%" viewBox={`0 0 290 ${H}`} style={{ maxWidth: 340 }} role="img" aria-label="Thermometer">
      <rect x={x - 9} y={top - 6} width={18} height={H - top - bot + 6} rx={9} fill="var(--panel2)" stroke="var(--line)" />
      <circle cx={x} cy={H - bot + 12} r={17} fill={target !== undefined && food.safeF !== null && target < food.safeF ? 'var(--warn)' : 'var(--err)'} />
      {target !== undefined && <rect x={x - 5} y={sy(target)} width={10} height={H - bot - sy(target) + 2} rx={5} fill={food.safeF !== null && target < food.safeF ? 'var(--warn)' : 'var(--err)'} />}
      {[120, 140, 160, 180, 200].filter((f) => safeY === null || Math.abs(sy(f) - safeY) > 22).map((f) => (
        <g key={f}>
          <line x1={x - 16} x2={x - 10} y1={sy(f)} y2={sy(f)} stroke="var(--muted)" />
          <text x={x - 19} y={sy(f) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">{showT(f, unit)}</text>
        </g>
      ))}
      {food.safeF !== null && (
        <g>
          <line x1={x - 16} x2={x + 12} y1={safeY!} y2={safeY!} stroke="var(--ok)" strokeWidth={3} />
          <text x={x - 19} y={safeY! - 2} textAnchor="end" fontSize={10.5} fontWeight={800} fill="var(--ok)">{showT(food.safeF, unit)}</text>
          <text x={x - 19} y={safeY! + 10} textAnchor="end" fontSize={9.5} fontWeight={700} fill="var(--ok)">USDA safe</text>
        </g>
      )}
      {marks.map((d, i) => (
        <g key={d.name}>
          <polyline points={`${x + 12},${sy(d.f)} ${x + 20},${labelY[i] - 4} ${x + 24},${labelY[i] - 4}`} fill="none" stroke="var(--line)" />
          <circle cx={x + 14} cy={sy(d.f)} r={i === pick ? 5 : 3} fill={isSafe(food, d) ? 'var(--accent)' : 'var(--warn)'} />
          <text x={x + 28} y={labelY[i]} fontSize={11} fontWeight={i === pick ? 800 : 500} fill="var(--fg)">{d.name} {showT(d.f, unit)}</text>
        </g>
      ))}
    </svg>
  )
}

export default function MeatTemperatureGuide() {
  const [s, set] = useToolState('meat-temperature-guide', DEF)
  const [checkT, setCheckT] = useState('')
  const list = search(s.q, s.group)
  const food = FOODS.find((f) => f.id === s.sel) ?? FOODS[0]
  const di = food.doneness ? Math.min(s.done[food.id] ?? 0, food.doneness.length - 1) : undefined
  const d = di !== undefined ? food.doneness![di] : undefined
  const pull = d && food.carry ? d.f - food.carry : undefined
  const reading = checkT.trim() === '' ? NaN : Number(checkT)
  const readingF = s.unit === 'F' ? reading : (reading * 9) / 5 + 32
  const delta = (df: number) => (s.unit === 'F' ? `${Math.round(df)}°F` : `${Math.round((df * 5) / 9)}°C`)

  return (
    <Split wide="left">
      <div>
        <Panel title="Find a food" actions={<Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['F', '°F'], ['C', '°C']]} label="Units" />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            <Txt label="Search" value={s.q} placeholder="burger, salmon, turkey…" onChange={(q) => set({ q })} />
            <Select label="Group" value={s.group} onChange={(group) => set({ group })} options={[['all', 'All foods'], ...GROUPS.map((g) => [g, g] as [string, string])]} />
          </div>
          <Table
            head={['Food', 'Safe minimum', 'Rest', '']}
            rows={list.map((f) => [
              <button key="n" type="button" onClick={() => set({ sel: f.id })} style={{ background: 'none', border: 0, padding: 0, color: f.id === food.id ? 'var(--accent)' : 'inherit', fontWeight: f.id === food.id ? 800 : 600, textAlign: 'left', cursor: 'pointer' }}>{f.name}</button>,
              <b key="t">{f.safeF === null ? <span className="muted" style={{ fontWeight: 500 }}>visual check</span> : showT(f.safeF, s.unit)}</b>,
              f.restMin ? `${f.restMin} min` : '—',
              <span key="g" className="muted" style={{ fontSize: 12 }}>{f.group}</span>,
            ])}
          />
          {!list.length && <Note tone="warn">Nothing matches “{s.q}”. Try a broader word like “pork” or “fish”.</Note>}
        </Panel>
        <Note>
          Safe minimums come from the <b>USDA Food Safety and Inspection Service</b>. Measure in the thickest part of the food, away from bone, fat and gristle. Colour and juices are not reliable signs of doneness.
        </Note>
      </div>

      <div>
        <Stats>
          <Stat label="USDA safe minimum" value={food.safeF === null ? 'Visual' : showT(food.safeF, s.unit)} sub={food.name} tone="good" />
          <Stat label="Rest time" value={food.restMin ? `${food.restMin} min` : 'None required'} sub={food.restMin ? 'required for safety' : 'resting still helps juiciness'} />
          {d && <Stat label="Your target" value={showT(d.f, s.unit)} sub={pull ? `pull at ≈ ${showT(pull, s.unit)}` : d.name} tone={isSafe(food, d) ? 'accent' : 'bad'} />}
        </Stats>

        <Panel title={food.name} actions={<Btn onClick={() => printChart(s.unit)}>🖨 Print chart</Btn>}>
          {food.doneness && (
            <>
              <span className="k-label">Doneness preference</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0 10px' }}>
                {food.doneness.map((x, i) => (
                  <Btn key={x.name} kind={i === di ? 'primary' : 'normal'} onClick={() => set({ done: { ...s.done, [food.id]: i } })}>
                    {isSafe(food, x) ? '' : '⚠ '}{x.name}
                  </Btn>
                ))}
              </div>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'center' }}><Gauge food={food} unit={s.unit} pick={di} /></div>
          {d && !isSafe(food, d) && (
            <Note tone="warn">
              <b>{d.name}</b> ({showT(d.f, s.unit)}) is a taste preference <b>below the USDA safe minimum</b> of {showT(food.safeF!, s.unit)}. It carries a higher risk of foodborne illness, especially for children, pregnant people, older adults and anyone with a weakened immune system.
            </Note>
          )}
          {d && isSafe(food, d) && food.safeF !== null && <Note tone="ok">{d.name} at {showT(d.f, s.unit)} meets the USDA minimum{food.restMin ? ` — rest ${food.restMin} minutes before carving or eating` : ''}.</Note>}
          {food.cue && <Note>{food.cue}</Note>}
          {pull && <p className="muted" style={{ fontSize: 13 }}>Carry-over: the temperature typically rises about {delta(food.carry!)} while resting, so remove it from the heat at about {showT(pull, s.unit)}. Always confirm the final reading.</p>}
        </Panel>

        <Panel title="Check a reading">
          <Txt label={`Thermometer reading (°${s.unit})`} type="number" value={checkT} placeholder={s.unit === 'F' ? 'e.g. 152' : 'e.g. 66'} onChange={setCheckT} />
          {Number.isFinite(readingF) && food.safeF !== null && (
            readingF >= food.safeF
              ? <Note tone="ok">✓ Safe for {food.name.toLowerCase()}{food.restMin ? ` after a ${food.restMin}-minute rest` : ''}.{d && readingF < d.f ? ` Still ${delta(d.f - readingF)} short of your ${d.name.toLowerCase()} target.` : ''}</Note>
              : <Note tone="err">Not yet: {delta(food.safeF - readingF)} below the USDA minimum. Keep cooking and re-check in the thickest part.</Note>
          )}
          {Number.isFinite(readingF) && food.safeF === null && <Note>{food.cue}</Note>}
        </Panel>
      </div>
    </Split>
  )
}
