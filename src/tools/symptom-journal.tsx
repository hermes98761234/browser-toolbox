import { useMemo, useState } from 'react'
import { Btn, CsvButton, download, JsonButtons, LineChart, Note, num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { addDays, dailyMax, dayOf, daysBetween, filterEntries, fmtDuration, parseList, pdfSafe, sampleEntries, severityColor, severityWord, summarize, triggerStats, type Entry } from './lib/symptom-journal'

const localNow = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const TODAY = localNow().slice(0, 10)

interface State { patient: string; entries: Entry[]; range: string }
const DEF: State = { patient: '', entries: sampleEntries(TODAY), range: '30' }

const COMMON_SYMPTOMS = ['Headache', 'Fatigue', 'Stomach pain', 'Nausea', 'Dizziness', 'Joint pain', 'Back pain', 'Cough', 'Shortness of breath', 'Rash', 'Anxiety', 'Insomnia']
const COMMON_TRIGGERS = ['poor sleep', 'stress', 'skipped meal', 'screen time', 'alcohol', 'caffeine', 'dairy', 'exercise', 'weather change', 'menstrual cycle']
const LINE_COLORS = ['#ef4444', '#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#a855f7']

const blank = (): Omit<Entry, 'id'> => ({ at: localNow(), symptom: 'Headache', severity: 4, minutes: 60, tags: [], triggers: [], meds: '', notes: '' })

async function buildPdf(s: State, list: Entry[], from: string, to: string) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const reg = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const W = 595.28, H = 841.89, M = 48
  let page = doc.addPage([W, H])
  let y = H - M
  const need = (h: number) => { if (y - h < M) { page = doc.addPage([W, H]); y = H - M } }
  const t = (str: string, x: number, o: { b?: boolean; sz?: number; c?: [number, number, number] } = {}) =>
    page.drawText(pdfSafe(str), { x, y, size: o.sz ?? 9.5, font: o.b ? bold : reg, color: rgb(...(o.c ?? [0.1, 0.1, 0.13])) })
  const wrap = (str: string, width: number, sz = 9.5) => {
    const out: string[] = []
    let line = ''
    for (const w of pdfSafe(str).split(/\s+/).filter(Boolean)) {
      const tryL = line ? `${line} ${w}` : w
      if (reg.widthOfTextAtSize(tryL, sz) > width && line) { out.push(line); line = w } else line = tryL
    }
    if (line) out.push(line)
    return out
  }
  t('Symptom summary', M, { b: true, sz: 18 }); y -= 18
  t(`${s.patient ? s.patient + ' · ' : ''}Period ${from} to ${to} · ${list.length} entries · generated ${TODAY}`, M, { c: [0.4, 0.4, 0.45] }); y -= 24
  t('Overview', M, { b: true, sz: 12 }); y -= 16
  const cols = [M, M + 150, M + 205, M + 250, M + 300, M + 360, M + 430]
  ;['Symptom', 'Entries', 'Days', 'Avg', 'Worst', 'Per week', 'Trend/wk'].forEach((h, i) => t(h, cols[i], { b: true, sz: 9 }))
  y -= 13
  for (const r of summarize(list, from, to)) {
    need(14)
    ;[r.symptom, String(r.count), String(r.days), num(r.avg, 1), `${r.max} (${severityWord(r.max)})`, num(r.perWeek, 1), `${r.trend > 0 ? '+' : ''}${num(r.trend, 2)}`].forEach((v, i) => t(v, cols[i]))
    y -= 13
  }
  y -= 10
  const trig = triggerStats(list).filter((x) => x.count > 0)
  if (trig.length) {
    need(40); t('Possible triggers (logged with the symptom)', M, { b: true, sz: 12 }); y -= 16
    for (const x of trig.slice(0, 10)) { need(13); t(`${x.trigger}: ${x.count}× · avg severity ${num(x.avgWith, 1)} vs ${num(x.avgWithout, 1)} without`, M); y -= 13 }
    y -= 10
  }
  need(40); t('Entries', M, { b: true, sz: 12 }); y -= 16
  for (const e of list) {
    const detail = [e.minutes ? fmtDuration(e.minutes) : '', e.tags.join(', '), e.triggers.length ? `triggers: ${e.triggers.join(', ')}` : '', e.meds ? `took: ${e.meds}` : '', e.notes].filter(Boolean).join(' · ')
    const lines = wrap(detail, W - 2 * M - 190, 8.5)
    need(13 * Math.max(1, lines.length) + 2)
    t(e.at.replace('T', ' '), M, { sz: 8.5 })
    t(e.symptom, M + 78, { b: true, sz: 8.5 })
    const c = severityColor(e.severity)
    page.drawRectangle({ x: M + 160, y: y - 2, width: 22, height: 11, color: rgb(parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255) })
    t(String(e.severity), M + 167, { b: true, sz: 8.5, c: [1, 1, 1] })
    lines.forEach((l, i) => { t(l, M + 190, { sz: 8.5, c: [0.3, 0.3, 0.35] }); if (i < lines.length - 1) y -= 11 })
    y -= 13
  }
  need(30); y -= 10
  t('Self-reported log for discussion with a clinician. Severity 0 = none, 10 = worst imaginable. Not a diagnosis.', M, { sz: 8, c: [0.45, 0.45, 0.5] })
  download(`symptom-summary-${to}.pdf`, new Blob([(await doc.save()) as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), 'application/pdf')
}

export default function SymptomJournal() {
  const [s, set, reset] = useToolState('symptom-journal', DEF)
  const [draft, setDraft] = useState(blank)
  const [editing, setEditing] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [symFilter, setSymFilter] = useState('')
  const [busy, setBusy] = useState(false)

  const to = TODAY
  const from = s.range === 'all' ? (s.entries.length ? s.entries.map((e) => dayOf(e.at)).sort()[0] : addDays(to, -29)) : addDays(to, -(Number(s.range) - 1))
  const inRange = useMemo(() => filterEntries(s.entries, { from, to }), [s.entries, from, to])
  const shown = filterEntries(inRange, { symptom: symFilter || undefined, tags: tagFilter })
  const sums = summarize(inRange, from, to)
  const trig = triggerStats(inRange).slice(0, 8)
  const allTags = [...new Set(s.entries.flatMap((e) => e.tags))].sort()
  const symptoms = [...new Set([...s.entries.map((e) => e.symptom), ...COMMON_SYMPTOMS])]
  const n = daysBetween(from, to) + 1
  const series = sums.slice(0, 6).map((r, i) => ({
    name: r.symptom,
    color: LINE_COLORS[i],
    points: dailyMax(inRange, r.symptom, from, to).flatMap((v, d) => (v === null ? [] : [[d - n + 1, v] as [number, number]])),
  }))
  const symptomFree = n - new Set(inRange.map((e) => dayOf(e.at))).size

  const save = () => {
    if (!draft.symptom.trim()) return
    const e: Entry = { ...draft, id: editing ?? uid(), symptom: draft.symptom.trim() }
    set({ entries: [e, ...s.entries.filter((x) => x.id !== e.id)].sort((a, b) => b.at.localeCompare(a.at)) })
    setDraft({ ...blank(), symptom: e.symptom })
    setEditing(null)
  }
  const toggle = (k: 'tags' | 'triggers', v: string) => setDraft({ ...draft, [k]: draft[k].includes(v) ? draft[k].filter((x) => x !== v) : [...draft[k], v] })
  const chip = (on: boolean, txt: string, onClick: () => void, col = 'var(--accent)') => (
    <button key={txt} type="button" className="k-btn" onClick={onClick} style={{ padding: '3px 10px', fontSize: 13, borderRadius: 999, background: on ? col : undefined, color: on ? '#fff' : undefined, borderColor: on ? col : undefined }}>{txt}</button>
  )

  return (
    <Split>
      <div>
        <Panel title={editing ? 'Edit entry' : 'Log a symptom'}>
          <Row>
            <Txt label="When" type="datetime-local" value={draft.at} onChange={(at) => setDraft({ ...draft, at })} />
            <label className="k-field">
              <span className="k-label">Symptom</span>
              <input className="k-text" list="sj-symptoms" value={draft.symptom} onChange={(ev) => setDraft({ ...draft, symptom: ev.target.value })} />
              <datalist id="sj-symptoms">{symptoms.map((x) => <option key={x} value={x} />)}</datalist>
            </label>
          </Row>
          <Slider label="Severity" value={draft.severity} min={0} max={10} onChange={(severity) => setDraft({ ...draft, severity })} show={(v) => `${v} · ${severityWord(v)}`} />
          <div style={{ height: 6, borderRadius: 3, margin: '-4px 0 10px', background: 'linear-gradient(90deg,#10b981,#f59e0b 50%,#f97316 75%,#ef4444)' }} />
          <Row>
            <label className="k-field">
              <span className="k-label">Duration</span>
              <select className="k-select" value={draft.minutes} onChange={(ev) => setDraft({ ...draft, minutes: Number(ev.target.value) })}>
                {[0, 5, 15, 30, 60, 120, 240, 480, 1440].map((m) => <option key={m} value={m}>{m ? fmtDuration(m) : 'Unknown / ongoing'}</option>)}
              </select>
            </label>
            <Txt label="Medication taken" value={draft.meds} onChange={(meds) => setDraft({ ...draft, meds })} placeholder="e.g. Paracetamol 500 mg" />
          </Row>
          <span className="k-label">Possible triggers</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0 10px' }}>
            {[...new Set([...COMMON_TRIGGERS, ...draft.triggers])].map((t) => chip(draft.triggers.includes(t), t, () => toggle('triggers', t), '#f97316'))}
          </div>
          <Txt label="Tags (comma-separated)" value={draft.tags.join(', ')} onChange={(v) => setDraft({ ...draft, tags: parseList(v) })} placeholder="left side, throbbing" hint="Location, character, context: anything you want to filter by later." />
          <Txt label="Notes" value={draft.notes} onChange={(notes) => setDraft({ ...draft, notes })} placeholder="What helped, what made it worse…" />
          <Row>
            <Btn kind="primary" onClick={save} disabled={!draft.symptom.trim()}>{editing ? 'Save changes' : '+ Add entry'}</Btn>
            {editing && <Btn kind="ghost" onClick={() => { setEditing(null); setDraft(blank()) }}>Cancel</Btn>}
          </Row>
        </Panel>
        <Panel title="Possible triggers">
          {trig.length ? (
            <Table
              head={['Trigger', 'Logged', 'Avg with', 'Avg without']}
              rows={trig.map((x) => [x.trigger, `${x.count}×`, <b key="w" style={{ color: severityColor(x.avgWith) }}>{num(x.avgWith, 1)}</b>, Number.isFinite(x.avgWithout) ? num(x.avgWithout, 1) : '—'])}
            />
          ) : <p className="muted">Tick triggers when you log symptoms to see patterns here.</p>}
          <p className="muted" style={{ fontSize: 13 }}>A higher average with a trigger hints at an association, not a cause. Share patterns with your doctor.</p>
        </Panel>
        <Note tone="warn">This journal is for personal record-keeping and sharing with a healthcare professional. It does not give medical advice. Seek urgent care for sudden, severe or worrying symptoms.</Note>
      </div>

      <div>
        <Row>
          <Seg value={s.range} onChange={(range) => set({ range })} options={[['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['all', 'All']]} label="Range" />
        </Row>
        <Stats>
          <Stat label="Entries" value={inRange.length} sub={`${from} → ${to}`} />
          <Stat label="Symptom-free days" value={`${symptomFree} / ${n}`} tone={symptomFree / n > 0.6 ? 'good' : undefined} />
          <Stat label="Most frequent" value={sums[0]?.symptom ?? '—'} sub={sums[0] ? `${num(sums[0].perWeek, 1)} per week` : undefined} />
          <Stat label="Worst" value={inRange.length ? Math.max(...inRange.map((e) => e.severity)) : '—'} sub={inRange.length ? severityWord(Math.max(...inRange.map((e) => e.severity))) : undefined} tone="accent" />
        </Stats>
        <Panel title="Daily worst severity">
          <LineChart series={series} yMin={0} yMax={10} xMin={-n + 1} xMax={0} height={240} fx={(v) => (v === 0 ? 'today' : `${v}d`)} fy={(v) => num(v, 0)} />
        </Panel>
        <Panel title="By symptom">
          <Table
            head={['Symptom', 'Entries', 'Avg', 'Worst', 'Trend / week']}
            rows={sums.map((r) => [
              <b key="s">{r.symptom}</b>, r.count, num(r.avg, 1), r.max,
              <span key="t" style={{ color: Math.abs(r.trend) < 0.15 ? 'var(--muted)' : r.trend > 0 ? 'var(--err)' : 'var(--ok)' }}>{Math.abs(r.trend) < 0.15 ? '→ stable' : r.trend > 0 ? `↑ +${num(r.trend, 2)}` : `↓ ${num(r.trend, 2)}`}</span>,
            ])}
          />
        </Panel>
        <Panel
          title="Entries"
          actions={
            <>
              <Btn kind="primary" disabled={busy || !shown.length} onClick={async () => { setBusy(true); try { await buildPdf(s, shown, from, to) } finally { setBusy(false) } }}>{busy ? 'Building…' : '⬇ PDF for doctor'}</Btn>
              <CsvButton name="symptoms.csv" rows={() => [['Date-time', 'Symptom', 'Severity', 'Duration (min)', 'Tags', 'Triggers', 'Medication', 'Notes'], ...shown.map((e) => [e.at, e.symptom, e.severity, e.minutes, e.tags.join('; '), e.triggers.join('; '), e.meds, e.notes])]} />
              <JsonButtons name="symptom-journal.json" data={s} onLoad={(d) => Array.isArray(d.entries) && set(d)} />
              <Btn kind="ghost" onClick={() => { if (confirm('Clear all entries?')) set({ entries: [] }) }}>Clear</Btn>
              <Btn kind="ghost" onClick={reset}>Sample</Btn>
            </>
          }
        >
          <Row>
            <Txt label="Name on the PDF (optional)" value={s.patient} onChange={(patient) => set({ patient })} />
            <label className="k-field">
              <span className="k-label">Symptom</span>
              <select className="k-select" value={symFilter} onChange={(ev) => setSymFilter(ev.target.value)}>
                <option value="">All symptoms</option>
                {sums.map((r) => <option key={r.symptom}>{r.symptom}</option>)}
              </select>
            </label>
          </Row>
          {allTags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              <span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>Filter tags:</span>
              {allTags.map((t) => chip(tagFilter.includes(t), t, () => setTagFilter(tagFilter.includes(t) ? tagFilter.filter((x) => x !== t) : [...tagFilter, t])))}
            </div>
          )}
          <Table
            max={60}
            head={['When', 'Symptom', 'Severity', 'Details', '']}
            rows={shown.map((e) => [
              <span key="w" style={{ whiteSpace: 'nowrap' }}>{e.at.replace('T', ' ')}</span>,
              e.symptom,
              <span key="v" style={{ display: 'inline-block', minWidth: 28, textAlign: 'center', borderRadius: 6, padding: '1px 6px', color: '#fff', fontWeight: 700, background: severityColor(e.severity) }}>{e.severity}</span>,
              <span key="d" style={{ fontSize: 13 }}>
                {[e.minutes ? fmtDuration(e.minutes) : '', e.tags.map((t) => `#${t}`).join(' '), e.triggers.length ? `⚡ ${e.triggers.join(', ')}` : '', e.meds ? `💊 ${e.meds}` : '', e.notes].filter(Boolean).join(' · ')}
              </span>,
              <span key="x" style={{ whiteSpace: 'nowrap' }}>
                <Btn kind="ghost" title="Edit" onClick={() => { setEditing(e.id); setDraft({ ...e }) }}>✎</Btn>
                <Btn kind="ghost" title="Delete" onClick={() => set({ entries: s.entries.filter((x) => x.id !== e.id) })}>✕</Btn>
              </span>,
            ])}
          />
          {!shown.length && <p className="muted">No entries match. Log one on the left, or change the range or filters.</p>}
        </Panel>
      </div>
    </Split>
  )
}
