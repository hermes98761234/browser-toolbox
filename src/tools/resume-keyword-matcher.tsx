import { useMemo, useState } from 'react'
import { Area, Bar, Btn, CopyButton, FileDrop, Note, Panel, Ring, Row, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { extractDocxText, extractPdfText, match, stem, type Match } from './lib/resume-keyword-matcher'

const JD = `Senior Frontend Engineer (React)

We are looking for a Senior Frontend Engineer to build fast, accessible web applications for our B2B analytics platform.

Responsibilities
- Build and maintain React and TypeScript applications used by thousands of analysts
- Own state management, performance budgets and web performance monitoring
- Work with designers to evolve our design system and ensure accessibility (WCAG 2.1 AA)
- Write unit testing and end-to-end testing suites (Jest, Playwright) and keep CI/CD green
- Integrate GraphQL and REST APIs; collaborate with backend engineers on API design
- Mentor engineers through code reviews and pair programming

Requirements
- 5+ years of frontend experience with React and TypeScript
- Deep knowledge of JavaScript, HTML and CSS
- Experience with GraphQL, Next.js and server-side rendering
- Experience with data visualization (D3 or similar)
- Familiarity with agile / scrum teams and cross-functional collaboration
- Nice to have: Storybook, Docker, AWS`

const CV = `Jane Doe — Frontend Developer
jane@example.com · Kyiv, Ukraine

SUMMARY
Frontend developer with 6 years of experience building React applications in JavaScript and TypeScript for SaaS products.

EXPERIENCE
Frontend Developer, DataCo (2021–present)
- Built a React + TypeScript dashboard used by 4,000 analysts; cut bundle size by 38%
- Introduced a component library in Storybook shared by three product teams
- Wrote unit tests with Jest and set up CI pipelines in GitHub Actions
- Worked in an agile scrum team with designers and backend engineers

Web Developer, Agency X (2018–2021)
- Delivered 20+ responsive websites with HTML, CSS and JavaScript
- Integrated REST APIs and payment providers

SKILLS
React, TypeScript, JavaScript, HTML, CSS, Redux, Jest, Storybook, Git, Figma`

interface State { jd: string; cv: string; max: number }
const DEF: State = { jd: JD, cv: CV, max: 40 }

function Chip({ m, missing }: { m: Match; missing: boolean }) {
  return (
    <span
      title={`${m.kw.count}× in the job ad${missing ? '' : ` · ${m.inResume}× in your resume`}`}
      style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '3px 10px', borderRadius: 999, fontSize: 14, border: `1px solid ${missing ? 'var(--err)' : 'var(--ok)'}`, background: `color-mix(in srgb, ${missing ? 'var(--err)' : 'var(--ok)'} 10%, var(--panel))` }}
    >
      {m.kw.term}
      <b style={{ fontSize: 11, opacity: 0.7 }}>{m.kw.count}×</b>
    </span>
  )
}

export default function ResumeKeywordMatcher() {
  const [s, set, reset] = useToolState('resume-keyword-matcher', DEF)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'warn'; text: string } | null>(null)
  const res = useMemo(() => match(s.jd, s.cv, s.max), [s.jd, s.cv, s.max])
  const missing = res.matches.filter((m) => !m.inResume)
  const found = res.matches.filter((m) => m.inResume)
  const maxW = Math.max(1, ...res.matches.map((m) => m.kw.weight))

  const status = useMemo(() => {
    const st = new Map<string, boolean>()
    for (const m of res.matches) for (const w of m.kw.key.split(' ')) if (!st.has(w) || m.inResume) st.set(w, m.inResume > 0)
    return st
  }, [res])

  const load = async (f: File) => {
    setMsg(null)
    try {
      const buf = new Uint8Array(await f.arrayBuffer())
      let text = ''
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') text = await extractPdfText(buf)
      else if (/\.docx$/i.test(f.name)) text = await extractDocxText(buf)
      else text = new TextDecoder().decode(buf)
      const letters = (text.match(/\p{L}/gu) ?? []).length
      if (letters < 80) setMsg({ tone: 'warn', text: `Only ${letters} letters could be read from ${f.name}. It may be a scanned image or use an unusual font encoding — and an ATS would struggle too. Paste the text instead.` })
      else setMsg({ tone: 'ok', text: `Read ${text.split(/\s+/).length} words from ${f.name}. Check the text below — this is roughly what an ATS sees.` })
      if (text.trim()) set({ cv: text })
    } catch (e) {
      setMsg({ tone: 'err', text: `${f.name}: ${(e as Error).message}` })
    }
  }

  const score = res.score
  const tone = score >= 0.75 ? 'good' : score >= 0.5 ? 'accent' : 'bad'

  return (
    <Split>
      <div>
        <Panel title="Job description" actions={<Btn kind="ghost" onClick={() => set({ jd: '' })}>Clear</Btn>}>
          <Area value={s.jd} onChange={(jd) => set({ jd })} rows={12} placeholder="Paste the full job ad here" />
        </Panel>
        <Panel title="Your resume" actions={<><Btn kind="ghost" onClick={() => set({ cv: '' })}>Clear</Btn><Btn kind="ghost" onClick={reset}>Sample</Btn></>}>
          <FileDrop accept=".pdf,.docx,.txt,.md,application/pdf" onFiles={(f) => void load(f[0])} label="Drop your resume (PDF, DOCX or TXT) — or paste it below" />
          {msg && <Note tone={msg.tone}>{msg.text}</Note>}
          <Area value={s.cv} onChange={(cv) => set({ cv })} rows={12} placeholder="Resume text" />
        </Panel>
      </div>
      <div>
        <Stats>
          <div className="k-stat" style={{ display: 'grid', placeItems: 'center' }}>
            <Ring value={score} label={`${Math.round(score * 100)}%`} color={tone === 'good' ? 'var(--ok)' : tone === 'bad' ? 'var(--err)' : 'var(--accent)'} />
          </div>
          <Stat label="Keyword match" value={`${Math.round(score * 100)}%`} sub="weighted by how often the ad repeats each term" tone={tone} />
          <Stat label="Matched" value={found.length} sub={`of ${res.matches.length} keywords`} tone="good" />
          <Stat label="Missing" value={missing.length} tone={missing.length ? 'bad' : 'good'} />
        </Stats>
        <Panel title="Missing keywords — most important first" actions={<CopyButton text={() => missing.map((m) => m.kw.term).join(', ')} label="Copy list" />}>
          {missing.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {missing.map((m) => <Chip key={m.kw.key} m={m} missing />)}
            </div>
          ) : (
            <Note tone="ok">Every keyword from the ad appears in your resume.</Note>
          )}
          <p className="muted" style={{ fontSize: 13 }}>Only add terms you can honestly back up — ideally in a bullet that shows the result, e.g. “Cut load time 40% with server-side rendering in Next.js”.</p>
        </Panel>
        <Panel title="Already covered">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {found.map((m) => <Chip key={m.kw.key} m={m} missing={false} />)}
          </div>
        </Panel>
        <Panel title="Keyword table">
          <Slider label="Keywords to compare" value={s.max} onChange={(max) => set({ max })} min={10} max={80} step={5} show={String} />
          <Table
            max={25}
            head={['Keyword', 'Importance', 'In ad', 'In resume']}
            rows={res.matches.map((m) => [
              <b key="k">{m.kw.term}</b>,
              <div key="w" style={{ minWidth: 80 }}><Bar value={m.kw.weight} max={maxW} color={m.inResume ? 'var(--ok)' : 'var(--err)'} /></div>,
              `${m.kw.count}×`,
              m.inResume ? <span key="r" style={{ color: 'var(--ok)' }}>✓ {m.inResume}×</span> : <span key="r" style={{ color: 'var(--err)' }}>missing</span>,
            ])}
          />
        </Panel>
        <Panel title="Job ad, highlighted">
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, maxHeight: 360, overflow: 'auto' }}>
            {s.jd.split(/(\s+|[,;:()!?]+)/).map((w, i) => {
              const k = stem(w.toLowerCase().replace(/^[^a-z0-9#+.]+|[^a-z0-9#+]+$/g, ''))
              const st = status.get(k)
              if (st === undefined) return <span key={i}>{w}</span>
              return <mark key={i} style={{ background: `color-mix(in srgb, ${st ? 'var(--ok)' : 'var(--err)'} 22%, transparent)`, color: 'inherit', borderRadius: 3, padding: '0 1px' }}>{w}</mark>
            })}
          </div>
          <Row>
            <span className="muted" style={{ fontSize: 13 }}>
              <mark style={{ background: 'color-mix(in srgb, var(--ok) 22%, transparent)', color: 'inherit' }}>in your resume</mark> · <mark style={{ background: 'color-mix(in srgb, var(--err) 22%, transparent)', color: 'inherit' }}>missing</mark>
            </span>
          </Row>
        </Panel>
        <Note>
          How it works: the ad is tokenised, stop-words removed and words reduced to a simple stem (so “APIs” matches “API”, “testing” matches “tests”); known skill phrases and repeated two-word terms count as one keyword. Text is read from PDFs and DOCX files locally — nothing is uploaded.
        </Note>
      </div>
    </Split>
  )
}
