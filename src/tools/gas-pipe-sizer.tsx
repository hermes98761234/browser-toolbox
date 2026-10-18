import { useMemo } from 'react'
import { Btn, CsvButton, JsonButtons, Note, Num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { GAS, LENGTHS, PIPES, sizeSystem, table, type Gas, type Material, type Pressure, type Section } from './lib/gas-pipe-sizer'

interface State { gas: Gas; btuPerCf: number; mat: Material; p: Pressure; method: 'longest' | 'branch'; secs: Section[]; unitKbtu: boolean }

const SAMPLE: Section[] = [
  { id: 'm1', name: 'Meter → tee A', parent: 'meter', length: 12, appliance: '', btu: 0 },
  { id: 'fu', name: 'Tee A → furnace', parent: 'm1', length: 8, appliance: 'Furnace', btu: 100000 },
  { id: 'm2', name: 'Tee A → tee B', parent: 'm1', length: 18, appliance: '', btu: 0 },
  { id: 'wh', name: 'Tee B → water heater', parent: 'm2', length: 6, appliance: 'Water heater', btu: 40000 },
  { id: 'm3', name: 'Tee B → tee C', parent: 'm2', length: 22, appliance: '', btu: 0 },
  { id: 'rg', name: 'Tee C → range', parent: 'm3', length: 10, appliance: 'Range', btu: 65000 },
  { id: 'dr', name: 'Tee C → dryer', parent: 'm3', length: 14, appliance: 'Clothes dryer', btu: 35000 },
  { id: 'fp', name: 'Tee A → fireplace', parent: 'm1', length: 25, appliance: 'Gas fireplace', btu: 30000 },
]

const PRESS: { name: string; gas?: Gas; p: Pressure }[] = [
  { name: 'NG 7 in w.c., 0.5 in drop', gas: 'ng', p: { mode: 'low', dropInWc: 0.5, inletPsig: 2, dropPsi: 1 } },
  { name: 'NG 7 in w.c., 0.3 in drop', gas: 'ng', p: { mode: 'low', dropInWc: 0.3, inletPsig: 2, dropPsi: 1 } },
  { name: 'LP 11 in w.c., 0.5 in drop', gas: 'lp', p: { mode: 'low', dropInWc: 0.5, inletPsig: 2, dropPsi: 1 } },
  { name: 'NG 2 psi, 1 psi drop', gas: 'ng', p: { mode: 'high', dropInWc: 0.5, inletPsig: 2, dropPsi: 1 } },
  { name: 'NG 5 psi, 3.5 psi drop', gas: 'ng', p: { mode: 'high', dropInWc: 0.5, inletPsig: 5, dropPsi: 3.5 } },
  { name: 'LP 2 psi, 1 psi drop', gas: 'lp', p: { mode: 'high', dropInWc: 0.5, inletPsig: 2, dropPsi: 1 } },
]

const DEF: State = { gas: 'ng', btuPerCf: 1000, mat: 'steel', p: PRESS[0].p, method: 'longest', secs: SAMPLE, unitKbtu: false }

export default function GasPipeSizer() {
  const [s, set, reset] = useToolState('gas-pipe-sizer', DEF)
  const res = useMemo(() => sizeSystem(s.secs, s.gas, s.mat, s.p, s.method, s.btuPerCf), [s.secs, s.gas, s.mat, s.p, s.method, s.btuPerCf])
  const tbl = useMemo(() => table(s.mat, s.gas, s.p), [s.mat, s.gas, s.p])
  const total = s.secs.reduce((a, x) => a + Math.max(0, x.btu), 0)
  const fq = (cfh: number) => (s.unitKbtu ? `${((cfh * s.btuPerCf) / 1000).toFixed(0)}` : cfh.toFixed(0))
  const unit = s.unitKbtu ? 'kBtu/h' : 'cfh'
  const edit = (id: string, p: Partial<Section>) => set({ secs: s.secs.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const fail = res.rows.filter((r) => !r.size)
  const pressText = s.p.mode === 'low' ? `${s.p.dropInWc} in w.c. drop` : `${s.p.inletPsig} psig inlet, ${s.p.dropPsi} psi drop`
  const colIdx = LENGTHS.findIndex((L) => L >= res.longest)

  // simple tree drawing: depth columns, rows in DFS order
  const draw = useMemo(() => {
    const kids = new Map<string, Section[]>()
    s.secs.forEach((x) => kids.set(x.parent, [...(kids.get(x.parent) ?? []), x]))
    const pos = new Map<string, { x: number; y: number }>()
    let row = 0
    const walk = (id: string, depth: number, seen: Set<string>) => {
      for (const k of kids.get(id) ?? []) {
        if (seen.has(k.id)) continue
        seen.add(k.id)
        pos.set(k.id, { x: depth, y: row })
        if (!(kids.get(k.id) ?? []).length) row++
        walk(k.id, depth + 1, seen)
      }
    }
    walk('meter', 1, new Set())
    return { pos, rows: Math.max(1, row), cols: Math.max(1, ...[...pos.values()].map((p) => p.x)) }
  }, [s.secs])
  const CW = 170, RH = 46

  return (
    <div>
      <Note tone="warn">
        <b>Verify with your local code and gas supplier.</b> Capacities are computed from the IFGC / NFPA 54 sizing equations, which the code tables are derived from; your jurisdiction’s adopted edition, local amendments, the actual meter pressure, fittings and appliance inlet requirements govern. Gas piping work generally requires a licensed installer and a pressure test.
      </Note>
      <Split wide="right">
        <div>
          <Panel title="System" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Select label="Pressure preset" value="" onChange={(v) => { const p = PRESS.find((x) => x.name === v); if (p) set({ p: p.p, gas: p.gas ?? s.gas, btuPerCf: GAS[p.gas ?? s.gas].btuPerCf }) }} options={[['', 'Choose…'], ...PRESS.map((p) => [p.name, p.name] as [string, string])]} />
            <Seg value={s.gas} onChange={(gas) => set({ gas, btuPerCf: GAS[gas].btuPerCf })} options={[['ng', 'Natural gas'], ['lp', 'Propane']]} />
            <Num label="Heating value" value={s.btuPerCf} onChange={(btuPerCf) => set({ btuPerCf })} unit="Btu/ft³" min={500} hint={s.gas === 'ng' ? 'utility value, typically 1000–1100' : 'propane ≈ 2516'} />
            <Select label="Pipe material" value={s.mat} onChange={(mat) => set({ mat })} options={Object.entries(PIPES).map(([k, v]) => [k as Material, v.name] as [Material, string])} />
            <Seg value={s.p.mode} onChange={(mode) => set({ p: { ...s.p, mode } })} options={[['low', 'Low pressure (< 1.5 psi)'], ['high', 'Elevated (≥ 1.5 psi)']]} />
            {s.p.mode === 'low' ? (
              <Num label="Allowable pressure drop" value={s.p.dropInWc} onChange={(dropInWc) => set({ p: { ...s.p, dropInWc } })} unit="in w.c." min={0.05} max={10} />
            ) : (
              <Row>
                <Num label="Inlet pressure" value={s.p.inletPsig} onChange={(inletPsig) => set({ p: { ...s.p, inletPsig } })} unit="psig" min={1.5} />
                <Num label="Allowable drop" value={s.p.dropPsi} onChange={(dropPsi) => set({ p: { ...s.p, dropPsi: Math.min(dropPsi, s.p.inletPsig + 14.6) } })} unit="psi" min={0.1} />
              </Row>
            )}
            <Seg value={s.method} onChange={(method) => set({ method })} options={[['longest', 'Longest length'], ['branch', 'Branch length']]} />
            <p className="muted" style={{ fontSize: 13 }}>
              {s.method === 'longest' ? 'Every section is sized using the distance from the meter to the most remote outlet, with the load it carries.' : 'Sections on the run to the most remote outlet use that distance; every other branch uses the distance from the meter to the farthest outlet that branch serves.'}
            </p>
          </Panel>
        </div>
        <div>
          <Stats>
            <Stat label="Connected load" value={`${(total / 1000).toFixed(0)} kBtu/h`} sub={`${(total / s.btuPerCf).toFixed(0)} cfh · ${(total * 0.00029307).toFixed(1)} kW`} />
            <Stat label="Longest run" value={`${res.longest} ft`} sub={`${(res.longest * 0.3048).toFixed(1)} m`} />
            <Stat label="Main size at meter" value={(() => { const m = res.rows.filter((_, i) => s.secs[i].parent === 'meter'); return m.map((r) => (r.size ? `${r.size}″` : 'too big')).join(', ') || '—' })()} tone="accent" sub={`${PIPES[s.mat].name}`} />
            <Stat label="Basis" value={s.gas === 'ng' ? 'Natural gas' : 'Propane'} sub={pressText} />
          </Stats>
          {res.errors.map((e) => <Note key={e} tone="err">{e}</Note>)}
          {fail.length > 0 && <Note tone="err">{fail.length} section(s) exceed the largest {PIPES[s.mat].name} size in this list: use a higher delivery pressure or a different material.</Note>}
          <Panel title="Piping schematic">
            <div style={{ overflowX: 'auto' }}>
              <svg width={(draw.cols + 1) * CW + 120} height={draw.rows * RH + 20} style={{ fontSize: 11 }} role="img" aria-label="piping schematic">
                <rect x={6} y={6} width={44} height={26} rx={5} fill="#64748b" />
                <text x={28} y={23} textAnchor="middle" fill="#fff" fontWeight={700}>Meter</text>
                {s.secs.map((x) => {
                  const p = draw.pos.get(x.id)
                  if (!p) return null
                  const pp = x.parent === 'meter' ? { x: 0, y: 0 } : draw.pos.get(x.parent) ?? { x: 0, y: 0 }
                  const r = res.rows.find((q) => q.id === x.id)
                  const x1 = pp.x * CW + 50, y1 = pp.y * RH + 19, x2 = p.x * CW + 40, y2 = p.y * RH + 19
                  return (
                    <g key={x.id}>
                      <path d={`M${x1},${y1} H${x1 + 10} V${y2} H${x2}`} fill="none" stroke={r?.critical ? '#f59e0b' : '#94a3b8'} strokeWidth={r?.size ? 1.5 + (r.D || 0) * 2.2 : 2} />
                      <text x={x1 + 16} y={y2 - 5} fill="currentColor">{r?.size ? `${r.size}″` : '—'} · {x.length} ft</text>
                      {x.btu > 0 && (
                        <g>
                          <circle cx={x2 + 6} cy={y2} r={6} fill="#ef4444" />
                          <text x={x2 + 16} y={y2 + 4} fill="currentColor">{x.appliance || 'outlet'} {(x.btu / 1000).toFixed(0)}k</text>
                        </g>
                      )}
                    </g>
                  )
                })}
              </svg>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>Orange: run to the most remote outlet ({res.longest} ft). Line thickness ∝ pipe size.</p>
          </Panel>
        </div>
      </Split>
          <Panel title="Sections & sizes" actions={<>
            <Btn onClick={() => set({ secs: [...s.secs, { id: uid(), name: 'New branch', parent: s.secs[0]?.id ?? 'meter', length: 10, appliance: 'Appliance', btu: 30000 }] })}>+ Section</Btn>
            <CsvButton name="gas-pipe-sizing.csv" rows={() => [['section', 'upstream', 'length_ft', 'appliance', 'appliance_btuh', 'load_btuh', 'load_cfh', 'sizing_length_ft', 'size_in', 'capacity_cfh'], ...s.secs.map((x, i) => [x.name, s.secs.find((q) => q.id === x.parent)?.name ?? 'meter', x.length, x.appliance, x.btu, res.rows[i].btu, +res.rows[i].cfh.toFixed(1), res.rows[i].Lsize, res.rows[i].size ?? 'n/a', +res.rows[i].cap.toFixed(0)])]} />
            <JsonButtons name="gas-system.json" data={s} onLoad={(d) => set(d)} />
          </>}>
            <Table
              head={['Section', 'From', 'Length ft', 'Appliance', 'Btu/h', `Load ${unit}`, 'Sizing L', 'Size', `Capacity ${unit}`, '']}
              rows={s.secs.map((x, i) => {
                const r = res.rows[i]
                return [
                  <input key="n" value={x.name} onChange={(e) => edit(x.id, { name: e.target.value })} style={{ width: 140 }} aria-label="Section name" />,
                  <select key="p" style={{ minWidth: 130 }} value={x.parent} onChange={(e) => edit(x.id, { parent: e.target.value })} aria-label="Upstream">
                    <option value="meter">Meter</option>
                    {s.secs.filter((q) => q.id !== x.id).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                  </select>,
                  <input key="l" type="number" min={0} value={x.length} onChange={(e) => edit(x.id, { length: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 60 }} aria-label="Length" />,
                  <input key="a" value={x.appliance} placeholder="(none)" onChange={(e) => edit(x.id, { appliance: e.target.value })} style={{ width: 110 }} aria-label="Appliance" />,
                  <input key="b" type="number" min={0} step={1000} value={x.btu} onChange={(e) => edit(x.id, { btu: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 84 }} aria-label="Btu/h" />,
                  fq(r.cfh), r.Lsize,
                  <b key="s" style={{ color: r.size ? (r.critical ? '#f59e0b' : 'var(--accent)') : 'var(--err)', whiteSpace: 'nowrap' }}>{r.size ? `${r.size}″` : 'n/a'}</b>,
                  r.size ? <span key="c">{fq(r.cap)} <span className="muted">({pct(r.cfh / r.cap, 0)})</span></span> : '—',
                  <Btn key="x" kind="ghost" onClick={() => set({ secs: s.secs.filter((q) => q.id !== x.id).map((q) => (q.parent === x.id ? { ...q, parent: x.parent } : q)) })}>✕</Btn>,
                ]
              })}
            />
            <Row>
              <Seg value={s.unitKbtu ? 'k' : 'c'} onChange={(v) => set({ unitKbtu: v === 'k' })} options={[['c', 'Show cfh'], ['k', 'Show kBtu/h']]} />
            </Row>
          </Panel>
          <Panel title={`Capacity table (${unit}) · ${PIPES[s.mat].name} · ${GAS[s.gas].name} · ${pressText}`}>
            <Table
              head={['Size', ...LENGTHS.map((L, i) => <span key={L} style={{ color: i === colIdx ? 'var(--accent)' : undefined }}>{L} ft</span>)]}
              rows={tbl.map((r) => [<b key="s">{r.size}″</b>, ...r.caps.map((c, i) => <span key={i} style={{ fontWeight: i === colIdx ? 700 : undefined, color: i === colIdx ? 'var(--accent)' : undefined }}>{fq(c) === '0' ? '<1' : Number(fq(c)).toLocaleString('en-US')}</span>)])}
            />
            <p className="muted" style={{ fontSize: 13 }}>
              {s.p.mode === 'low' ? 'Q = 2313 · D^2.623 · (ΔH / (Cr · L))^0.541' : 'Q = 2237 · D^2.623 · ((P₁² − P₂²) · Y / (Cr · L))^0.541'} with D the actual inside diameter (in), L in ft, Cr = {GAS[s.gas].Cr}{s.p.mode === 'high' ? `, Y = ${GAS[s.gas].Y}, P absolute (psia)` : ''}. Highlighted column: the longest run rounded up, as when reading a code table. CSST is not included: its capacities depend on each manufacturer’s EHD rating, so use their tables.
            </p>
          </Panel>
    </div>
  )
}
