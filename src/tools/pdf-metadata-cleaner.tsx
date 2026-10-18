import { useCallback, useEffect, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Panel, Split, Stat, Stats, Table, useToolState } from '../kit'
import { ALL, analyze, clean, samplePdf, type CleanOpts, type Report } from './lib/pdf-metadata-cleaner'

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`)
const OPTS: [keyof CleanOpts, string, string][] = [
  ['info', 'Document Info dictionary', 'Title, Author, Subject, Keywords, Creator, Producer, dates, custom keys'],
  ['xmp', 'XMP metadata', 'Catalog XMP packet and per-object (page/image) XMP streams'],
  ['thumbs', 'Embedded page thumbnails', '/Thumb images can show an older version of a page'],
  ['pieceInfo', 'Private application data', '/PieceInfo and /LastModified (Illustrator, Photoshop, Word…)'],
  ['js', 'Document JavaScript', 'Name-tree scripts, JavaScript open actions, document/page additional actions'],
  ['annotAuthors', 'Annotation author fields', 'Comment author (/T) and dates (/M, /CreationDate); comments stay'],
  ['newId', 'New random document ID', 'The trailer /ID links copies of the same file'],
  ['embedded', 'Embedded file attachments', 'Off by default: attachments may be intended content'],
]

interface Loaded { name: string; bytes: Uint8Array; before: Report }

export default function PdfMetadataCleaner() {
  const [opts, setOpts, reset] = useToolState('pdf-metadata-cleaner', { ...ALL })
  const [file, setFile] = useState<Loaded | null>(null)
  const [after, setAfter] = useState<{ bytes: Uint8Array; rep: Report } | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async (name: string, bytes: Uint8Array) => {
    setErr('')
    setAfter(null)
    setBusy('Reading PDF…')
    try {
      const lib = await import('pdf-lib')
      const before = await analyze(lib, bytes)
      setFile({ name, bytes, before })
    } catch (e) {
      setErr(`Could not read this PDF: ${(e as Error).message}`)
    }
    setBusy('')
  }, [])
  useEffect(() => {
    let live = true
    void (async () => {
      const lib = await import('pdf-lib')
      const b = await samplePdf(lib)
      if (live) await load('sample-with-metadata.pdf', b)
    })()
    return () => {
      live = false
    }
  }, [load])

  // re-clean whenever the file or the options change, so before/after is always current
  useEffect(() => {
    if (!file || file.before.encrypted) return
    let live = true
    void (async () => {
      try {
        const lib = await import('pdf-lib')
        const out = await clean(lib, file.bytes, opts)
        const rep = await analyze(lib, out)
        if (live) setAfter({ bytes: out, rep })
      } catch (e) {
        if (live) setErr(`Cleaning failed: ${(e as Error).message}`)
      }
    })()
    return () => {
      live = false
    }
  }, [file, opts])

  const b = file?.before, a = after?.rep
  const row = (label: string, f: (r: Report) => string, bad: (r: Report) => boolean) => [
    <b key="l">{label}</b>,
    b ? <span key="b" style={{ color: bad(b) ? 'var(--warn)' : undefined }}>{f(b)}</span> : '—',
    a ? <span key="a" style={{ color: bad(a) ? 'var(--err)' : 'var(--ok)', fontWeight: 600 }}>{f(a)}</span> : <span key="a" className="muted">—</span>,
  ]
  const leaks = (r: Report) => r.info.length + (r.xmp ? 1 : 0) + r.objectXmp + r.thumbs + r.pieceInfo + r.js.names + r.js.actions + (r.js.openAction ? 1 : 0) + r.annots.withAuthor + (r.revisions > 1 ? 1 : 0)

  return (
    <Split>
      <div>
        <Panel title="PDF file" actions={<Btn kind="ghost" onClick={async () => { const lib = await import('pdf-lib'); await load('sample-with-metadata.pdf', await samplePdf(lib)) }}>Sample</Btn>}>
          <FileDrop accept=".pdf,application/pdf" onFiles={async ([f]) => load(f.name, new Uint8Array(await f.arrayBuffer()))} label="Drop a PDF here or click to choose" />
          {file && <p style={{ margin: '8px 0 0' }}><b>{file.name}</b> · {kb(file.before.bytes)} · {file.before.pages} pages · PDF {file.before.version}</p>}
          {busy && <Note>{busy}</Note>}
          {err && <Note tone="err">{err}</Note>}
          {file?.before.encrypted && <Note tone="err">This PDF is encrypted. Remove the password first (metadata in encrypted files cannot be rewritten here).</Note>}
        </Panel>
        <Panel title="What to remove" actions={<Btn kind="ghost" onClick={reset}>Defaults</Btn>}>
          {OPTS.map(([k, l, hint]) => (
            <div key={k} style={{ marginBottom: 6 }}>
              <Check label={<b>{l}</b>} value={!!opts[k]} onChange={(v) => setOpts({ [k]: v })} />
              <div className="muted" style={{ fontSize: 12, marginLeft: 26 }}>{hint}</div>
            </div>
          ))}
          {opts.info && <Check label="…but keep the document title (helps screen readers)" value={opts.keepTitle} onChange={(keepTitle) => setOpts({ keepTitle })} />}
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {after && file && <Btn kind="primary" onClick={() => download(file.name.replace(/\.pdf$/i, '') + '-clean.pdf', new Blob([after.bytes as BlobPart], { type: 'application/pdf' }))}>⬇ Download cleaned PDF</Btn>}
          </div>
        </Panel>
        <Note tone="warn">
          The cleaned file is written from scratch as a single revision, so <b>incremental-update history is dropped</b> — older versions of metadata (and of edited content) that PDF editors append to the end of a file disappear. Not touched: visible text, images (including EXIF inside embedded JPEGs), font names, form field values and hidden layers.
        </Note>
      </div>
      <div>
        {b && (
          <Stats>
            <Stat label="Metadata items found" value={leaks(b)} tone={leaks(b) ? 'bad' : 'good'} />
            <Stat label="After cleaning" value={a ? leaks(a) : '—'} tone={a ? (leaks(a) ? 'bad' : 'good') : undefined} />
            <Stat label="Revisions in file" value={b.revisions} sub={b.revisions > 1 ? 'older versions are still inside' : b.linearized ? 'linearized' : 'single revision'} />
            <Stat label="Size" value={kb(b.bytes)} sub={a ? `→ ${kb(a.bytes)}` : ''} />
          </Stats>
        )}
        {b && (
          <Panel title="Before → after">
            <Table
              head={['Item', 'Before', 'After']}
              rows={[
                row('Info dictionary', (r) => (r.info.length ? `${r.info.length} fields` : 'none'), (r) => r.info.length > 0 && !(r.info.length === 1 && r.info[0][0] === 'Title')),
                row('XMP packet', (r) => (r.xmp ? `${r.xmp.fields.length} properties` : 'none'), (r) => !!r.xmp),
                row('Object-level XMP', (r) => String(r.objectXmp), (r) => r.objectXmp > 0),
                row('Page thumbnails', (r) => String(r.thumbs), (r) => r.thumbs > 0),
                row('Private app data', (r) => String(r.pieceInfo), (r) => r.pieceInfo > 0),
                row('JavaScript', (r) => `${r.js.names} named · ${r.js.actions} actions${r.js.openAction ? ' · on open' : ''}`, (r) => r.js.names + r.js.actions > 0 || r.js.openAction),
                row('Annotation authors', (r) => (r.annots.withAuthor ? `${r.annots.withAuthor}: ${r.annots.authors.join(', ')}` : `none (${r.annots.total} annotations)`), (r) => r.annots.withAuthor > 0),
                row('Attachments', (r) => String(r.embedded), () => false),
                row('Document ID', (r) => (r.id ? r.id.slice(0, 20) + '…' : 'none'), () => false),
                row('Revisions', (r) => String(r.revisions), (r) => r.revisions > 1),
              ]}
            />
          </Panel>
        )}
        {b && b.info.length > 0 && (
          <Panel title="Document Info">
            <Table head={['Field', 'Before', 'After']} rows={b.info.map(([k, v]) => [<b key="k">{k}</b>, v, a ? (a.info.find((x) => x[0] === k)?.[1] ?? <span key="r" style={{ color: 'var(--ok)' }}>removed</span>) : '—'])} />
          </Panel>
        )}
        {b?.xmp && (
          <Panel title="XMP metadata (before)">
            <Table head={['Property', 'Value']} rows={b.xmp.fields.map(([k, v]) => [<code key="k">{k}</code>, v])} max={20} />
          </Panel>
        )}
        {b && b.rawStrings.length > 0 && (
          <Panel title="Readable in the raw bytes">
            <p className="muted" style={{ marginTop: 0 }}>Plain strings anyone can find with a text editor — including values from earlier revisions that viewers no longer show.</p>
            <Table head={['Key', 'Value', 'After']} rows={b.rawStrings.map(([k, v]) => [<code key="k">{k}</code>, v, a ? (a.rawStrings.some((x) => x[1] === v) ? <span key="s" style={{ color: 'var(--err)' }}>still present</span> : <span key="g" style={{ color: 'var(--ok)' }}>gone</span>) : '—'])} />
          </Panel>
        )}
      </div>
    </Split>
  )
}
