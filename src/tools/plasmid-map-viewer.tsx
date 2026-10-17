import { useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, CopyButton, CsvButton, download, FileDrop, Note, num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { digest, ENZYMES, findSites, gcWindows, translate, wrap } from './lib/dna-sequence-toolkit'
import { columnLabels, featureSeq, lanes, parseAny, sampleGenBank, span, type Feature } from './lib/plasmid-map-viewer'

const SAMPLE = sampleGenBank()
const TYPE_COLOR: Record<string, string> = {
  CDS: '#6366f1', gene: '#818cf8', promoter: '#10b981', terminator: '#ef4444', rep_origin: '#f59e0b', misc_feature: '#64748b',
  protein_bind: '#14b8a6', primer_bind: '#a855f7', RBS: '#ec4899', regulatory: '#0ea5e9', polyA_signal: '#f97316', enhancer: '#84cc16',
}
const fcolor = (t: string) => TYPE_COLOR[t] ?? '#94a3b8'

const DEF = { text: SAMPLE, mode: 'unique' as 'unique' | 'twice' | 'custom' | 'none', custom: ['EcoRI', 'BamHI'] as string[], gc: true, rotate: 0, digestOn: ['EcoRI', 'HindIII'] as string[] }

const S = 600, C = S / 2, R = 178

export default function PlasmidMapViewer() {
  const [s, set, reset] = useToolState('plasmid-map-viewer', DEF)
  const [sel, setSel] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const rec = useMemo(() => parseAny(s.text), [s.text])
  const L = rec.seq.length || rec.length
  const hits = useMemo(() => (rec.seq ? findSites(rec.seq, ENZYMES, rec.circular) : []), [rec])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of hits) m.set(h.enzyme, (m.get(h.enzyme) ?? 0) + 1)
    return m
  }, [hits])
  const shownHits = hits.filter((h) => (s.mode === 'unique' ? counts.get(h.enzyme) === 1 : s.mode === 'twice' ? (counts.get(h.enzyme) ?? 0) <= 2 : s.mode === 'custom' ? s.custom.includes(h.enzyme) : false))
  const feats = rec.features.filter((f) => f.type !== 'source')
  const lane = useMemo(() => lanes(feats, L || 1, Math.ceil((L || 1) / 200)), [feats, L])
  const gc = useMemo(() => (s.gc && rec.seq.length > 100 ? gcWindows(rec.seq, Math.max(20, Math.round(rec.seq.length / 120)), Math.max(5, Math.round(rec.seq.length / 240))) : []), [rec.seq, s.gc])
  const gcMean = rec.seq ? (rec.seq.match(/[GCS]/g)?.length ?? 0) / rec.seq.length : 0

  const ang = (bp: number) => ((bp - 1) / (L || 1)) * Math.PI * 2 - Math.PI / 2 + (s.rotate * Math.PI) / 180
  const pt = (a: number, r: number) => [C + r * Math.cos(a), C + r * Math.sin(a)] as const
  const arc = (a0: number, a1: number, r: number, sweep = 1) => {
    const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r)
    const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0
    return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r},${r} 0 ${large} ${sweep} ${x1.toFixed(2)},${y1.toFixed(2)}`
  }
  const featPath = (f: Feature, rMid: number, w: number) => {
    const { start, size } = span(f, L)
    let a0 = ang(start), a1 = ang(start + size)
    if (size >= L) a1 = a0 + Math.PI * 2 - 1e-3
    const head = Math.min(Math.abs(a1 - a0) * 0.5, 9 / rMid)
    const ro = rMid + w / 2, ri = rMid - w / 2
    const P = (a: number, r: number) => pt(a, r).map((v) => v.toFixed(2)).join(',')
    const large = (x: number, y: number) => (Math.abs(y - x) > Math.PI ? 1 : 0)
    if (f.strand === 1) {
      const b = a1 - head
      return `M${P(a0, ro)}A${ro},${ro} 0 ${large(a0, b)} 1 ${P(b, ro)}L${P(a1, rMid)}L${P(b, ri)}A${ri},${ri} 0 ${large(a0, b)} 0 ${P(a0, ri)}Z`
    }
    if (f.strand === -1) {
      const b = a0 + head
      return `M${P(a0, rMid)}L${P(b, ro)}A${ro},${ro} 0 ${large(b, a1)} 1 ${P(a1, ro)}L${P(a1, ri)}A${ri},${ri} 0 ${large(b, a1)} 0 ${P(b, ri)}Z`
    }
    return `M${P(a0, ro)}A${ro},${ro} 0 ${large(a0, a1)} 1 ${P(a1, ro)}L${P(a1, ri)}A${ri},${ri} 0 ${large(a0, a1)} 0 ${P(a0, ri)}Z`
  }

  // outside labels: restriction sites plus features too small to carry their name on the arc
  const fits = (f: Feature, i: number) => {
    const { size } = span(f, L)
    return (size / (L || 1)) * Math.PI * 2 * (R - 30 - lane[i] * 19) > f.label.length * 6.2 + 14
  }
  const outside = [
    ...shownHits.map((h) => ({ a: ang(h.pos), key: `${h.enzyme}${h.pos}${h.strand}`, text: h.enzyme, sub: `(${h.pos})`, color: 'currentColor', r0: R + 1, fi: -1 })),
    ...feats.map((f, i) => ({ f, i })).filter(({ f, i }) => !fits(f, i)).map(({ f, i }) => { const sp = span(f, L); return { a: ang(sp.start + sp.size / 2), key: `f${i}`, text: f.label, sub: '', color: fcolor(f.type), r0: R - 30 - lane[i] * 19 + 7, fi: i } }),
  ]
  const placed = columnLabels(outside.map((o) => o.a), C, C, R + 40, 13, 14, S - 14)
  const step = [50, 100, 250, 500, 1000, 2000, 5000, 10000].find((v) => L / v <= 12) ?? 20000
  const selF = sel !== null ? feats[sel] : null
  const selSeq = selF ? featureSeq(selF, rec.seq) : ''
  const cuts = hits.filter((h) => s.digestOn.includes(h.enzyme)).map((h) => h.cut)
  const frags = rec.seq ? digest(L, cuts, rec.circular) : []

  const svgText = () => {
    const el = svgRef.current
    if (!el) return ''
    return new XMLSerializer().serializeToString(el).replace(/currentColor/g, '#1e293b').replace(/var\(--line\)/g, '#cbd5e1').replace(/var\(--muted\)/g, '#64748b')
  }
  const savePng = () => {
    const img = new Image()
    img.onload = () => {
      const cv = document.createElement('canvas')
      cv.width = (S + 160) * 2
      cv.height = (S - 20) * 2
      const ctx = cv.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.drawImage(img, 0, 0, cv.width, cv.height)
      cv.toBlob((b) => b && download(`${rec.name}.png`, b, 'image/png'))
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText())
  }
  const toggle = (list: string[], e: string) => (list.includes(e) ? list.filter((x) => x !== e) : [...list, e])

  return (
    <Split wide="right">
      <div>
        <Panel title="Sequence (GenBank, FASTA or raw)" actions={<><Btn onClick={() => { set({ text: SAMPLE }); setSel(null) }}>Demo vector</Btn><Btn kind="ghost" onClick={() => { reset(); setSel(null) }}>Reset</Btn></>}>
          <FileDrop accept=".gb,.gbk,.genbank,.ape,.fa,.fasta,.txt,.seq" label="Drop a .gb / .gbk / FASTA file" onFiles={async ([f]) => { set({ text: await f.text() }); setSel(null) }} />
          <Area value={s.text} onChange={(text) => { set({ text }); setSel(null) }} rows={8} mono />
          {rec.warnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}
          {!rec.seq && <Note tone="err">No sequence found. Paste a GenBank record (with ORIGIN) or a FASTA sequence.</Note>}
          <p className="muted" style={{ fontSize: 12 }}>The demo is a synthetic GFP vector built for illustration (its sequence is generated, not a real plasmid). Data stays in your browser.</p>
        </Panel>
        <Panel title="Restriction sites">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['unique', 'Unique cutters'], ['twice', '≤ 2 sites'], ['custom', 'Chosen'], ['none', 'None']]} />
          {s.mode === 'custom' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {ENZYMES.map(([e]) => <Btn key={e} kind={s.custom.includes(e) ? 'primary' : 'normal'} onClick={() => set({ custom: toggle(s.custom, e) })}>{e} <span style={{ opacity: 0.6 }}>{counts.get(e) ?? 0}</span></Btn>)}
            </div>
          )}
          <p className="muted" style={{ fontSize: 12 }}>Non-cutters: {ENZYMES.filter(([e]) => !counts.get(e)).map(([e]) => e).join(', ') || 'none'}.</p>
        </Panel>
        <Panel title="Virtual digest">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {ENZYMES.filter(([e]) => counts.get(e)).map(([e]) => <Btn key={e} kind={s.digestOn.includes(e) ? 'primary' : 'normal'} onClick={() => set({ digestOn: toggle(s.digestOn, e) })}>{e}</Btn>)}
          </div>
          {s.digestOn.length > 0 && frags.length > 0 && (
            <div style={{ display: 'flex', gap: 16, marginTop: 10, alignItems: 'flex-start' }}>
              <svg width={70} height={220} style={{ background: '#0f172a', borderRadius: 8, flex: 'none' }} role="img" aria-label="gel">
                {[10000, 5000, 3000, 2000, 1500, 1000, 500, 250].map((m) => { const y = 20 + (Math.log10(10000) - Math.log10(m)) / (Math.log10(10000) - Math.log10(100)) * 190; return <rect key={m} x={8} y={y} width={20} height={2} fill="#64748b" /> })}
                {frags.map((f, i) => { const y = 20 + (Math.log10(10000) - Math.log10(Math.max(100, f))) / (Math.log10(10000) - Math.log10(100)) * 190; return <rect key={i} x={40} y={y} width={22} height={3} fill="#f8fafc" opacity={0.9} /> })}
              </svg>
              <Table head={['Fragment', 'Size (bp)']} rows={frags.map((f, i) => [i + 1, num(f, 0)])} />
            </div>
          )}
          <p className="muted" style={{ fontSize: 12 }}>Simulated 1 % agarose gel (left lane: ladder 10 kb → 250 bp).</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label={rec.name} value={`${num(L, 0)} bp`} sub={rec.circular ? 'circular' : 'linear'} tone="accent" />
          <Stat label="Features" value={feats.length} sub={`${feats.filter((f) => f.type === 'CDS').length} CDS`} />
          <Stat label="GC content" value={`${num(gcMean * 100, 1)} %`} />
          <Stat label="Unique cutters" value={[...counts.values()].filter((c) => c === 1).length} sub={`of ${ENZYMES.length} enzymes`} />
        </Stats>
        <Panel title="Plasmid map" actions={<><Btn onClick={() => download(`${rec.name}.svg`, svgText(), 'image/svg+xml')}>⬇ SVG</Btn><Btn onClick={savePng}>⬇ PNG</Btn></>}>
          <Row>
            <Slider label="Rotate" value={s.rotate} onChange={(rotate) => set({ rotate })} min={0} max={355} step={5} unit="°" show={(v) => v.toFixed(0)} />
            <Check label="GC ring" value={s.gc} onChange={(v) => set({ gc: v })} />
          </Row>
          <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`-80 10 ${S + 160} ${S - 20}`} style={{ width: '100%', maxWidth: 760, display: 'block', margin: '0 auto', color: 'var(--fg, #1e293b)' }} fontFamily="system-ui, sans-serif">
            <circle cx={C} cy={C} r={R} fill="none" stroke="currentColor" strokeWidth={2.5} opacity={0.75} />
            <circle cx={C} cy={C} r={R - 4} fill="none" stroke="currentColor" strokeWidth={0.8} opacity={0.4} />
            {Array.from({ length: Math.floor(L / step) + 1 }, (_, k) => k * step).filter((b) => b < L).map((b) => {
              const a = ang(b + 1)
              const [x0, y0] = pt(a, R + 2), [x1, y1] = pt(a, R + 8), [tx, ty] = pt(a, R - 16)
              return <g key={b}><line x1={x0} y1={y0} x2={x1} y2={y1} stroke="currentColor" opacity={0.6} /><text x={tx} y={ty + 3} fontSize={9} textAnchor="middle" fill="currentColor" opacity={0.55}>{b === 0 ? '1' : b >= 1000 ? `${b / 1000}k` : b}</text></g>
            })}
            {gc.length > 0 && gc.map(([p, g], i) => {
              const a = ang(p)
              const r0 = 92, h = (g - gcMean) * 120
              const [x0, y0] = pt(a, r0), [x1, y1] = pt(a, r0 + h)
              return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={h >= 0 ? '#0ea5e9' : '#f59e0b'} strokeWidth={2} opacity={0.7} />
            })}
            {feats.map((f, i) => {
              const rMid = R - 30 - lane[i] * 19
              const on = sel === i
              const { start, size } = span(f, L)
              const a0 = ang(start), a1 = ang(start + size)
              const mid = (a0 + a1) / 2
              const flip = Math.sin(mid) > 0.05 // bottom half: draw text path reversed so it reads left-to-right
              const id = `fp${i}`
              return (
                <g key={i} style={{ cursor: 'pointer' }} onClick={() => setSel(on ? null : i)}>
                  <path d={featPath(f, rMid, 13)} fill={fcolor(f.type)} stroke={on ? 'currentColor' : 'none'} strokeWidth={2} opacity={sel === null || on ? 0.92 : 0.45}><title>{`${f.label} (${f.type}) ${f.segs.map((x) => x.join('..')).join(',')}`}</title></path>
                  {fits(f, i) ? (
                    <>
                      <path id={id} d={flip ? arc(a1 - 2 / rMid, a0, rMid - 3.5, 0) : arc(a0, a1, rMid + 3.5)} fill="none" />
                      <text fontSize={9.5} fontWeight={600} fill="#fff"><textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{f.label}</textPath></text>
                    </>
                  ) : null}
                </g>
              )
            })}
            {outside.map((o, i) => {
              const p = placed[i]
              const [x0, y0] = pt(o.a, o.r0), [x1, y1] = pt(o.a, R + 12)
              return (
                <g key={o.key} style={o.fi >= 0 ? { cursor: 'pointer' } : undefined} onClick={o.fi >= 0 ? () => setSel(o.fi) : undefined}>
                  <polyline points={`${x0},${y0} ${x1},${y1} ${p.x + (p.right ? -3 : 3)},${p.y}`} fill="none" stroke={o.color} strokeWidth={0.8} opacity={0.6} />
                  <text x={p.x} y={p.y + 3.5} fontSize={10} textAnchor={p.right ? 'start' : 'end'} fill={o.color}><tspan fontWeight={700}>{o.text}</tspan>{o.sub && <tspan opacity={0.6}> {o.sub}</tspan>}</text>
                </g>
              )
            })}
            <text x={C} y={C - 6} textAnchor="middle" fontSize={18} fontWeight={700} fill="currentColor">{rec.name}</text>
            <text x={C} y={C + 14} textAnchor="middle" fontSize={12} fill="currentColor" opacity={0.65}>{num(L, 0)} bp</text>
          </svg>
          <div className="k-legend">{[...new Set(feats.map((f) => f.type))].map((t) => <span key={t}><i style={{ background: fcolor(t) }} />{t}</span>)}{s.gc && <span><i style={{ background: '#0ea5e9' }} />GC above / <i style={{ background: '#f59e0b' }} />below mean</span>}</div>
        </Panel>
        {selF && (
          <Panel title={`${selF.label} · ${selF.type}`} actions={<><CopyButton text={selSeq} label="Copy DNA" /><Btn kind="ghost" onClick={() => setSel(null)}>✕</Btn></>}>
            <p>Location <code>{selF.strand === -1 ? 'complement(' : ''}{selF.segs.map((x) => x.join('..')).join(',')}{selF.strand === -1 ? ')' : ''}</code> · {num(selSeq.length, 0)} bp · {selF.strand === -1 ? 'reverse' : 'forward'} strand</p>
            {Object.entries(selF.quals).filter(([k]) => k !== 'translation').map(([k, v]) => <p key={k} style={{ margin: '2px 0', fontSize: 13 }}><b>/{k}</b> {v}</p>)}
            {selF.type === 'CDS' && <><b style={{ fontSize: 13 }}>Translation ({Math.floor(selSeq.length / 3)} codons)</b><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 120, overflow: 'auto' }}>{wrap(translate(selSeq), 60)}</pre></>}
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 140, overflow: 'auto', opacity: 0.8 }}>{wrap(selSeq, 60)}</pre>
          </Panel>
        )}
        <Panel title="Features" actions={<CsvButton name={`${rec.name}-features.csv`} rows={() => [['label', 'type', 'start', 'end', 'strand', 'length'], ...feats.map((f) => { const sp = span(f, L); return [f.label, f.type, f.segs[0][0], f.segs[f.segs.length - 1][1], f.strand === -1 ? '-' : '+', sp.size] })]} />}>
          <Table head={['', 'Feature', 'Type', 'Location', 'Strand', 'Length']} rows={feats.map((f, i) => [
            <i key="c" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: fcolor(f.type) }} />,
            <button key="b" type="button" className="k-btn ghost" onClick={() => setSel(i)}>{f.label}</button>,
            f.type, f.segs.map((x) => x.join('..')).join(', '), f.strand === -1 ? '←' : f.strand === 1 ? '→' : '', `${num(span(f, L).size, 0)} bp`,
          ])} />
          {!feats.length && <Note>No annotated features. Restriction sites and GC content are still shown.</Note>}
        </Panel>
      </div>
    </Split>
  )
}
