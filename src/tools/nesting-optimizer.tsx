import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, Btn, Check, color, CsvButton, download, FileDrop, JsonButtons, Note, Num, Panel, Row, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { expand, loopsToParts, pack, parseDxf, partArea, SAMPLE_DXF, utilisation, type Layout, type Part, type Placed } from './lib/nesting-optimizer'

const DEF = {
  W: 2440, H: 1220, gap: 6, gens: 120, pop: 40,
  parts: [
    { id: 'p1', name: 'Side panel', w: 720, h: 560, qty: 4, rotate: true },
    { id: 'p2', name: 'Shelf', w: 764, h: 300, qty: 6, rotate: true },
    { id: 'p3', name: 'Door', w: 396, h: 716, qty: 4, rotate: false },
    { id: 'p4', name: 'Drawer front', w: 380, h: 140, qty: 8, rotate: true },
    { id: 'p5', name: 'Back rail', w: 764, h: 90, qty: 6, rotate: true },
  ] as Part[],
}
type S = typeof DEF

function pathOf(p: Part, pl: Placed): string {
  if (!p.outline) return ''
  const tr = ([x, y]: [number, number]): [number, number] => (pl.rot ? [pl.x + y, pl.y + (p.w - x)] : [pl.x + x, pl.y + (p.h - y)])
  return p.outline.map((loop) => 'M' + loop.map((q) => tr(q).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z').join(' ')
}

function SheetSvg({ s, sheet, idx }: { s: S; sheet: Placed[]; idx: number }) {
  return (
    <svg viewBox={`-4 -4 ${s.W + 8} ${s.H + 8}`} width="100%" style={{ display: 'block', background: 'var(--bg)', borderRadius: 6 }} data-sheet={idx}>
      <rect x={0} y={0} width={s.W} height={s.H} fill="none" stroke="var(--muted)" strokeWidth={Math.max(2, s.W / 600)} strokeDasharray="12 8" />
      {sheet.map((pl, i) => {
        const p = s.parts[pl.part]
        if (!p) return null
        const c = color(pl.part)
        const fs = Math.max(10, Math.min(pl.w, pl.h) / 6, s.W / 90)
        return (
          <g key={i}>
            <title>{`${p.name} ${p.w}×${p.h}${pl.rot ? ' (rotated)' : ''} @ ${pl.x.toFixed(0)}, ${pl.y.toFixed(0)}`}</title>
            {p.outline
              ? <><rect x={pl.x} y={pl.y} width={pl.w} height={pl.h} fill="none" stroke={c} strokeOpacity={0.35} strokeDasharray="6 6" /><path d={pathOf(p, pl)} fill={c} fillOpacity={0.55} fillRule="evenodd" stroke={c} strokeWidth={2} /></>
              : <rect x={pl.x} y={pl.y} width={pl.w} height={pl.h} fill={c} fillOpacity={0.55} stroke={c} strokeWidth={2} />}
            {Math.min(pl.w, pl.h) > fs * 1.4 && <text x={pl.x + pl.w / 2} y={pl.y + pl.h / 2} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill="currentColor">{p.name.length > 14 ? p.name.slice(0, 13) + '…' : p.name}{pl.rot ? ' ⟲' : ''}</text>}
          </g>
        )
      })}
    </svg>
  )
}

export default function NestingOptimizer() {
  const [s, set, reset] = useToolState('nesting-optimizer', DEF)
  const cfg = useMemo(() => ({ W: s.W, H: s.H, gap: s.gap }), [s.W, s.H, s.gap])
  const pieces = useMemo(() => expand(s.parts.filter((p) => p.w > 0 && p.h > 0)), [s.parts])
  const greedy = useMemo(() => {
    const order = [...pieces.keys()].sort((a, b) => pieces[b].w * pieces[b].h - pieces[a].w * pieces[a].h)
    return pack(pieces, order, pieces.map(() => false), cfg)
  }, [pieces, cfg])
  const key = JSON.stringify([s.parts, cfg])
  const [ga, setGa] = useState<{ key: string; layout: Layout; gen: number; gens: number; running: boolean } | null>(null)
  const worker = useRef<Worker | null>(null)
  const stop = () => { worker.current?.terminate(); worker.current = null; setGa((g) => (g ? { ...g, running: false } : g)) }
  useEffect(() => () => worker.current?.terminate(), [])
  const run = () => {
    stop()
    if (!pieces.length) return
    const w = new Worker(new URL('./lib/nesting-optimizer.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    const k = key
    setGa({ key: k, layout: greedy, gen: 0, gens: s.gens, running: true })
    w.onmessage = (e: MessageEvent<{ type: string; gen: number; gens: number; best: Layout }>) => {
      const d = e.data
      setGa({ key: k, layout: d.best, gen: d.type === 'done' ? d.gens : d.gen, gens: d.gens, running: d.type !== 'done' })
      if (d.type === 'done') { w.terminate(); worker.current = null }
    }
    w.postMessage({ pieces, cfg, gens: s.gens, pop: s.pop, seed: (Math.random() * 1e9) | 0 })
  }
  const fresh = ga && ga.key === key
  const layout = fresh && ga.layout.score <= greedy.score ? ga.layout : greedy
  const u = utilisation(layout, s.parts, cfg)
  const edit = (id: string, p: Partial<Part>) => set({ parts: s.parts.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const unplacedNames = [...new Set(layout.unplaced.map((i) => s.parts[pieces[i].part]?.name))]
  const totalArea = s.parts.reduce((a, p) => a + partArea(p) * p.qty, 0)

  const exportSvg = () => {
    const gapY = 60
    const body = layout.sheets.map((sh, k) => {
      const y0 = k * (s.H + gapY)
      const items = sh.map((pl) => {
        const p = s.parts[pl.part]
        const c = color(pl.part)
        const shape = p.outline ? `<path d="${pathOf(p, pl)}" fill="${c}" fill-opacity="0.5" fill-rule="evenodd" stroke="${c}"/>` : `<rect x="${pl.x}" y="${pl.y}" width="${pl.w}" height="${pl.h}" fill="${c}" fill-opacity="0.5" stroke="${c}"/>`
        return shape
      }).join('')
      return `<g transform="translate(0,${y0})"><rect width="${s.W}" height="${s.H}" fill="none" stroke="#000" stroke-dasharray="10 6"/>${items}<text x="0" y="-12" font-size="28" font-family="sans-serif">Sheet ${k + 1}</text></g>`
    }).join('')
    const H = layout.sheets.length * (s.H + gapY)
    download('nesting.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -50 ${s.W + 20} ${H + 50}" width="${s.W}mm" height="${(H + 50) * (s.W / (s.W + 20))}mm">${body}</svg>`, 'image/svg+xml')
  }

  return (
    <div>
      <Stats>
        <Stat label="Sheets" value={layout.sheets.length} sub={ga?.running ? `searching… gen ${ga.gen}` : fresh ? `GA best after ${ga.gens} gens` : 'greedy (largest first)'} tone="accent" />
        <Stat label="Utilisation" value={`${(u.util * 100).toFixed(1)}%`} sub={`${(u.utilStrip * 100).toFixed(1)}% excl. remnant`} tone={u.util > 0.75 ? 'good' : undefined} />
        <Stat label="Waste" value={`${((u.total - u.used) / 1e6).toFixed(2)} m²`} sub={`remnant strip ${u.remnant.toFixed(0)} mm`} />
        <Stat label="Parts" value={pieces.length} sub={`${(totalArea / 1e6).toFixed(2)} m² net`} />
      </Stats>
      {layout.unplaced.length > 0 && <Note tone="err">{layout.unplaced.length} piece(s) larger than the sheet: {unplacedNames.join(', ')}</Note>}
      <Split wide="right">
        <div>
          <Panel title="Sheet" actions={<Btn kind="ghost" onClick={() => { stop(); reset() }}>Reset</Btn>}>
            <Row>
              <Num label="Width" unit="mm" value={s.W} min={10} onChange={(W) => set({ W })} />
              <Num label="Height" unit="mm" value={s.H} min={10} onChange={(H) => set({ H })} />
              <Num label="Gap / kerf" unit="mm" value={s.gap} min={0} onChange={(gap) => set({ gap })} />
            </Row>
            <Row>
              {[['4×8 ft ply', 2440, 1220], ['Euro 2500×1250', 2500, 1250], ['MDF 2800×2070', 2800, 2070], ['Laser 1000×600', 1000, 600]].map(([n, W, H]) => (
                <Btn key={n} onClick={() => set({ W: W as number, H: H as number })}>{n}</Btn>
              ))}
            </Row>
          </Panel>
          <Panel title="Genetic search (Web Worker)">
            <Row>
              <Slider label="Generations" value={s.gens} min={10} max={600} step={10} onChange={(gens) => set({ gens })} />
              <Slider label="Population" value={s.pop} min={10} max={120} step={2} onChange={(pop) => set({ pop })} />
            </Row>
            <Row>
              <Btn kind="primary" disabled={!!ga?.running || !pieces.length} onClick={run}>▶ Optimise</Btn>
              {ga?.running && <Btn kind="danger" onClick={stop}>■ Stop</Btn>}
            </Row>
            {ga?.running && <div style={{ marginTop: 8 }}><Bar value={ga.gen / ga.gens} /><span className="muted" style={{ fontSize: 12 }}>generation {ga.gen} / {ga.gens}</span></div>}
            <Note>Chromosome = part order + rotation flags; each one is decoded by a MaxRects best-short-side-fit packer. Fitness = sheets used, then strip length on the last sheet. The greedy (largest-first) layout is shown until you optimise.</Note>
          </Panel>
        </div>
        <Panel title={`Layout — ${layout.sheets.length} sheet${layout.sheets.length === 1 ? '' : 's'}`} actions={<>
          <Btn onClick={exportSvg}>⬇ SVG</Btn>
          <CsvButton name="nesting-placements.csv" rows={() => [['Sheet', 'Part', 'X', 'Y', 'Width', 'Height', 'Rotated'], ...layout.sheets.flatMap((sh, k) => sh.map((pl) => [k + 1, s.parts[pl.part]?.name ?? '', +pl.x.toFixed(1), +pl.y.toFixed(1), pl.w, pl.h, pl.rot ? 'yes' : 'no']))]} />
        </>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
            {layout.sheets.map((sh, k) => {
              const used = sh.reduce((a, pl) => a + partArea(s.parts[pl.part]), 0)
              return (
                <div key={k}>
                  <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}><b>Sheet {k + 1}</b> · {sh.length} parts · {((used / (s.W * s.H)) * 100).toFixed(1)}% used</div>
                  <SheetSvg s={s} sheet={sh} idx={k} />
                </div>
              )
            })}
          </div>
        </Panel>
      </Split>
      <Panel title="Parts" actions={<>
        <Btn onClick={() => set({ parts: [...s.parts, { id: uid(), name: `Part ${s.parts.length + 1}`, w: 300, h: 200, qty: 2, rotate: true }] })}>+ Part</Btn>
        <JsonButtons name="nesting-job.json" data={s} onLoad={(d) => set(d)} />
      </>}>
        <FileDrop accept=".dxf" onFiles={async ([f]) => {
          const parts = loopsToParts(parseDxf(await f.text()), f.name.replace(/\.dxf$/i, ''))
          if (parts.length) set({ parts: [...s.parts, ...parts] })
        }} label="Drop a DXF (closed polylines, circles, chained lines/arcs) to import outlines" />
        <Row><Btn onClick={() => set({ parts: [...s.parts, ...loopsToParts(parseDxf(SAMPLE_DXF), 'Demo').map((p) => ({ ...p, qty: 6, id: uid() }))] })}>Add demo DXF parts</Btn></Row>
        <Table head={['', 'Name', 'Width', 'Height', 'Qty', 'Rotate', 'Area', '']} rows={s.parts.map((p, i) => [
          <span key="c" style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: color(i) }} />,
          <input key="n" value={p.name} aria-label="Name" style={{ width: 140 }} onChange={(e) => edit(p.id, { name: e.target.value })} />,
          p.outline ? `${p.w}` : <input key="w" type="number" min={1} value={p.w} aria-label="Width" style={{ width: 80 }} onChange={(e) => edit(p.id, { w: Math.max(1, Number(e.target.value) || 1) })} />,
          p.outline ? `${p.h}` : <input key="h" type="number" min={1} value={p.h} aria-label="Height" style={{ width: 80 }} onChange={(e) => edit(p.id, { h: Math.max(1, Number(e.target.value) || 1) })} />,
          <input key="q" type="number" min={0} value={p.qty} aria-label="Quantity" style={{ width: 60 }} onChange={(e) => edit(p.id, { qty: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />,
          <Check key="r" label="" value={p.rotate} onChange={(rotate) => edit(p.id, { rotate })} />,
          `${(partArea(p) / 1e4).toFixed(1)} dm²${p.outline ? ' (outline)' : ''}`,
          <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ parts: s.parts.filter((x) => x.id !== p.id) })}>✕</Btn>,
        ])} />
      </Panel>
    </div>
  )
}
