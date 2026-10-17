import { useEffect, useMemo, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Panel, Row, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'

type Kind = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'list' | 'button' | 'signature' | 'unknown'
type Val = string | boolean | string[]

interface Widget { page: number; x: number; y: number; w: number; h: number }
interface Field {
  name: string
  kind: Kind
  value: Val
  options: string[]
  multiline: boolean
  maxLen?: number
  readOnly: boolean
  required: boolean
  widgets: Widget[]
}
interface Loaded { name: string; bytes: Uint8Array; pages: [number, number][]; fields: Field[]; sample?: boolean }

const DEF = { flatten: false, outName: 'filled.pdf', showReadOnly: true }

async function inspect(name: string, bytes: Uint8Array, sample = false): Promise<Loaded> {
  const lib = await import('pdf-lib')
  const pdf = await lib.PDFDocument.load(bytes, { ignoreEncryption: true })
  const pages = pdf.getPages()
  const refs = pages.map((p) => p.ref)
  const form = pdf.getForm()
  const fields: Field[] = form.getFields().map((f) => {
    let kind: Kind = 'unknown'
    let value: Val = ''
    let options: string[] = []
    let multiline = false
    let maxLen: number | undefined
    if (f instanceof lib.PDFTextField) {
      kind = 'text'
      value = f.getText() ?? ''
      multiline = f.isMultiline()
      maxLen = f.getMaxLength()
    } else if (f instanceof lib.PDFCheckBox) {
      kind = 'checkbox'
      value = f.isChecked()
    } else if (f instanceof lib.PDFRadioGroup) {
      kind = 'radio'
      options = f.getOptions()
      value = f.getSelected() ?? ''
    } else if (f instanceof lib.PDFDropdown) {
      kind = 'dropdown'
      options = f.getOptions()
      value = f.getSelected()[0] ?? ''
    } else if (f instanceof lib.PDFOptionList) {
      kind = 'list'
      options = f.getOptions()
      value = f.getSelected()
    } else if (f instanceof lib.PDFButton) kind = 'button'
    else if (f instanceof lib.PDFSignature) kind = 'signature'
    const widgets = f.acroField.getWidgets().map((w) => {
      const r = w.getRectangle()
      const pref = w.P()
      let page = pref ? refs.findIndex((x) => x === pref || x.toString() === pref.toString()) : -1
      if (page < 0) page = 0
      return { page, x: r.x, y: r.y, w: r.width, h: r.height }
    })
    return { name: f.getName(), kind, value, options, multiline, maxLen, readOnly: f.isReadOnly(), required: f.isRequired(), widgets }
  })
  return { name, bytes, sample, pages: pages.map((p) => [p.getWidth(), p.getHeight()] as [number, number]), fields }
}

async function makeSample(): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  pdf.setTitle('Membership application')
  const page = pdf.addPage([595.28, 841.89])
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  page.drawRectangle({ x: 0, y: 771, width: 595.28, height: 71, color: rgb(0.39, 0.4, 0.95) })
  page.drawText('Membership application', { x: 40, y: 798, size: 24, font: bold, color: rgb(1, 1, 1) })
  const form = pdf.getForm()
  const lbl = (t: string, x: number, y: number) => page.drawText(t, { x, y, size: 10, font, color: rgb(0.3, 0.32, 0.38) })
  const text = (name: string, t: string, x: number, y: number, w: number, h = 22, value = '') => {
    lbl(t, x, y + h + 4)
    const f = form.createTextField(name)
    if (value) f.setText(value)
    f.addToPage(page, { x, y, width: w, height: h, borderWidth: 1 })
    return f
  }
  text('full_name', 'Full name', 40, 700, 330, 22, 'Ada Lovelace')
  text('member_id', 'Member ID (read-only)', 390, 700, 165, 22, 'M-2026-0417').enableReadOnly()
  text('email', 'Email', 40, 650, 250, 22, 'ada@example.org').enableRequired()
  text('phone', 'Phone', 305, 650, 250)
  text('street', 'Street address', 40, 600, 515)
  text('city', 'City', 40, 550, 250)
  const zip = text('zip', 'Postal code (max 6)', 305, 550, 120)
  zip.setMaxLength(6)
  lbl('Country', 440, 576)
  const dd = form.createDropdown('country')
  dd.addOptions(['United Kingdom', 'United States', 'Canada', 'Germany', 'Ukraine', 'Poland', 'Other'])
  dd.select('United Kingdom')
  dd.addToPage(page, { x: 440, y: 550, width: 115, height: 22 })
  lbl('Membership plan', 40, 515)
  const rg = form.createRadioGroup('plan')
  ;['Basic', 'Plus', 'Family'].forEach((o, i) => {
    rg.addOptionToPage(o, page, { x: 40 + i * 110, y: 492, width: 14, height: 14 })
    page.drawText(o, { x: 60 + i * 110, y: 495, size: 11, font })
  })
  rg.select('Plus')
  const ta = text('notes', 'Interests / notes', 40, 370, 515, 90)
  ta.enableMultiline()
  const cb = (name: string, t: string, y: number, on = false) => {
    const c = form.createCheckBox(name)
    if (name === 'terms') c.enableRequired()
    c.addToPage(page, { x: 40, y, width: 14, height: 14 })
    if (on) c.check()
    page.drawText(t, { x: 62, y: y + 3, size: 11, font })
  }
  cb('newsletter', 'Send me the monthly newsletter', 330, true)
  cb('terms', 'I agree to the terms and conditions', 306)
  text('signed_date', 'Date', 40, 240, 160)
  text('signature_name', 'Type your name as signature', 220, 240, 335)
  page.drawText('Generated sample form. Your files never leave the browser.', { x: 40, y: 40, size: 9, font, color: rgb(0.55, 0.56, 0.6) })
  return pdf.save()
}

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const shown = (v: Val) => (typeof v === 'boolean' ? (v ? 'Yes' : 'No') : Array.isArray(v) ? v.join(', ') : v)

export default function PdfFormFiller() {
  const [s, set] = useToolState('pdf-form-filler', DEF)
  const [doc, setDoc] = useState<Loaded | null>(null)
  const [vals, setVals] = useState<Record<string, Val>>({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [focus, setFocus] = useState('')
  const [page, setPage] = useState(0)

  const open = async (name: string, bytes: Uint8Array, sample = false) => {
    setErr('')
    try {
      const d = await inspect(name, bytes, sample)
      setDoc(d)
      setVals(Object.fromEntries(d.fields.map((f) => [f.name, f.value])))
      setPage(d.fields[0]?.widgets[0]?.page ?? 0)
      if (!sample) set({ outName: name.replace(/\.pdf$/i, '') + '-filled.pdf' })
    } catch (e) {
      setErr(`Could not read this PDF: ${(e as Error).message}`)
    }
  }
  const loadSample = async () => open('membership-application.pdf', await makeSample(), true)

  useEffect(() => {
    void (async () => {
      const b = await makeSample()
      await open('membership-application.pdf', b, true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fields = useMemo(() => (doc?.fields ?? []).filter((f) => s.showReadOnly || !f.readOnly), [doc, s.showReadOnly])
  const fillable = (doc?.fields ?? []).filter((f) => !f.readOnly && f.kind !== 'button' && f.kind !== 'signature')
  const filled = fillable.filter((f) => {
    const v = vals[f.name]
    return typeof v === 'boolean' ? v : Array.isArray(v) ? v.length > 0 : !!v
  })
  const missing = fillable.filter((f) => f.required && !filled.includes(f))
  const changed = (doc?.fields ?? []).filter((f) => JSON.stringify(vals[f.name]) !== JSON.stringify(f.value))

  const save = async () => {
    if (!doc) return
    setBusy(true)
    setErr('')
    try {
      const lib = await import('pdf-lib')
      const pdf = await lib.PDFDocument.load(doc.bytes, { ignoreEncryption: true })
      const form = pdf.getForm()
      const font = await pdf.embedFont(lib.StandardFonts.Helvetica)
      for (const f of doc.fields) {
        if (f.readOnly) continue
        const v = vals[f.name]
        const pf = form.getField(f.name)
        if (pf instanceof lib.PDFTextField) pf.setText(typeof v === 'string' && v ? v : undefined)
        else if (pf instanceof lib.PDFCheckBox) {
          if (v) pf.check()
          else pf.uncheck()
        }
        else if (pf instanceof lib.PDFRadioGroup) {
          if (v) pf.select(String(v))
          else pf.clear()
        }
        else if (pf instanceof lib.PDFDropdown) {
          if (v) pf.select(String(v))
          else pf.clear()
        }
        else if (pf instanceof lib.PDFOptionList) {
          if (Array.isArray(v) && v.length) pf.select(v)
          else pf.clear()
        }
      }
      form.updateFieldAppearances(font)
      if (s.flatten) form.flatten()
      const out = await pdf.save()
      download(s.outName || 'filled.pdf', new Blob([out as BlobPart], { type: 'application/pdf' }))
    } catch (e) {
      setErr(`Saving failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const importJson = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as Record<string, Val>
      const names = new Set(doc?.fields.map((x) => x.name))
      const hit = Object.entries(data).filter(([k]) => names.has(k))
      setVals((v) => ({ ...v, ...Object.fromEntries(hit) }))
      if (!hit.length) setErr('No field names in that JSON match this form.')
    } catch {
      setErr('That file is not valid JSON.')
    }
  }

  const input = (f: Field) => {
    const v = vals[f.name]
    const dis = f.readOnly
    const common = { onFocus: () => { setFocus(f.name); if (f.widgets[0]) setPage(f.widgets[0].page) }, disabled: dis, 'aria-label': f.name }
    switch (f.kind) {
      case 'text':
        return f.multiline ? (
          <textarea className="k-area" rows={3} value={String(v ?? '')} maxLength={f.maxLen} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} {...common} />
        ) : (
          <input className="k-text" value={String(v ?? '')} maxLength={f.maxLen} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} {...common} />
        )
      case 'checkbox':
        return <label className="k-check"><input type="checkbox" checked={!!v} onChange={(e) => setVals({ ...vals, [f.name]: e.target.checked })} {...common} /> {v ? 'Checked' : 'Unchecked'}</label>
      case 'radio':
        return (
          <Row>
            {f.options.map((o) => (
              <label key={o} className="k-check"><input type="radio" name={f.name} checked={v === o} onChange={() => setVals({ ...vals, [f.name]: o })} {...common} /> {o}</label>
            ))}
          </Row>
        )
      case 'dropdown':
        return (
          <select className="k-select" value={String(v ?? '')} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} {...common}>
            <option value="">—</option>
            {f.options.map((o) => <option key={o}>{o}</option>)}
          </select>
        )
      case 'list':
        return (
          <select className="k-select" multiple value={(v as string[]) ?? []} onChange={(e) => setVals({ ...vals, [f.name]: [...e.target.selectedOptions].map((o) => o.value) })} {...common}>
            {f.options.map((o) => <option key={o}>{o}</option>)}
          </select>
        )
      default:
        return <span className="muted">{f.kind === 'signature' ? 'Signature fields cannot be filled here' : 'Push buttons have no value'}</span>
    }
  }

  const pg = doc?.pages[page]
  return (
    <Split wide="right">
      <div>
        <Panel title="PDF with a form">
          <FileDrop accept="application/pdf,.pdf" onFiles={async ([f]) => open(f.name, new Uint8Array(await f.arrayBuffer()))} label="Drop a fillable PDF or click to choose" />
          <Row>
            <Btn kind="ghost" onClick={loadSample}>Load sample form</Btn>
          </Row>
          {doc && (
            <p className="muted" style={{ marginTop: 8 }}>
              {doc.sample && '🧪 '}<b>{doc.name}</b> · {kb(doc.bytes.length)} · {doc.pages.length} page{doc.pages.length === 1 ? '' : 's'}
            </p>
          )}
          {err && <Note tone="err">{err}</Note>}
          {doc && !doc.fields.length && <Note tone="warn">This PDF has no interactive (AcroForm) fields. Scanned or "flat" forms cannot be filled field by field.</Note>}
        </Panel>
        <Panel title="Save">
          <Txt label="Output file name" value={s.outName} onChange={(outName) => set({ outName })} />
          <Check label="Flatten form (fields become plain page content, no longer editable)" value={s.flatten} onChange={(flatten) => set({ flatten })} />
          <Row>
            <Btn kind="primary" onClick={save} disabled={!doc || busy}>{busy ? 'Saving…' : '⬇ Download filled PDF'}</Btn>
          </Row>
          {missing.length > 0 && <Note tone="warn">Required but empty: {missing.map((f) => f.name).join(', ')}</Note>}
          <Note>Values are written with pdf-lib and appearances are regenerated with Helvetica, so the text shows up in every viewer. Flattening is best for sending a final copy.</Note>
        </Panel>
        {pg && (
          <Panel title={`Field map — page ${page + 1}`} actions={doc!.pages.length > 1 && (
            <>
              <Btn kind="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</Btn>
              <Btn kind="ghost" disabled={page >= doc!.pages.length - 1} onClick={() => setPage(page + 1)}>›</Btn>
            </>
          )}>
            <svg viewBox={`0 0 ${pg[0]} ${pg[1]}`} style={{ width: '100%', maxHeight: 520, background: '#fff', border: '1px solid var(--line)', borderRadius: 6 }}>
              {doc!.fields.flatMap((f) => f.widgets.filter((w) => w.page === page).map((w, i) => {
                const v = vals[f.name]
                const on = focus === f.name
                return (
                  <g key={f.name + i} onClick={() => { setFocus(f.name); document.getElementById(`ff-${f.name}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }} style={{ cursor: 'pointer' }}>
                    <rect x={w.x} y={pg[1] - w.y - w.h} width={w.w} height={w.h} fill={on ? 'rgba(99,102,241,.25)' : f.readOnly ? 'rgba(100,116,139,.12)' : 'rgba(14,165,233,.12)'} stroke={on ? '#6366f1' : '#0ea5e9'} strokeWidth={on ? 2 : 1} />
                    {f.kind === 'text' && <text x={w.x + 4} y={pg[1] - w.y - w.h + Math.min(w.h - 6, 15)} fontSize={11} fill="#0f172a">{String(v ?? '').slice(0, Math.floor(w.w / 6))}</text>}
                    {f.kind === 'dropdown' && <text x={w.x + 4} y={pg[1] - w.y - w.h + 15} fontSize={10} fill="#0f172a">{String(v ?? '')}</text>}
                    {f.kind === 'checkbox' && v === true && <text x={w.x + w.w / 2} y={pg[1] - w.y - 3} fontSize={w.h} textAnchor="middle" fill="#0f172a">✓</text>}
                    {f.kind === 'radio' && <circle cx={w.x + w.w / 2} cy={pg[1] - w.y - w.h / 2} r={w.w / 4} fill={v === f.options[i] ? '#0f172a' : 'none'} />}
                  </g>
                )
              }))}
            </svg>
            <p className="k-hint">Schematic of field positions (page content is not rendered). Click a box to jump to its input.</p>
          </Panel>
        )}
      </div>
      <div>
        <Stats>
          <Stat label="Fields" value={doc?.fields.length ?? 0} sub={`${fillable.length} fillable`} />
          <Stat label="Filled" value={`${filled.length} / ${fillable.length}`} tone={fillable.length && filled.length === fillable.length ? 'good' : 'accent'} />
          <Stat label="Changed" value={changed.length} sub="vs. original values" />
          <Stat label="Required missing" value={missing.length} tone={missing.length ? 'bad' : 'good'} />
        </Stats>
        <Panel
          title="Form fields"
          actions={
            <>
              <Btn onClick={() => download('form-data.json', JSON.stringify(vals, null, 2), 'application/json')}>⬇ Values JSON</Btn>
              <label className="k-btn">
                ⬆ Import values
                <input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importJson(f) }} />
              </label>
              <Btn kind="ghost" onClick={() => doc && setVals(Object.fromEntries(doc.fields.map((f) => [f.name, f.value])))}>Revert</Btn>
              <Btn kind="ghost" onClick={() => doc && setVals(Object.fromEntries(doc.fields.map((f) => [f.name, f.readOnly ? f.value : f.kind === 'checkbox' ? false : f.kind === 'list' ? [] : ''])))}>Clear all</Btn>
            </>
          }
        >
          <Check label="Show read-only fields" value={s.showReadOnly} onChange={(showReadOnly) => set({ showReadOnly })} />
          {fields.map((f) => (
            <div key={f.name} id={`ff-${f.name}`} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', outline: focus === f.name ? '2px solid var(--accent)' : undefined, outlineOffset: 2, borderRadius: 4 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 4 }}>
                <b>{f.name}</b>
                <span className="muted" style={{ fontSize: 12 }}>
                  {f.kind}{f.multiline ? ' · multiline' : ''}{f.maxLen ? ` · max ${f.maxLen}` : ''} · p.{(f.widgets[0]?.page ?? 0) + 1}
                  {f.required && <b style={{ color: 'var(--err)' }}> · required</b>}
                  {f.readOnly && ' · read-only'}
                </span>
              </div>
              {input(f)}
            </div>
          ))}
        </Panel>
        {doc && doc.fields.length > 0 && (
          <Panel title="Summary">
            <Table head={['Field', 'Type', 'Value']} rows={doc.fields.map((f) => [f.name, f.kind, shown(vals[f.name] ?? '') || <span key="e" className="muted">empty</span>])} max={40} />
          </Panel>
        )}
      </div>
    </Split>
  )
}
