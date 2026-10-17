import { useEffect, useRef, useState } from 'react'
import { Btn, Check, color, download, FileDrop, Note, Panel, Row, Seg, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { describePages, paperName, parseRanges } from './lib/pdf-merger'

interface Doc {
  id: string
  name: string
  bytes: Uint8Array
  size: number
  sizes: [number, number][] // page width/height in points (rotation applied)
  range: string
  rotate: number
  sample?: boolean
}

interface Opts {
  fileName: string
  title: string
  fit: 'keep' | 'a4' | 'letter'
  pad: boolean
}

const DEF: Opts = { fileName: 'merged.pdf', title: 'Merged document', fit: 'keep', pad: false }
const FIT: Record<string, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] }
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

async function inspect(name: string, bytes: Uint8Array, sample = false): Promise<Doc> {
  const { PDFDocument } = await import('pdf-lib')
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const sizes = pdf.getPages().map((p) => {
    const { width, height } = p.getSize()
    return (p.getRotation().angle % 180 ? [height, width] : [width, height]) as [number, number]
  })
  return { id: uid(), name, bytes, size: bytes.length, sizes, range: '', rotate: 0, sample }
}

async function makeSamples(): Promise<Doc[]> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const spec: [string, number, [number, number], [number, number, number]][] = [
    ['cover-letter.pdf', 1, [595.28, 841.89], [0.39, 0.4, 0.95]],
    ['invoice-2026-117.pdf', 2, [612, 792], [0.05, 0.65, 0.91]],
    ['appendix-charts.pdf', 3, [841.89, 595.28], [0.06, 0.73, 0.5]],
  ]
  const out: Doc[] = []
  for (const [name, n, [w, h], [r, g, b]] of spec) {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.HelveticaBold)
    const body = await pdf.embedFont(StandardFonts.Helvetica)
    pdf.setTitle(name)
    for (let i = 0; i < n; i++) {
      const p = pdf.addPage([w, h])
      p.drawRectangle({ x: 0, y: h - 90, width: w, height: 90, color: rgb(r, g, b) })
      p.drawText(name.replace('.pdf', ''), { x: 40, y: h - 58, size: 26, font, color: rgb(1, 1, 1) })
      p.drawText(`Page ${i + 1} of ${n}`, { x: 40, y: 40, size: 12, font: body, color: rgb(0.4, 0.4, 0.45) })
      for (let l = 0; l < 14; l++) p.drawRectangle({ x: 40, y: h - 140 - l * 26, width: (w - 80) * (0.55 + ((l * 37 + i * 11) % 45) / 100), height: 10, color: rgb(0.88, 0.89, 0.92) })
      p.drawText(String(i + 1), { x: w - 90, y: 50, size: 60, font, color: rgb(r, g, b), opacity: 0.25 })
    }
    out.push(await inspect(name, await pdf.save(), true))
  }
  return out
}

export default function PdfMerger() {
  const [o, set, reset] = useToolState('pdf-merger', DEF)
  const [docs, setDocs] = useState<Doc[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'warn'; text: string } | null>(null)
  const drag = useRef<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    void makeSamples().then((d) => live && setDocs((cur) => (cur.length ? cur : d)))
    return () => {
      live = false
    }
  }, [])

  const add = async (files: File[]) => {
    setMsg(null)
    const added: Doc[] = []
    const bad: string[] = []
    for (const f of files) {
      try {
        added.push(await inspect(f.name, new Uint8Array(await f.arrayBuffer())))
      } catch {
        bad.push(f.name)
      }
    }
    setDocs((cur) => [...cur.filter((d) => !d.sample || !added.length), ...added])
    if (bad.length) setMsg({ tone: 'err', text: `Couldn't read ${bad.join(', ')} — not a valid PDF (or password protected).` })
  }
  const edit = (id: string, p: Partial<Doc>) => setDocs((cur) => cur.map((d) => (d.id === id ? { ...d, ...p } : d)))
  const move = (from: number, to: number) =>
    setDocs((cur) => {
      if (to < 0 || to >= cur.length || from === to) return cur
      const next = [...cur]
      const [x] = next.splice(from, 1)
      next.splice(to, 0, x)
      return next
    })

  const plan = docs.map((d) => ({ d, r: parseRanges(d.range, d.sizes.length) }))
  const errors = plan.filter((p) => p.r.error)
  const strip: { doc: number; page: number; w: number; h: number; blank?: boolean }[] = []
  plan.forEach(({ d, r }, di) => {
    for (const p of r.pages) {
      let [w, h] = d.sizes[p]
      if (d.rotate % 180) [w, h] = [h, w]
      if (o.fit !== 'keep') [w, h] = w > h ? [FIT[o.fit][1], FIT[o.fit][0]] : FIT[o.fit]
      strip.push({ doc: di, page: p, w, h })
    }
    if (o.pad && r.pages.length % 2 === 1 && di < plan.length - 1) strip.push({ doc: di, page: -1, w: strip[strip.length - 1].w, h: strip[strip.length - 1].h, blank: true })
  })

  const merge = async () => {
    if (!strip.length || errors.length) return
    setBusy(true)
    setMsg(null)
    try {
      const { PDFDocument, degrees } = await import('pdf-lib')
      const out = await PDFDocument.create()
      for (const [di, { d, r }] of plan.entries()) {
        if (!r.pages.length) continue
        const src = await PDFDocument.load(d.bytes, { ignoreEncryption: true })
        if (o.fit === 'keep') {
          const pages = await out.copyPages(src, r.pages)
          for (const pg of pages) {
            if (d.rotate) pg.setRotation(degrees((pg.getRotation().angle + d.rotate) % 360))
            out.addPage(pg)
          }
        } else {
          for (const pi of r.pages) {
            const srcRot = src.getPage(pi).getRotation().angle
            const rot = (srcRot + d.rotate) % 360
            let e
            try {
              ;[e] = await out.embedPdf(src, [pi])
            } catch {
              e = null // empty page without a content stream: emit a blank page instead
            }
            const { width: ew, height: eh } = e ?? src.getPage(pi).getSize()
            const [cw, ch] = rot % 180 ? [eh, ew] : [ew, eh]
            const [W, H] = cw > ch ? [FIT[o.fit][1], FIT[o.fit][0]] : FIT[o.fit]
            const pg = out.addPage([W, H])
            if (!e) continue
            const s = Math.min(W / cw, H / ch)
            const x = (W - cw * s) / 2
            const y = (H - ch * s) / 2
            // Draw the embedded page rotated clockwise about its anchor so it lands upright and centred.
            const pos = rot === 90 ? { x, y: y + ch * s } : rot === 180 ? { x: x + cw * s, y: y + ch * s } : rot === 270 ? { x: x + cw * s, y } : { x, y }
            pg.drawPage(e, { ...pos, xScale: s, yScale: s, rotate: degrees(-rot) })
          }
        }
        if (o.pad && r.pages.length % 2 === 1 && di < plan.length - 1) {
          const last = out.getPage(out.getPageCount() - 1)
          const { width, height } = last.getSize()
          const blank = out.addPage([width, height])
          blank.setRotation(last.getRotation())
        }
      }
      out.setTitle(o.title || 'Merged document')
      out.setCreator('Browser Toolbox · PDF Merger')
      out.setProducer('pdf-lib')
      const bytes = await out.save()
      const name = (o.fileName.trim() || 'merged.pdf').replace(/(\.pdf)?$/i, '.pdf')
      download(name, new Blob([bytes.slice().buffer], { type: 'application/pdf' }))
      setMsg({ tone: 'ok', text: `Saved ${name}: ${out.getPageCount()} pages, ${kb(bytes.length)}.` })
    } catch (e) {
      setMsg({ tone: 'err', text: `Merge failed: ${(e as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  const totalIn = docs.reduce((a, d) => a + d.size, 0)
  const maxH = Math.max(1, ...strip.map((s) => s.h))

  return (
    <Split wide="right">
      <div>
        <Panel title="Add PDFs">
          <FileDrop accept="application/pdf,.pdf" multiple onFiles={(f) => void add(f)} label="Drop PDFs here or click to choose (several at once is fine)" />
          {docs.some((d) => d.sample) && <Note>Showing three generated sample PDFs. Add your own files and the samples are replaced.</Note>}
          {msg && <Note tone={msg.tone}>{msg.text}</Note>}
          <p className="muted" style={{ fontSize: 13 }}>Files are read and merged entirely in your browser — nothing is uploaded.</p>
        </Panel>
        <Panel title="Output">
          <Txt label="File name" value={o.fileName} onChange={(fileName) => set({ fileName })} />
          <Txt label="Document title (metadata)" value={o.title} onChange={(title) => set({ title })} />
          <div className="k-field">
            <span className="k-label">Page size</span>
            <Seg value={o.fit} onChange={(fit) => set({ fit })} options={[['keep', 'Keep original'], ['a4', 'Fit to A4'], ['letter', 'Fit to Letter']]} />
          </div>
          <Check label="Pad odd-length documents with a blank page (duplex printing)" value={o.pad} onChange={(pad) => set({ pad })} />
          <Row>
            <Btn kind="primary" onClick={() => void merge()} disabled={busy || !strip.length || errors.length > 0}>
              {busy ? 'Merging…' : `⬇ Merge ${strip.length} pages`}
            </Btn>
            <Btn kind="ghost" onClick={reset}>Reset options</Btn>
            <Btn kind="ghost" onClick={() => setDocs([])} disabled={!docs.length}>Clear files</Btn>
          </Row>
          {errors.length > 0 && <Note tone="err">Fix the page selection of {errors.map((e) => e.d.name).join(', ')} first.</Note>}
        </Panel>
        <Panel title="Page selection syntax">
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Leave empty for all pages. Examples: <code>1-3, 5</code> · <code>4-</code> (4 to end) · <code>-2</code> · <code>last</code> · <code>odd</code> / <code>even</code> · <code>5-1</code> (reverse order). Pages may repeat.
          </p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Documents" value={docs.length} />
          <Stat label="Pages out" value={strip.length} tone="accent" sub={`of ${docs.reduce((a, d) => a + d.sizes.length, 0)} in sources`} />
          <Stat label="Input size" value={kb(totalIn)} />
        </Stats>
        <Panel title="Merge order" actions={<span className="muted" style={{ fontSize: 13 }}>Drag to reorder</span>}>
          {!docs.length && <p className="muted">No documents yet.</p>}
          {plan.map(({ d, r }, i) => (
            <div
              key={d.id}
              draggable
              onDragStart={() => (drag.current = i)}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(i)
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault()
                if (drag.current !== null) move(drag.current, i)
                drag.current = null
                setOver(null)
              }}
              style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, padding: 10, marginBottom: 8, border: `1px solid ${over === i ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 10, background: 'var(--panel)', cursor: 'grab' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 34, height: 44, borderRadius: 4, background: color(i), color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{i + 1}</span>
                <Btn kind="ghost" title="Move up" onClick={() => move(i, i - 1)} disabled={i === 0}>▲</Btn>
                <Btn kind="ghost" title="Move down" onClick={() => move(i, i + 1)} disabled={i === docs.length - 1}>▼</Btn>
              </div>
              <div style={{ minWidth: 0 }}>
                <Row wrap={false}>
                  <b style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.name}>{d.name}</b>
                  <Btn kind="ghost" title="Remove" onClick={() => setDocs((cur) => cur.filter((x) => x.id !== d.id))}>✕</Btn>
                </Row>
                <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                  {d.sizes.length} page{d.sizes.length === 1 ? '' : 's'} · {paperName(...d.sizes[0])} · {kb(d.size)}
                </div>
                <Row>
                  <Txt label="Pages" value={d.range} placeholder={d.sizes.length > 1 ? `all (1-${d.sizes.length})` : "all"} onChange={(range) => edit(d.id, { range })} />
                  <div className="k-field">
                    <span className="k-label">Rotate</span>
                    <Seg value={String(d.rotate)} onChange={(v) => edit(d.id, { rotate: Number(v) })} options={[['0', '0°'], ['90', '90°'], ['180', '180°'], ['270', '270°']]} />
                  </div>
                </Row>
                {r.error ? <Note tone="err">{r.error}</Note> : <div className="muted" style={{ fontSize: 13 }}>Using {r.pages.length ? describePages(r.pages) : 'no pages'}</div>}
              </div>
            </div>
          ))}
        </Panel>
        <Panel title="Result preview">
          {!strip.length ? (
            <p className="muted">Nothing to merge yet.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
              {strip.map((s, k) => (
                <div key={k} title={s.blank ? 'Blank padding page' : `${docs[s.doc].name} · page ${s.page + 1}`} style={{ textAlign: 'center', fontSize: 11 }}>
                  <div
                    style={{
                      width: (s.w / maxH) * 70,
                      height: (s.h / maxH) * 70,
                      borderRadius: 3,
                      border: `2px solid ${color(s.doc)}`,
                      background: s.blank ? 'repeating-linear-gradient(45deg, transparent 0 4px, var(--line) 4px 5px)' : `linear-gradient(${color(s.doc)} 0 22%, var(--panel) 22%)`,
                      display: 'grid',
                      placeItems: 'end center',
                      color: 'var(--muted)',
                      paddingBottom: 2,
                    }}
                  >
                    {s.blank ? '' : s.page + 1}
                  </div>
                  <span className="muted">{k + 1}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </Split>
  )
}
