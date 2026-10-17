import { Btn, CsvButton, fmt, Note, Num, Panel, pct, Row, Seg, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { asWrittenSize, bestSize, convertCount, gaugeDiff } from './lib/gauge-converter'

interface Line { id: string; label: string; count: number; kind: 'sts' | 'rows' }
interface Size { id: string; label: string; size: number }

const DEF = {
  unit: 'cm' as 'cm' | 'in',
  pSts: 22,
  pRows: 30,
  ySts: 20,
  yRows: 27,
  multiple: 4,
  plus: 2,
  swW: 12,
  swSts: 24,
  swH: 12,
  swRows: 32,
  wanted: 100,
  lines: [
    { id: 'a', label: 'Cast on (body)', count: 198, kind: 'sts' },
    { id: 'b', label: 'Ribbing', count: 20, kind: 'rows' },
    { id: 'c', label: 'Body to underarm', count: 120, kind: 'rows' },
    { id: 'd', label: 'Sleeve cast on', count: 48, kind: 'sts' },
    { id: 'e', label: 'Sleeve at upper arm', count: 72, kind: 'sts' },
    { id: 'f', label: 'Neck band pick-up', count: 96, kind: 'sts' },
  ] as Line[],
  sizes: [
    { id: 'xs', label: 'XS', size: 86 },
    { id: 's', label: 'S', size: 96 },
    { id: 'm', label: 'M', size: 106 },
    { id: 'l', label: 'L', size: 116 },
    { id: 'xl', label: 'XL', size: 126 },
  ] as Size[],
}

export default function GaugeConverter() {
  const [s, set, reset] = useToolState('gauge-converter', DEF)
  const sw = s.unit === 'cm' ? 10 : 4
  const u = s.unit === 'cm' ? 'cm' : 'in'
  const dS = gaugeDiff(s.pSts, s.ySts)
  const dR = gaugeDiff(s.pRows, s.yRows)
  const best = bestSize(s.sizes.map((z) => z.size), s.pSts, s.ySts, s.wanted)
  const measuredSts = s.swW > 0 ? (s.swSts / s.swW) * sw : NaN
  const measuredRows = s.swH > 0 ? (s.swRows / s.swH) * sw : NaN

  const editLine = (id: string, p: Partial<Line>) => set({ lines: s.lines.map((l) => (l.id === id ? { ...l, ...p } : l)) })
  const editSize = (id: string, p: Partial<Size>) => set({ sizes: s.sizes.map((z) => (z.id === id ? { ...z, ...p } : z)) })
  const conv = (l: Line) => (l.kind === 'sts' ? convertCount(l.count, s.pSts, s.ySts, s.multiple, s.plus) : convertCount(l.count, s.pRows, s.yRows))
  const setUnit = (unit: 'cm' | 'in') => {
    if (unit === s.unit) return
    const f = unit === 'in' ? 4 / 10 / 2.54 : (10 * 2.54) / 4 // gauge per 10 cm ↔ per 4 in
    const r = (x: number) => Math.round(x * f * 10) / 10
    const len = unit === 'in' ? 1 / 2.54 : 2.54
    set({ unit, pSts: r(s.pSts), pRows: r(s.pRows), ySts: r(s.ySts), yRows: r(s.yRows), wanted: Math.round(s.wanted * len * 10) / 10, sizes: s.sizes.map((z) => ({ ...z, size: Math.round(z.size * len * 10) / 10 })), swW: Math.round(s.swW * len * 10) / 10, swH: Math.round(s.swH * len * 10) / 10 })
  }

  // swatch drawing: same number of stitches, drawn at each gauge
  const cell = (g: number) => (g > 0 ? 160 / g : 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="Gauge">
          <Seg value={s.unit} onChange={setUnit} options={[['cm', 'per 10 cm'], ['in', 'per 4 in']]} />
          <div className="k-label" style={{ marginTop: 10 }}>Pattern gauge</div>
          <Row>
            <Num label="Stitches" value={s.pSts} onChange={(pSts) => set({ pSts })} min={0} step={0.5} />
            <Num label="Rows" value={s.pRows} onChange={(pRows) => set({ pRows })} min={0} step={0.5} />
          </Row>
          <div className="k-label">Your gauge</div>
          <Row>
            <Num label="Stitches" value={s.ySts} onChange={(ySts) => set({ ySts })} min={0} step={0.5} />
            <Num label="Rows" value={s.yRows} onChange={(yRows) => set({ yRows })} min={0} step={0.5} />
          </Row>
        </Panel>
        <Panel title="Measure your swatch">
          <Row>
            <Num label="Stitches counted" value={s.swSts} onChange={(swSts) => set({ swSts })} min={0} />
            <Num label="Across" value={s.swW} onChange={(swW) => set({ swW })} unit={u} min={0} />
          </Row>
          <Row>
            <Num label="Rows counted" value={s.swRows} onChange={(swRows) => set({ swRows })} min={0} />
            <Num label="Over" value={s.swH} onChange={(swH) => set({ swH })} unit={u} min={0} />
          </Row>
          <p style={{ margin: '4px 0 8px' }}>= <b>{fmt(measuredSts, 3)} sts</b> and <b>{fmt(measuredRows, 3)} rows</b> per {sw} {u}</p>
          <Btn onClick={() => set({ ySts: Math.round(measuredSts * 10) / 10, yRows: Math.round(measuredRows * 10) / 10 })} disabled={!Number.isFinite(measuredSts) || !Number.isFinite(measuredRows)}>Use as my gauge</Btn>
          <p className="muted" style={{ fontSize: 13 }}>Measure a washed and blocked swatch at least 12 cm / 5 in wide, away from the edges.</p>
        </Panel>
        <Panel title="Stitch pattern repeat">
          <Row>
            <Num label="Multiple of" value={s.multiple} onChange={(multiple) => set({ multiple: Math.max(1, Math.round(multiple)) })} min={1} />
            <Num label="Plus" value={s.plus} onChange={(plus) => set({ plus: Math.max(0, Math.round(plus)) })} min={0} />
          </Row>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Stitch counts are rounded to the nearest {s.multiple > 1 ? `multiple of ${s.multiple}${s.plus ? ` + ${s.plus}` : ''}` : 'whole stitch'} so ribbing or lace still lines up.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Stitch gauge" value={dS === 0 ? 'matches' : `${dS > 0 ? '+' : ''}${pct(dS, 1)}`} sub={dS > 0 ? 'you knit tighter' : dS < 0 ? 'you knit looser' : 'on gauge'} tone={Math.abs(dS) < 0.02 ? 'good' : 'accent'} />
          <Stat label="Row gauge" value={dR === 0 ? 'matches' : `${dR > 0 ? '+' : ''}${pct(dR, 1)}`} sub={dR > 0 ? 'shorter rows' : dR < 0 ? 'taller rows' : 'on gauge'} tone={Math.abs(dR) < 0.02 ? 'good' : 'accent'} />
          <Stat label="As written, width ×" value={fmt(s.pSts / (s.ySts || 1), 4)} sub={`length × ${fmt(s.pRows / (s.yRows || 1), 4)}`} />
        </Stats>
        {Math.abs(dS) >= 0.05 && <Note tone="warn">More than 5% off. Try a needle {dS > 0 ? 'one size larger' : 'one size smaller'} and swatch again, or use the recalculated counts below.</Note>}
        <Panel title="Recalculated counts" actions={<><Btn onClick={() => set({ lines: [...s.lines, { id: uid(), label: 'New step', count: 40, kind: 'sts' }] })}>+ Line</Btn><CsvButton name="gauge-conversion.csv" rows={() => [['Step', 'Type', 'Pattern', 'Yours exact', 'Yours'], ...s.lines.map((l) => { const c = conv(l); return [l.label, l.kind, l.count, c.exact.toFixed(2), c.rounded] })]} /></>}>
          <Table
            head={['Step', 'Type', 'Pattern', 'Your count', 'Measures', '']}
            rows={s.lines.map((l) => {
              const c = conv(l)
              const g = l.kind === 'sts' ? s.pSts : s.pRows
              return [
                <input key="n" value={l.label} onChange={(e) => editLine(l.id, { label: e.target.value })} aria-label="Step" style={{ minWidth: 130 }} />,
                <select key="k" value={l.kind} onChange={(e) => editLine(l.id, { kind: e.target.value as Line['kind'] })} aria-label="Type"><option value="sts">stitches</option><option value="rows">rows</option></select>,
                <input key="c" type="number" min={0} value={l.count} onChange={(e) => editLine(l.id, { count: Math.max(0, +e.target.value || 0) })} aria-label="Pattern count" style={{ width: 70 }} />,
                <span key="y"><b style={{ fontSize: 17 }}>{Number.isFinite(c.rounded) ? c.rounded : '—'}</b> <span className="muted">({fmt(c.exact, 4)})</span></span>,
                `${fmt((l.count / (g || 1)) * sw, 3)} ${u}`,
                <Btn key="x" kind="ghost" onClick={() => set({ lines: s.lines.filter((x) => x.id !== l.id) })} title="Remove">✕</Btn>,
              ]
            })}
          />
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Rows written as a length ("knit until 30 cm") need no change. Only convert rows that are counted.</p>
        </Panel>
        <Panel title="Which size should I knit?" actions={<Btn onClick={() => set({ sizes: [...s.sizes, { id: uid(), label: 'Size', size: 100 }] })}>+ Size</Btn>}>
          <Num label={`Finished measurement you want`} value={s.wanted} onChange={(wanted) => set({ wanted })} unit={u} min={0} />
          <Table
            head={['Size', `Pattern (${u})`, `At your gauge (${u})`, 'Difference', '']}
            rows={s.sizes.map((z, i) => {
              const a = asWrittenSize(z.size, s.pSts, s.ySts)
              return [
                <input key="l" value={z.label} onChange={(e) => editSize(z.id, { label: e.target.value })} aria-label="Size label" style={{ width: 60, fontWeight: i === best ? 700 : undefined }} />,
                <input key="s" type="number" min={0} value={z.size} onChange={(e) => editSize(z.id, { size: Math.max(0, +e.target.value || 0) })} aria-label="Pattern measurement" style={{ width: 70 }} />,
                <b key="a" style={{ color: i === best ? 'var(--ok)' : undefined }}>{fmt(a, 4)}{i === best ? ' ✓ knit this' : ''}</b>,
                `${a - s.wanted >= 0 ? '+' : ''}${fmt(a - s.wanted, 3)} ${u}`,
                <Btn key="x" kind="ghost" onClick={() => set({ sizes: s.sizes.filter((x) => x.id !== z.id) })} title="Remove">✕</Btn>,
              ]
            })}
          />
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Following another size's numbers at your gauge is often easier than recalculating every instruction, but check lengths and armhole depth (row gauge) too.</p>
        </Panel>
        <Panel title="20 stitches × 20 rows at each gauge">
          <Row>
            {[['Pattern', s.pSts, s.pRows, '#94a3b8'], ['Yours', s.ySts, s.yRows, 'var(--accent)']].map(([n, gs, gr, c]) => {
              const cw = cell(gs as number), ch = cell(gr as number)
              return (
                <div key={n as string} style={{ textAlign: 'center', flex: 1 }}>
                  <svg viewBox="0 0 200 200" style={{ width: '100%', maxWidth: 200 }}>
                    {Array.from({ length: 20 }, (_, r) => Array.from({ length: 20 }, (_, k) => <path key={r * 20 + k} d={`M${k * cw + 2} ${r * ch + 2} l${cw / 2} ${ch} l${cw / 2} ${-ch}`} fill="none" stroke={c as string} strokeWidth={1.2} />))}
                  </svg>
                  <div className="muted" style={{ fontSize: 13 }}>{n}: {fmt((20 / (gs as number)) * sw, 3)} × {fmt((20 / (gr as number)) * sw, 3)} {u}</div>
                </div>
              )
            })}
          </Row>
        </Panel>
        <Btn kind="ghost" onClick={reset}>Reset</Btn>
      </div>
    </Split>
  )
}
