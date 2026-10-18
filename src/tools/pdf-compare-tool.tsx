import { useEffect, useMemo, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Panel, pct, Row, Seg, Slider, Split, Stat, Stats, toCsv, useToolState } from '../kit'
import { boxes, compareWords, pageWords, pixelDiff, report, type Kind, type PageRuns, type Word } from './lib/pdf-compare-tool'
import type { Run } from './lib/pdf-text-extractor'

let pdfjsP: Promise<typeof import('pdfjs-dist')> | null = null
function pdfjs() {
  pdfjsP ??= (async () => {
    const lib = await import('pdfjs-dist')
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    lib.GlobalWorkerOptions.workerSrc = worker.default
    return lib
  })()
  return pdfjsP
}

interface Page extends PageRuns { t: number[]; img: string; canvas: HTMLCanvasElement }
interface Doc { name: string; pages: Page[]; skipped: number }
const SCALE = 1.5
const MAX_PAGES = 80

async function loadDoc(data: Uint8Array, name: string, onStep: (s: string) => void): Promise<Doc> {
  const lib = await pdfjs()
  const task = lib.getDocument({ data: data.slice() })
  const d = await task.promise
  const pages: Page[] = []
  const n = Math.min(d.numPages, MAX_PAGES)
  for (let i = 1; i <= n; i++) {
    onStep(`${name}: page ${i} of ${n}…`)
    const pg = await d.getPage(i)
    const vp1 = pg.getViewport({ scale: 1 })
    const tc = await pg.getTextContent()
    const runs: Run[] = []
    for (const it of tc.items) {
      if (!('str' in it)) continue
      const [a, b, c, dd, e, f] = it.transform as number[]
      runs.push({ str: it.str, x: e, y: f, w: it.width, h: Math.hypot(c, dd) || Math.hypot(a, b) || it.height })
    }
    const vp = pg.getViewport({ scale: SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(vp.width)
    canvas.height = Math.round(vp.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await pg.render({ canvas, canvasContext: ctx, viewport: vp }).promise
    pages.push({ runs, w: vp1.width, h: vp1.height, t: vp1.transform, img: canvas.toDataURL('image/png'), canvas })
  }
  await task.destroy()
  return { name, pages, skipped: d.numPages - n }
}

// ---------- demo pair (generated with pdf-lib) ----------
const V1 = [
  ['SERVICE AGREEMENT', 'This agreement is made on 3 March 2026 between Northwind Studio ("Provider") and Harbor Lane Bakery ("Client").', '1. Scope. Provider will design and maintain the Client website, including up to four content updates per month and a quarterly performance review.', '2. Fees. Client pays a monthly fee of $850, invoiced on the first business day of each month. Late payments accrue interest of 1% per month.', '3. Term. This agreement runs for twelve months and renews automatically unless either party gives thirty days written notice.'],
  ['4. Ownership. All final designs become the property of Client once paid in full. Provider may show the work in its portfolio.', '5. Confidentiality. Each party keeps the other party\'s business information confidential during the term and for two years after it ends.', '6. Liability. Provider\'s total liability is limited to the fees paid in the previous three months.', 'Signed for Provider: ____________   Signed for Client: ____________'],
]
const V2 = [
  ['SERVICE AGREEMENT', 'This agreement is made on 17 March 2026 between Northwind Studio ("Provider") and Harbor Lane Bakery ("Client").', '1. Scope. Provider will design, host and maintain the Client website, including up to six content updates per month and a quarterly performance review.', '2. Fees. Client pays a monthly fee of $975, invoiced on the first business day of each month. Late payments accrue interest of 1.5% per month.', '3. Term. This agreement runs for twelve months and renews automatically unless either party gives sixty days written notice.'],
  ['4. Ownership. All final designs become the property of Client once paid in full. Provider may show the work in its portfolio with Client approval.', '5. Confidentiality. Each party keeps the other party\'s business information confidential during the term and for two years after it ends.', '6. Liability. Provider\'s total liability is limited to the fees paid in the previous six months.', '7. Hosting. Provider keeps daily backups for thirty days and restores the site within one business day after an outage.', 'Signed for Provider: ____________   Signed for Client: ____________'],
]

async function demoPdf(paras: string[][], stamp: boolean): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  paras.forEach((ps, pi) => {
    const page = doc.addPage([595, 842])
    let y = 780
    ps.forEach((p, i) => {
      const f = i === 0 && pi === 0 ? bold : font
      const size = i === 0 && pi === 0 ? 20 : 11.5
      const words = p.split(' ')
      let line = ''
      const flush = () => {
        page.drawText(line, { x: 60, y, size, font: f, color: rgb(0.1, 0.1, 0.15) })
        y -= size * 1.45
        line = ''
      }
      for (const w of words) {
        const next = line ? `${line} ${w}` : w
        if (f.widthOfTextAtSize(next, size) > 475) flush()
        line = line ? `${line} ${w}` : w
      }
      if (line) flush()
      y -= 10
    })
    page.drawText(`Page ${pi + 1} of ${paras.length}`, { x: 270, y: 40, size: 9, font, color: rgb(0.45, 0.45, 0.5) })
    if (stamp && pi === 1) {
      page.drawRectangle({ x: 400, y: 120, width: 140, height: 44, borderColor: rgb(0.1, 0.55, 0.3), borderWidth: 2.5, rotate: degrees(8) })
      page.drawText('REVIEWED', { x: 420, y: 140, size: 18, font: bold, color: rgb(0.1, 0.55, 0.3), rotate: degrees(8) })
    }
  })
  return doc.save()
}

// ---------- view ----------
const KIND_COL: Record<Kind, string> = { added: 'var(--ok)', removed: 'var(--err)', changed: 'var(--warn)' }
const apply = (t: number[], x: number, y: number) => [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]]

export default function PdfCompareTool() {
  const [s, set] = useToolState('pdf-compare-tool', { ignoreCase: false, ignorePunct: true, mode: 'text' as 'text' | 'visual', threshold: 40, filter: 'all' as 'all' | Kind })
  const [A, setA] = useState<Doc | null>(null)
  const [B, setB] = useState<Doc | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [sel, setSel] = useState<number | null>(null)

  const open = async (which: 'a' | 'b', data: Uint8Array, name: string) => {
    setErr('')
    try {
      const d = await loadDoc(data, name, setBusy)
      if (which === 'a') setA(d)
      else setB(d)
      setSel(null)
    } catch (e) {
      setErr(`Could not read ${name}: ${(e as Error).message}`)
    }
    setBusy('')
  }
  const demo = async () => {
    setBusy('Generating demo pair…')
    const [a, b] = await Promise.all([demoPdf(V1, false), demoPdf(V2, true)])
    await open('a', a, 'agreement-v1.pdf')
    await open('b', b, 'agreement-v2.pdf')
  }
  useEffect(() => {
    void demo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const wa = useMemo(() => (A ? pageWords(A.pages) : []), [A])
  const wb = useMemo(() => (B ? pageWords(B.pages) : []), [B])
  const cmp = useMemo(() => (A && B ? compareWords(wa, wb, { ignoreCase: s.ignoreCase, ignorePunct: s.ignorePunct }) : null), [A, B, wa, wb, s.ignoreCase, s.ignorePunct])

  const visual = useMemo(() => {
    if (s.mode !== 'visual' || !A || !B) return null
    const n = Math.max(A.pages.length, B.pages.length)
    return Array.from({ length: n }, (_, i) => {
      const pa = A.pages[i], pb = B.pages[i]
      const w = Math.max(pa?.canvas.width ?? 0, pb?.canvas.width ?? 0), h = Math.max(pa?.canvas.height ?? 0, pb?.canvas.height ?? 0)
      const grab = (p: Page | undefined) => {
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const g = c.getContext('2d', { willReadFrequently: true })!
        g.fillStyle = '#fff'
        g.fillRect(0, 0, w, h)
        if (p) g.drawImage(p.canvas, 0, 0)
        return g.getImageData(0, 0, w, h)
      }
      const ia = grab(pa), ib = grab(pb)
      const r = pixelDiff(ia.data, ib.data, w, h, s.threshold)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      c.getContext('2d')!.putImageData(new ImageData(r.out, w, h), 0, 0)
      return { img: c.toDataURL('image/png'), share: r.count / (w * h), w, h }
    })
  }, [s.mode, s.threshold, A, B])

  const changes = cmp?.changes ?? []
  const shown = changes.filter((c) => s.filter === 'all' || c.kind === s.filter)
  const nPages = Math.max(A?.pages.length ?? 0, B?.pages.length ?? 0)
  const pick = (id: number, scroll: boolean) => {
    setSel(id)
    if (scroll) document.getElementById(`pc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const overlay = (doc: Doc, words: Word[], owner: Int32Array | undefined, page: number, side: 'a' | 'b') => {
    const p = doc.pages[page]
    if (!p || !owner) return null
    const ids = new Set<number>()
    words.forEach((w, i) => w.page === page && owner[i] >= 0 && ids.add(owner[i]))
    return [...ids].flatMap((id) => {
      const c = changes[id]
      if (s.filter !== 'all' && c.kind !== s.filter) return []
      const col = c.kind === 'changed' ? 'var(--warn)' : side === 'a' ? 'var(--err)' : 'var(--ok)'
      return boxes(words, side === 'a' ? c.a : c.b, page).map((bx, k) => {
        const [x0, y0] = apply(p.t, bx.x - 1, bx.y + bx.h + 1)
        const [x1, y1] = apply(p.t, bx.x + bx.w + 1, bx.y - 1)
        const W = p.canvas.width / SCALE, H = p.canvas.height / SCALE
        return (
          <span
            key={`${id}-${k}`}
            id={k === 0 && side === 'b' ? `pc-${id}` : k === 0 && !c.b.length ? `pc-${id}` : undefined}
            title={`#${id + 1} ${c.kind}: ${side === 'a' ? c.aText : c.bText}`}
            onClick={() => pick(id, false)}
            style={{
              position: 'absolute', left: `${(Math.min(x0, x1) / W) * 100}%`, top: `${(Math.min(y0, y1) / H) * 100}%`,
              width: `${(Math.abs(x1 - x0) / W) * 100}%`, height: `${(Math.abs(y1 - y0) / H) * 100}%`, cursor: 'pointer',
              background: `color-mix(in srgb, ${col} ${sel === id ? 45 : 25}%, transparent)`, outline: sel === id ? `2px solid ${col}` : undefined, borderRadius: 2,
            }}
          />
        )
      })
    })
  }

  const pageBox = (doc: Doc | null, words: Word[], owner: Int32Array | undefined, i: number, side: 'a' | 'b') => {
    const p = doc?.pages[i]
    if (!doc || !p) return <div className="muted" style={{ border: '1px dashed var(--line)', borderRadius: 8, display: 'grid', placeItems: 'center', minHeight: 160 }}>{doc ? 'No such page' : 'No document'}</div>
    return (
      <div style={{ position: 'relative', boxShadow: '0 1px 4px rgba(0,0,0,.25)', background: '#fff', lineHeight: 0 }}>
        <img src={p.img} alt={`${doc.name} page ${i + 1}`} style={{ width: '100%', display: 'block' }} />
        {overlay(doc, words, owner, i, side)}
      </div>
    )
  }

  const csv = () => toCsv([['#', 'Type', 'Old page', 'New page', 'Old text', 'New text'], ...changes.map((c) => [c.id + 1, c.kind, c.pageA + 1, c.pageB + 1, c.aText, c.bText])])
  const cnt = (k: Kind) => changes.filter((c) => c.kind === k).length

  return (
    <div>
      <Panel title="Documents" actions={<Btn onClick={() => void demo()}>Load demo pair</Btn>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {(['a', 'b'] as const).map((k) => {
            const d = k === 'a' ? A : B
            return (
              <div key={k}>
                <b>{k === 'a' ? 'Original (old)' : 'Revised (new)'}</b>
                <FileDrop accept="application/pdf,.pdf" onFiles={async (f) => open(k, new Uint8Array(await f[0].arrayBuffer()), f[0].name)} label={d ? `${d.name} · ${d.pages.length} page(s) — drop to replace` : 'Drop a PDF here'} />
              </div>
            )
          })}
        </div>
        <Row>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['text', 'Text changes'], ['visual', 'Visual (pixel) diff']]} />
          <Check label="Ignore case" value={s.ignoreCase} onChange={(ignoreCase) => set({ ignoreCase })} />
          <Check label="Ignore punctuation" value={s.ignorePunct} onChange={(ignorePunct) => set({ ignorePunct })} />
        </Row>
        {s.mode === 'visual' && <Slider label="Pixel tolerance" value={s.threshold} onChange={(threshold) => set({ threshold })} min={0} max={160} step={4} show={(v) => String(v)} />}
        {busy && <Note>{busy}</Note>}
        {err && <Note tone="err">{err}</Note>}
        {(A?.skipped || B?.skipped) ? <Note tone="warn">Only the first {MAX_PAGES} pages are compared.</Note> : null}
      </Panel>

      {cmp && (
        <Stats>
          <Stat label="Changes" value={changes.length} tone={changes.length ? 'accent' : 'good'} sub={`${cnt('changed')} edited · ${cnt('added')} added · ${cnt('removed')} removed`} />
          <Stat label="Words added" value={cmp.added} tone={cmp.added ? 'good' : undefined} />
          <Stat label="Words removed" value={cmp.removed} tone={cmp.removed ? 'bad' : undefined} />
          <Stat label="Text similarity" value={pct(cmp.similarity, 1)} sub={`${wa.length} → ${wb.length} words`} />
        </Stats>
      )}
      {cmp && wa.length + wb.length === 0 && <Note tone="warn">Neither PDF contains extractable text (scanned images?). Use the visual diff mode instead.</Note>}

      <Split wide="left">
        <Panel title={s.mode === 'text' ? 'Side by side' : 'Pixel differences'}>
          {s.mode === 'text' && (
            <p className="muted" style={{ marginTop: 0 }}>
              <span style={{ color: 'var(--err)' }}>■</span> removed · <span style={{ color: 'var(--ok)' }}>■</span> added · <span style={{ color: 'var(--warn)' }}>■</span> edited. Click a highlight or a list item.
            </p>
          )}
          {s.mode === 'visual' && <p className="muted" style={{ marginTop: 0 }}><span style={{ color: '#dc2626' }}>■</span> ink only in old · <span style={{ color: '#059669' }}>■</span> ink only in new · <span style={{ color: '#ea800c' }}>■</span> both differ. Catches images, stamps and layout shifts that text diff misses.</p>}
          {Array.from({ length: nPages }, (_, i) => (
            <div key={i} style={{ marginBottom: 18 }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
                Page {i + 1}
                {visual?.[i] && <> · <b style={{ color: visual[i].share > 0 ? 'var(--warn)' : 'var(--ok)' }}>{pct(visual[i].share, 2)}</b> of pixels differ</>}
              </div>
              {s.mode === 'text' || !visual ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {pageBox(A, wa, cmp?.aWord, i, 'a')}
                  {pageBox(B, wb, cmp?.bWord, i, 'b')}
                </div>
              ) : (
                <img src={visual[i].img} alt={`difference page ${i + 1}`} style={{ width: '100%', maxWidth: 640, display: 'block', margin: '0 auto', boxShadow: '0 1px 4px rgba(0,0,0,.25)' }} />
              )}
            </div>
          ))}
        </Panel>
        <div style={{ position: 'sticky', top: 8 }}>
          <Panel
            title={`Change list (${shown.length})`}
            actions={
              <>
                <Btn onClick={() => download('pdf-changes.csv', csv(), 'text/csv')} disabled={!changes.length}>⬇ CSV</Btn>
                <Btn onClick={() => download('pdf-changes.txt', report(changes, A?.name ?? 'old', B?.name ?? 'new'), 'text/plain')} disabled={!changes.length}>⬇ Report</Btn>
              </>
            }
          >
            <Seg value={s.filter} onChange={(filter) => set({ filter })} options={[['all', 'All'], ['changed', 'Edited'], ['added', 'Added'], ['removed', 'Removed']]} />
            {cmp && !changes.length && <Note tone="ok">No text differences found{s.ignoreCase || s.ignorePunct ? ' (with the ignore options)' : ''}.</Note>}
            <div style={{ maxHeight: '70vh', overflow: 'auto', display: 'grid', gap: 6 }}>
              {shown.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c.id, true)}
                  style={{ textAlign: 'left', border: `1px solid ${sel === c.id ? KIND_COL[c.kind] : 'var(--line)'}`, borderLeft: `4px solid ${KIND_COL[c.kind]}`, borderRadius: 8, padding: '6px 9px', background: 'var(--panel)', color: 'inherit', cursor: 'pointer', font: 'inherit', fontSize: 13.5 }}
                >
                  <div className="muted" style={{ fontSize: 12 }}>#{c.id + 1} · {c.kind} · p.{c.pageA + 1} → p.{c.pageB + 1}</div>
                  {c.aText && <div style={{ color: 'var(--err)', textDecoration: 'line-through' }}>{c.aText.length > 160 ? c.aText.slice(0, 160) + '…' : c.aText}</div>}
                  {c.bText && <div style={{ color: 'var(--ok)' }}>{c.bText.length > 160 ? c.bText.slice(0, 160) + '…' : c.bText}</div>}
                </button>
              ))}
            </div>
          </Panel>
          <Note>Text is compared word by word in reading order across all pages, so reflowed paragraphs don't count as changes. Everything runs locally; files never leave your browser.</Note>
        </div>
      </Split>
    </div>
  )
}
