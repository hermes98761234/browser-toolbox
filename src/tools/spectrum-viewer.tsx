import { useMemo, useState } from 'react'
import { Btn, Check, color, CsvButton, download, FileDrop, fmt, LineChart, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, toCsv, useToolState, type Series } from '../kit'
import { alsBaseline, encodeDifDup, findPeaks, normalize, parseCsvSpectra, parseJcamp, polyBaseline, sampleIr, savgol, type Norm, type Spectrum } from './lib/spectrum-viewer'

interface Loaded extends Spectrum { id: string; file: string; on: boolean }

function samples(): Loaded[] {
  const { x, t } = sampleIr()
  const yf = 0.01
  const jdx = ['##TITLE=Ethyl acetate (synthetic, film)', '##JCAMP-DX=4.24', '##DATA TYPE=INFRARED SPECTRUM', '##XUNITS=1/CM', '##YUNITS=TRANSMITTANCE', '##XFACTOR=1', `##YFACTOR=${yf}`, `##FIRSTX=${x[0]}`, `##LASTX=${x[x.length - 1]}`, `##NPOINTS=${x.length}`, '##XYDATA=(X++(Y..Y))', ...encodeDifDup(x[0], x[1] - x[0], t.map((v) => Math.round(v / yf))), '##END='].join('\n')
  const a = parseJcamp(jdx).map((s, i) => ({ ...s, id: `s${i}`, file: 'ethyl-acetate.jdx (DIFDUP)', on: true }))
  // "wet" sample as CSV: broad O–H stretch and H–O–H bend, plus a curved baseline
  const csv = ['wavenumber,wet sample %T', ...x.map((w, i) => {
    const extra = 0.5 / (1 + ((w - 3400) / 160) ** 2) + 0.18 / (1 + ((w - 1640) / 30) ** 2) + 0.06 * ((4000 - w) / 3600) ** 2
    return `${w},${(t[i] * Math.pow(10, -extra)).toFixed(2)}`
  })].join('\n')
  const b = parseCsvSpectra(csv, 'wet sample').map((s, i) => ({ ...s, xUnits: '1/CM', yUnits: 'TRANSMITTANCE', id: `c${i}`, file: 'wet-sample.csv', on: true }))
  return [...a, ...b]
}

const DEF = { toAbs: true, baseline: 'als' as 'none' | 'als' | 'poly', lambda: 5, p: 0.01, degree: 3, smooth: 0, norm: 'max' as Norm, prom: 5, offset: 0, showBase: false, lo: 0, hi: 0, peaksOf: 0 }

export default function SpectrumViewer() {
  const [s, set, reset] = useToolState('spectrum-viewer', DEF)
  const [specs, setSpecs] = useState<Loaded[]>(samples)
  const [err, setErr] = useState('')
  const [jcampText, setJcampText] = useState<string>('')

  const load = async (fs: File[]) => {
    setErr('')
    const add: Loaded[] = []
    for (const f of fs) {
      try {
        const txt = await f.text()
        const isJ = /^\s*##/m.test(txt.slice(0, 2000))
        const sp = isJ ? parseJcamp(txt) : parseCsvSpectra(txt, f.name.replace(/\.\w+$/, ''))
        if (isJ) setJcampText(txt.slice(0, 1500))
        if (!sp.some((x) => x.x.length)) throw new Error('no spectral data found')
        sp.filter((x) => x.x.length).forEach((x, i) => add.push({ ...x, id: `${Date.now()}-${f.name}-${i}`, file: f.name, on: true }))
      } catch (e) {
        setErr(`${f.name}: ${(e as Error).message}`)
      }
    }
    if (add.length) setSpecs((old) => [...old.filter((o) => !o.id.startsWith('s') && !o.id.startsWith('c')), ...add].slice(-12))
  }

  const proc = useMemo(
    () =>
      specs.map((sp) => {
        const isT = /TRANSMIT/i.test(sp.yUnits)
        let y = sp.y.slice()
        let units = sp.yUnits
        if (isT && s.toAbs) {
          const pctT = Math.max(...y) > 1.5
          y = y.map((v) => -Math.log10(Math.max(1e-6, pctT ? v / 100 : v)))
          units = 'ABSORBANCE'
        }
        if (s.smooth >= 5) y = savgol(y, s.smooth)
        const down = /TRANSMIT/i.test(units)
        const base = s.baseline === 'none' ? null : s.baseline === 'als' ? alsBaseline(down ? y.map((v) => -v) : y, 10 ** s.lambda, s.p).map((v) => (down ? -v : v)) : (() => {
          const b = polyBaseline(sp.x, down ? y.map((v) => -v) : y, s.degree)
          return down ? b.map((v) => -v) : b
        })()
        const corr = base ? y.map((v, i) => v - base[i]) : y
        const n = normalize(sp.x, corr, s.norm)
        return { sp, y: n, base, units, down }
      }),
    [specs, s.toAbs, s.smooth, s.baseline, s.lambda, s.p, s.degree, s.norm],
  )

  const shown = proc.filter((p) => p.sp.on)
  const reverse = shown.some((p) => /1\/CM|PPM|WAVENUMBER/i.test(p.sp.xUnits))
  const allX = shown.flatMap((p) => [Math.min(...p.sp.x), Math.max(...p.sp.x)])
  const xMin = s.lo || s.hi ? Math.min(s.lo, s.hi) : Math.min(...allX)
  const xMax = s.lo || s.hi ? Math.max(s.lo, s.hi) : Math.max(...allX)
  const X = (v: number) => (reverse ? -v : v)
  const sel = proc[Math.min(s.peaksOf, proc.length - 1)]
  const peaks = useMemo(() => (sel ? findPeaks(sel.sp.x, sel.y, s.prom / 100, 3, sel.down).filter((p) => p.x >= xMin && p.x <= xMax) : []), [sel, s.prom, xMin, xMax])
  const top = [...peaks].sort((a, b) => b.prominence - a.prominence).slice(0, 8)
  const inView = (x: number) => x >= xMin && x <= xMax
  const series: Series[] = shown.flatMap((p, k) => {
    const idx = proc.indexOf(p)
    const off = k * s.offset
    const out: Series[] = [{ name: p.sp.title, points: p.sp.x.flatMap((x, i) => (inView(x) ? [[X(x), p.y[i] + off] as [number, number]] : [])), color: color(idx) }]
    const base = p.base
    if (s.showBase && base && s.norm === 'none') out.push({ name: `${p.sp.title} baseline`, points: p.sp.x.flatMap((x, i) => (inView(x) ? [[X(x), base[i] + off] as [number, number]] : [])), color: color(idx), dashed: true })
    return out
  })
  const units = shown[0]?.sp.xUnits || 'x'

  return (
    <Split wide="right">
      <div>
        <Panel title="Spectra" actions={<Btn kind="ghost" onClick={() => { setSpecs(samples()); reset() }}>Samples</Btn>}>
          <FileDrop multiple accept=".jdx,.dx,.jcamp,.jcm,.csv,.tsv,.txt" onFiles={load} label="Drop JCAMP-DX (.jdx/.dx) or CSV files" />
          {err && <Note tone="err">{err}</Note>}
          {specs.map((sp, i) => (
            <Row key={sp.id} wrap={false}>
              <Check label={<span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: color(i), marginRight: 6 }} />{sp.title}</span>} value={sp.on} onChange={(on) => setSpecs(specs.map((x) => (x.id === sp.id ? { ...x, on } : x)))} />
              <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>{sp.x.length} pts</span>
              <Btn kind="ghost" onClick={() => setSpecs(specs.filter((x) => x.id !== sp.id))} title="Remove">✕</Btn>
            </Row>
          ))}
        </Panel>
        <Panel title="Processing">
          <Check label="Convert transmittance → absorbance (A = −log₁₀T)" value={s.toAbs} onChange={(toAbs) => set({ toAbs })} />
          <Select label="Baseline correction" value={s.baseline} onChange={(baseline) => set({ baseline })} options={[['none', 'None'], ['als', 'Asymmetric least squares (ALS)'], ['poly', 'Iterative polynomial (modpoly)']]} />
          {s.baseline === 'als' && (
            <Row>
              <Slider label="Smoothness log₁₀λ" value={s.lambda} min={2} max={9} step={0.5} onChange={(lambda) => set({ lambda })} />
              <Slider label="Asymmetry p" value={s.p} min={0.001} max={0.1} step={0.001} onChange={(p) => set({ p })} show={(v) => v.toFixed(3)} />
            </Row>
          )}
          {s.baseline === 'poly' && <Slider label="Polynomial degree" value={s.degree} min={1} max={8} onChange={(degree) => set({ degree })} />}
          <Slider label="Savitzky–Golay smoothing window" value={s.smooth} min={0} max={41} step={2} onChange={(smooth) => set({ smooth: smooth < 5 ? 0 : smooth | 1 })} show={(v) => (v < 5 ? 'off' : `${v | 1} pts`)} />
          <Select label="Normalisation" value={s.norm} onChange={(norm) => set({ norm })} options={[['none', 'None'], ['max', 'Max = 1'], ['minmax', 'Min–max (0…1)'], ['area', 'Unit area'], ['l2', 'Unit vector (L2)'], ['snv', 'SNV (mean 0, sd 1)']]} />
          <Check label="Show baseline (when not normalised)" value={s.showBase} onChange={(showBase) => set({ showBase })} />
        </Panel>
        <Panel title="View">
          <Row>
            <Num label="From" value={s.lo} onChange={(lo) => set({ lo })} unit={units} />
            <Num label="To" value={s.hi} onChange={(hi) => set({ hi })} unit={units} />
          </Row>
          <Slider label="Stack offset" value={s.offset} min={0} max={2} step={0.05} onChange={(offset) => set({ offset })} />
          <p className="muted">From = To = 0 shows the full range. Wavenumber and ppm axes run high → low, as is customary.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Spectra shown" value={`${shown.length} / ${specs.length}`} />
          <Stat label="Range" value={`${fmt(xMin, 4)} – ${fmt(xMax, 4)}`} sub={units} />
          <Stat label="Peaks found" value={peaks.length} sub={sel ? sel.sp.title : ''} />
          <Stat label="Strongest" value={top[0] ? fmt(top[0].x, 5) : '—'} sub={units} tone="accent" />
        </Stats>
        <Panel
          title="Overlay"
          actions={<CsvButton name="spectra-processed.csv" rows={() => shown.flatMap((p) => [[`# ${p.sp.title}`], ['x', p.units || 'y'], ...p.sp.x.map((x, i) => [x, +p.y[i].toPrecision(7)])])} />}
        >
          {series.length ? (
            <LineChart series={series} height={360} xMin={reverse ? -xMax : xMin} xMax={reverse ? -xMin : xMax} fx={(v) => fmt(Math.abs(v), 4)} fy={(v) => fmt(v, 3)} xLabel={units} markers={top.map((p) => ({ x: X(p.x), label: fmt(p.x, 4) }))} />
          ) : (
            <Note>Tick at least one spectrum.</Note>
          )}
          <p className="muted">{shown[0] ? `y: ${proc.find((p) => p.sp.on)?.units || 'intensity'}${s.norm !== 'none' ? ' (normalised)' : ''}` : ''}. Dashed lines mark the 8 most prominent peaks of the selected spectrum.</p>
        </Panel>
        <Panel
          title="Peak picking"
          actions={sel && <Btn onClick={() => download('peaks.csv', toCsv([['x', 'y', 'prominence', 'FWHM'], ...peaks.map((p) => [+p.x.toFixed(4), +p.y.toPrecision(6), +p.prominence.toPrecision(4), +p.fwhm.toFixed(3)])]), 'text/csv')}>⬇ Peaks CSV</Btn>}
        >
          <Row>
            <Select label="Spectrum" value={Math.min(s.peaksOf, proc.length - 1)} onChange={(peaksOf) => set({ peaksOf })} options={proc.map((p, i) => [i, p.sp.title] as const)} />
            <Slider label="Min. prominence" value={s.prom} min={1} max={50} onChange={(prom) => set({ prom })} unit="%" />
          </Row>
          <Table head={['Position', 'Height', 'Prominence', 'FWHM']} rows={peaks.map((p) => [<b key="x">{fmt(p.x, 5)}</b>, fmt(p.y, 4), fmt(p.prominence, 3), fmt(p.fwhm, 3)])} max={40} />
          {sel?.sp.peaks && <Note>The file also contains a peak table with {sel.sp.peaks.length} entries.</Note>}
        </Panel>
        <Panel title="File details">
          <Table head={['Spectrum', 'File', 'Type', 'X units', 'Y units', 'Points']} rows={specs.map((sp) => [sp.title, sp.file, sp.dataType || '—', sp.xUnits || '—', sp.yUnits || '—', sp.x.length])} />
          {jcampText && <pre className="mono" style={{ fontSize: 11, maxHeight: 160, overflow: 'auto', background: 'var(--bg)', padding: 8, borderRadius: 8 }}>{jcampText}</pre>}
          <Note>JCAMP-DX 4.24/5: AFFN, PAC and the compressed ASDF forms (SQZ, DIF, DUP with Y-checks) in XYDATA, plus XYPOINTS and PEAK TABLE blocks. Multi-block files load every block. NTUPLES (NMR FID) is not supported.</Note>
        </Panel>
      </div>
    </Split>
  )
}
