import { useState, type ReactNode } from 'react'
import { Btn, CopyButton, download, Note, Panel, Row, Select, Seg, Split, Stat, Stats, useToolState } from '../kit'
import { boldRuns, fill, makeDocx, placeholders, words } from './lib/cover-letter-writer'

const FIELDS: [string, string, string][] = [
  ['name', 'Your name', 'Alex Morgan'],
  ['contact', 'Email · phone · city', 'alex@example.com · +1 555 0100 · Austin, TX'],
  ['date', 'Date', ''],
  ['manager', 'Hiring manager', 'Ms. Rivera'],
  ['company', 'Company', 'Acme Analytics'],
  ['role', 'Job title', 'Senior Product Designer'],
  ['source', 'Where you saw the job', 'your careers page'],
  ['years', 'Years of experience', '6'],
  ['field', 'Your field / current role', 'product designer'],
  ['skills', 'Top skills (comma separated)', 'user research, design systems, prototyping'],
  ['achievement', 'Key achievement (with a number)', 'redesigned the onboarding flow and lifted activation by 23%'],
  ['why', 'Why this company', 'your focus on making data accessible to non-analysts'],
  ['value', 'What you will bring', 'a research-driven process and a scalable design system'],
  ['referrer', 'Referrer (if any)', 'Jamie Chen'],
  ['prev', 'Previous career (career change)', 'secondary-school teaching'],
]

const TEMPLATES: Record<string, { name: string; hint: string; text: string }> = {
  classic: {
    name: 'Classic professional',
    hint: 'Safe default for most applications: hook, proof, fit, close.',
    text: `**{{name}}**
{{contact}}

{{date}}

Dear {{manager}},

I am writing to apply for the **{{role}}** position at {{company}}, which I found on {{source}}. With {{years}} years of experience as a {{field}}, I have built strengths in {{skills}}, and I would love to bring them to your team.

In my current role I {{achievement}}. That project taught me how to balance user needs with business goals, and it is exactly the kind of impact I want to have at {{company}}.

Beyond results, I care about how the work gets done. I collaborate closely with engineers and product managers, share progress early, and back decisions with evidence. I am comfortable leading projects end to end and enjoy mentoring colleagues.

What draws me to {{company}} is {{why}}. I believe I can contribute {{value}} from day one.

Thank you for considering my application. I would welcome the chance to discuss how I can help {{company}} reach its goals.

Sincerely,
{{name}}`,
  },
  short: {
    name: 'Short & direct (email)',
    hint: 'For email bodies and online forms with a character limit.',
    text: `Dear {{manager}},

I'd like to apply for the {{role}} role at {{company}}. I'm a {{field}} with {{years}} years of experience in {{skills}}; most recently I {{achievement}}.

I'm excited about {{why}}, and I'd bring {{value}}. My CV is attached — I'd be glad to talk whenever suits you.

Best regards,
{{name}}
{{contact}}`,
  },
  referral: {
    name: 'Referral',
    hint: 'Lead with the person who referred you — it gets read first.',
    text: `**{{name}}**
{{contact}}

{{date}}

Dear {{manager}},

{{referrer}} suggested I reach out about the **{{role}}** opening at {{company}}. Having heard about the team's work first-hand, I'm confident my background is a strong match.

Over {{years}} years as a {{field}}, I have focused on {{skills}}. One result I'm proud of: I {{achievement}}.

{{referrer}} mentioned {{why}} — that is exactly the environment where I do my best work, and where I can add {{value}}.

I'd appreciate the opportunity to talk further. Thank you for your time.

Kind regards,
{{name}}`,
  },
  change: {
    name: 'Career changer',
    hint: 'Connects transferable skills from a previous career to the new role.',
    text: `**{{name}}**
{{contact}}

{{date}}

Dear {{manager}},

I am excited to apply for the **{{role}}** role at {{company}}. After a career in {{prev}}, I moved into work as a {{field}}, and the skills from both worlds — especially {{skills}} — make me a different kind of candidate.

My previous career taught me to explain complex ideas clearly, stay calm under pressure and put people first. Since switching, I {{achievement}}, which shows how quickly those strengths translate.

I am particularly drawn to {{company}} because of {{why}}. I would bring {{value}}, along with the perspective of someone who has seen problems from the other side.

Thank you for your consideration. I look forward to the possibility of discussing my application.

Sincerely,
{{name}}`,
  },
  graduate: {
    name: 'Graduate / entry level',
    hint: 'Emphasises projects, learning speed and enthusiasm over years.',
    text: `**{{name}}**
{{contact}}

{{date}}

Dear {{manager}},

I am a recent graduate eager to begin my career as a **{{role}}** at {{company}}. I came across the opening on {{source}} and was immediately excited by {{why}}.

During my studies and internships I developed practical skills in {{skills}}. In one project I {{achievement}} — an experience that confirmed this is the work I want to do.

I learn fast, ask good questions and enjoy working in teams. At {{company}} I would bring {{value}} and a genuine commitment to growing with the role.

Thank you for your time and consideration. I would be delighted to discuss how I could contribute.

Yours sincerely,
{{name}}`,
  },
}

interface State {
  tpl: string
  values: Record<string, string>
  edits: Record<string, string>
  font: string
  size: number
}

const today = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
const DEF: State = { tpl: 'classic', values: Object.fromEntries(FIELDS.map(([k, , ex]) => [k, ex])), edits: {}, font: 'Calibri', size: 11 }
const LABEL = Object.fromEntries(FIELDS.map(([k, l]) => [k, l]))

const Tip = ({ children }: { children: ReactNode }) => (
  <div className="k-note" style={{ background: 'color-mix(in srgb, var(--accent2) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent2) 35%, transparent)' }}>{children}</div>
)

const CLICHES = ['hard-working', 'team player', 'go-getter', 'think outside the box', 'detail-oriented', 'synergy', 'passionate', 'to whom it may concern', 'dynamic']

export default function CoverLetterWriter() {
  const [s, set, reset] = useToolState('cover-letter-writer', DEF)
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const tplText = s.edits[s.tpl] ?? TEMPLATES[s.tpl]?.text ?? TEMPLATES.classic.text
  const values: Record<string, string> = { ...s.values, date: s.values.date?.trim() ? s.values.date : today() }
  const used = placeholders(tplText)
  const missing = used.filter((k) => !values[k]?.trim())
  const plain = fill(tplText, values, (k) => `[${LABEL[k] ?? k}]`).replace(/\*\*/g, '')
  const wc = words(plain)
  const cliches = CLICHES.filter((c) => plain.toLowerCase().includes(c))
  const file = `Cover letter - ${(values.company || 'company').replace(/[^\w -]/g, '')} - ${(values.name || 'me').replace(/[^\w -]/g, '')}`

  const setV = (k: string, v: string) => set({ values: { ...s.values, [k]: v } })

  // Preview: placeholders that are still empty are highlighted.
  const preview = fill(tplText, values, (k) => `\u0001${k}\u0001`)
    .split(/\n{2,}/)
    .map((para, i) => (
      <p key={i} style={{ margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>
        {boldRuns(para).map((r, j) =>
          r.t.split('\u0001').map((chunk, k) => {
            const key = `${j}-${k}`
            if (k % 2) return <mark key={key} style={{ background: 'color-mix(in srgb, var(--warn) 35%, transparent)', color: 'inherit', borderRadius: 3, padding: '0 3px' }}>{LABEL[chunk] ?? chunk}</mark>
            return r.b ? <b key={key}>{chunk}</b> : <span key={key}>{chunk}</span>
          }),
        )}
      </p>
    ))

  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const html = fill(tplText, values, (k) => `[${LABEL[k] ?? k}]`)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')}</p>`)
      .join('')
    w.document.write(`<!doctype html><title>${file}</title><style>body{font:${s.size}pt ${s.font},Calibri,Arial,sans-serif;max-width:17cm;margin:2.5cm auto;line-height:1.45;color:#111}p{margin:0 0 1em}</style>${html}<script>onload=()=>print()</script>`)
    w.document.close()
  }

  return (
    <Split>
      <div>
        <Panel title="Template" actions={<Btn kind="ghost" onClick={reset}>Reset all</Btn>}>
          <div style={{ display: 'grid', gap: 6 }}>
            {Object.entries(TEMPLATES).map(([id, t]) => (
              <button
                key={id}
                type="button"
                onClick={() => set({ tpl: id })}
                style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 10, border: `1px solid ${id === s.tpl ? 'var(--accent)' : 'var(--line)'}`, background: id === s.tpl ? 'color-mix(in srgb, var(--accent) 8%, var(--panel))' : 'var(--panel)', color: 'inherit', font: 'inherit', cursor: 'pointer' }}
              >
                <b>{t.name}</b> {s.edits[id] !== undefined && <span className="muted" style={{ fontSize: 12 }}>· edited</span>}
                <div className="muted" style={{ fontSize: 13 }}>{t.hint}</div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Job & you">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Fields used by this template are shown first. Leave “Date” empty to use today.</p>
          {[...FIELDS].sort((a, b) => Number(!used.includes(a[0])) - Number(!used.includes(b[0]))).map(([k, label, ex]) => {
            const on = used.includes(k)
            return (
              <label key={k} className="k-field" style={{ opacity: on ? 1 : 0.5 }}>
                <span className="k-label">
                  {label} {on && !values[k]?.trim() && <span style={{ color: 'var(--warn)' }}>• needed</span>}
                </span>
                <input className="k-text" value={s.values[k] ?? ''} placeholder={k === 'date' ? today() : ex} onChange={(e) => setV(k, e.target.value)} />
              </label>
            )
          })}
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Words" value={wc} tone={wc >= 200 && wc <= 400 ? 'good' : 'bad'} sub="aim for 200–400" />
          <Stat label="Reading time" value={`${Math.max(1, Math.round(wc / 230))} min`} />
          <Stat label="Missing fields" value={missing.length} tone={missing.length ? 'bad' : 'good'} sub={missing.length ? missing.map((k) => LABEL[k] ?? k).join(', ').slice(0, 40) : 'all filled'} />
          <Stat label="Mentions company" value={`${(plain.match(new RegExp((values.company || '¤').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length}×`} sub="2–4× reads natural" />
        </Stats>
        <Panel
          title="Letter"
          actions={
            <>
              <Seg value={mode} onChange={setMode} options={[['preview', 'Preview'], ['edit', 'Edit template']]} label="Mode" />
              <CopyButton text={plain} />
              <Btn onClick={print}>🖨 Print / PDF</Btn>
              <Btn onClick={() => download(`${file}.txt`, plain)}>⬇ TXT</Btn>
              <Btn kind="primary" onClick={() => download(`${file}.docx`, new Blob([makeDocx(fill(tplText, values, (k) => `[${LABEL[k] ?? k}]`), { font: s.font, sizePt: s.size, title: file, author: values.name })], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))}>⬇ DOCX</Btn>
            </>
          }
        >
          {mode === 'preview' ? (
            <div style={{ background: '#fff', color: '#1f2937', borderRadius: 6, boxShadow: '0 2px 12px rgba(0,0,0,.12)', padding: 'clamp(18px, 5%, 48px)', fontFamily: `${s.font}, Calibri, Arial, sans-serif`, fontSize: `${s.size + 2}px`, lineHeight: 1.5, maxWidth: 720, margin: '0 auto' }}>{preview}</div>
          ) : (
            <>
              <textarea className="k-area mono" rows={22} value={tplText} onChange={(e) => set({ edits: { ...s.edits, [s.tpl]: e.target.value } })} style={{ width: '100%' }} aria-label="Template text" />
              <Row>
                <span className="muted" style={{ fontSize: 13, flex: 1 }}>
                  Use <code>{'{{company}}'}</code>-style placeholders: {FIELDS.map(([k]) => k).join(', ')}. Wrap text in <code>**double stars**</code> for bold. Blank line = new paragraph.
                </span>
                {s.edits[s.tpl] !== undefined && <Btn kind="ghost" onClick={() => { const e = { ...s.edits }; delete e[s.tpl]; set({ edits: e }) }}>Restore original</Btn>}
              </Row>
            </>
          )}
          <Row>
            <Select label="Font" value={s.font} onChange={(font) => set({ font })} options={['Calibri', 'Arial', 'Georgia', 'Times New Roman', 'Garamond', 'Helvetica']} />
            <Select label="Size" value={s.size} onChange={(size) => set({ size })} options={[[10, '10 pt'], [10.5, '10.5 pt'], [11, '11 pt'], [12, '12 pt']]} />
          </Row>
        </Panel>
        <Panel title="Checklist">
          {missing.length > 0 && <Note tone="warn">Fill in: {missing.map((k) => LABEL[k] ?? k).join(', ')}.</Note>}
          {!/\d/.test(values.achievement ?? '') && <Note tone="warn">Your achievement has no number. Quantify it (%, $, time saved, users) — it is the line recruiters remember.</Note>}
          {cliches.length > 0 && <Note tone="warn">Clichés spotted: {cliches.join(', ')}. Replace them with concrete evidence.</Note>}
          {wc > 450 && <Note tone="warn">Over 450 words. Most hiring managers skim; cut to one page.</Note>}
          {!missing.length && /\d/.test(values.achievement ?? '') && !cliches.length && wc <= 450 && <Note tone="ok">Ready to send. Read it aloud once and tailor one sentence specifically to this job ad.</Note>}
          <Tip>Tip: mirror 2–3 keywords from the job description in <b>Top skills</b> — applicant tracking systems scan for them.</Tip>
        </Panel>
      </div>
    </Split>
  )
}
