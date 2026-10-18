import { useState } from 'react'
import { Btn, CopyButton, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, fmt, uid, useToolState } from '../kit'
import { download } from '../kitlib'
import { fromMm, nearestScale, parseScale, rescale, rulerTicks, SCALES, toMm, UNITS, type Unit } from './lib/model-scale-converter'

const UNIT_OPTS = Object.keys(UNITS) as Unit[]
interface Dim { id: string; name: string; realMm: number }
const SUBJECTS: Record<string, { name: string; mm: number }[]> = {
  'Adult person': [{ name: 'Height', mm: 1750 }, { name: 'Shoulder width', mm: 450 }],
  'Family car (typical)': [{ name: 'Length', mm: 4500 }, { name: 'Width', mm: 1800 }, { name: 'Height', mm: 1450 }],
  '20 ft shipping container': [{ name: 'Length', mm: 6058 }, { name: 'Width', mm: 2438 }, { name: 'Height', mm: 2591 }],
  'Standard interior door': [{ name: 'Height', mm: 2032 }, { name: 'Width', mm: 813 }],
  'Two-storey house (typical)': [{ name: 'Ridge height', mm: 8500 }, { name: 'Frontage', mm: 9000 }, { name: 'Depth', mm: 10000 }],
}
const DEF = {
  n: 87, custom: '1:87', realUnit: 'm' as Unit, modelUnit: 'mm' as Unit,
  dims: SUBJECTS['20 ft shipping container'].map((d) => ({ id: uid(), name: d.name, realMm: d.mm })) as Dim[],
  from: 72, to: 48, rulerUnit: 'm' as Unit, rulerLen: 180,
}

const cell: React.CSSProperties = { width: '100%', minWidth: 80, padding: '5px 7px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--panel)', color: 'var(--fg)', font: 'inherit' }
function NumCell({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [txt, setTxt] = useState<string | null>(null)
  return (
    <input style={cell} inputMode="decimal" aria-label={label} value={txt ?? String(value)}
      onChange={(e) => { setTxt(e.target.value); const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0) onChange(v) }}
      onBlur={() => setTxt(null)} />
  )
}

function rulerSvg(n: number, unit: Unit, len: number, forPrint: boolean): string {
  const ticks = rulerTicks(n, unit, len)
  const h = 22, pad = 6
  const lines = ticks.map((t) => `<line x1="${(pad + t.pos).toFixed(3)}" y1="0" x2="${(pad + t.pos).toFixed(3)}" y2="${t.level === 0 ? 8 : t.level === 1 ? 5.5 : 3.5}" stroke="#000" stroke-width="${t.level === 0 ? 0.3 : 0.18}"/>` + (t.label ? `<text x="${(pad + t.pos).toFixed(3)}" y="11.5" font-size="2.6" text-anchor="middle" font-family="Arial,sans-serif">${t.label}</text>` : '')).join('')
  const W = len + pad * 2
  const size = forPrint ? `width="${W}mm" height="${h}mm"` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="0 0 ${W} ${h}"><rect x="0.2" y="0.2" width="${W - 0.4}" height="${h - 0.4}" fill="#fff" stroke="#000" stroke-width="0.3" rx="1"/>${lines}<text x="${pad}" y="18.5" font-size="3" font-family="Arial,sans-serif" font-weight="bold">1:${+n.toFixed(3)} scale · real ${unit}</text><text x="${W - pad}" y="18.5" font-size="2.4" text-anchor="end" font-family="Arial,sans-serif">print at 100% · check: ${len} mm overall tick span ≈ ${fmt(fromMm(len * n, unit), 4)} ${unit} real</text></svg>`
}

export default function ModelScaleConverter() {
  const [s, set] = useToolState('model-scale-converter', DEF)
  const [findReal, setFindReal] = useState({ real: 8.45, ru: 'm' as Unit, model: 241, mu: 'mm' as Unit })
  const n = s.n
  const editDim = (id: string, p: Partial<Dim>) => set({ dims: s.dims.map((d) => (d.id === id ? { ...d, ...p } : d)) })
  const fmtU = (mm: number, u: Unit) => `${fmt(fromMm(mm, u), 4)} ${u}`
  const groups = [...new Set(SCALES.map((x) => x.group))]
  const ratio = toMm(findReal.real, findReal.ru) / toMm(findReal.model, findReal.mu)
  const near = Number.isFinite(ratio) && ratio > 0 ? nearestScale(ratio) : null
  const svg = rulerSvg(n, s.rulerUnit, s.rulerLen, false)
  const printRuler = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><title>Scale ruler 1:${n}</title><style>@page{margin:10mm}body{margin:0;font-family:Arial}p{font-size:11px}</style><p>Print at 100% / “Actual size” (no fit-to-page). Measure the ruler with a real ruler to confirm.</p>${rulerSvg(n, s.rulerUnit, s.rulerLen, true)}<br><br>${rulerSvg(n, s.rulerUnit === 'm' ? 'ft' : 'm', s.rulerLen, true)}<script>setTimeout(()=>print(),300)</script>`)
    w.document.close()
  }

  return (
    <Split>
      <div>
        <Panel title="Scale">
          <Row>
            <Select label="Preset" value={String(SCALES.findIndex((x) => x.n === n))} onChange={(v) => { const sc = SCALES[Number(v)]; if (sc) set({ n: sc.n, custom: `1:${sc.n}` }) }}
              options={[['-1', 'Custom…'], ...groups.flatMap((g) => SCALES.map((x, i) => [x, i] as const).filter(([x]) => x.group === g).map(([x, i]) => [String(i), `${g}: 1:${x.n} — ${x.name}`] as [string, string]))]} />
            <Txt label="Ratio" value={s.custom} onChange={(custom) => { const p = parseScale(custom); set(p ? { custom, n: p } : { custom }) }} hint="e.g. 1:87, 1/35, 2:1" />
          </Row>
          {!parseScale(s.custom) && <Note tone="err">Enter a ratio like 1:72.</Note>}
          <Stats>
            <Stat label="1 real metre" value={`${fmt(1000 / n, 4)} mm`} tone="accent" sub="on the model" />
            <Stat label="1 real foot" value={`${fmt(12 / n, 4)} in`} sub={`${fmt(304.8 / n, 4)} mm`} />
            <Stat label="1 model mm" value={`${fmt(n / 1000, 4)} m`} sub={`${fmt(n / 304.8, 4)} ft real`} />
          </Stats>
        </Panel>
        <Panel title="Real ↔ model dimensions" actions={<CopyButton text={() => s.dims.map((d) => `${d.name}: ${fmtU(d.realMm, s.realUnit)} → ${fmtU(d.realMm / n, s.modelUnit)} at 1:${n}`).join('\n')} label="Copy" />}>
          <Row>
            <Select label="Real units" value={s.realUnit} onChange={(realUnit) => set({ realUnit })} options={UNIT_OPTS} />
            <Select label="Model units" value={s.modelUnit} onChange={(modelUnit) => set({ modelUnit })} options={UNIT_OPTS} />
            <Select label="Load subject" value="" onChange={(k) => SUBJECTS[k] && set({ dims: SUBJECTS[k].map((d) => ({ id: uid(), name: d.name, realMm: d.mm })) })} options={[['', 'Choose…'], ...Object.keys(SUBJECTS).map((k) => [k, k] as [string, string])]} />
          </Row>
          <Table
            head={['Dimension', `Real (${s.realUnit})`, `Model (${s.modelUnit})`, '']}
            rows={s.dims.map((d) => [
              <input key="n" style={cell} value={d.name} aria-label="Dimension name" onChange={(e) => editDim(d.id, { name: e.target.value })} />,
              <NumCell key="r" value={+fromMm(d.realMm, s.realUnit).toPrecision(8)} label="Real size" onChange={(v) => editDim(d.id, { realMm: toMm(v, s.realUnit) })} />,
              <NumCell key="m" value={+fromMm(d.realMm / n, s.modelUnit).toPrecision(6)} label="Model size" onChange={(v) => editDim(d.id, { realMm: toMm(v, s.modelUnit) * n })} />,
              <Btn key="x" kind="ghost" onClick={() => set({ dims: s.dims.filter((x) => x.id !== d.id) })}>✕</Btn>,
            ])}
          />
          <Btn onClick={() => set({ dims: [...s.dims, { id: uid(), name: 'New dimension', realMm: 1000 }] })}>＋ Dimension</Btn>
          <p className="k-hint">Edit either side — the other updates instantly.</p>
        </Panel>
        <Panel title="Convert between scales">
          <Row>
            <Num label="From 1:" value={s.from} onChange={(from) => from > 0 && set({ from })} />
            <Num label="To 1:" value={s.to} onChange={(to) => to > 0 && set({ to })} />
          </Row>
          <Note>Multiply model sizes by <b>{fmt(rescale(s.from, s.to), 5)}</b> ({fmt(rescale(s.from, s.to) * 100, 4)}% when scaling a print or drawing) to go from 1:{s.from} to 1:{s.to}.</Note>
        </Panel>
        <Panel title="Find the scale of a model">
          <Row>
            <Num label="Real size" value={findReal.real} onChange={(real) => setFindReal({ ...findReal, real })} />
            <Select label="" value={findReal.ru} onChange={(ru) => setFindReal({ ...findReal, ru })} options={UNIT_OPTS} />
            <Num label="Model size" value={findReal.model} onChange={(model) => setFindReal({ ...findReal, model })} />
            <Select label="" value={findReal.mu} onChange={(mu) => setFindReal({ ...findReal, mu })} options={UNIT_OPTS} />
          </Row>
          {near && <Note tone="ok">Scale ≈ <b>1:{fmt(ratio, 4)}</b> — nearest standard: 1:{near.n} ({near.name}). <button type="button" className="k-btn ghost" onClick={() => set({ n: ratio, custom: `1:${+ratio.toFixed(2)}` })}>Use it</button></Note>}
        </Panel>
      </div>
      <div>
        <Panel title={`Same subject in common scales`}>
          <Table
            head={['Scale', 'Use', ...s.dims.slice(0, 3).map((d) => d.name)]}
            rows={[...new Map(SCALES.map((x) => [x.n, x])).values()].sort((a, b) => a.n - b.n).map((x) => [
              <button key="s" type="button" className="k-btn ghost" style={{ padding: '1px 6px', fontWeight: x.n === n ? 800 : 500 }} onClick={() => set({ n: x.n, custom: `1:${x.n}` })}>1:{x.n}</button>,
              <span key="u" className="k-hint">{x.name}</span>,
              ...s.dims.slice(0, 3).map((d) => fmtU(d.realMm / x.n, s.modelUnit)),
            ])}
          />
        </Panel>
        <Panel title="Printable scale ruler" actions={<>
          <Btn kind="primary" onClick={printRuler}>🖨 Print</Btn>
          <Btn onClick={() => download(`scale-ruler-1-${n}.svg`, rulerSvg(n, s.rulerUnit, s.rulerLen, true), 'image/svg+xml')}>⬇ SVG</Btn>
        </>}>
          <Row>
            <Select label="Ruler marked in real" value={s.rulerUnit} onChange={(rulerUnit) => set({ rulerUnit })} options={UNIT_OPTS} />
            <Num label="Ruler length" value={s.rulerLen} onChange={(v) => set({ rulerLen: Math.max(20, Math.min(270, v)) })} unit="mm" min={20} max={270} />
          </Row>
          <div style={{ background: '#fff', borderRadius: 8, padding: 6, overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="k-hint">The printed SVG is sized in real millimetres. Print at 100% (“Actual size”), then hold it against your model: each labelled tick is a real-world {s.rulerUnit} at 1:{fmt(n, 5)}. The printout also includes a second ruler in {s.rulerUnit === 'm' ? 'ft' : 'm'}.</p>
        </Panel>
      </div>
    </Split>
  )
}
