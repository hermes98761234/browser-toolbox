import { useState } from 'react'
import { Area, Btn, JsonButtons, Note, Panel, Row, Select, Split, Txt, uid, useToolState } from '../kit'
import { BUILTINS, extractFields, fill, mailto, missing, toHtml, toPlain } from './lib/email-template-builder'

interface Tpl { id: string; name: string; cat: string; subject: string; body: string; values: Record<string, string> }
const T = (name: string, cat: string, subject: string, body: string): Tpl => ({ id: uid(), name, cat, subject, body, values: {} })
const SAMPLES: Tpl[] = [
  T('Meeting follow-up', 'Work', 'Follow-up: {{meeting topic}} ({{today}})', `Hi {{first name|everyone}},

Thanks for joining the **{{meeting topic}}** session today. A quick summary of what we agreed:

- {{decision 1}}
- {{decision 2}}
- Next check-in: *{{next meeting date}}*

If I missed anything, just reply to this email.

Best regards,
{{your name}}`),
  T('Invoice reminder', 'Billing', 'Friendly reminder: invoice {{invoice number}} is due {{due date}}', `Hello {{client name}},

This is a friendly reminder that invoice **{{invoice number}}** for **{{amount}}** is due on {{due date}}.

You can pay by bank transfer using the details on the invoice. If payment is already on its way, please ignore this message — and thank you!

Kind regards,
{{your name}}
{{company|}}`),
  T('Interview thank-you', 'Career', 'Thank you — {{role}} interview', `Dear {{interviewer name}},

Thank you for taking the time to talk with me {{when|today}} about the **{{role}}** position. I especially enjoyed hearing about {{topic you enjoyed}}.

Our conversation confirmed my enthusiasm for the team, and I'm confident my experience with {{your strength}} would help from day one.

Please let me know if I can share anything else.

With thanks,
{{your name}}`),
  T('Reschedule request', 'Work', 'Could we move our {{meeting}}?', `Hi {{first name}},

Something has come up and I can't make our {{meeting}} on {{original time}}. Would any of these work instead?

- {{option 1}}
- {{option 2}}

Sorry for the shuffle, and thanks for your flexibility.

{{your name}}`),
  T('Out of office', 'Auto-reply', 'Out of office until {{return date}}', `Hello,

Thanks for your message. I'm away until **{{return date}}** with limited access to email.

For anything urgent, please contact {{backup name}} at [{{backup email}}](mailto:{{backup email}}).

I'll reply as soon as I'm back.

{{your name}}`),
  T('Customer welcome', 'Sales', 'Welcome to {{product}}, {{first name|there}}!', `Hi {{first name|there}},

Welcome aboard! Your **{{plan|Starter}}** plan is active as of {{today}}.

Three things to try first:
- {{tip 1|Set up your profile}}
- {{tip 2|Invite a teammate}}
- {{tip 3|Explore the getting-started guide}}

Questions? Reply to this email — a real person reads every message.

The {{product}} team`),
]
SAMPLES[0].values = { 'meeting topic': 'Q4 roadmap', 'first name': 'Priya', 'decision 1': 'Ship the onboarding redesign in November', 'decision 2': 'Pause the legacy export feature', 'next meeting date': 'Thursday 10:00' }
const DEF = { tpls: SAMPLES, sel: SAMPLES[0].id, to: '', shared: { 'your name': 'Alex Morgan' } as Record<string, string> }
const GLOBAL = ['your name', 'company'] // remembered across templates

export default function EmailTemplateBuilder() {
  const [s, set, reset] = useToolState('email-template-builder', DEF)
  const [status, setStatus] = useState('')
  const [tab, setTab] = useState<'fill' | 'edit'>('fill')
  const tpl = s.tpls.find((t) => t.id === s.sel) ?? s.tpls[0]
  const editTpl = (p: Partial<Tpl>) => set({ tpls: s.tpls.map((t) => (t.id === tpl?.id ? { ...t, ...p } : t)) })
  if (!tpl) {
    return <Panel title="Templates"><Note>No templates. <Btn onClick={reset}>Restore samples</Btn></Note></Panel>
  }
  const fields = extractFields(tpl.subject, tpl.body)
  const values: Record<string, string> = { ...Object.fromEntries(GLOBAL.map((g) => [g, s.shared[g] ?? ''])), ...tpl.values }
  const setVal = (k: string, v: string) => {
    if (GLOBAL.includes(k)) set({ shared: { ...s.shared, [k]: v } })
    else editTpl({ values: { ...tpl.values, [k]: v } })
  }
  const miss = missing(fields, values)
  const subject = fill(tpl.subject, values)
  const body = fill(tpl.body, values)
  const markHtml = toHtml(fill(tpl.body, values, undefined, (n) => `⟦${n}⟧`)).replace(/⟦([^⟧]*)⟧/g, '<mark style="background:#fde68a;color:#78350f;border-radius:3px;padding:0 3px">{{$1}}</mark>')
  const cats = [...new Set(s.tpls.map((t) => t.cat || 'Other'))]

  const copyRich = async () => {
    const html = toHtml(body), plain = toPlain(body)
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })])
      setStatus('Copied as rich text — paste into Gmail, Outlook or any mail composer.')
    } catch {
      const div = document.createElement('div')
      div.innerHTML = html
      div.style.cssText = 'position:fixed;left:-9999px'
      document.body.appendChild(div)
      const r = document.createRange()
      r.selectNodeContents(div)
      const sel = getSelection()
      sel?.removeAllRanges()
      sel?.addRange(r)
      const ok = document.execCommand('copy')
      sel?.removeAllRanges()
      div.remove()
      setStatus(ok ? 'Copied as rich text.' : 'Copy failed — select the preview and copy manually.')
    }
    setTimeout(() => setStatus(''), 2500)
  }
  const copyPlain = async (t: string, what: string) => {
    try {
      await navigator.clipboard.writeText(t)
      setStatus(`${what} copied.`)
    } catch {
      setStatus('Clipboard not available.')
    }
    setTimeout(() => setStatus(''), 2000)
  }
  const insert = (name: string) => editTpl({ body: `${tpl.body}{{${name}}}` })

  return (
    <Split wide="right">
      <div>
        <Panel title="Templates" actions={<Btn kind="ghost" onClick={reset}>Samples</Btn>}>
          {cats.map((c) => (
            <div key={c} style={{ marginBottom: 6 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>{c}</div>
              {s.tpls.filter((t) => (t.cat || 'Other') === c).map((t) => (
                <button key={t.id} type="button" className={`k-btn ${t.id === tpl.id ? 'primary' : 'ghost'}`} style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 3 }} onClick={() => set({ sel: t.id })}>{t.name}</button>
              ))}
            </div>
          ))}
          <Row>
            <Btn onClick={() => { const t = T('New template', 'Other', 'Subject with {{field}}', 'Hi {{first name|there}},\n\n\n\nBest,\n{{your name}}'); set({ tpls: [...s.tpls, t], sel: t.id }); setTab('edit') }}>＋ New</Btn>
            <Btn onClick={() => { const t = { ...tpl, id: uid(), name: `${tpl.name} (copy)` }; set({ tpls: [...s.tpls, t], sel: t.id }) }}>Duplicate</Btn>
            <Btn kind="danger" onClick={() => { const rest = s.tpls.filter((t) => t.id !== tpl.id); set({ tpls: rest, sel: rest[0]?.id ?? '' }) }}>Delete</Btn>
          </Row>
          <Row><JsonButtons name="email-templates.json" data={s.tpls} onLoad={(tpls) => Array.isArray(tpls) && tpls.length && set({ tpls, sel: tpls[0].id })} /></Row>
          <p className="k-hint">Templates are saved in this browser only.</p>
        </Panel>
      </div>
      <div>
        <Panel title={tpl.name} actions={<>
          <Btn kind={tab === 'fill' ? 'primary' : 'ghost'} onClick={() => setTab('fill')}>Fill in</Btn>
          <Btn kind={tab === 'edit' ? 'primary' : 'ghost'} onClick={() => setTab('edit')}>Edit template</Btn>
        </>}>
          {tab === 'edit' ? (
            <>
              <Row>
                <Txt label="Template name" value={tpl.name} onChange={(name) => editTpl({ name })} />
                <Txt label="Category" value={tpl.cat} onChange={(cat) => editTpl({ cat })} />
              </Row>
              <Txt label="Subject" value={tpl.subject} onChange={(subject) => editTpl({ subject })} />
              <Area label="Body" value={tpl.body} onChange={(b) => editTpl({ body: b })} rows={14} mono />
              <Row>
                <span className="muted" style={{ fontSize: 12 }}>Insert:</span>
                {BUILTINS.map((b) => <Btn key={b} kind="ghost" onClick={() => insert(b)}>{`{{${b}}}`}</Btn>)}
              </Row>
              <Note>Write <code>{'{{field name}}'}</code> for a blank to fill, <code>{'{{field|default}}'}</code> for a blank with a fallback. Formatting: <code>**bold**</code>, <code>*italic*</code>, <code>[text](https://link)</code>, lines starting with <code>- </code> become a bullet list. Built-ins ({BUILTINS.join(', ')}) fill themselves.</Note>
            </>
          ) : (
            <>
              {fields.length ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0 12px' }}>
                  {fields.map((f) => (
                    <Txt key={f.name} label={<>{f.name}{GLOBAL.includes(f.name) && <span className="muted"> · shared</span>}</>} value={values[f.name] ?? ''} onChange={(v) => setVal(f.name, v)} placeholder={f.def || ''}
                      type={/email/i.test(f.name) ? 'email' : 'text'} />
                  ))}
                </div>
              ) : <Note>This template has no {'{{fields}}'} — it's ready to send as is.</Note>}
              <Row>
                <Btn kind="ghost" onClick={() => editTpl({ values: {} })}>Clear values</Btn>
                <Select label="" value="" onChange={(id) => { const src = s.tpls.find((t) => t.id === id); if (src) editTpl({ values: { ...src.values, ...tpl.values } }) }} options={[['', 'Copy matching values from…'], ...s.tpls.filter((t) => t.id !== tpl.id).map((t) => [t.id, t.name] as [string, string])]} />
              </Row>
            </>
          )}
        </Panel>
        <Panel title="Preview" actions={<>
          <Btn kind="primary" onClick={() => void copyRich()}>⧉ Copy rich text</Btn>
          <Btn onClick={() => void copyPlain(toPlain(body), 'Plain text')}>Plain</Btn>
          <Btn onClick={() => void copyPlain(subject, 'Subject')}>Subject</Btn>
        </>}>
          {miss.length > 0 && <Note tone="warn">Still blank: {miss.join(', ')}</Note>}
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: '#fff', color: '#1f2937' }}>
            <div style={{ padding: '8px 14px', borderBottom: '1px solid #e5e7eb', background: '#f8fafc', fontSize: 14 }}>
              <div><span style={{ color: '#6b7280' }}>To:</span> {s.to || <span style={{ color: '#9ca3af' }}>recipient@example.com</span>}</div>
              <div><span style={{ color: '#6b7280' }}>Subject:</span> <b>{subject}</b></div>
            </div>
            <div style={{ padding: '6px 14px 12px', fontSize: 15, lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: markHtml }} />
          </div>
          {status && <Note tone="ok">{status}</Note>}
          <Row>
            <Txt label="Send to (optional)" value={s.to} onChange={(to) => set({ to })} placeholder="name@example.com" type="email" />
            <a className="k-btn" href={mailto(s.to, subject, toPlain(body))}>✉ Open in mail app</a>
          </Row>
          <p className="k-hint">“Open in mail app” passes plain text (mail links cannot carry formatting). For bold text and links, use Copy rich text and paste into your composer.</p>
        </Panel>
      </div>
    </Split>
  )
}
