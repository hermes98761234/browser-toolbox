import { useMemo, useState } from 'react'
import { Area, Btn, download, FileDrop, Note, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { makeDocx } from './lib/cover-letter-writer'
import { detectDelimiter, parseCsv } from './lib/csv-json-converter'
import { docxText, fields, fileName, fillDocxXml, fillText, unzip, type Row as DataRow, type ZipEntry } from './lib/document-assembly-tool'
import { zipStore } from './lib/pdf-splitter'

interface State {
  csv: string
  template: string
  pattern: string
  format: 'docx' | 'txt' | 'html'
  mode: 'text' | 'docx'
}

const DEF: State = {
  csv: `name,role,salary,start_date,manager,city,bonus
Ana Kovač,Product Designer,72000,2026-03-02,Lena Fischer,Berlin,5000
James Okafor,Backend Engineer,88000,2026-03-16,Tom Reyes,Remote,
Chloé Martin,Data Analyst,64000,2026-04-01,Lena Fischer,Paris,3000
Mateo Silva,Support Lead,58000,2026-04-13,Priya Shah,Lisbon,2500`,
  template: `Dear {{name}},

We are delighted to offer you the position of **{{role}}** at Northwind Labs, based in {{city}}.

Your starting annual salary will be {{salary|money}}, with a signing bonus of {{bonus|money|default:none}}. Your first day will be {{start_date|date}}, and you will report to {{manager}}.

Please sign and return this letter within ten business days. We are excited to welcome you to the team!

Kind regards,
Human Resources, Northwind Labs`,
  pattern: 'Offer letter - {{name}}',
  format: 'docx',
  mode: 'text',
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const enc = new TextEncoder()

function rowsOf(csv: string): { head: string[]; rows: DataRow[] } {
  const t = csv.trim()
  if (!t) return { head: [], rows: [] }
  const [head = [], ...body] = parseCsv(t, detectDelimiter(t)).filter((r) => r.some((c) => c.trim()))
  const h = head.map((x) => x.trim())
  return { head: h, rows: body.map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()]))) }
}

export default function DocumentAssemblyTool() {
  const [s, set, reset] = useToolState('document-assembly-tool', DEF)
  const [docx, setDocx] = useState<{ name: string; files: ZipEntry[]; xml: string } | null>(null)
  const [cur, setCur] = useState(0)
  const [err, setErr] = useState('')
  const data = useMemo(() => rowsOf(s.csv), [s.csv])
  const mode = s.mode === 'docx' && docx ? 'docx' : 'text'
  const source = mode === 'docx' ? docxText(docx!.xml) : s.template
  const used = fields(source)
  const missing = used.filter((f) => !data.head.some((h) => h.toLowerCase() === f.toLowerCase()))
  const i = Math.min(cur, Math.max(0, data.rows.length - 1))
  const row = data.rows[i] ?? {}
  const preview = mode === 'docx' ? docxText(fillDocxXml(docx!.xml, row)).replace(/\n/g, '\n\n') : fillText(s.template, row)
  const blanks = data.rows.map((r) => used.filter((f) => (r[Object.keys(r).find((k) => k.toLowerCase() === f.toLowerCase()) ?? f] ?? '').trim() === '' && !/default:/.test(source.match(new RegExp(`\\{\\{\\s*${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|[^}]*`))?.[0] ?? '')))

  const build = (r: DataRow, k: number): { name: string; data: Uint8Array } => {
    const base = fileName(s.pattern, r, k)
    if (mode === 'docx') {
      const files = docx!.files.map((f) =>
        /^word\/(document|header\d*|footer\d*)\.xml$/.test(f.name) ? { name: f.name, data: enc.encode(fillDocxXml(new TextDecoder().decode(f.data), r)) } : f,
      )
      return { name: `${base}.docx`, data: zipStore(files) }
    }
    const text = fillText(s.template, r)
    if (s.format === 'txt') return { name: `${base}.txt`, data: enc.encode(text.replace(/\*\*/g, '')) }
    if (s.format === 'html') return { name: `${base}.html`, data: enc.encode(htmlDoc([text], base)) }
    return { name: `${base}.docx`, data: makeDocx(text, { title: base }) }
  }
  const htmlDoc = (texts: string[], title: string) =>
    `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:12pt/1.5 Georgia,serif;max-width:46em;margin:2cm auto;color:#111}.doc{white-space:pre-wrap;page-break-after:always;margin-bottom:3em}@media print{body{margin:0}}</style>` +
    texts.map((t) => `<div class="doc">${esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>`).join('')

  const zipAll = () => {
    const seen = new Map<string, number>()
    const files = data.rows.map((r, k) => {
      const f = build(r, k)
      const n = seen.get(f.name) ?? 0
      seen.set(f.name, n + 1)
      return n ? { ...f, name: f.name.replace(/(\.\w+)$/, ` (${n + 1})$1`) } : f
    })
    download('documents.zip', new Blob([zipStore(files).slice().buffer], { type: 'application/zip' }))
  }
  const one = () => {
    const f = build(row, i)
    download(f.name, new Blob([f.data.slice().buffer]))
  }
  const loadSample = async () => {
    const files = await unzip(makeDocx(DEF.template, { title: 'Offer letter template' }))
    setDocx({ name: 'offer-letter-template.docx', files, xml: new TextDecoder().decode(files.find((f) => f.name === 'word/document.xml')!.data) })
  }
  const sampleDocx = () => download('offer-letter-template.docx', new Blob([makeDocx(DEF.template, { title: 'Offer letter template' }).slice().buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))

  return (
    <Split>
      <div>
        <Panel title="1 · Data (one document per row)" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <FileDrop accept=".csv,.tsv,.txt,text/csv" label="Drop a CSV/TSV (export spreadsheets as CSV)" onFiles={async ([f]) => { set({ csv: await f.text() }); setCur(0) }} />
          <Area value={s.csv} onChange={(csv) => set({ csv })} rows={6} mono placeholder="name,email,…" />
          <p className="k-hint">{data.rows.length} rows · columns: {data.head.join(', ') || '—'}</p>
        </Panel>
        <Panel title="2 · Template">
          <Seg value={s.mode} onChange={(m) => { set({ mode: m }); setErr('') }} options={[['text', 'Write template'], ['docx', 'Upload .docx']]} label="Template source" />
          {s.mode === 'text' ? (
            <>
              <Area value={s.template} onChange={(template) => set({ template })} rows={12} />
              <Row>
                {data.head.map((h) => (
                  <Btn key={h} kind="ghost" onClick={() => set({ template: `${s.template}{{${h}}}` })}>{`{{${h}}}`}</Btn>
                ))}
              </Row>
            </>
          ) : (
            <>
              <FileDrop accept=".docx" label="Drop a Word .docx with {{placeholders}}" onFiles={async ([f]) => {
                try {
                  const files = await unzip(new Uint8Array(await f.arrayBuffer()))
                  const main = files.find((x) => x.name === 'word/document.xml')
                  if (!main) throw new Error('This is not a Word document (word/document.xml missing).')
                  setDocx({ name: f.name, files, xml: new TextDecoder().decode(main.data) })
                  setErr('')
                } catch (e) {
                  setErr((e as Error).message)
                }
              }} />
              {docx ? <p className="k-hint">Template: <b>{docx.name}</b> · {fields(docxText(docx.xml)).length} fields found</p> : <Note>No .docx loaded yet — the written template is used meanwhile.</Note>}
              <Row>
                <Btn kind="ghost" onClick={() => void loadSample()}>Use sample .docx</Btn>
                <Btn kind="ghost" onClick={sampleDocx}>⬇ Download sample to edit in Word</Btn>
              </Row>
              <Note>Formatting, tables, headers and footers in your document are kept; only the placeholder text changes.</Note>
            </>
          )}
          <p className="k-hint">Filters: <code>{'{{salary|money}}'}</code>, <code>{'{{salary|money:€}}'}</code>, <code>{'{{date|date}}'}</code>, <code>{'{{name|upper}}'}</code>, <code>{'{{x|default:n/a}}'}</code>. In written templates <code>**bold**</code> works for DOCX/HTML.</p>
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="3 · Output">
          <Txt label="File name pattern" value={s.pattern} onChange={(pattern) => set({ pattern })} hint="Use any field, or {{#}} for the row number" />
          {mode === 'text' && <Seg value={s.format} onChange={(format) => set({ format })} options={[['docx', 'Word .docx'], ['html', 'HTML'], ['txt', 'Plain text']]} label="Format" />}
          <Row>
            <Btn kind="primary" disabled={!data.rows.length} onClick={zipAll}>⬇ All {data.rows.length} as ZIP</Btn>
            {mode === 'text' && <Btn disabled={!data.rows.length} onClick={() => download('all-documents.html', htmlDoc(data.rows.map((r) => fillText(s.template, r)), 'Merged documents'), 'text/html')}>⬇ One printable HTML</Btn>}
          </Row>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Documents" value={data.rows.length} tone="accent" />
          <Stat label="Fields used" value={used.length} />
          <Stat label="Unknown fields" value={missing.length} tone={missing.length ? 'bad' : 'good'} />
          <Stat label="Rows with blanks" value={blanks.filter((b) => b.length).length} tone={blanks.some((b) => b.length) ? 'accent' : 'good'} />
        </Stats>
        {missing.length > 0 && <Note tone="err">The template uses {missing.map((m) => `{{${m}}}`).join(', ')} but the data has no such column. They will appear as [field].</Note>}
        <Panel
          title={`Preview · ${fileName(s.pattern, row, i)}`}
          actions={
            <>
              <Btn disabled={i <= 0} onClick={() => setCur(i - 1)}>‹</Btn>
              <span className="muted">{data.rows.length ? i + 1 : 0} / {data.rows.length}</span>
              <Btn disabled={i >= data.rows.length - 1} onClick={() => setCur(i + 1)}>›</Btn>
              <Btn onClick={one} disabled={!data.rows.length}>⬇ This one</Btn>
            </>
          }
        >
          <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif', lineHeight: 1.55, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10, padding: '18px 20px' }}>
            {preview.split(/(\*\*.+?\*\*|\[[^\]\n]+\])/).map((p, k) => (p.startsWith('**') ? <b key={k}>{p.slice(2, -2)}</b> : /^\[.+\]$/.test(p) && missing.includes(p.slice(1, -1)) ? <mark key={k}>{p}</mark> : p))}
          </div>
          {blanks[i]?.length > 0 && <Note tone="warn">This row has empty values for: {blanks[i].join(', ')}.</Note>}
        </Panel>
        <Panel title="Data check">
          <Table
            head={['#', ...data.head.slice(0, 4), 'Blank fields']}
            rows={data.rows.map((r, k) => [
              <button key="n" type="button" className="k-btn ghost" style={{ padding: '2px 6px', fontWeight: k === i ? 800 : 500 }} onClick={() => setCur(k)}>{k + 1}</button>,
              ...data.head.slice(0, 4).map((h) => r[h]),
              blanks[k].length ? <span key="b" style={{ color: 'var(--warn)' }}>{blanks[k].join(', ')}</span> : <span key="b" style={{ color: 'var(--ok)' }}>✓</span>,
            ])}
            max={50}
          />
        </Panel>
      </div>
    </Split>
  )
}
