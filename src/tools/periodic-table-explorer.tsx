import { useMemo } from 'react'
import { Btn, CsvButton, LineChart, Note, num, Panel, Row, Select, Slider, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { CATS, config, ELEMENTS, position, shells, stateAt, type Cat, type El } from './lib/periodic-table-explorer'

type Prop = 'mass' | 'en' | 'ie' | 'mp' | 'bp' | 'density'
type Mode = 'cat' | Prop | 'state'

const PROPS: Record<Prop, [string, string, boolean]> = {
  mass: ['Atomic mass', 'u', false],
  en: ['Electronegativity (Pauling)', '', false],
  ie: ['1st ionization energy', 'kJ/mol', false],
  mp: ['Melting point', 'K', false],
  bp: ['Boiling point', 'K', false],
  density: ['Density', 'g/cm³', true],
}

const STATE_C = { solid: '#94a3b8', liquid: '#38bdf8', gas: '#f472b6', unknown: '#e2e8f0' }

const DEF = { mode: 'cat' as Mode, sel: 26, q: '', temp: 298 }

/** Viridis-like ramp from dark purple to yellow. */
function ramp(t: number) {
  const stops = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]]
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  const f = x - i
  const c = [0, 1, 2].map((k) => Math.round(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f))
  return { bg: `rgb(${c.join(',')})`, fg: t > 0.55 ? '#111' : '#fff' }
}

const fmtK = (k?: number) => (k === undefined ? '—' : `${num(k, 2)} K (${num(k - 273.15, 1)} °C)`)

export default function PeriodicTableExplorer() {
  const [s, set, reset] = useToolState('periodic-table-explorer', DEF)
  const sel = ELEMENTS[Math.min(117, Math.max(0, s.sel - 1))]
  const q = s.q.trim().toLowerCase()
  const match = (e: El) => !q || e.sym.toLowerCase() === q || e.name.toLowerCase().includes(q) || String(e.z) === q || CATS[e.cat][0].toLowerCase().includes(q)

  const scale = useMemo(() => {
    if (s.mode === 'cat' || s.mode === 'state') return null
    const [, , log] = PROPS[s.mode]
    const vals = ELEMENTS.map((e) => e[s.mode as Prop]).filter((v): v is number => v !== undefined)
    const f = (v: number) => (log ? Math.log10(v) : v)
    const lo = Math.min(...vals.map(f)), hi = Math.max(...vals.map(f))
    return (v?: number) => (v === undefined ? null : (f(v) - lo) / (hi - lo || 1))
  }, [s.mode])

  const look = (e: El) => {
    if (s.mode === 'cat') return { bg: CATS[e.cat][1], fg: '#111' }
    if (s.mode === 'state') return { bg: STATE_C[stateAt(e, s.temp)], fg: '#111' }
    const t = scale!(e[s.mode])
    return t === null ? { bg: 'var(--line)', fg: 'var(--muted)' } : ramp(t)
  }

  const cell = (e: El, style: React.CSSProperties) => {
    const c = look(e)
    const on = e.z === sel.z
    const val = s.mode !== 'cat' && s.mode !== 'state' ? e[s.mode] : undefined
    return (
      <button
        key={e.z}
        type="button"
        onClick={() => set({ sel: e.z })}
        title={`${e.name} (${e.z})`}
        style={{
          ...style, background: c.bg, color: c.fg, border: on ? '2px solid var(--fg)' : '1px solid rgba(0,0,0,.15)', borderRadius: 5, padding: '2px 3px',
          cursor: 'pointer', textAlign: 'left', opacity: match(e) ? 1 : 0.18, minWidth: 0, lineHeight: 1.1, fontFamily: 'inherit', transform: on ? 'scale(1.08)' : undefined, zIndex: on ? 2 : 1,
        }}
      >
        <div style={{ fontSize: 9, opacity: 0.8 }}>{e.z}</div>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{e.sym}</div>
        <div style={{ fontSize: 8, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden' }}>{val !== undefined ? num(val, val < 1 ? 4 : 1) : e.name}</div>
      </button>
    )
  }

  const prop = s.mode !== 'cat' && s.mode !== 'state' ? s.mode : 'en'
  const pos = position(sel.z)
  const sh = shells(sel.z)
  const st = stateAt(sel, s.temp)

  return (
    <div>
      <Panel
        title="Periodic table"
        actions={
          <>
            <CsvButton name="elements.csv" rows={() => [['Z', 'Symbol', 'Name', 'Mass', 'Category', 'Electronegativity', 'IE1 kJ/mol', 'Melting K', 'Boiling K', 'Density g/cm3', 'Configuration'], ...ELEMENTS.map((e) => [e.z, e.sym, e.name, e.mass, CATS[e.cat][0], e.en ?? '', e.ie ?? '', e.mp ?? '', e.bp ?? '', e.density ?? '', config(e.z)])]} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </>
        }
      >
        <Row>
          <Select
            label="Colour by"
            value={s.mode}
            onChange={(mode) => set({ mode })}
            options={[['cat', 'Category'], ['state', 'State of matter at temperature'], ...Object.entries(PROPS).map(([k, v]) => [k, `Heatmap: ${v[0]}`] as [Mode, string])]}
          />
          <Txt label="Search" value={s.q} onChange={(q) => set({ q })} placeholder="Fe, gold, 79, halogen…" />
        </Row>
        {s.mode === 'state' && <Slider label="Temperature" value={s.temp} onChange={(temp) => set({ temp })} min={0} max={6000} step={1} show={(v) => `${v} K (${num(v - 273.15, 0)} °C)`} />}
        <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(18, minmax(38px, 1fr))', gridTemplateRows: 'repeat(7, 52px) 10px repeat(2, 52px)', gap: 3, minWidth: 760 }}>
            {ELEMENTS.map((e) => {
              const p = position(e.z)
              return p.fRow ? cell(e, { gridRow: 8 + p.fRow, gridColumn: 3 + p.fCol! }) : cell(e, { gridRow: p.period, gridColumn: p.group })
            })}
            <div style={{ gridRow: 6, gridColumn: 3, fontSize: 10, display: 'grid', placeItems: 'center', color: 'var(--muted)', border: '1px dashed var(--line)', borderRadius: 5 }}>57–71</div>
            <div style={{ gridRow: 7, gridColumn: 3, fontSize: 10, display: 'grid', placeItems: 'center', color: 'var(--muted)', border: '1px dashed var(--line)', borderRadius: 5 }}>89–103</div>
            <div style={{ gridRow: '1 / 4', gridColumn: '4 / 12', alignSelf: 'start', padding: '4px 10px', display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 11 }}>
              {s.mode === 'cat' &&
                (Object.keys(CATS) as Cat[]).map((k) => (
                  <span key={k} style={{ cursor: 'pointer' }} onClick={() => set({ q: s.q === CATS[k][0].toLowerCase() ? '' : CATS[k][0].toLowerCase() })}>
                    <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: CATS[k][1], marginRight: 4 }} />
                    {CATS[k][0]}
                  </span>
                ))}
              {s.mode === 'state' &&
                (['solid', 'liquid', 'gas', 'unknown'] as const).map((k) => (
                  <span key={k}>
                    <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: STATE_C[k], marginRight: 4 }} />
                    {k} ({ELEMENTS.filter((e) => stateAt(e, s.temp) === k).length})
                  </span>
                ))}
              {scale && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                  low <span style={{ flex: 1, height: 10, borderRadius: 5, background: 'linear-gradient(90deg,rgb(68,1,84),rgb(59,82,139),rgb(33,145,140),rgb(94,201,98),rgb(253,231,37))' }} /> high {PROPS[s.mode as Prop][2] && '(log scale)'}
                </span>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <div className="k-split">
        <Panel title={`${sel.name} (${sel.sym})`} actions={<Row wrap={false}><Btn onClick={() => set({ sel: sel.z > 1 ? sel.z - 1 : 118 })}>◀</Btn><Btn onClick={() => set({ sel: sel.z < 118 ? sel.z + 1 : 1 })}>▶</Btn></Row>}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ width: 110, height: 120, borderRadius: 12, background: CATS[sel.cat][1], color: '#111', padding: 10, flexShrink: 0 }}>
              <div style={{ fontSize: 13 }}>{sel.z}</div>
              <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>{sel.sym}</div>
              <div style={{ fontSize: 12 }}>{sel.name}</div>
              <div style={{ fontSize: 11 }}>{sel.mass}</div>
            </div>
            <svg width={120} height={120} viewBox="-60 -60 120 120" aria-label="Bohr model">
              <circle r={6} fill={CATS[sel.cat][1]} />
              {sh.map((n, i) => {
                const r = 12 + i * (46 / Math.max(1, sh.length))
                return (
                  <g key={i}>
                    <circle r={r} fill="none" stroke="var(--line)" />
                    {Array.from({ length: n }, (_, k) => (
                      <circle key={k} r={1.8} cx={r * Math.cos((2 * Math.PI * k) / n)} cy={r * Math.sin((2 * Math.PI * k) / n)} fill="var(--accent)" />
                    ))}
                  </g>
                )
              })}
            </svg>
          </div>
          <Table
            head={['Property', 'Value']}
            rows={[
              ['Category', CATS[sel.cat][0]],
              ['Position', pos.fRow ? `period ${pos.period}, ${pos.fRow === 1 ? 'lanthanide' : 'actinide'} f-block` : `period ${pos.period}, group ${pos.group}`],
              ['Electron configuration', <span key="c" className="mono">{config(sel.z)}</span>],
              ['Electrons per shell', sh.join(', ')],
              ['Electronegativity', sel.en ?? '—'],
              ['1st ionization energy', sel.ie ? `${sel.ie} kJ/mol (${num(sel.ie / 96.485, 3)} eV)` : '—'],
              ['Melting point', fmtK(sel.mp)],
              ['Boiling point', fmtK(sel.bp)],
              ['Density', sel.density === undefined ? '—' : `${sel.density} g/cm³${sel.density < 0.02 ? ' (gas, STP)' : ''}`],
              [`State at ${s.temp} K`, st],
            ]}
          />
          {sel.z > 103 && <Note>Superheavy element: only a few atoms have ever been made, so most bulk properties are unknown or predicted.</Note>}
        </Panel>
        <div>
          <Stats>
            <Stat label="Atomic number" value={sel.z} tone="accent" />
            <Stat label="Protons / electrons" value={`${sel.z} / ${sel.z}`} />
            <Stat label="Neutrons (main isotope)" value={Math.round(sel.mass) - sel.z} sub={`A ≈ ${Math.round(sel.mass)}`} />
            <Stat label="Valence shell" value={sh[sh.length - 1]} sub={`n = ${sh.length}`} />
          </Stats>
          <Panel title={`Trend: ${PROPS[prop][0]} vs atomic number`}>
            <LineChart
              series={[{ name: PROPS[prop][0], points: ELEMENTS.filter((e) => e[prop] !== undefined).map((e) => [e.z, PROPS[prop][2] ? Math.log10(e[prop]!) : e[prop]!] as [number, number]), color: 'var(--accent)' }]}
              fx={(v) => String(Math.round(v))}
              fy={(v) => (PROPS[prop][2] ? `10^${v.toFixed(1)}` : num(v, 2))}
              markers={[{ x: sel.z, label: sel.sym }]}
              yMin={PROPS[prop][2] ? undefined : 0}
              height={240}
              xLabel="Z"
            />
            <p className="muted" style={{ fontSize: 12 }}>Pick a heatmap property above to change this chart. Peaks in ionization energy mark the noble gases; dips mark the alkali metals.</p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
