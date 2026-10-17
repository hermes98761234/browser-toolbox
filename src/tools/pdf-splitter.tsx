import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Btn, color, download, FileDrop, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { everyN, everyPage, intoN, parseRanges, zipStore, type Part } from './lib/pdf-splitter'

type Mode = 'each' | 'chunk' | 'into' | 'ranges' | 'cuts'

interface State {
  mode: Mode
  chunk: number
  into: number
  ranges: string
  cuts: number[]
  prefix: string
}

const DEF: State = { mode: 'ranges', chunk: 2, into: 3, ranges: '1-2, 3-6, 7-10, 11-', cuts: [2, 6, 10], prefix: '' }

interface Doc {
  name: string
  bytes: Uint8Array
  sizes: [number, number][]
  title?: string
}

interface Out {
  name: string
  pages: number[]
  bytes: Uint8Array
}

const PAPER: [string, number, number][] = [['A4', 595.28, 841.89], ['Letter', 612, 792], ['Legal', 612, 1008], ['A5', 419.53, 595.28], ['A3', 841.89, 1190.55]]
const paperName = (w: number, h: number) => {
  const [a, b] = w < h ? [w, h] : [h, w]
  const hit = PAPER.find(([, pw, ph]) => Math.abs(pw - a) < 3 && Math.abs(ph - b) < 3)
  const mm = `${Math.round((w / 72) * 25.4)}×${Math.round((h / 72) * 25.4)} mm`
  return hit ? `${hit[0]}${w > h ? ' landscape' : ''}` : mm
}
// Kit's info Note collides with a global .info grid rule, so use a local hint box.
const Tip = ({ children }: { children: ReactNode }) => (
  <div className="k-note" style={{ background: 'color-mix(in srgb, var(--accent2) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent2) 35%, transparent)' }}>{children}</div>
)
const pdfBlob = (b: Uint8Array, type = 'application/pdf') => new Blob([b as Uint8Array<ArrayBuffer>], { type })
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`)
const base = (n: string) => n.replace(/\.pdf$/i, '')

async function makeSample(): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle('Sample report')
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const body = await doc.embedFont(StandardFonts.Helvetica)
  const chapters = ['Cover', 'Summary', 'Chapter 1 — Market', 'Chapter 1 — Market', 'Chapter 2 — Product', 'Chapter 2 — Product', 'Chapter 3 — Finance', 'Chapter 3 — Finance', 'Appendix A — Tables', 'Appendix A — Tables', 'Appendix B — Wide chart', 'Back cover']
  chapters.forEach((ch, i) => {
    const land = i === 10
    const letter = i === 1
    const [w, h] = land ? [841.89, 595.28] : letter ? [612, 792] : [595.28, 841.89]
    const page = doc.addPage([w, h])
    const hue = [0.39, 0.55, 0.06, 0.06, 0.73, 0.73, 0.96, 0.96, 0.35, 0.35, 0.55, 0.39][i]
    page.drawRectangle({ x: 0, y: h - 90, width: w, height: 90, color: rgb(hue * 0.4 + 0.2, 0.35, 0.85 - hue * 0.4) })
    page.drawText(ch, { x: 40, y: h - 58, size: 24, font, color: rgb(1, 1, 1) })
    for (let l = 0; l < 22; l++) page.drawRectangle({ x: 40, y: h - 140 - l * 22, width: (w - 80) * (0.55 + ((l * 37 + i * 11) % 45) / 100), height: 8, color: rgb(0.85, 0.86, 0.9) })
    page.drawText(`Page ${i + 1} of ${chapters.length}`, { x: w / 2 - 40, y: 30, size: 11, font: body, color: rgb(0.4, 0.4, 0.45) })
  })
  return doc.save()
}

async function loadDoc(name: string, bytes: Uint8Array): Promise<Doc> {
  const { PDFDocument } = await import('pdf-lib')
  const d = await PDFDocument.load(bytes, { ignoreEncryption: true })
  return { name, bytes, sizes: d.getPages().map((p) => { const s = p.getSize(); return [s.width, s.height] as [number, number] }), title: d.getTitle() }
}

export default function PdfSplitter() {
  const [s, set, reset] = useToolState('pdf-splitter', DEF)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [built, setBuilt] = useState<{ key: string; files: Out[] } | null>(null)

  const loadSample = async () => {
    setErr('')
    setDoc(await loadDoc('sample-report.pdf', await makeSample()))
  }
  useEffect(() => {
    let live = true
    void makeSample()
      .then((b) => loadDoc('sample-report.pdf', b))
      .then((d) => live && setDoc(d))
    return () => {
      live = false
    }
  }, [])

  const total = doc?.sizes.length ?? 0
  const plan = useMemo((): { parts: Part[]; errors: string[] } => {
    if (!total) return { parts: [], errors: [] }
    if (s.mode === 'each') return { parts: everyPage(total), errors: [] }
    if (s.mode === 'chunk') return { parts: everyN(total, s.chunk), errors: [] }
    if (s.mode === 'into') return { parts: intoN(total, s.into), errors: [] }
    if (s.mode === 'ranges') return parseRanges(s.ranges, total)
    const cuts = [...new Set(s.cuts.filter((c) => c >= 1 && c < total))].sort((a, b) => a - b)
    const bounds = [0, ...cuts, total]
    const parts: Part[] = []
    for (let i = 0; i < bounds.length - 1; i++) {
      const a = bounds[i] + 1, b = bounds[i + 1]
      parts.push({ name: a === b ? String(a) : `${a}-${b}`, pages: Array.from({ length: b - a + 1 }, (_, j) => a + j) })
    }
    return { parts, errors: [] }
  }, [total, s.mode, s.chunk, s.into, s.ranges, s.cuts])

  const planKey = `${doc?.name}|${doc?.bytes.length}|${s.prefix}|${JSON.stringify(plan.parts)}`
  const outs = built && built.key === planKey ? built.files : null

  const owner = useMemo(() => {
    const m = new Map<number, number>()
    plan.parts.forEach((p, i) => p.pages.forEach((pg) => { if (!m.has(pg)) m.set(pg, i) }))
    return m
  }, [plan])
  const unused = total - owner.size
  const prefix = s.prefix.trim() || (doc ? base(doc.name) : 'part')
  const label = (p: Part) => {
    const a = p.pages[0], b = p.pages[p.pages.length - 1]
    const run = p.pages.every((x, j) => x === a + j)
    return run ? (a === b ? String(a) : `${a}-${b}`) : p.name.replace(/[^0-9a-z+-]/gi, '')
  }
  const fileName = (p: Part, i: number) => `${prefix}_${String(i + 1).padStart(2, '0')}_p${label(p)}.pdf`

  const onFiles = async (files: File[]) => {
    const f = files[0]
    setErr('')
    try {
      setDoc(await loadDoc(f.name, new Uint8Array(await f.arrayBuffer())))
    } catch (e) {
      setErr(`Could not read "${f.name}": ${(e as Error).message}. Is it a valid, unencrypted PDF?`)
    }
  }

  const split = async () => {
    if (!doc) return
    setBusy(true)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const src = await PDFDocument.load(doc.bytes, { ignoreEncryption: true })
      const res: Out[] = []
      for (const [i, p] of plan.parts.entries()) {
        const out = await PDFDocument.create()
        const pages = await out.copyPages(src, p.pages.map((n) => n - 1))
        pages.forEach((pg) => out.addPage(pg))
        out.setTitle(`${doc.title || base(doc.name)} (pages ${p.name})`)
        out.setProducer('Browser Toolbox PDF Splitter')
        res.push({ name: fileName(p, i), pages: p.pages, bytes: await out.save() })
      }
      setBuilt({ key: planKey, files: res })
    } catch (e) {
      setErr(`Split failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const toggleCut = (pg: number) => {
    if (s.mode !== 'cuts' || pg >= total) return
    set({ cuts: s.cuts.includes(pg) ? s.cuts.filter((c) => c !== pg) : [...s.cuts, pg] })
  }

  const outTotal = outs?.reduce((a, o) => a + o.bytes.length, 0) ?? 0

  return (
    <Split wide="right">
      <div>
        <Panel title="1 · Source PDF" actions={<Btn kind="ghost" onClick={() => void loadSample()}>Sample</Btn>}>
          <FileDrop accept="application/pdf,.pdf" onFiles={(f) => void onFiles(f)} label="Drop a PDF here or click to choose" />
          {err && <Note tone="err">{err}</Note>}
          {doc && (
            <p className="muted" style={{ margin: '8px 0 0' }}>
              <b>{doc.name}</b> · {total} pages · {kb(doc.bytes.length)}
              {doc.title ? ` · “${doc.title}”` : ''}
            </p>
          )}
        </Panel>
        <Panel title="2 · How to split" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['ranges', 'Ranges'], ['cuts', 'Click cuts'], ['each', 'Every page'], ['chunk', 'Every N'], ['into', 'Into N parts']]} label="Split mode" />
          <div style={{ marginTop: 12 }}>
            {s.mode === 'ranges' && (
              <>
                <Txt label="Page ranges (one output file per item)" value={s.ranges} onChange={(ranges) => set({ ranges })} placeholder="1-3, 5, 8-" />
                <Row>
                  {[['Halves', `1-${Math.ceil(total / 2)}, ${Math.ceil(total / 2) + 1}-`], ['Odd / even', 'odd, even'], ['First page off', `1, 2-`], ['Last page off', `-${total - 1}, ${total}`]].map(([l, v]) => (
                    <Btn key={l} kind="ghost" onClick={() => set({ ranges: v })}>{l}</Btn>
                  ))}
                </Row>
                <Tip>
                  <b>Syntax:</b> <code>3-7</code> range · <code>8-</code> to the end · <code>-4</code> from the start · <code>9-5</code> reversed · <code>1-2+9</code> join into one file · <code>odd</code>, <code>even</code>, <code>all</code>.
                </Tip>
              </>
            )}
            {s.mode === 'cuts' && <Tip>Click a page on the right to place a cut <b>after</b> it. Click again to remove. {s.cuts.length ? '' : 'No cuts yet: the whole document is one part.'}</Tip>}
            {s.mode === 'chunk' && <Num label="Pages per file" value={s.chunk} onChange={(chunk) => set({ chunk })} min={1} max={Math.max(1, total)} step={1} />}
            {s.mode === 'into' && <Num label="Number of files" value={s.into} onChange={(into) => set({ into })} min={1} max={Math.max(1, total)} step={1} hint="Pages are distributed as evenly as possible." />}
            {s.mode === 'each' && <Tip>Each of the {total} pages becomes its own PDF.</Tip>}
          </div>
          {plan.errors.map((e) => (
            <Note key={e} tone="err">{e}</Note>
          ))}
          <Txt label="File name prefix" value={s.prefix} onChange={(prefix) => set({ prefix })} placeholder={doc ? base(doc.name) : 'part'} />
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Pages" value={total} />
          <Stat label="Output files" value={plan.parts.length} tone="accent" />
          <Stat label="Pages not used" value={unused} tone={unused ? 'bad' : 'good'} sub={unused ? 'not in any part' : 'all covered'} />
          <Stat label="Output size" value={outs ? kb(outTotal) : '—'} sub={outs ? 'after split' : 'press Split'} />
        </Stats>
        <Panel title="Pages" actions={s.mode === 'cuts' && s.cuts.length > 0 ? <Btn kind="ghost" onClick={() => set({ cuts: [] })}>Clear cuts</Btn> : undefined}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            {doc?.sizes.map(([w, h], i) => {
              const pg = i + 1
              const o = owner.get(pg)
              const scale = 74 / Math.max(w, h)
              const cut = s.mode === 'cuts' && s.cuts.includes(pg) && pg < total
              return (
                <div key={pg} style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => toggleCut(pg)}
                    title={`Page ${pg}: ${paperName(w, h)}${o !== undefined ? ` · part ${o + 1}` : ' · not used'}`}
                    style={{
                      width: w * scale, height: h * scale, padding: 0, borderRadius: 4, cursor: s.mode === 'cuts' ? 'pointer' : 'default',
                      border: `2px solid ${o !== undefined ? color(o) : 'var(--line)'}`,
                      background: o !== undefined ? `color-mix(in srgb, ${color(o)} 16%, var(--panel))` : 'var(--panel)',
                      opacity: o !== undefined ? 1 : 0.45, display: 'grid', placeItems: 'center', font: 'inherit', color: 'inherit',
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{pg}</span>
                  </button>
                  {cut && <span style={{ width: 3, height: 70, background: 'var(--err)', borderRadius: 2 }} title="Cut" />}
                </div>
              )
            })}
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Page boxes are drawn to scale; colours show which output file each page goes to.</p>
        </Panel>
        <Panel
          title="Output files"
          actions={
            <>
              <Btn kind="primary" onClick={() => void split()} disabled={!doc || busy || !plan.parts.length}>{busy ? 'Splitting…' : 'Split'}</Btn>
              {outs && outs.length > 1 && <Btn onClick={() => download(`${prefix}_split.zip`, pdfBlob(zipStore(outs.map((o) => ({ name: o.name, data: o.bytes }))), 'application/zip'))}>⬇ ZIP</Btn>}
            </>
          }
        >
          <Table
            head={['#', 'File', 'Pages', 'Count', 'Size', '']}
            rows={plan.parts.map((p, i) => {
              const o = outs?.[i]
              return [
                <span key="c" style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: color(i) }} />,
                fileName(p, i),
                p.pages.length > 8 ? `${p.pages.slice(0, 6).join(', ')} … ${p.pages[p.pages.length - 1]}` : p.pages.join(', '),
                p.pages.length,
                o ? kb(o.bytes.length) : '—',
                o ? <Btn key="d" kind="ghost" onClick={() => download(o.name, pdfBlob(o.bytes))}>⬇</Btn> : '',
              ]
            })}
          />
          {!outs && plan.parts.length > 0 && <Tip>Press <b>Split</b> to build the files. Everything happens in your browser; nothing is uploaded.</Tip>}
          {outs && <Note tone="ok">Built {outs.length} file{outs.length > 1 ? 's' : ''}. Download them one by one or all together as a ZIP.</Note>}
        </Panel>
      </div>
    </Split>
  )
}
