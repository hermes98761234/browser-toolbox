import { useState } from 'react'
import { Area, Btn, CopyButton, download, JsonButtons, Note, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { buildPdf, fieldNames, fill, lines, newSection, TEMPLATES, toText, type Form, type Kind, type Section } from './lib/consent-form-builder'

const KINDS: [Kind, string][] = [['checks', '☑ Checkboxes'], ['choice', '◉ Single choice'], ['fields', '▭ Text fields'], ['text', '¶ Paragraph']]
const HINT: Record<Kind, string> = { checks: 'One checkbox per line', choice: 'One option per line (radio buttons)', fields: 'One fillable field label per line', text: 'Plain paragraph text' }

export default function ConsentFormBuilder() {
  const [f, set, reset] = useToolState<Form>('consent-form-builder', TEMPLATES['Photo & video'])
  const [tpl, setTpl] = useState('Photo & video')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const edit = (id: string, p: Partial<Section>) => set({ sections: f.sections.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  const move = (i: number, d: number) => {
    const a = [...f.sections]
    const j = i + d
    if (j < 0 || j >= a.length) return
    ;[a[i], a[j]] = [a[j], a[i]]
    set({ sections: a })
  }
  const names = fieldNames(f)
  const pdf = async () => {
    setBusy(true)
    setErr('')
    try {
      const bytes = await buildPdf(f)
      download(`${f.title.toLowerCase().replace(/\W+/g, '-') || 'consent-form'}.pdf`, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Split>
      <div>
        <Panel title="Template">
          <Row>
            <Select label="Start from" value={tpl} onChange={setTpl} options={Object.keys(TEMPLATES)} />
            <Btn onClick={() => set(structuredClone(TEMPLATES[tpl]))}>Load template</Btn>
          </Row>
          <Txt label="Form title" value={f.title} onChange={(title) => set({ title })} />
          <Row>
            <Txt label="Organisation" value={f.org} onChange={(org) => set({ org })} />
            <Txt label="Contact" value={f.contact} onChange={(contact) => set({ contact })} />
          </Row>
          <Area label="Introduction ({{org}} and {{contact}} are filled in)" value={f.intro} onChange={(intro) => set({ intro })} rows={4} />
          <Row>
            <Seg value={f.paper} onChange={(paper) => set({ paper })} options={[['A4', 'A4'], ['Letter', 'US Letter']]} />
            <label className="k-check">Accent <input type="color" value={f.accent} onChange={(e) => set({ accent: e.target.value })} style={{ width: 36, height: 26, border: 0, padding: 0, background: 'none' }} /></label>
          </Row>
        </Panel>
        <Panel title="Sections" actions={<Row>{KINDS.map(([k, l]) => <Btn key={k} kind="ghost" onClick={() => set({ sections: [...f.sections, newSection(k)] })}>+ {l.split(' ').slice(1).join(' ')}</Btn>)}</Row>}>
          {f.sections.map((s, i) => (
            <div key={s.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <Row wrap={false}>
                <select className="k-select" value={s.kind} onChange={(e) => edit(s.id, { kind: e.target.value as Kind })} aria-label="Section type" style={{ maxWidth: 150 }}>
                  {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <span style={{ flex: 1 }} />
                <Btn kind="ghost" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</Btn>
                <Btn kind="ghost" onClick={() => move(i, 1)} disabled={i === f.sections.length - 1} title="Move down">↓</Btn>
                <Btn kind="ghost" onClick={() => set({ sections: f.sections.filter((x) => x.id !== s.id) })} title="Delete section">✕</Btn>
              </Row>
              <input className="k-text" style={{ width: '100%', fontWeight: 600, margin: '6px 0' }} value={s.title} onChange={(e) => edit(s.id, { title: e.target.value })} aria-label="Section title" />
              <Area value={s.body} onChange={(body) => edit(s.id, { body })} rows={s.kind === 'text' ? 4 : Math.min(7, lines(s.body).length + 1)} placeholder={HINT[s.kind]} />
              <span className="muted" style={{ fontSize: 12 }}>{HINT[s.kind]}</span>
            </div>
          ))}
        </Panel>
        <Panel title="Signers" actions={<Btn kind="ghost" onClick={() => set({ signers: [...f.signers, 'Witness'] })}>+ Signer</Btn>}>
          {f.signers.map((w, i) => (
            <Row key={i} wrap={false}>
              <input className="k-text" style={{ flex: 1 }} value={w} onChange={(e) => set({ signers: f.signers.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Signer ${i + 1}`} />
              <Btn kind="ghost" onClick={() => set({ signers: f.signers.filter((_, j) => j !== i) })} disabled={f.signers.length < 2}>✕</Btn>
            </Row>
          ))}
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Each signer gets fillable name and date fields plus a signature line (sign on paper, or type a name in the PDF).</p>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Sections" value={f.sections.length} />
          <Stat label="Fillable fields" value={names.length} tone="accent" />
          <Stat label="Signers" value={f.signers.length} />
        </Stats>
        <Panel
          title="Preview"
          actions={
            <>
              <Btn kind="primary" onClick={() => void pdf()} disabled={busy}>{busy ? 'Building…' : '⬇ Fillable PDF'}</Btn>
              <CopyButton text={() => toText(f)} label="Text" />
              <JsonButtons name="consent-form.json" data={f} onLoad={(d) => set(d)} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          {err && <Note tone="err">{err}</Note>}
          <div style={{ background: '#fff', color: '#222', borderRadius: 8, padding: '0 22px 18px', border: '1px solid var(--line)', borderTop: `6px solid ${f.accent}`, fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 13.5 }}>
            <div style={{ color: f.accent, fontWeight: 700, fontSize: 12, paddingTop: 14 }}>{f.org}</div>
            <h2 style={{ margin: '4px 0 8px', fontSize: 22, color: '#111' }}>{f.title}</h2>
            <p style={{ margin: '0 0 8px', lineHeight: 1.45 }}>{fill(f.intro, f)}</p>
            {f.sections.map((s) => (
              <div key={s.id} style={{ marginTop: 12 }}>
                <div style={{ color: f.accent, fontWeight: 700, marginBottom: 4 }}>{fill(s.title, f)}</div>
                {s.kind === 'text' && <p style={{ margin: 0, lineHeight: 1.45 }}>{fill(s.body, f)}</p>}
                {s.kind === 'checks' && lines(s.body).map((x, j) => <label key={j} style={{ display: 'flex', gap: 8, margin: '3px 0' }}><input type="checkbox" /> {fill(x, f)}</label>)}
                {s.kind === 'choice' && lines(s.body).map((x, j) => <label key={j} style={{ display: 'flex', gap: 8, margin: '3px 0' }}><input type="radio" name={s.id} /> {fill(x, f)}</label>)}
                {s.kind === 'fields' && lines(s.body).map((x, j) => (
                  <div key={j} style={{ margin: '4px 0' }}><div style={{ fontSize: 11, color: '#777' }}>{fill(x, f)}</div><div style={{ border: '1px solid #999', height: 22, borderRadius: 2 }} /></div>
                ))}
              </div>
            ))}
            <div style={{ color: f.accent, fontWeight: 700, margin: '16px 0 4px' }}>Signatures</div>
            {f.signers.map((w, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <b>{w}</b>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 4 }}>
                  <div><div style={{ fontSize: 11, color: '#777' }}>Printed name</div><div style={{ border: '1px solid #999', height: 22 }} /></div>
                  <div><div style={{ fontSize: 11, color: '#777' }}>Date</div><div style={{ border: '1px solid #999', height: 22 }} /></div>
                </div>
                <div style={{ fontSize: 11, color: '#777', marginTop: 8 }}>Signature</div>
                <div style={{ borderBottom: '1px solid #222', height: 26, width: '50%' }} />
              </div>
            ))}
            <div style={{ fontSize: 11, color: '#888', borderTop: '1px solid #ddd', paddingTop: 6 }}>{f.org}{f.contact ? ` · ${f.contact}` : ''}</div>
          </div>
        </Panel>
        <Panel title="PDF form fields">
          <p style={{ fontFamily: 'var(--mono)', fontSize: 12, margin: 0, wordBreak: 'break-word' }}>{names.join(' · ')}</p>
          <p className="muted" style={{ fontSize: 12 }}>The PDF opens in any reader (Acrobat, browser, Preview) with clickable checkboxes, radio buttons and text fields, so people can fill it on screen or print it.</p>
        </Panel>
        <Note tone="warn">
          <b>Not legal advice.</b> These templates are general starting points. Consent rules differ by country and context (e.g. GDPR, rules for minors, research ethics
          boards). Have the final wording checked by someone qualified for your situation.
        </Note>
      </div>
    </Split>
  )
}
