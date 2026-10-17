import { useEffect, useMemo, useState, type DragEvent, type MouseEvent } from 'react'
import { Btn, color, download, FileDrop, Note, Panel, Row, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { fmtBytes } from './lib/image-compressor'
import { collateDuplex, finalRot, moveBlock, norm, paperLabel, parsePageSet, shownSize, type PageItem } from './lib/pdf-page-organizer'

interface Doc {
  name: string
  bytes: Uint8Array
  /** page captions for the generated sample (real files have none) */
  captions?: string[]
}
interface Snap {
  pages: PageItem[]
  trash: PageItem[]
}

const SAMPLE_PAGES: [string, number][] = [
  ['Cover', 0], ['Contents', 0], ['3 · Results', 0], ['5 · Budget', 180], ['4 · Methods', 0], ['6 · Wide chart', 90], ['(blank scan)', 0], ['7 · Appendix', 0],
]

async function makeSample(): Promise<Doc> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle('Scanned report (sample)')
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  SAMPLE_PAGES.forEach(([title, rot], i) => {
    const [w, h] = [595.28, 841.89]
    const page = doc.addPage([w, h])
    if (title.startsWith('(')) return
    page.drawRectangle({ x: 0, y: h - 100, width: w, height: 100, color: rgb(0.31, 0.27, 0.9) })
    page.drawText(title, { x: 40, y: h - 64, size: 28, font: bold, color: rgb(1, 1, 1) })
    for (let l = 0; l < 24; l++) page.drawRectangle({ x: 40, y: h - 150 - l * 24, width: (w - 80) * (0.5 + ((l * 37 + i * 13) % 47) / 100), height: 9, color: rgb(0.84, 0.86, 0.91) })
    page.drawText(`Sample page ${i + 1}`, { x: w / 2 - 44, y: 32, size: 11, font: reg, color: rgb(0.4, 0.4, 0.46) })
    if (rot) page.setRotation(degrees(rot))
  })
  return { name: 'scanned-report.pdf', bytes: await doc.save(), captions: SAMPLE_PAGES.map((p) => p[0]) }
}

async function readPages(bytes: Uint8Array, src: number): Promise<PageItem[]> {
  const { PDFDocument } = await import('pdf-lib')
  const d = await PDFDocument.load(bytes, { ignoreEncryption: true })
  return d.getPages().map((p, index) => {
    const { width, height } = p.getSize()
    return { id: uid(), src, index, w: width, h: height, baseRot: norm(p.getRotation().angle), rot: 0 }
  })
}

const BOX = 116

function Thumb({ p, caption, tint }: { p: PageItem; caption: string; tint: string }) {
  const k = (BOX - 8) / Math.max(p.w, p.h)
  const r = finalRot(p)
  const content = p.src >= 0 && !caption.startsWith('(')
  return (
    <div style={{ width: BOX, height: BOX, display: 'grid', placeItems: 'center' }}>
      <div
        style={{
          width: p.w * k, height: p.h * k, background: '#fff', border: '1px solid #cbd2e1', borderRadius: 3, boxShadow: '0 2px 6px rgb(0 0 0 / .15)',
          transform: `rotate(${r}deg)`, transition: 'transform .25s', overflow: 'hidden', position: 'relative', color: '#1e293b',
        }}
      >
        {content && <div style={{ height: '14%', background: tint }} />}
        {content && Array.from({ length: 7 }, (_, i) => <div key={i} style={{ height: 3, margin: '5px 8%', width: `${55 + ((i * 29 + p.index * 7) % 35)}%`, background: '#dfe3ec', borderRadius: 2 }} />)}
        <b style={{ position: 'absolute', left: 0, right: 0, bottom: 4, textAlign: 'center', fontSize: 11 }}>{caption}</b>
      </div>
    </div>
  )
}

export default function PdfPageOrganizer() {
  const [s, set] = useToolState('pdf-page-organizer', { outName: 'organized.pdf', selSpec: 'odd' })
  const [docs, setDocs] = useState<Doc[]>([])
  const [snap, setSnap] = useState<Snap>({ pages: [], trash: [] })
  const [hist, setHist] = useState<Snap[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [drag, setDrag] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{ url: string; size: number; pages: number } | null>(null)
  const [original, setOriginal] = useState<PageItem[]>([])
  const { pages, trash } = snap

  const commit = (next: Snap) => {
    setHist((h) => [...h.slice(-49), snap])
    setSnap(next)
    setResult(null)
  }
  const setPages = (p: PageItem[]) => commit({ pages: p, trash })

  const addDocs = async (list: Doc[], replace: boolean) => {
    setErr('')
    setBusy(true)
    try {
      const base = replace ? 0 : docs.length
      const items: PageItem[] = []
      for (let i = 0; i < list.length; i++) items.push(...(await readPages(list[i].bytes, base + i)))
      if (replace) {
        setDocs(list)
        setOriginal(items)
        setSnap({ pages: items, trash: [] })
        setHist([])
        setSel(new Set())
        setResult(null)
      } else {
        setDocs([...docs, ...list])
        setOriginal([...original, ...items])
        commit({ pages: [...pages, ...items], trash })
      }
    } catch (e) {
      setErr(`Could not read that PDF: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  useEffect(() => {
    let live = true
    void makeSample().then(async (d) => {
      const items = await readPages(d.bytes, 0)
      if (!live) return
      setDocs([d])
      setOriginal(items)
      setSnap({ pages: items, trash: [] })
    })
    return () => {
      live = false
    }
  }, [])

  const caption = (p: PageItem) => (p.src < 0 ? 'Blank' : (docs[p.src]?.captions?.[p.index] ?? `p. ${p.index + 1}`))
  const targets = (id?: string) => (id && !sel.has(id) ? new Set([id]) : sel)

  const rotate = (ids: Set<string>, d: number) => setPages(pages.map((p) => (ids.has(p.id) ? { ...p, rot: norm(p.rot + d) } : p)))
  const remove = (ids: Set<string>) => {
    commit({ pages: pages.filter((p) => !ids.has(p.id)), trash: [...trash, ...pages.filter((p) => ids.has(p.id))] })
    setSel(new Set())
  }
  const duplicate = (ids: Set<string>) => setPages(pages.flatMap((p) => (ids.has(p.id) ? [p, { ...p, id: uid() }] : [p])))
  const insertBlank = () => {
    const last = pages.reduce((a, p, i) => (sel.has(p.id) ? i : a), pages.length - 1)
    const ref = pages[last] ?? { w: 595.28, h: 841.89 }
    const blank: PageItem = { id: uid(), src: -1, index: 0, w: ref.w, h: ref.h, baseRot: 0, rot: 0 }
    setPages([...pages.slice(0, last + 1), blank, ...pages.slice(last + 1)])
  }
  const nudge = (id: string, d: number) => {
    const i = pages.findIndex((p) => p.id === id)
    const j = i + d
    if (j < 0 || j >= pages.length) return
    const next = pages.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    setPages(next)
  }
  const undo = () => {
    if (!hist.length) return
    setSnap(hist[hist.length - 1])
    setHist(hist.slice(0, -1))
    setResult(null)
  }

  const click = (e: MouseEvent, id: string) => {
    const next = new Set(e.metaKey || e.ctrlKey ? sel : [])
    if (e.shiftKey && anchor) {
      const a = pages.findIndex((p) => p.id === anchor)
      const b = pages.findIndex((p) => p.id === id)
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(pages[i].id)
    } else if (sel.has(id) && (e.metaKey || e.ctrlKey || sel.size === 1)) next.delete(id)
    else next.add(id)
    setSel(next)
    setAnchor(id)
  }
  const selectSpec = (spec: string) => {
    const t = spec.trim().toLowerCase()
    if (t === 'odd' || t === 'even') return setSel(new Set(pages.filter((_, i) => i % 2 === (t === 'odd' ? 0 : 1)).map((p) => p.id)))
    if (t === 'landscape' || t === 'portrait') return setSel(new Set(pages.filter((p) => { const [w, h] = shownSize(p); return t === 'landscape' ? w > h : h >= w }).map((p) => p.id)))
    const r = parsePageSet(spec, pages.length)
    setErr(r.error)
    if (!r.error) setSel(new Set(r.idx.map((i) => pages[i].id)))
  }

  const onDragOver = (e: DragEvent, id: string) => {
    e.preventDefault()
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const after = e.clientX > box.left + box.width / 2
    const i = pages.findIndex((p) => p.id === id)
    setDropAt(after ? (pages[i + 1]?.id ?? '__end') : id)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    if (drag && dropAt) setPages(moveBlock(pages, targets(drag), dropAt === '__end' ? null : dropAt))
    setDrag(null)
    setDropAt(null)
  }

  const save = async (only?: Set<string>) => {
    const list = only ? pages.filter((p) => only.has(p.id)) : pages
    if (!list.length) return
    setBusy(true)
    setErr('')
    try {
      const { PDFDocument, degrees } = await import('pdf-lib')
      const out = await PDFDocument.create()
      const srcs = new Map<number, Awaited<ReturnType<typeof PDFDocument.load>>>()
      const copied = new Map<string, ReturnType<typeof out.addPage>>()
      for (const src of new Set(list.map((p) => p.src).filter((x) => x >= 0))) {
        const d = await PDFDocument.load(docs[src].bytes, { ignoreEncryption: true })
        srcs.set(src, d)
        const mine = list.filter((p) => p.src === src)
        const got = await out.copyPages(d, mine.map((p) => p.index))
        mine.forEach((p, i) => copied.set(p.id, got[i]))
      }
      for (const p of list) {
        const page = p.src < 0 ? out.addPage([p.w, p.h]) : out.addPage(copied.get(p.id)!)
        page.setRotation(degrees(finalRot(p)))
      }
      const first = docs[list[0].src]
      if (first) {
        const t = srcs.get(list[0].src)?.getTitle()
        if (t) out.setTitle(t)
      }
      const bytes = await out.save()
      const name = (s.outName.trim() || 'organized.pdf').replace(/(\.pdf)?$/i, '.pdf')
      download(name, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), 'application/pdf')
      if (result) URL.revokeObjectURL(result.url)
      setResult({ url: URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })), size: bytes.length, pages: list.length })
    } catch (e) {
      setErr(`Saving failed: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  const rotated = pages.filter((p) => p.rot !== 0).length
  const moved = useMemo(() => {
    const orig = new Map(original.map((p, i) => [`${p.src}:${p.index}`, i]))
    return pages.filter((p, i) => orig.get(`${p.src}:${p.index}`) !== i).length
  }, [pages, original])
  const inBytes = docs.reduce((a, d) => a + d.bytes.length, 0)
  const one = sel.size > 0

  return (
    <Split wide="left">
      <div>
        <Stats>
          <Stat label="Pages out" value={pages.length} sub={`${original.length} loaded`} tone="accent" />
          <Stat label="Removed" value={trash.length} tone={trash.length ? 'bad' : undefined} />
          <Stat label="Rotated" value={rotated} />
          <Stat label="Moved" value={moved} sub="not in original position" />
        </Stats>
        <Panel
          title={`Pages${sel.size ? ` · ${sel.size} selected` : ''}`}
          actions={
            <>
              <Btn onClick={undo} disabled={!hist.length} title="Undo (one step)">↶ Undo</Btn>
              <Btn onClick={() => setSel(new Set(sel.size === pages.length ? [] : pages.map((p) => p.id)))}>{sel.size === pages.length ? 'Select none' : 'Select all'}</Btn>
            </>
          }
        >
          <Row>
            <Btn disabled={!one} onClick={() => rotate(sel, -90)}>⟲ Left</Btn>
            <Btn disabled={!one} onClick={() => rotate(sel, 90)}>⟳ Right</Btn>
            <Btn disabled={!one} onClick={() => rotate(sel, 180)}>↕ 180°</Btn>
            <Btn disabled={!one} onClick={() => duplicate(sel)}>⧉ Duplicate</Btn>
            <Btn onClick={insertBlank}>＋ Blank page</Btn>
            <Btn disabled={!one} kind="danger" onClick={() => remove(sel)}>✕ Delete</Btn>
          </Row>
          <div
            style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${BOX + 16}px, 1fr))`, gap: 10, marginTop: 12 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            {pages.map((p, i) => {
              const on = sel.has(p.id)
              const tint = p.src < 0 ? 'var(--muted)' : color(p.src)
              const [w, h] = shownSize(p)
              return (
                <div
                  key={p.id}
                  draggable
                  onDragStart={(e) => {
                    setDrag(p.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => {
                    setDrag(null)
                    setDropAt(null)
                  }}
                  onDragOver={(e) => onDragOver(e, p.id)}
                  onClick={(e) => click(e, p.id)}
                  style={{
                    position: 'relative', padding: '6px 6px 4px', borderRadius: 12, cursor: 'grab', userSelect: 'none',
                    border: `2px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'color-mix(in srgb, var(--accent) 10%, var(--panel))' : 'var(--panel2)',
                    opacity: drag && targets(drag).has(p.id) ? 0.4 : 1,
                    boxShadow: dropAt === p.id ? '-5px 0 0 var(--accent2)' : undefined,
                  }}
                >
                  <span style={{ position: 'absolute', top: 6, left: 8, fontWeight: 800, fontSize: 13 }}>{i + 1}</span>
                  <span title={docs[p.src]?.name ?? 'Inserted'} style={{ position: 'absolute', top: 9, right: 8, width: 10, height: 10, borderRadius: 5, background: tint }} />
                  <div style={{ display: 'grid', placeItems: 'center' }}><Thumb p={p} caption={caption(p)} tint={tint} /></div>
                  <div className="muted" style={{ fontSize: 11, textAlign: 'center' }}>
                    {paperLabel(w, h)} {w > h ? '▭' : '▯'} {finalRot(p) ? `· ${finalRot(p)}°` : ''}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 2 }} onClick={(e) => e.stopPropagation()}>
                    {[['◀', () => nudge(p.id, -1), 'Move left'], ['⟲', () => rotate(new Set([p.id]), -90), 'Rotate left'], ['⟳', () => rotate(new Set([p.id]), 90), 'Rotate right'], ['✕', () => remove(new Set([p.id])), 'Delete'], ['▶', () => nudge(p.id, 1), 'Move right']].map(([t, f, ttl]) => (
                      <button key={ttl as string} type="button" title={ttl as string} aria-label={ttl as string} onClick={f as () => void} className="k-btn ghost" style={{ padding: '1px 6px', minHeight: 0, fontSize: 13 }}>
                        {t as string}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            {pages.length > 0 && drag && (
              <div onDragOver={(e) => { e.preventDefault(); setDropAt('__end') }} style={{ border: '2px dashed var(--line)', borderRadius: 12, display: 'grid', placeItems: 'center', minHeight: 120, color: 'var(--muted)', boxShadow: dropAt === '__end' ? '-5px 0 0 var(--accent2)' : undefined }}>
                Drop at end
              </div>
            )}
          </div>
          {!pages.length && <Note>No pages left. Restore pages from the bin, or load a PDF.</Note>}
          <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            Drag cards to reorder (selected pages move together). Click to select, Shift-click for a range, Ctrl/⌘-click to add. On touch screens use the ◀ ▶ buttons.
          </p>
        </Panel>
        {trash.length > 0 && (
          <Panel title={`Removed pages (${trash.length})`} actions={<Btn onClick={() => commit({ pages: [...pages, ...trash], trash: [] })}>Restore all</Btn>}>
            <Row>
              {trash.map((p) => (
                <Btn key={p.id} kind="ghost" onClick={() => commit({ pages: [...pages, p], trash: trash.filter((x) => x.id !== p.id) })} title="Restore at the end">
                  ↩ {caption(p)}
                </Btn>
              ))}
            </Row>
          </Panel>
        )}
      </div>

      <div>
        <Panel title="Documents">
          <FileDrop accept="application/pdf,.pdf" multiple label="Open PDF(s) — replaces the current set" onFiles={async (fs) => addDocs(await Promise.all(fs.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))), true)} />
          <div style={{ height: 8 }} />
          <FileDrop accept="application/pdf,.pdf" multiple label="Append pages from another PDF" onFiles={async (fs) => addDocs(await Promise.all(fs.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))), false)} />
          {docs.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 14 }}>
              <i style={{ width: 10, height: 10, borderRadius: 5, background: color(i), flex: 'none' }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
              <span className="muted">{fmtBytes(d.bytes.length)}</span>
            </div>
          ))}
          {docs[0]?.captions && <Note>This sample “scan” has typical problems: pages 4 and 5 are swapped, page 4 is upside down, page 6 is sideways and page 7 is a blank sheet. Fix them and save.</Note>}
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="Arrange">
          <Row>
            <Btn onClick={() => setPages(pages.slice().reverse())}>⇅ Reverse order</Btn>
            <Btn onClick={() => setPages(collateDuplex(pages))} title="Fronts 1,3,5… followed by backs …6,4,2">⇄ Collate duplex scan</Btn>
            <Btn onClick={() => setPages(pages.slice().sort((a, b) => a.src - b.src || a.index - b.index))}>↺ Original order</Btn>
            <Btn onClick={() => setPages(pages.map((p) => ({ ...p, rot: 0 })))}>Clear rotations</Btn>
          </Row>
          <Txt label="Select pages" value={s.selSpec} onChange={(selSpec) => set({ selSpec })} placeholder="1-3, 8 · odd · even · landscape" hint="Ranges like 1-3, 9- or the words odd, even, landscape, portrait" />
          <Btn onClick={() => selectSpec(s.selSpec)}>Select</Btn>
        </Panel>
        <Panel title="Save">
          <Txt label="File name" value={s.outName} onChange={(outName) => set({ outName })} />
          <Row>
            <Btn kind="primary" disabled={busy || !pages.length} onClick={() => void save()}>{busy ? 'Working…' : `⬇ Save PDF (${pages.length} pages)`}</Btn>
            <Btn disabled={busy || !one} onClick={() => void save(sel)}>Extract selected ({sel.size})</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13, margin: '8px 0' }}>Input: {docs.length} file{docs.length === 1 ? '' : 's'}, {fmtBytes(inBytes)}</p>
          {result && (
            <Note tone="ok">
              Saved {result.pages} pages · {fmtBytes(result.size)}.{' '}
              <a href={result.url} target="_blank" rel="noreferrer">Open the result in a new tab</a> to check it.
            </Note>
          )}
          <p className="muted" style={{ fontSize: 13 }}>
            Pages are copied losslessly with pdf-lib (text stays selectable, links and fonts are kept); rotation is written to each page’s /Rotate entry. Everything runs locally — the files never leave your browser.
          </p>
        </Panel>
      </div>
    </Split>
  )
}
