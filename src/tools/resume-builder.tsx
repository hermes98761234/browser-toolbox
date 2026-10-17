import { useState, type ReactNode } from 'react'
import { Area, Bar, Btn, CopyButton, download, Note, Panel, Row, Seg, Split, Txt, uid, useToolState } from '../kit'
import { wrapText } from './lib/quote-generator'
import { atsChecks, fromJsonResume, keywordMatch, lines, range, toJsonResume, toPlainText, type Edu, type Project, type Resume, type Skill, type Work } from './lib/resume-builder'

type Template = 'classic' | 'modern' | 'compact'
interface State {
  r: Resume
  template: Template
  accent: string
  jd: string
}

const DEF: State = {
  template: 'modern',
  accent: '#2563eb',
  jd: 'We are hiring a Senior Frontend Engineer to build our React and TypeScript design system. You will own performance, accessibility and testing, mentor engineers, and collaborate with product and design. Experience with GraphQL, CI/CD, Storybook and web performance is a plus.',
  r: {
    basics: {
      name: 'Alex Morgan',
      label: 'Senior Frontend Engineer',
      email: 'alex.morgan@example.com',
      phone: '+1 (555) 014-2290',
      url: 'github.com/alexmorgan',
      location: 'Denver, CO',
      summary:
        'Frontend engineer with 8 years of experience building fast, accessible web apps in React and TypeScript. Led a design-system rewrite used by 40 engineers, cut bundle size by 38% and mentor juniors. Comfortable owning features end to end, from discovery with designers to monitoring in production.',
    },
    work: [
      { id: 'w1', name: 'Brightline Health', position: 'Senior Frontend Engineer', location: 'Remote', startDate: '2021-04', endDate: '', highlights: 'Led the React/TypeScript design system used by 6 product teams and 40 engineers\nReduced JavaScript bundle size by 38% and improved LCP from 3.4 s to 1.9 s\nIntroduced Storybook visual tests, cutting UI regressions by 60%\nMentored 4 engineers; two were promoted within a year' },
      { id: 'w2', name: 'Parcelo', position: 'Frontend Engineer', location: 'Boulder, CO', startDate: '2018-02', endDate: '2021-03', highlights: 'Built the shipment-tracking dashboard serving 120k monthly users\nMigrated a 90k-line AngularJS app to React with zero downtime\nAutomated releases with GitHub Actions, shipping 3× more often' },
      { id: 'w3', name: 'Studio Nine', position: 'Web Developer', location: 'Denver, CO', startDate: '2016-06', endDate: '2018-01', highlights: 'Delivered 25+ marketing sites for retail and hospitality clients\nCreated a reusable component kit that halved build time for new sites' },
    ],
    education: [{ id: 'e1', institution: 'University of Colorado Boulder', studyType: 'B.S.', area: 'Computer Science', startDate: '2012', endDate: '2016', score: '' }],
    skills: [
      { id: 's1', name: 'Languages', keywords: 'TypeScript, JavaScript, HTML, CSS, SQL' },
      { id: 's2', name: 'Frameworks', keywords: 'React, Next.js, Redux, GraphQL, Node.js' },
      { id: 's3', name: 'Practices', keywords: 'Accessibility (WCAG 2.2), web performance, testing (Jest, Playwright), CI/CD' },
    ],
    projects: [{ id: 'p1', name: 'a11y-lint', description: 'Open-source ESLint plugin with 1.2k GitHub stars that flags inaccessible React patterns.', url: 'github.com/alexmorgan/a11y-lint' }],
    certificates: 'AWS Certified Cloud Practitioner (2023)',
    languages: 'English (native), Spanish (professional)',
  },
}

const TABS = [['basics', 'Basics'], ['work', 'Experience'], ['edu', 'Education'], ['skills', 'Skills'], ['more', 'More'], ['ats', 'ATS check']] as const
type Tab = (typeof TABS)[number][0]

function Items<T extends { id: string }>({ items, onChange, blank, title, render }: { items: T[]; onChange: (v: T[]) => void; blank: () => T; title: (t: T) => string; render: (t: T, patch: (p: Partial<T>) => void) => ReactNode }) {
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null)
  const mv = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const n = [...items]
    ;[n[i], n[j]] = [n[j], n[i]]
    onChange(n)
  }
  return (
    <div>
      {items.map((it, i) => (
        <div key={it.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, marginBottom: 8, background: 'var(--panel)' }}>
          <Row wrap={false}>
            <button type="button" className="k-btn ghost" style={{ flex: 1, justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => setOpen(open === it.id ? null : it.id)}>
              {open === it.id ? '▾' : '▸'} {title(it) || '(untitled)'}
            </button>
            <Btn kind="ghost" title="Move up" onClick={() => mv(i, -1)}>▲</Btn>
            <Btn kind="ghost" title="Move down" onClick={() => mv(i, 1)}>▼</Btn>
            <Btn kind="ghost" title="Remove" onClick={() => onChange(items.filter((x) => x.id !== it.id))}>✕</Btn>
          </Row>
          {open === it.id && render(it, (p) => onChange(items.map((x) => (x.id === it.id ? { ...x, ...p } : x))))}
        </div>
      ))}
      <Btn onClick={() => { const b = blank(); onChange([...items, b]); setOpen(b.id) }}>+ Add</Btn>
    </div>
  )
}

const FONTS: Record<Template, string> = { classic: 'Georgia, "Times New Roman", serif', modern: '"Helvetica Neue", Arial, sans-serif', compact: 'Arial, Helvetica, sans-serif' }

function Preview({ s }: { s: State }) {
  const { r, template: t, accent } = s
  const b = r.basics
  const small = t === 'compact'
  const H = ({ children }: { children: ReactNode }) => (
    <h2 style={{ fontSize: small ? 12 : 13.5, letterSpacing: 1.2, textTransform: 'uppercase', color: t === 'classic' ? '#111' : accent, margin: `${small ? 10 : 16}px 0 6px`, paddingBottom: 3, borderBottom: t === 'classic' ? '1px solid #111' : `2px solid ${accent}` }}>{children}</h2>
  )
  return (
    <div className="resume-paper" style={{ background: '#fff', color: '#1a1a1a', fontFamily: FONTS[t], fontSize: small ? 11.5 : 12.5, lineHeight: 1.4, padding: small ? '26px 30px' : '36px 40px', borderRadius: 6, boxShadow: '0 2px 16px #0002', maxWidth: 820, margin: '0 auto', borderTop: t === 'modern' ? `6px solid ${accent}` : undefined }}>
      <header style={{ textAlign: t === 'classic' ? 'center' : 'left' }}>
        <h1 style={{ margin: 0, fontSize: small ? 22 : 28, letterSpacing: t === 'classic' ? 2 : 0, color: t === 'modern' ? accent : '#111' }}>{t === 'classic' ? b.name.toUpperCase() : b.name}</h1>
        {b.label && <div style={{ fontSize: small ? 13 : 15, fontWeight: 600, marginTop: 2 }}>{b.label}</div>}
        <div style={{ color: '#444', marginTop: 4 }}>{[b.email, b.phone, b.location, b.url].filter(Boolean).join('  ·  ')}</div>
      </header>
      {b.summary && (<><H>Summary</H><p style={{ margin: 0 }}>{b.summary}</p></>)}
      {r.work.length > 0 && <H>Experience</H>}
      {r.work.map((w) => (
        <section key={w.id} style={{ marginBottom: small ? 6 : 10, breakInside: 'avoid' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <b>{w.position}{w.name && <span style={{ fontWeight: 400 }}> — {w.name}</span>}</b>
            <span style={{ color: '#555', whiteSpace: 'nowrap' }}>{range(w.startDate, w.endDate)}{w.location && ` · ${w.location}`}</span>
          </div>
          <ul style={{ margin: '3px 0 0', paddingLeft: 18 }}>{lines(w.highlights).map((h, i) => <li key={i}>{h}</li>)}</ul>
        </section>
      ))}
      {r.education.length > 0 && <H>Education</H>}
      {r.education.map((e) => (
        <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <span><b>{[e.studyType, e.area].filter(Boolean).join(', ')}</b>{e.institution && ` — ${e.institution}`}{e.score && ` · ${e.score}`}</span>
          <span style={{ color: '#555' }}>{range(e.startDate, e.endDate)}</span>
        </div>
      ))}
      {r.skills.length > 0 && <H>Skills</H>}
      <div style={small ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '2px 16px' } : undefined}>
        {r.skills.map((k) => <div key={k.id}><b>{k.name}:</b> {k.keywords}</div>)}
      </div>
      {r.projects.length > 0 && <H>Projects</H>}
      {r.projects.map((p) => <div key={p.id} style={{ marginBottom: 3 }}><b>{p.name}</b>{p.url && <span style={{ color: '#555' }}> ({p.url})</span>} — {p.description}</div>)}
      {lines(r.certificates).length > 0 && (<><H>Certifications</H>{lines(r.certificates).map((c, i) => <div key={i}>{c}</div>)}</>)}
      {r.languages.trim() && (<><H>Languages</H><div>{r.languages}</div></>)}
    </div>
  )
}

async function buildPdf(s: State): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const serif = s.template === 'classic'
  const reg = await doc.embedFont(serif ? StandardFonts.TimesRoman : StandardFonts.Helvetica)
  const bold = await doc.embedFont(serif ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold)
  const safe = (x: string) => [...x.replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")].map((ch) => { try { reg.encodeText(ch); return ch } catch { return '?' } }).join('')
  const n = parseInt(s.accent.slice(1), 16)
  const acc = s.template === 'classic' ? rgb(0, 0, 0) : rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
  const ink = rgb(0.1, 0.1, 0.1), mute = rgb(0.33, 0.33, 0.33)
  const fs = s.template === 'compact' ? 9.5 : 10.5
  const W = 612, Hh = 792, M = 50 // US Letter
  let page = doc.addPage([W, Hh])
  let y = Hh - M
  const need = (h: number) => { if (y - h < M) { page = doc.addPage([W, Hh]); y = Hh - M } }
  const put = (t: string, x: number, size = fs, f = reg, c = ink, right = false) => { const v = safe(t); page.drawText(v, { x: right ? x - f.widthOfTextAtSize(v, size) : x, y, size, font: f, color: c }) }
  const para = (t: string, x = M, w = W - 2 * M, f = reg) => { for (const l of wrapText(safe(t), w, (z) => f.widthOfTextAtSize(z, fs))) { need(fs * 1.35); put(l, x, fs, f); y -= fs * 1.35 } }
  const head = (t: string) => { y -= fs * 0.9; need(fs * 4); put(t.toUpperCase(), M, fs + 1.5, bold, acc); y -= 4; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: acc }); y -= fs * 1.5 }
  const b = s.r.basics
  put(b.name, M, 22, bold, s.template === 'modern' ? acc : ink); y -= 18
  if (b.label) { put(b.label, M, 12, bold); y -= 15 }
  put([b.email, b.phone, b.location, b.url].filter(Boolean).join('  |  '), M, fs, reg, mute); y -= fs * 1.6
  if (b.summary) { head('Summary'); para(b.summary) }
  if (s.r.work.length) head('Experience')
  for (const w of s.r.work) {
    need(fs * 4)
    put(`${w.position}${w.name ? ` - ${w.name}` : ''}`, M, fs, bold)
    put(range(w.startDate, w.endDate) + (w.location ? ` | ${w.location}` : ''), W - M, fs, reg, mute, true)
    y -= fs * 1.4
    for (const h of lines(w.highlights)) {
      const ls = wrapText(safe(h), W - 2 * M - 12, (z) => reg.widthOfTextAtSize(z, fs))
      ls.forEach((l, i) => { need(fs * 1.35); if (!i) put('•', M + 2); put(l, M + 12); y -= fs * 1.35 })
    }
    y -= fs * 0.5
  }
  if (s.r.education.length) head('Education')
  for (const e of s.r.education) { need(fs * 2); put([e.studyType, e.area].filter(Boolean).join(', ') + (e.institution ? ` - ${e.institution}` : '') + (e.score ? ` | ${e.score}` : ''), M, fs, bold); put(range(e.startDate, e.endDate), W - M, fs, reg, mute, true); y -= fs * 1.5 }
  if (s.r.skills.length) head('Skills')
  for (const k of s.r.skills) para(`${k.name}: ${k.keywords}`)
  if (s.r.projects.length) head('Projects')
  for (const p of s.r.projects) para(`${p.name}${p.url ? ` (${p.url})` : ''} - ${p.description}`)
  if (lines(s.r.certificates).length) { head('Certifications'); lines(s.r.certificates).forEach((c) => para(c)) }
  if (s.r.languages.trim()) { head('Languages'); para(s.r.languages) }
  doc.setTitle(`${b.name} — Resume`)
  doc.setAuthor(b.name)
  doc.setCreator('Browser Toolbox · Resume Builder')
  return doc.save()
}

export default function ResumeBuilder() {
  const [s, set, reset] = useToolState('resume-builder', DEF)
  const [tab, setTab] = useState<Tab>('basics')
  const [msg, setMsg] = useState('')
  const r = s.r
  const setR = (p: Partial<Resume>) => set((st) => ({ ...st, r: { ...st.r, ...p } }))
  const setB = (p: Partial<Resume['basics']>) => setR({ basics: { ...r.basics, ...p } })
  const checks = atsChecks(r)
  const score = checks.filter((c) => c.ok).length / checks.length
  const kw = keywordMatch(toPlainText(r), s.jd)
  const kwScore = kw.length ? kw.filter((k) => k.found).length / kw.length : 0
  const file = (r.basics.name.trim() || 'resume').replace(/\s+/g, '-').toLowerCase()
  const importJson = async (f: File) => {
    try {
      const j = JSON.parse(await f.text()) as Record<string, unknown>
      const res = 'r' in j && 'template' in j ? (j as unknown as State).r : fromJsonResume(j, uid)
      setR(res)
      setMsg(`Imported ${f.name}.`)
    } catch {
      setMsg('That file is not valid JSON.')
    }
  }

  return (
    <Split>
      <div>
        <Panel title="Edit">
          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <Seg value={tab} onChange={setTab} options={TABS} />
          </div>
          {tab === 'basics' && (
            <>
              <Row>
                <Txt label="Full name" value={r.basics.name} onChange={(name) => setB({ name })} />
                <Txt label="Headline" value={r.basics.label} onChange={(label) => setB({ label })} />
              </Row>
              <Row>
                <Txt label="Email" type="email" value={r.basics.email} onChange={(email) => setB({ email })} />
                <Txt label="Phone" value={r.basics.phone} onChange={(phone) => setB({ phone })} />
              </Row>
              <Row>
                <Txt label="Location" value={r.basics.location} onChange={(location) => setB({ location })} />
                <Txt label="Website / GitHub / LinkedIn" value={r.basics.url} onChange={(url) => setB({ url })} />
              </Row>
              <Area label="Professional summary" value={r.basics.summary} onChange={(summary) => setB({ summary })} rows={5} />
            </>
          )}
          {tab === 'work' && (
            <Items<Work>
              items={r.work}
              onChange={(work) => setR({ work })}
              title={(w) => `${w.position} · ${w.name}`}
              blank={() => ({ id: uid(), name: '', position: 'New role', location: '', startDate: '', endDate: '', highlights: '' })}
              render={(w, p) => (
                <>
                  <Row><Txt label="Job title" value={w.position} onChange={(position) => p({ position })} /><Txt label="Company" value={w.name} onChange={(name) => p({ name })} /></Row>
                  <Row>
                    <Txt label="Start" type="month" value={w.startDate} onChange={(startDate) => p({ startDate })} />
                    <Txt label="End" type="month" value={w.endDate} onChange={(endDate) => p({ endDate })} hint="empty = Present" />
                    <Txt label="Location" value={w.location} onChange={(location) => p({ location })} />
                  </Row>
                  <Area label="Achievements (one per line — start with a verb, add numbers)" value={w.highlights} onChange={(highlights) => p({ highlights })} rows={5} />
                </>
              )}
            />
          )}
          {tab === 'edu' && (
            <Items<Edu>
              items={r.education}
              onChange={(education) => setR({ education })}
              title={(e) => `${e.studyType} ${e.area} · ${e.institution}`}
              blank={() => ({ id: uid(), institution: '', studyType: '', area: '', startDate: '', endDate: '', score: '' })}
              render={(e, p) => (
                <>
                  <Txt label="Institution" value={e.institution} onChange={(institution) => p({ institution })} />
                  <Row><Txt label="Degree" value={e.studyType} onChange={(studyType) => p({ studyType })} /><Txt label="Field" value={e.area} onChange={(area) => p({ area })} /></Row>
                  <Row><Txt label="Start (YYYY or YYYY-MM)" value={e.startDate} onChange={(startDate) => p({ startDate })} /><Txt label="End" value={e.endDate} onChange={(endDate) => p({ endDate })} /><Txt label="GPA / honours" value={e.score} onChange={(score) => p({ score })} /></Row>
                </>
              )}
            />
          )}
          {tab === 'skills' && (
            <Items<Skill>
              items={r.skills}
              onChange={(skills) => setR({ skills })}
              title={(k) => k.name}
              blank={() => ({ id: uid(), name: 'Category', keywords: '' })}
              render={(k, p) => (
                <Row><Txt label="Category" value={k.name} onChange={(name) => p({ name })} /><Txt label="Skills (comma separated)" value={k.keywords} onChange={(keywords) => p({ keywords })} /></Row>
              )}
            />
          )}
          {tab === 'more' && (
            <>
              <h4 style={{ margin: '0 0 6px' }}>Projects</h4>
              <Items<Project>
                items={r.projects}
                onChange={(projects) => setR({ projects })}
                title={(x) => x.name}
                blank={() => ({ id: uid(), name: 'Project', description: '', url: '' })}
                render={(x, p) => (
                  <>
                    <Row><Txt label="Name" value={x.name} onChange={(name) => p({ name })} /><Txt label="Link" value={x.url} onChange={(url) => p({ url })} /></Row>
                    <Area label="Description" value={x.description} onChange={(description) => p({ description })} rows={2} />
                  </>
                )}
              />
              <Area label="Certifications (one per line)" value={r.certificates} onChange={(certificates) => setR({ certificates })} rows={3} />
              <Txt label="Languages" value={r.languages} onChange={(languages) => setR({ languages })} />
            </>
          )}
          {tab === 'ats' && (
            <>
              <Row wrap={false}><b style={{ flex: 1 }}>Resume health {Math.round(score * 100)}%</b></Row>
              <Bar value={score} color={score > 0.8 ? 'var(--ok)' : score > 0.5 ? 'var(--warn)' : 'var(--err)'} />
              <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0' }}>
                {checks.map((c) => <li key={c.msg} style={{ margin: '4px 0' }}>{c.ok ? '✅' : '⚠️'} {c.msg}</li>)}
              </ul>
              <Area label="Paste the job description to check keyword coverage" value={s.jd} onChange={(jd) => set({ jd })} rows={5} />
              {kw.length > 0 && (
                <>
                  <p style={{ margin: '8px 0 4px' }}><b>{Math.round(kwScore * 100)}%</b> of the top job-ad keywords appear in your resume.</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {kw.map((k) => (
                      <span key={k.word} style={{ padding: '2px 10px', borderRadius: 99, fontSize: 13, border: '1px solid', borderColor: k.found ? 'var(--ok)' : 'var(--line)', color: k.found ? 'var(--ok)' : 'var(--muted)' }}>{k.found ? '✓' : '+'} {k.word}</span>
                    ))}
                  </div>
                  <p className="muted" style={{ fontSize: 13 }}>Grey words are missing — add the ones that truly match your experience.</p>
                </>
              )}
            </>
          )}
        </Panel>
        <Panel title="Import / backup">
          <Row>
            <label className="k-btn">⬆ Import JSON Resume<input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importJson(f) }} /></label>
            <Btn onClick={() => download(`${file}.json`, JSON.stringify(toJsonResume(r), null, 2), 'application/json')}>⬇ JSON Resume</Btn>
            <Btn kind="ghost" onClick={reset}>Reset to sample</Btn>
            <Btn kind="ghost" onClick={() => setR({ basics: { name: '', label: '', email: '', phone: '', url: '', location: '', summary: '' }, work: [], education: [], skills: [], projects: [], certificates: '', languages: '' })}>Start blank</Btn>
          </Row>
          {msg && <Note tone={msg.startsWith('Imported') ? 'ok' : 'err'}>{msg}</Note>}
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Uses the open <a href="https://jsonresume.org/schema" target="_blank" rel="noreferrer">JSON Resume</a> schema. Your data stays in this browser.</p>
        </Panel>
      </div>
      <div>
        <Panel
          title="Preview"
          actions={
            <>
              <Btn kind="primary" onClick={() => void buildPdf(s).then((b) => download(`${file}.pdf`, new Blob([b.slice().buffer], { type: 'application/pdf' })))}>⬇ PDF</Btn>
              <Btn onClick={() => window.print()}>🖨 Print</Btn>
              <Btn onClick={() => download(`${file}.txt`, toPlainText(r))}>⬇ TXT</Btn>
              <CopyButton label="Copy text" text={() => toPlainText(r)} />
            </>
          }
        >
          <Row>
            <Seg value={s.template} onChange={(template) => set({ template })} options={[['modern', 'Modern'], ['classic', 'Classic'], ['compact', 'Compact']]} label="Template" />
            {s.template !== 'classic' && <input type="color" value={s.accent} onChange={(e) => set({ accent: e.target.value })} aria-label="Accent colour" />}
          </Row>
          <style>{'@media print { @page { margin: 12mm } body * { visibility: hidden } .resume-paper, .resume-paper * { visibility: visible } .resume-paper { position: absolute; inset: 0 0 auto 0; box-shadow: none !important; padding: 0 !important; max-width: none !important } }'}</style>
          <div style={{ marginTop: 10 }}>
            <Preview s={s} />
          </div>
          <p className="muted" style={{ fontSize: 13 }}>All templates are single-column with real text and standard headings, which applicant tracking systems parse reliably.</p>
        </Panel>
      </div>
    </Split>
  )
}
