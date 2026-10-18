import { useEffect, useState } from 'react'
import { Btn, Check, CopyButton, download, FileDrop, Note, Panel, Row, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { applyFields, buildXmp, demoPdf, EMPTY, isoToPdf, LAYOUTS, lint, MODES, nowIso, readMeta, writeMeta, type Field, type Loaded, type Meta } from './lib/pdf-metadata-editor'

interface Item extends Loaded {
  id: string
  name: string
  bytes: Uint8Array
  orig: Meta
  saved?: boolean
}

const LANGS: [string, string][] = [['', '— none —'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['de-DE', 'German'], ['fr-FR', 'French'], ['es-ES', 'Spanish'], ['it-IT', 'Italian'], ['pt-BR', 'Portuguese (BR)'], ['nl-NL', 'Dutch'], ['pl-PL', 'Polish'], ['uk-UA', 'Ukrainian'], ['ja-JP', 'Japanese'], ['zh-CN', 'Chinese (simpl.)']]
const LAYOUT_LABEL: Record<string, string> = { '': 'Viewer default', SinglePage: 'Single page', OneColumn: 'Continuous', TwoColumnLeft: 'Two-up continuous (odd left)', TwoColumnRight: 'Two-up continuous (odd right)', TwoPageLeft: 'Two-up (odd left)', TwoPageRight: 'Two-up (cover page)' }
const MODE_LABEL: Record<string, string> = { '': 'Viewer default', UseNone: 'Nothing', UseOutlines: 'Bookmarks panel', UseThumbs: 'Thumbnails panel', FullScreen: 'Full screen', UseOC: 'Layers panel', UseAttachments: 'Attachments panel' }
const BATCH: [Field, string][] = [['title', 'Title'], ['author', 'Author'], ['subject', 'Subject'], ['keywords', 'Keywords'], ['creator', 'Creator'], ['producer', 'Producer'], ['created', 'Created'], ['modified', 'Modified'], ['trapped', 'Trapped'], ['lang', 'Language'], ['displayTitle', 'Show title'], ['layout', 'Page layout'], ['mode', 'Open panel'], ['custom', 'Custom keys']]

const DEF = { touch: true, xmp: true, batch: ['author', 'keywords', 'producer', 'lang', 'displayTitle', 'custom'] as Field[] }

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const local = value.slice(0, 19)
  const tz = value.slice(19)
  const bad = value !== '' && !isoToPdf(value)
  return (
    <label className={`k-field ${bad ? 'err' : ''}`}>
      <span className="k-label">{label}</span>
      <span style={{ display: 'flex', gap: 6 }}>
        <input className="k-text" type="datetime-local" step={1} value={local} onChange={(e) => onChange(e.target.value ? (e.target.value.length === 16 ? e.target.value + ':00' : e.target.value) + (tz || nowIso().slice(19)) : '')} style={{ flex: 1, minWidth: 0 }} />
        <input className="k-text" value={tz} placeholder="+00:00" onChange={(e) => onChange(local + e.target.value.trim())} style={{ width: 74 }} aria-label={`${label} time zone`} />
      </span>
    </label>
  )
}

export default function PdfMetadataEditor() {
  const [s, set] = useToolState('pdf-metadata-editor', DEF)
  const [items, setItems] = useState<Item[]>([])
  const [sel, setSel] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const cur = items.find((i) => i.id === sel) ?? items[0]

  const add = async (files: { name: string; bytes: Uint8Array }[]) => {
    setErr('')
    const lib = await import('pdf-lib')
    const out: Item[] = []
    for (const f of files) {
      try {
        const r = await readMeta(lib, f.bytes)
        out.push({ ...r, id: Math.random().toString(36).slice(2), name: f.name, bytes: f.bytes, orig: r.meta })
      } catch (e) {
        setErr(`${f.name}: not a readable PDF (${(e as Error).message})`)
      }
    }
    setItems((l) => [...l, ...out])
    if (out[0]) setSel(out[0].id)
  }
  useEffect(() => {
    void (async () => {
      const lib = await import('pdf-lib')
      await add([
        { name: 'q3-report.pdf', bytes: await demoPdf(lib, 'Q3 report', 4) },
        { name: 'board-pack.pdf', bytes: await demoPdf(lib, 'Board pack', 2) },
        { name: 'policy.pdf', bytes: await demoPdf(lib, 'Travel policy', 1) },
      ])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const edit = (p: Partial<Meta>) => cur && setItems((l) => l.map((i) => (i.id === cur.id ? { ...i, meta: { ...i.meta, ...p }, saved: false } : i)))
  const save = async (list: Item[]) => {
    setBusy(true)
    setErr('')
    const lib = await import('pdf-lib')
    for (const it of list) {
      try {
        const bytes = await writeMeta(lib, it.bytes, it.meta, { touchModified: s.touch, xmp: s.xmp })
        download(it.name.replace(/\.pdf$/i, '') + '.pdf', new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), 'application/pdf')
        const r = await readMeta(lib, bytes)
        setItems((l) => l.map((i) => (i.id === it.id ? { ...i, ...r, bytes, orig: r.meta, saved: true } : i)))
      } catch (e) {
        setErr(`${it.name}: ${(e as Error).message}`)
      }
    }
    setBusy(false)
  }

  if (!cur) return <Panel title="PDF metadata editor"><FileDrop accept="application/pdf,.pdf" multiple onFiles={async (fs) => add(await Promise.all(fs.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))))} label="Drop PDFs here or click to choose" />{err && <Note tone="err">{err}</Note>}<p className="muted">Generating demo files…</p></Panel>

  const m = cur.meta
  const warnings = lint(m)
  const changed = (Object.keys(EMPTY) as (keyof Meta)[]).filter((k) => JSON.stringify(m[k]) !== JSON.stringify(cur.orig[k]))
  const xmpPreview = buildXmp({ ...m, modified: s.touch ? nowIso() : m.modified }, { doc: 'uuid:(kept or new)', inst: 'uuid:(new on save)' }).replace(/\n( {99}\n)+/, '\n')

  return (
    <Split wide="right">
      <div>
        <Panel title="Files" actions={<Btn kind="ghost" onClick={() => { setItems([]); setSel('') }}>Clear</Btn>}>
          <FileDrop accept="application/pdf,.pdf" multiple onFiles={async (fs) => add(await Promise.all(fs.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))))} label="Add PDFs (several at once for batch edits)" />
          <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
            {items.map((it) => (
              <button key={it.id} type="button" className={`k-btn ${it.id === cur.id ? 'primary' : ''}`} style={{ justifyContent: 'space-between', display: 'flex', textAlign: 'left' }} onClick={() => setSel(it.id)}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {it.name}</span>
                <span style={{ opacity: 0.8, fontSize: 12 }}>{it.pages} p{it.saved ? ' · ✓ saved' : JSON.stringify(it.meta) !== JSON.stringify(it.orig) ? ' · edited' : ''}</span>
              </button>
            ))}
          </div>
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="Batch apply">
          <p className="muted" style={{ marginTop: 0 }}>Copy the ticked fields from <b>{cur.name}</b> to every other file, then save them all.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 2 }}>
            {BATCH.map(([f, l]) => (
              <Check key={f} label={l} value={s.batch.includes(f)} onChange={(v) => set({ batch: v ? [...s.batch, f] : s.batch.filter((x) => x !== f) })} />
            ))}
          </div>
          <Row>
            <Btn disabled={items.length < 2 || !s.batch.length} onClick={() => setItems((l) => l.map((i) => (i.id === cur.id ? i : { ...i, meta: applyFields(i.meta, m, s.batch), saved: false })))}>Apply to {items.length - 1} other file{items.length === 2 ? '' : 's'}</Btn>
            <Btn kind="primary" disabled={busy} onClick={() => void save(items)}>⬇ Save all ({items.length})</Btn>
          </Row>
        </Panel>
        <Panel title="Save options">
          <Check label="Set “Modified” to now when saving" value={s.touch} onChange={(touch) => set({ touch })} />
          <Check label="Write a matching XMP packet (recommended)" value={s.xmp} onChange={(xmp) => set({ xmp })} />
          <Note>Info dictionary and XMP are written together so Acrobat, macOS Preview, Windows Explorer and DAM systems all agree. Pages, text and images are untouched. Nothing is uploaded.</Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Pages" value={cur.pages} sub={`PDF ${cur.version}${cur.encrypted ? ' · encrypted' : ''}`} />
          <Stat label="Edited fields" value={changed.length} tone={changed.length ? 'accent' : undefined} sub={changed.slice(0, 3).join(', ') || 'none yet'} />
          <Stat label="Checks" value={warnings.length ? `${warnings.length} hint${warnings.length > 1 ? 's' : ''}` : 'OK'} tone={warnings.length ? 'bad' : 'good'} />
          <Stat label="Old XMP" value={cur.xmp ? `${cur.xmp.length} fields` : 'none'} sub={cur.conflicts.length ? `mismatch: ${cur.conflicts.join(', ')}` : 'in sync'} tone={cur.conflicts.length ? 'bad' : undefined} />
        </Stats>
        <Panel title={`Document info — ${cur.name}`} actions={<><Btn kind="ghost" onClick={() => edit(cur.orig)}>Revert</Btn><Btn kind="primary" disabled={busy} onClick={() => void save([cur])}>⬇ Save PDF</Btn></>}>
          <Txt label="Title" value={m.title} onChange={(title) => edit({ title })} placeholder="Shown in the viewer title bar and search results" />
          <Row>
            <Txt label="Author" value={m.author} onChange={(author) => edit({ author })} hint="Separate several authors with ;" />
            <Txt label="Subject" value={m.subject} onChange={(subject) => edit({ subject })} />
          </Row>
          <Txt label="Keywords" value={m.keywords} onChange={(keywords) => edit({ keywords })} hint="Comma- or semicolon-separated; becomes an XMP keyword bag" />
          <Row>
            <Txt label="Creator (application)" value={m.creator} onChange={(creator) => edit({ creator })} />
            <Txt label="Producer (PDF library)" value={m.producer} onChange={(producer) => edit({ producer })} />
          </Row>
          <Row>
            <DateField label="Created" value={m.created} onChange={(created) => edit({ created })} />
            <DateField label="Modified" value={m.modified} onChange={(modified) => edit({ modified })} />
          </Row>
          <Row>
            <Btn kind="ghost" onClick={() => edit({ created: nowIso() })}>Created = now</Btn>
            <Btn kind="ghost" onClick={() => edit({ modified: nowIso() })}>Modified = now</Btn>
            <Btn kind="ghost" onClick={() => edit({ created: '', modified: '' })}>Remove dates</Btn>
          </Row>
          <Row>
            <Select label="Language (/Lang)" value={LANGS.some(([v]) => v === m.lang) ? m.lang : '*'} onChange={(v) => v !== '*' && edit({ lang: v })} options={[...LANGS, ...(LANGS.some(([v]) => v === m.lang) ? [] : [['*', m.lang] as [string, string]])]} />
            <Txt label="…or any BCP 47 tag" value={m.lang} onChange={(lang) => edit({ lang: lang.trim() })} placeholder="e.g. fr-CA" />
            <Select label="Trapped" value={m.trapped} onChange={(trapped) => edit({ trapped })} options={[['', 'Not set'], ['True', 'True'], ['False', 'False'], ['Unknown', 'Unknown']]} />
          </Row>
        </Panel>
        <Panel title="Viewer preferences">
          <Check label="Show the document title in the window bar instead of the file name (DisplayDocTitle)" value={m.displayTitle} onChange={(displayTitle) => edit({ displayTitle })} />
          <Row>
            <Select label="Page layout on open" value={m.layout} onChange={(layout) => edit({ layout })} options={LAYOUTS.map((l) => [l, LAYOUT_LABEL[l]] as const)} />
            <Select label="Side panel on open" value={m.mode} onChange={(mode) => edit({ mode })} options={MODES.map((l) => [l, MODE_LABEL[l]] as const)} />
          </Row>
        </Panel>
        <Panel title="Custom properties" actions={<Btn onClick={() => edit({ custom: [...m.custom, ['NewKey', '']] })}>+ Property</Btn>}>
          {m.custom.length ? (
            <Table
              head={['Key', 'Value', '']}
              rows={m.custom.map(([k, v], i) => [
                <input key="k" value={k} aria-label="Key" onChange={(e) => edit({ custom: m.custom.map((c, j) => (j === i ? [e.target.value, c[1]] : c)) })} style={{ width: 140 }} />,
                <input key="v" value={v} aria-label="Value" onChange={(e) => edit({ custom: m.custom.map((c, j) => (j === i ? [c[0], e.target.value] : c)) })} style={{ width: '100%', minWidth: 160 }} />,
                <Btn key="x" kind="ghost" title="Remove" onClick={() => edit({ custom: m.custom.filter((_, j) => j !== i) })}>✕</Btn>,
              ])}
            />
          ) : <p className="muted">No custom keys. Add e.g. Company, Project, DocumentNumber or Classification.</p>}
          <p className="muted" style={{ fontSize: 13 }}>Custom keys are stored in the Info dictionary and mirrored in XMP under the pdfx namespace, where Acrobat’s “Custom” tab finds them.</p>
        </Panel>
        {warnings.length > 0 && <Panel title="Checks">{warnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}</Panel>}
        <Panel title="XMP packet that will be written" actions={<CopyButton text={xmpPreview} />}>
          <pre className="mono" style={{ maxHeight: 260, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{s.xmp ? xmpPreview : 'XMP writing is switched off: the existing packet (if any) is kept unchanged and may disagree with the Info dictionary.'}</pre>
        </Panel>
      </div>
    </Split>
  )
}
