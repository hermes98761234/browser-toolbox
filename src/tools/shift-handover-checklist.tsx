import { useEffect, useState } from 'react'
import { Bar, Btn, Check, CopyButton, JsonButtons, Note, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'

type Pri = 'stable' | 'watch' | 'critical'
interface Item { id: string; text: string; done: boolean; note: string }
interface Section { id: string; title: string; items: Item[] }
interface Task { id: string; text: string; due: string; done: boolean }
interface Subject { id: string; label: string; pri: Pri; s: string; b: string; a: string; r: string; tasks: Task[] }
interface State {
  template: string
  unit: string
  from: string
  to: string
  shift: string
  date: string
  subjects: Subject[]
  sections: Section[]
  notes: string
  ackBy: string
  ackAt: string
}

interface Tpl { name: string; subject: string; prompts: [string, string, string, string]; sections: [string, string[]][] }
const TPL: Record<string, Tpl> = {
  nursing: {
    name: 'Nursing ward (SBAR)', subject: 'Patient / bed',
    prompts: ['Reason for admission, current concern, code status', 'Relevant history, allergies, procedures, meds given', 'Latest vitals & trends, pain, lines/drains, mobility, risk scores', 'What to watch, pending results, what to do if it changes'],
    sections: [
      ['Safety & environment', ['Bed rails / call bells in reach', 'Fall-risk patients identified', 'Isolation precautions signed', 'Emergency trolley checked & sealed', 'Oxygen & suction checked']],
      ['Medications', ['Controlled drugs counted & signed', 'Time-critical meds due next shift listed', 'IV infusions & rates verified at bedside', 'Fridge temperature logged']],
      ['Admin & staffing', ['Admissions / discharges / transfers noted', 'Staffing & breaks agreed', 'Outstanding referrals handed over', 'Incident reports filed']],
    ],
  },
  icu: {
    name: 'ICU / critical care', subject: 'Bed',
    prompts: ['Diagnosis, current status, ceiling of care', 'PMH, timeline of stay, key events this shift', 'Neuro / resp (vent settings) / CVS (pressors) / renal / lines', 'Goals for next shift, weaning plan, escalation triggers'],
    sections: [
      ['Bedside checks', ['Airway equipment & bag-valve-mask at bedside', 'Alarm limits reviewed', 'Infusion pumps & syringe labels checked', 'Line / tube positions documented']],
      ['Unit', ['Bed availability & expected admissions', 'Equipment faults reported', 'Family updates scheduled']],
    ],
  },
  security: {
    name: 'Security / facilities', subject: 'Post / area',
    prompts: ['Current status of the post or area', 'Events earlier in the shift, visitors, contractors', 'Risks observed, CCTV / alarm status', 'Patrols due, follow-ups, who to call'],
    sections: [
      ['Keys & access', ['Key safe count matches log', 'Access cards issued/returned logged', 'Doors & gates checked on patrol']],
      ['Systems', ['CCTV recording on all cameras', 'Fire panel normal / faults noted', 'Radios charged & tested']],
      ['Log', ['Incident log up to date', 'Lost property recorded']],
    ],
  },
  ops: {
    name: 'Manufacturing / operations', subject: 'Line / machine',
    prompts: ['Running status, product, output vs target', 'Changeovers, stoppages, maintenance done', 'Quality issues, scrap, safety observations', 'Actions for next shift, parts on order, priorities'],
    sections: [
      ['Safety', ['Lock-out/tag-out status handed over', 'Spills & hazards cleared', 'Near misses recorded']],
      ['Production', ['Shift output recorded', 'Material stock for next shift checked', 'Quality holds communicated']],
      ['Housekeeping', ['5S area check done', 'Tools returned & counted']],
    ],
  },
  it: {
    name: 'IT on-call / support', subject: 'Incident / ticket',
    prompts: ['Impact, affected services, current severity', 'Timeline, changes deployed, related tickets', 'Root cause hypothesis, mitigations in place, monitoring', 'Next steps, owners, rollback plan, escalation contacts'],
    sections: [
      ['Platform', ['Dashboards green / anomalies noted', 'Backups completed', 'Scheduled maintenance windows noted']],
      ['Process', ['Open incidents have owners', 'Status page updated', 'Pager rotation confirmed']],
    ],
  },
}

const mkSections = (t: Tpl): Section[] => t.sections.map(([title, items]) => ({ id: uid(), title, items: items.map((text) => ({ id: uid(), text, done: false, note: '' })) }))
const now = () => new Date().toTimeString().slice(0, 5)

const DEF: State = {
  template: 'nursing', unit: '4 West — Surgical', from: 'R. Okafor RN', to: 'J. Lindqvist RN', shift: 'Day → Night', date: new Date().toISOString().slice(0, 10),
  subjects: [
    { id: 'p1', label: 'Bed 12 · M.K., 68 M', pri: 'watch', s: 'Post-op day 1 right total hip replacement. Full code. Increasing pain this afternoon.', b: 'Hx: T2 diabetes, HTN. Allergy: penicillin (rash). PCA morphine stopped 14:00, now oral oxycodone.', a: 'BP 142/86, HR 92, T 37.9 °C, SpO₂ 95 % RA. Pain 6/10 on movement. Drain 80 ml since 07:00. Mobilised to chair with physio.', r: 'Recheck temp at 22:00 — if ≥ 38.0 °C take blood cultures and call surgical team. Fasting glucose in the morning.', tasks: [{ id: 't1', text: 'Blood glucose before supper', due: '17:30', done: true }, { id: 't2', text: 'Remove wound drain if < 50 ml / 8 h', due: '22:00', done: false }] },
    { id: 'p2', label: 'Bed 14 · A.S., 81 F', pri: 'critical', s: 'Confused since 15:00, new-onset AF on monitor. DNACPR in place, for ward-based care.', b: 'Admitted with UTI, on IV ceftriaxone day 2. Lives alone, baseline independent.', a: 'HR 128 irregular, BP 104/62, RR 22, NEWS2 = 6. Drinking poorly, urine output 20 ml/h last 3 h.', r: 'Medical reg aware — ECG done, awaiting review by 19:00. Hourly obs and fluid balance. Escalate if NEWS2 ≥ 7.', tasks: [{ id: 't3', text: 'Repeat U&E and lactate', due: '19:00', done: false }, { id: 't4', text: 'Call daughter with update', due: '20:00', done: false }] },
    { id: 'p3', label: 'Bed 16 · D.R., 45 M', pri: 'stable', s: 'Lap cholecystectomy this morning, recovering well.', b: 'No significant history. No known allergies.', a: 'Obs within range, pain 2/10, tolerating fluids, passed urine.', r: 'Likely discharge tomorrow AM — TTOs written, pharmacy to dispense.', tasks: [{ id: 't5', text: 'Diet as tolerated from 18:00', due: '18:00', done: false }] },
  ],
  sections: mkSections(TPL.nursing).map((s, i) => (i === 0 ? { ...s, items: s.items.map((it, j) => ({ ...it, done: j < 3 })) } : s)),
  notes: 'Two admissions expected from ED after 21:00. Bay B side-room needs deep clean (C. diff discharge).',
  ackBy: '', ackAt: '',
}

const PRI: Record<Pri, [string, string]> = { stable: ['Stable', 'var(--ok)'], watch: ['Watch', 'var(--warn)'], critical: ['Critical', 'var(--err)'] }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function summary(s: State, tpl: Tpl): string {
  const lines = [`SHIFT HANDOVER — ${s.unit}`, `${s.date} · ${s.shift} · from ${s.from} to ${s.to}`, '']
  for (const p of s.subjects) {
    lines.push(`■ ${p.label} [${PRI[p.pri][0].toUpperCase()}]`, `  S: ${p.s}`, `  B: ${p.b}`, `  A: ${p.a}`, `  R: ${p.r}`)
    for (const t of p.tasks) lines.push(`  ${t.done ? '[x]' : '[ ]'} ${t.due ? t.due + ' ' : ''}${t.text}`)
    lines.push('')
  }
  for (const sec of s.sections) {
    lines.push(`${sec.title}:`)
    for (const it of sec.items) lines.push(`  ${it.done ? '[x]' : '[ ]'} ${it.text}${it.note ? ` — ${it.note}` : ''}`)
  }
  if (s.notes) lines.push('', `Notes: ${s.notes}`)
  lines.push('', s.ackBy ? `Received by ${s.ackBy} at ${s.ackAt}` : 'Not yet acknowledged', `(${tpl.name})`)
  return lines.join('\n')
}

function printHtml(s: State, tpl: Tpl, blank: boolean): string {
  const f = (v: string) => (blank ? '<span class="ln"></span>' : esc(v) || '<span class="ln"></span>')
  const subs = (blank ? Array.from({ length: 4 }, (_, i) => ({ id: String(i), label: '', pri: 'stable' as Pri, s: '', b: '', a: '', r: '', tasks: [] })) : s.subjects)
    .map((p) => `<div class="sub"><h3>${blank ? `${tpl.subject}: <span class="ln w"></span> &nbsp; ☐ Stable ☐ Watch ☐ Critical` : `${esc(p.label)} <em class="${p.pri}">${PRI[p.pri][0]}</em>`}</h3>
      <table>${(['S', 'B', 'A', 'R'] as const).map((k, i) => `<tr><th>${k}</th><td>${blank ? `<small>${tpl.prompts[i]}</small><span class="ln"></span><span class="ln"></span>` : f(p[k.toLowerCase() as 's' | 'b' | 'a' | 'r'])}</td></tr>`).join('')}</table>
      ${p.tasks.length ? `<ul>${p.tasks.map((t) => `<li>${t.done ? '☑' : '☐'} ${esc(t.due)} ${esc(t.text)}</li>`).join('')}</ul>` : ''}</div>`).join('')
  const secs = s.sections.map((sec) => `<div class="sec"><h3>${esc(sec.title)}</h3><ul>${sec.items.map((it) => `<li>${!blank && it.done ? '☑' : '☐'} ${esc(it.text)}${!blank && it.note ? ` — <i>${esc(it.note)}</i>` : ''}</li>`).join('')}</ul></div>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Shift handover</title><style>
  @page{margin:12mm}body{font:12px/1.4 system-ui,sans-serif;color:#111;margin:0}h1{font-size:18px;margin:0}h3{font-size:13px;margin:10px 0 4px}
  .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 16px;margin:6px 0 10px}.sub{border:1px solid #bbb;border-radius:6px;padding:6px 10px;margin-bottom:8px;break-inside:avoid}
  table{width:100%;border-collapse:collapse}th{width:22px;text-align:left;vertical-align:top;font-size:14px;color:#444}td{padding:2px 0 4px;border-bottom:1px solid #eee}
  em{font-style:normal;font-size:11px;padding:1px 6px;border-radius:8px;border:1px solid}.critical{color:#b91c1c}.watch{color:#b45309}.stable{color:#047857}
  ul{margin:2px 0;padding-left:4px;list-style:none}.ln{display:block;border-bottom:1px solid #999;height:16px}.ln.w{display:inline-block;width:200px}small{color:#666}
  .cols{columns:2;column-gap:20px}.sec{break-inside:avoid}.sign{margin-top:16px;display:flex;gap:30px}.sign div{flex:1;border-top:1px solid #333;padding-top:3px}</style></head><body>
  <h1>Shift handover — ${blank ? '<span class="ln w"></span>' : esc(s.unit)}</h1>
  <div class="meta"><div>Date: ${f(s.date)}</div><div>Shift: ${f(s.shift)}</div><div>Template: ${esc(tpl.name)}</div><div>Outgoing: ${f(s.from)}</div><div>Incoming: ${f(s.to)}</div></div>
  ${subs}<div class="cols">${secs}</div>${blank || s.notes ? `<h3>Notes</h3><div>${blank ? '<span class="ln"></span><span class="ln"></span>' : esc(s.notes)}</div>` : ''}
  <div class="sign"><div>Outgoing signature ${blank ? '' : esc(s.from)}</div><div>Incoming signature ${!blank && s.ackBy ? `${esc(s.ackBy)} · ${esc(s.ackAt)}` : ''}</div></div>
  <script>onload=()=>setTimeout(()=>print(),200)</script></body></html>`
}

export default function ShiftHandoverChecklist() {
  const [s, set] = useToolState<State>('shift-handover-checklist', DEF)
  const [edit, setEdit] = useState(false)
  const tpl = TPL[s.template] ?? TPL.nursing
  // Autosave indicator: the state persists to localStorage on every change.
  const [saved, setSaved] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setSaved(now()), 400)
    return () => clearTimeout(t)
  }, [s])

  const items = s.sections.flatMap((x) => x.items)
  const tasks = s.subjects.flatMap((p) => p.tasks)
  const done = items.filter((i) => i.done).length + tasks.filter((t) => t.done).length
  const total = items.length + tasks.length
  const crit = s.subjects.filter((p) => p.pri === 'critical').length
  const sbarGaps = s.subjects.filter((p) => !p.s.trim() || !p.a.trim() || !p.r.trim()).length

  const subj = (id: string, patch: Partial<Subject>) => set({ subjects: s.subjects.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  const sec = (id: string, patch: Partial<Section>) => set({ sections: s.sections.map((x) => (x.id === id ? { ...x, ...patch } : x)) })
  const item = (sid: string, iid: string, patch: Partial<Item>) => set({ sections: s.sections.map((x) => (x.id === sid ? { ...x, items: x.items.map((it) => (it.id === iid ? { ...it, ...patch } : it)) } : x)) })
  const open = (html: string) => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }
  const newHandover = (template: string) => {
    if (!confirm('Start a new, empty handover? The current draft will be cleared (export a backup first if you need it).')) return
    const t = TPL[template] ?? TPL.nursing
    set({ ...DEF, template, unit: '', from: '', to: '', notes: '', subjects: [{ id: uid(), label: '', pri: 'stable', s: '', b: '', a: '', r: '', tasks: [] }], sections: mkSections(t), date: new Date().toISOString().slice(0, 10) })
  }
  const area = (v: string, on: (v: string) => void, ph: string, label: string) => (
    <label className="k-field" style={{ marginBottom: 6 }}>
      <span className="k-label">{label}</span>
      <textarea className="k-area" rows={3} value={v} placeholder={ph} onChange={(e) => on(e.target.value)} />
    </label>
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Handover details">
          <Select label="Template" value={s.template} onChange={(template) => (template === s.template ? null : newHandover(template))} options={Object.entries(TPL).map(([k, t]) => [k, t.name] as [string, string])} />
          <Txt label="Unit / area" value={s.unit} onChange={(unit) => set({ unit })} placeholder="e.g. Ward 4 West" />
          <Row>
            <Txt label="Outgoing" value={s.from} onChange={(from) => set({ from })} />
            <Txt label="Incoming" value={s.to} onChange={(to) => set({ to })} />
          </Row>
          <Row>
            <Txt label="Date" type="date" value={s.date} onChange={(date) => set({ date })} />
            <Txt label="Shift" value={s.shift} onChange={(shift) => set({ shift })} placeholder="Day → Night" />
          </Row>
          <p className="k-hint">💾 Draft autosaved in this browser {saved && `at ${saved}`}. Nothing is transmitted. Use initials and bed numbers rather than full names.</p>
        </Panel>
        <Panel title="Checklists" actions={<Btn kind="ghost" onClick={() => setEdit(!edit)}>{edit ? '✓ Done editing' : '✎ Customize'}</Btn>}>
          {s.sections.map((x) => (
            <div key={x.id} style={{ marginBottom: 12 }}>
              {edit ? (
                <Row wrap={false}>
                  <input className="k-text" value={x.title} onChange={(e) => sec(x.id, { title: e.target.value })} aria-label="Section title" style={{ flex: 1, fontWeight: 700 }} />
                  <Btn kind="ghost" onClick={() => set({ sections: s.sections.filter((y) => y.id !== x.id) })} title="Delete section">✕</Btn>
                </Row>
              ) : (
                <h4 style={{ margin: '4px 0' }}>{x.title} <span className="muted" style={{ fontWeight: 400 }}>{x.items.filter((i) => i.done).length}/{x.items.length}</span></h4>
              )}
              {x.items.map((it) => (
                <div key={it.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {edit ? (
                    <>
                      <input className="k-text" value={it.text} onChange={(e) => item(x.id, it.id, { text: e.target.value })} aria-label="Item" style={{ flex: 1 }} />
                      <Btn kind="ghost" onClick={() => sec(x.id, { items: x.items.filter((y) => y.id !== it.id) })} title="Delete item">✕</Btn>
                    </>
                  ) : (
                    <>
                      <Check label={<span style={{ textDecoration: it.done ? 'line-through' : undefined, opacity: it.done ? 0.65 : 1 }}>{it.text}</span>} value={it.done} onChange={(done) => item(x.id, it.id, { done })} />
                      <input className="k-text" value={it.note} placeholder="note" onChange={(e) => item(x.id, it.id, { note: e.target.value })} aria-label="Note" style={{ marginLeft: 'auto', width: 110, padding: '2px 6px', fontSize: 12 }} />
                    </>
                  )}
                </div>
              ))}
              {edit && <Btn kind="ghost" onClick={() => sec(x.id, { items: [...x.items, { id: uid(), text: 'New item', done: false, note: '' }] })}>+ Item</Btn>}
            </div>
          ))}
          {edit && <Btn onClick={() => set({ sections: [...s.sections, { id: uid(), title: 'New section', items: [] }] })}>+ Section</Btn>}
          {!edit && <Btn kind="ghost" onClick={() => set({ sections: s.sections.map((x) => ({ ...x, items: x.items.map((i) => ({ ...i, done: false, note: '' })) })) })}>Uncheck all</Btn>}
        </Panel>
        <Panel title="General notes">
          <textarea className="k-area" rows={3} value={s.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Bed state, staffing, equipment, anything else…" />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Checklist" value={`${done}/${total}`} sub={<Bar value={done} max={total || 1} />} tone="accent" />
          <Stat label={`${tpl.subject}s`} value={s.subjects.length} sub={`${crit} critical · ${s.subjects.filter((p) => p.pri === 'watch').length} watch`} tone={crit ? 'bad' : undefined} />
          <Stat label="Open tasks" value={tasks.filter((t) => !t.done).length} sub={tasks.filter((t) => !t.done && t.due).sort((a, b) => a.due.localeCompare(b.due))[0]?.due ? `next due ${tasks.filter((t) => !t.done && t.due).sort((a, b) => a.due.localeCompare(b.due))[0].due}` : 'none timed'} />
          <Stat label="Sign-off" value={s.ackBy ? '✓ Received' : 'Pending'} sub={s.ackBy ? `${s.ackBy} · ${s.ackAt}` : 'incoming not signed'} tone={s.ackBy ? 'good' : undefined} />
        </Stats>
        {sbarGaps > 0 && <Note tone="warn">{sbarGaps} {tpl.subject.toLowerCase()} entr{sbarGaps === 1 ? 'y is' : 'ies are'} missing a Situation, Assessment or Recommendation.</Note>}
        <Panel
          title={`SBAR · ${tpl.subject}s`}
          actions={<Btn onClick={() => set({ subjects: [...s.subjects, { id: uid(), label: '', pri: 'stable', s: '', b: '', a: '', r: '', tasks: [] }] })}>+ {tpl.subject}</Btn>}
        >
          {[...s.subjects].sort((a, b) => ['critical', 'watch', 'stable'].indexOf(a.pri) - ['critical', 'watch', 'stable'].indexOf(b.pri)).map((p) => (
            <div key={p.id} style={{ border: '1px solid var(--line)', borderLeft: `5px solid ${PRI[p.pri][1]}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <Row>
                <input className="k-text" value={p.label} placeholder={tpl.subject} onChange={(e) => subj(p.id, { label: e.target.value })} aria-label={tpl.subject} style={{ flex: 1, fontWeight: 700, minWidth: 160 }} />
                <Seg value={p.pri} onChange={(pri) => subj(p.id, { pri })} options={[['stable', 'Stable'], ['watch', 'Watch'], ['critical', 'Critical']]} />
                <Btn kind="ghost" onClick={() => confirm('Remove this entry?') && set({ subjects: s.subjects.filter((x) => x.id !== p.id) })} title="Remove">✕</Btn>
              </Row>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0 12px', marginTop: 6 }}>
                {area(p.s, (v) => subj(p.id, { s: v }), tpl.prompts[0], 'S — Situation')}
                {area(p.b, (v) => subj(p.id, { b: v }), tpl.prompts[1], 'B — Background')}
                {area(p.a, (v) => subj(p.id, { a: v }), tpl.prompts[2], 'A — Assessment')}
                {area(p.r, (v) => subj(p.id, { r: v }), tpl.prompts[3], 'R — Recommendation')}
              </div>
              {p.tasks.map((t) => (
                <div key={t.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                  <input type="checkbox" checked={t.done} onChange={(e) => subj(p.id, { tasks: p.tasks.map((x) => (x.id === t.id ? { ...x, done: e.target.checked } : x)) })} aria-label="Task done" />
                  <input type="time" className="k-text" value={t.due} onChange={(e) => subj(p.id, { tasks: p.tasks.map((x) => (x.id === t.id ? { ...x, due: e.target.value } : x)) })} style={{ width: 135 }} aria-label="Due" />
                  <input className="k-text" value={t.text} onChange={(e) => subj(p.id, { tasks: p.tasks.map((x) => (x.id === t.id ? { ...x, text: e.target.value } : x)) })} style={{ flex: 1, textDecoration: t.done ? 'line-through' : undefined }} aria-label="Task" />
                  <Btn kind="ghost" onClick={() => subj(p.id, { tasks: p.tasks.filter((x) => x.id !== t.id) })} title="Remove task">✕</Btn>
                </div>
              ))}
              <Btn kind="ghost" onClick={() => subj(p.id, { tasks: [...p.tasks, { id: uid(), text: '', due: '', done: false }] })}>+ Pending task</Btn>
            </div>
          ))}
        </Panel>
        <Panel title="Sign-off & output">
          <Row>
            <Txt label="Received by (incoming)" value={s.ackBy} onChange={(ackBy) => set({ ackBy, ackAt: ackBy ? s.ackAt || `${s.date} ${now()}` : '' })} placeholder="Name / initials" />
            <Btn kind="primary" disabled={!s.ackBy} onClick={() => set({ ackAt: `${s.date} ${now()}` })}>Stamp time</Btn>
          </Row>
          <Row>
            <Btn kind="primary" onClick={() => open(printHtml(s, tpl, false))}>🖨 Print handover</Btn>
            <Btn onClick={() => open(printHtml(s, tpl, true))}>🖨 Blank form</Btn>
            <CopyButton label="Copy as text" text={() => summary(s, tpl)} />
            <JsonButtons name={`handover-${s.date}.json`} data={s} onLoad={(d) => set(d)} />
            <Btn kind="danger" onClick={() => newHandover(s.template)}>New handover</Btn>
          </Row>
          <p className="k-hint">The blank form prints the current template with SBAR prompts — handy for paper-based units or downtime.</p>
        </Panel>
      </div>
    </Split>
  )
}
