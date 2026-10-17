import { useMemo, useState } from 'react'
import { Area, Bar, Btn, Check, CopyButton, CsvButton, download, FileDrop, LineChart, Note, num, Num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { CODES, composition, digest, ENZYMES, findOrfs, findSites, formatSeq, gcWindows, invalidChars, meltingTemp, molecularWeight, parseFasta, reverseComplement, sampleSequence, translate, wrap, type Hit } from './lib/dna-sequence-toolkit'

type Tab = 'map' | 'translate' | 'orfs' | 'sites' | 'revcomp'
interface State {
  text: string
  rec: number
  table: number
  minAa: number
  alt: boolean
  circular: boolean
  tab: Tab
  frame: number
  single: boolean
  digestWith: string[]
}

const DEF: State = {
  text: `>demo_construct synthetic expression cassette (demo)\n${wrap(sampleSequence(), 70)}`,
  rec: 0,
  table: 1,
  minAa: 75,
  alt: false,
  circular: false,
  tab: 'map',
  frame: 1,
  single: true,
  digestWith: ['EcoRI', 'HindIII'],
}

const ORF_COL = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#a855f7']
const mono: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 13, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'var(--panel2)', padding: 10, borderRadius: 8, maxHeight: 360, overflow: 'auto', margin: 0 }

function SeqMap({ len, orfs, sites, circular }: { len: number; orfs: ReturnType<typeof findOrfs>; sites: Hit[]; circular: boolean }) {
  const W = 760, L = 20, R = 20
  const sx = (p: number) => L + ((p - 1) / Math.max(1, len - 1)) * (W - L - R)
  const shown = orfs.slice(0, 6)
  const H = 150 + Math.max(0, shown.filter((o) => o.strand === -1).length - 1) * 16
  const mid = 92
  const ticks = Array.from({ length: 6 }, (_, i) => Math.round(1 + ((len - 1) * i) / 5))
  // stagger labels to reduce overlap
  const lab = sites.map((h, i) => ({ h, x: sx(h.pos), row: i % 3 }))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Sequence map">
      <line x1={L} x2={W - R} y1={mid} y2={mid} stroke="var(--fg)" strokeWidth={3} />
      {circular && <text x={W - R} y={mid - 6} fontSize={10} textAnchor="end" fill="var(--muted)">circular ↺</text>}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={sx(t)} x2={sx(t)} y1={mid} y2={mid + 5} stroke="var(--muted)" />
          <text x={sx(t)} y={mid + 16} fontSize={10} textAnchor="middle" fill="var(--muted)">{t}</text>
        </g>
      ))}
      {lab.map(({ h, x, row }, i) => (
        <g key={i}>
          <line x1={x} x2={x} y1={mid - 4} y2={14 + row * 14} stroke="#ef4444" strokeWidth={1} opacity={0.7} />
          <text x={x + 2} y={12 + row * 14} fontSize={10} fill="#ef4444">{h.enzyme}</text>
        </g>
      ))}
      {shown.map((o, i) => {
        const y = o.strand === 1 ? mid - 18 - (i % 2) * 6 : mid + 26 + shown.filter((x, j) => j < i && x.strand === -1).length * 16
        const x0 = sx(o.start), x1 = sx(o.end)
        const c = ORF_COL[i % ORF_COL.length]
        const head = Math.min(10, (x1 - x0) / 2)
        const d = o.strand === 1 ? `M${x0},${y - 5}H${x1 - head}L${x1},${y}L${x1 - head},${y + 5}H${x0}Z` : `M${x1},${y - 5}H${x0 + head}L${x0},${y}L${x0 + head},${y + 5}H${x1}Z`
        return (
          <g key={i}>
            <path d={d} fill={c} opacity={0.85} />
            <text x={(x0 + x1) / 2} y={o.strand === 1 ? y - 8 : y + 17} fontSize={10} textAnchor="middle" fill={c}>ORF{i + 1} {o.aa} aa</text>
          </g>
        )
      })}
    </svg>
  )
}

function Gel({ lanes, ladder }: { lanes: { name: string; frags: number[] }[]; ladder: number[] }) {
  const H = 260, top = 24, bottom = H - 12
  const lo = Math.log10(40), hi = Math.log10(12000)
  const y = (bp: number) => top + ((hi - Math.log10(Math.min(12000, Math.max(40, bp)))) / (hi - lo)) * (bottom - top)
  const all = [{ name: 'Ladder', frags: ladder }, ...lanes]
  const lw = 70
  return (
    <svg viewBox={`0 0 ${all.length * lw + 50} ${H}`} style={{ width: '100%', maxWidth: all.length * lw + 50, height: 'auto', background: '#0b1020', borderRadius: 8 }} role="img" aria-label="Simulated agarose gel">
      {all.map((l, i) => (
        <g key={l.name} transform={`translate(${50 + i * lw},0)`}>
          <text x={lw / 2 - 6} y={14} fontSize={10} textAnchor="middle" fill="#cbd5e1">{l.name}</text>
          <rect x={6} y={top - 4} width={lw - 24} height={4} fill="#334155" />
          {l.frags.map((f, k) => (
            <rect key={k} x={6} y={y(f) - 2} width={lw - 24} height={4} rx={1} fill={i ? '#fbbf24' : '#94a3b8'} opacity={i ? 0.95 : 0.8}>
              <title>{f} bp</title>
            </rect>
          ))}
        </g>
      ))}
      {ladder.map((b) => <text key={b} x={44} y={y(b) + 3} fontSize={9} textAnchor="end" fill="#94a3b8">{b >= 1000 ? `${b / 1000}k` : b}</text>)}
    </svg>
  )
}

export default function DnaSequenceToolkit() {
  const [s, set, reset] = useToolState('dna-sequence-toolkit', DEF)
  const [orfSel, setOrfSel] = useState(0)
  const recs = useMemo(() => parseFasta(s.text), [s.text])
  const rec = recs[Math.min(s.rec, recs.length - 1)]
  const seq = rec?.seq ?? ''
  const bad = invalidChars(seq)
  const comp = useMemo(() => composition(seq), [seq])
  const mw = molecularWeight(seq)
  const orfs = useMemo(() => findOrfs(seq, s.minAa, s.table, s.alt), [seq, s.minAa, s.table, s.alt])
  const hits = useMemo(() => findSites(seq, ENZYMES, s.circular), [seq, s.circular])
  const byEnz = useMemo(() => {
    const m = new Map<string, Hit[]>()
    for (const h of hits) m.set(h.enzyme, [...(m.get(h.enzyme) ?? []), h])
    return m
  }, [hits])
  const mapSites = hits.filter((h) => !s.single || byEnz.get(h.enzyme)!.length === 1)
  const gc = useMemo(() => gcWindows(seq, Math.max(20, Math.min(100, Math.round(seq.length / 30))), Math.max(5, Math.round(seq.length / 150))), [seq])

  const strandSeq = s.frame > 0 ? seq : reverseComplement(seq)
  const fr = Math.abs(s.frame) - 1
  const protein = translate(strandSeq, fr, s.table)
  const aligned = useMemo(() => {
    const rows: string[] = []
    const sub = strandSeq.slice(0, 1500)
    for (let i = 0; i < sub.length; i += 60) {
      const dna = sub.slice(i, i + 60)
      let aa = ''
      for (let k = 0; k < dna.length; k++) {
        const p = i + k
        aa += (p - fr) % 3 === 1 && p >= fr + 1 ? (translate(strandSeq.slice(p - 1, p + 2), 0, s.table) || ' ') : ' '
      }
      rows.push(`${String(i + 1).padStart(5)} ${dna}\n      ${aa.trimEnd()}`)
    }
    return rows.join('\n')
  }, [strandSeq, fr, s.table])

  const digestCuts = s.digestWith.flatMap((e) => (byEnz.get(e) ?? []).map((h) => h.cut))
  const frags = digest(seq.length, digestCuts, s.circular)
  const name = rec?.id ?? 'sequence'
  const orf = orfs[Math.min(orfSel, orfs.length - 1)]

  return (
    <Split wide="right">
      <div>
        <Panel title="Sequence" actions={<><Btn kind="ghost" onClick={() => set({ text: DEF.text, rec: 0 })}>Demo</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Area value={s.text} onChange={(text) => set({ text, rec: 0 })} rows={9} mono placeholder=">name&#10;ATGC…" />
          <FileDrop accept=".fa,.fasta,.fna,.ffn,.txt,.seq" onFiles={async ([f]) => set({ text: await f.text(), rec: 0 })} label="Open a FASTA / plain sequence file" />
          {recs.length > 1 && <Select label={`Record (${recs.length} in file)`} value={s.rec} onChange={(rec) => set({ rec })} options={recs.map((r, i) => [i, `${r.id} · ${r.seq.length} bp`] as const)} />}
          {bad.length > 0 && <Note tone="warn">Unexpected characters ignored in analysis: {bad.slice(0, 12).join(' ')}</Note>}
          {!seq && <Note tone="err">Paste a DNA sequence (FASTA or plain). RNA (U) is converted to T.</Note>}
        </Panel>
        <Panel title="Settings">
          <Select label="Genetic code (NCBI)" value={s.table} onChange={(table) => set({ table })} options={Object.entries(CODES).map(([k, v]) => [Number(k), v.name] as const)} />
          <Num label="Minimum ORF length" value={s.minAa} onChange={(minAa) => set({ minAa: Math.max(10, Math.round(minAa)) })} unit="aa" min={10} />
          <Check label="Alternative start codons" value={s.alt} onChange={(alt) => set({ alt })} />
          <Seg label="Topology" value={s.circular ? 'c' : 'l'} onChange={(v) => set({ circular: v === 'c' })} options={[['l', 'Linear'], ['c', 'Circular (plasmid)']]} />
        </Panel>
        <Panel title="Composition">
          {(['A', 'C', 'G', 'T'] as const).map((b) => (
            <div key={b} style={{ marginBottom: 6 }}>
              <Row wrap={false}><b style={{ width: 20 }}>{b}</b><span style={{ flex: 1 }}><Bar value={comp[b]} max={comp.len || 1} color={{ A: '#10b981', C: '#0ea5e9', G: '#f59e0b', T: '#ef4444' }[b]} /></span><span style={{ width: 90, textAlign: 'right' }}>{comp[b]} · {pct(comp[b] / (comp.len || 1), 1)}</span></Row>
            </div>
          ))}
          {comp.other > 0 && <p className="muted">Ambiguous (N, R, Y…): {comp.other}</p>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Length" value={`${num(comp.len, 0)} bp`} sub={rec?.desc || name} />
          <Stat label="GC content" value={pct(comp.gc, 1)} sub={`AT ${pct(comp.at, 1)}`} tone="accent" />
          <Stat label="Tm (basic)" value={`${num(meltingTemp(seq), 1)} °C`} sub={comp.len < 14 ? 'Wallace rule' : 'GC formula, no salt corr.'} />
          <Stat label="Mol. weight" value={`${num(mw.ds / 1000, 1)} kDa`} sub={`ds · ss ${num(mw.ss / 1000, 1)} kDa`} />
        </Stats>
        <Panel>
          <Seg label="View" value={s.tab} onChange={(tab) => set({ tab })} options={[['map', 'Map'], ['translate', 'Translate'], ['orfs', `ORFs (${orfs.length})`], ['sites', 'Restriction'], ['revcomp', 'Rev. complement']]} />
        </Panel>

        {s.tab === 'map' && (
          <>
            <Panel title="Sequence map" actions={<Check label="Single cutters only" value={s.single} onChange={(single) => set({ single })} />}>
              {seq ? <SeqMap len={seq.length} orfs={orfs} sites={mapSites} circular={s.circular} /> : <p className="muted">No sequence.</p>}
              <p className="muted" style={{ fontSize: 13 }}>Arrows above the line are ORFs on the + strand, below on the − strand. Red ticks: restriction sites.</p>
            </Panel>
            <Panel title="GC content along the sequence">
              <LineChart series={[{ name: 'GC %', points: gc.map(([x, y]) => [x, y * 100]), area: true }]} xLabel="position (bp)" fy={(v) => `${num(v, 0)}%`} fx={(v) => num(v, 0)} yMin={0} yMax={100} height={200} />
            </Panel>
          </>
        )}

        {s.tab === 'translate' && (
          <Panel title="Translation" actions={<><CopyButton text={protein} label="Copy protein" /><Btn onClick={() => download(`${name}_frame${s.frame}.faa`, `>${name} frame ${s.frame > 0 ? '+' : ''}${s.frame} code ${s.table}\n${wrap(protein)}\n`, 'text/plain')}>⬇ FASTA</Btn></>}>
            <Seg label="Reading frame" value={String(s.frame)} onChange={(v) => set({ frame: Number(v) })} options={[['1', '+1'], ['2', '+2'], ['3', '+3'], ['-1', '−1'], ['-2', '−2'], ['-3', '−3']]} />
            <p className="muted" style={{ fontSize: 13 }}>{protein.length} codons · {(protein.match(/\*/g) ?? []).length} stops (*). Codon-aligned view{strandSeq.length > 1500 ? ' (first 1,500 bp)' : ''}:</p>
            <pre style={mono}>{aligned}</pre>
            <b style={{ fontSize: 13 }}>Protein</b>
            <pre style={mono}>{protein.split(/(\*)/).map((part, i) => (part === '*' ? <span key={i} style={{ color: 'var(--err)', fontWeight: 700 }}>*</span> : part))}</pre>
          </Panel>
        )}

        {s.tab === 'orfs' && (
          <Panel title={`Open reading frames ≥ ${s.minAa} aa`} actions={<CsvButton name={`${name}-orfs.csv`} rows={() => [['ORF', 'Strand', 'Frame', 'Start', 'End', 'Length aa', 'Protein'], ...orfs.map((o, i) => [i + 1, o.strand > 0 ? '+' : '-', o.frame, o.start, o.end, o.aa, o.protein])]} />}>
            {orfs.length ? (
              <>
                <Table
                  head={['#', 'Strand', 'Frame', 'Location', 'Length', '']}
                  rows={orfs.map((o, i) => [
                    <b key="n" style={{ color: ORF_COL[i % ORF_COL.length] }}>ORF{i + 1}</b>,
                    o.strand > 0 ? '+' : '−',
                    o.frame,
                    `${o.start}..${o.end}`,
                    `${o.aa} aa · ${o.end - o.start + 1} bp`,
                    <Btn key="v" kind={i === orfSel ? 'primary' : 'ghost'} onClick={() => setOrfSel(i)}>View</Btn>,
                  ])}
                  max={50}
                />
                {orf && (
                  <>
                    <Row><b>ORF{orfSel + 1} protein</b><CopyButton text={orf.protein} /></Row>
                    <pre style={mono}>{wrap(orf.protein, 60)}</pre>
                  </>
                )}
              </>
            ) : (
              <Note>No ORF of at least {s.minAa} codons. Lower the minimum length or enable alternative starts.</Note>
            )}
          </Panel>
        )}

        {s.tab === 'sites' && (
          <>
            <Panel title="Restriction sites" actions={<CsvButton name={`${name}-sites.csv`} rows={() => [['Enzyme', 'Site', 'Strand', 'Position', 'Cut after'], ...hits.map((h) => [h.enzyme, h.site, h.strand > 0 ? '+' : '-', h.pos, h.cut])]} />}>
              <Table
                head={['Digest', 'Enzyme', 'Site', 'Cuts', 'Positions (cut after)']}
                rows={ENZYMES.filter(([n]) => byEnz.has(n)).map(([n, site]) => {
                  const hs = byEnz.get(n)!
                  return [
                    <input key="c" type="checkbox" checked={s.digestWith.includes(n)} onChange={(e) => set({ digestWith: e.target.checked ? [...s.digestWith, n] : s.digestWith.filter((x) => x !== n) })} aria-label={`Digest with ${n}`} />,
                    <b key="n">{n}</b>,
                    <code key="s" style={{ fontFamily: 'var(--mono)' }}>{site}</code>,
                    hs.length,
                    hs.slice(0, 8).map((h) => h.cut).join(', ') + (hs.length > 8 ? ' …' : ''),
                  ]
                })}
              />
              <p className="muted" style={{ fontSize: 13 }}>Non-cutters: {ENZYMES.filter(([n]) => !byEnz.has(n)).map(([n]) => n).join(', ') || 'none'}.</p>
            </Panel>
            <Panel title={`Digest: ${s.digestWith.join(' + ') || 'none selected'} (${s.circular ? 'circular' : 'linear'})`}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 220px' }}>
                  <Table head={['Fragment', 'Size']} rows={frags.map((f, i) => [i + 1, `${num(f, 0)} bp`])} />
                </div>
                <div style={{ flex: '1 1 240px' }}>
                  <Gel lanes={[{ name: 'Uncut', frags: [seq.length] }, { name: 'Digest', frags }]} ladder={[100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000]} />
                </div>
              </div>
            </Panel>
          </>
        )}

        {s.tab === 'revcomp' && (
          <Panel title="Reverse complement" actions={<><CopyButton text={reverseComplement(seq)} /><Btn onClick={() => download(`${name}_rc.fasta`, `>${name}_revcomp\n${wrap(reverseComplement(seq))}\n`, 'text/plain')}>⬇ FASTA</Btn></>}>
            <pre style={mono}>{formatSeq(reverseComplement(seq))}</pre>
            <Row>
              <CopyButton text={seq.split('').reverse().join('')} label="Copy reverse" />
              <CopyButton text={reverseComplement(seq).split('').reverse().join('')} label="Copy complement" />
              <CopyButton text={seq.replace(/T/g, 'U')} label="Copy as RNA" />
            </Row>
          </Panel>
        )}
      </div>
    </Split>
  )
}
