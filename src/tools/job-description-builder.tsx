import { Area, Bar, Btn, CopyButton, download, Note, Panel, Row, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { checkInclusive, flesch, genderCoding, mdToHtml, toMarkdown, type Jd } from './lib/job-description-builder'

interface State extends Omit<Jd, 'duties' | 'must' | 'nice' | 'benefits'> { duties: string; must: string; nice: string; benefits: string }

type Tpl = [summary: string, duties: string[], must: string[], nice: string[]]
const TEMPLATES: Record<string, Tpl> = {
  'Software Engineer': ['You will build and run the services behind our product, working closely with design and product to ship improvements every week.', ['Design, build and maintain reliable backend services and APIs', 'Review code and help teammates grow through thoughtful feedback', 'Own features end to end, from planning to monitoring in production', 'Improve test coverage, performance and developer tooling', 'Take part in a fair, well-paid on-call rotation'], ['3+ years of professional software development experience', 'Solid knowledge of TypeScript, Go or a similar language', 'Experience with SQL databases and REST or GraphQL APIs', 'Clear written communication in English'], ['Experience with cloud infrastructure (AWS, GCP or Azure)', 'Contributions to open-source projects']],
  'Product Designer': ['You will shape how thousands of people experience our product, from early research to polished interfaces.', ['Turn research and data into clear user flows, wireframes and prototypes', 'Create accessible, high-quality UI in Figma using our design system', 'Run usability tests and share what you learn with the team', 'Partner with engineers through build and launch'], ['A portfolio showing end-to-end product design work', 'Experience designing for web and mobile', 'Working knowledge of accessibility (WCAG) principles'], ['Experience contributing to a design system', 'Basic HTML/CSS knowledge']],
  'Marketing Manager': ['You will plan and run campaigns that grow our audience and turn interest into customers.', ['Plan and execute multi-channel campaigns across email, social and paid media', 'Set goals, track results and report on what works', 'Work with sales and product on launches and messaging', 'Manage a monthly budget and external partners'], ['4+ years of B2B or B2C marketing experience', 'Hands-on experience with analytics tools', 'Excellent writing and editing skills'], ['Experience with marketing automation (HubSpot, Braze or similar)', 'Basic video editing skills']],
  'Customer Support Specialist': ['You will be the voice of our company, helping customers solve problems quickly and kindly.', ['Answer customer questions by chat and email', 'Troubleshoot issues and escalate bugs with clear reproduction steps', 'Write and update help-centre articles', 'Share customer feedback with the product team'], ['1+ year in a customer-facing role', 'Patience, empathy and clear written English', 'Comfort learning new software quickly'], ['Experience with Zendesk or Intercom', 'A second language']],
  'Data Analyst': ['You will help teams make better decisions by turning raw data into clear answers.', ['Build dashboards and reports that teams actually use', 'Write SQL to explore data and answer business questions', 'Design and analyse A/B tests', 'Document metrics so everyone uses the same definitions'], ['2+ years of experience in an analytics role', 'Strong SQL skills', 'Experience with a BI tool such as Looker, Metabase or Power BI'], ['Python or R for analysis', 'Experience with dbt']],
  'Sales Representative': ['You will help new customers discover how we can solve their problems, from first call to signed contract.', ['Run discovery calls and product demos', 'Manage a pipeline of qualified opportunities in our CRM', 'Work with marketing on outreach campaigns', 'Hit quarterly revenue targets with support from the team'], ['2+ years of experience in sales or account management', 'Excellent listening and presentation skills', 'Experience with a CRM such as Salesforce or HubSpot'], ['Experience selling SaaS products']],
}
const BENEFITS = ['Salary bands published internally', '25 days of paid holiday plus public holidays', 'Flexible working hours', 'Remote-friendly with an annual team retreat', 'Health insurance for you and your family', 'Learning budget of $1,500 per year', 'Parental leave: 16 weeks fully paid', 'Home-office setup budget', 'Pension / 401(k) matching']
const EEO = 'We are an equal opportunity employer. We welcome applicants of all backgrounds and do not discriminate on the basis of race, religion, colour, national origin, gender, sexual orientation, age, marital status, veteran status or disability. If you need reasonable adjustments during the hiring process, let us know.'

const DEF: State = {
  title: 'Senior Software Engineer', company: 'Northwind Labs', location: 'Lisbon, Portugal', workplace: 'Hybrid', type: 'Full-time', salary: '€62,000 – €78,000 per year',
  about: 'Northwind Labs builds scheduling software used by 4,000 clinics across Europe. We are a supportive team of 60 people who care about calm, focused work.',
  summary: TEMPLATES['Software Engineer'][0],
  duties: TEMPLATES['Software Engineer'][1].join('\n'),
  must: ['5+ years of professional software development experience', 'A competitive, self-reliant rockstar engineer who can dominate complex problems', 'Solid knowledge of TypeScript and Node.js', 'Experience with PostgreSQL', 'Native English speaker'].join('\n'),
  nice: TEMPLATES['Software Engineer'][3].join('\n'),
  benefits: BENEFITS.slice(1, 6).join('\n'),
  apply: 'Send your CV and a short note about a project you are proud of. We reply to every applicant within 10 days. The process: 30-minute intro call, a paid take-home task, and a final conversation with the team.',
  eeo: EEO,
}
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
const tone = (score: number) => (score >= 60 ? ['Plain English', 'var(--ok)'] : score >= 40 ? ['Fairly difficult', 'var(--warn)'] : ['Difficult', 'var(--err)'])

export default function JobDescriptionBuilder() {
  const [s, set, reset] = useToolState('job-description-builder', DEF)
  const jd: Jd = { ...s, duties: lines(s.duties), must: lines(s.must), nice: lines(s.nice), benefits: lines(s.benefits) }
  const md = toMarkdown(jd)
  const html = mdToHtml(md)
  const plain = md.replace(/^#+ /gm, '').replace(/\*\*|_/g, '').replace(/^- /gm, '• ').replace(/^---$/m, '')
  const findings = checkInclusive(md)
  const g = genderCoding(md)
  const r = flesch(plain)
  const [rl, rc] = tone(r.score)
  const you = (md.match(/\byou(r)?\b/gi) ?? []).length, cand = (md.match(/\b(candidate|applicant)s?\b/gi) ?? []).length
  const tips: [string, 'warn' | 'ok'][] = []
  if (jd.must.length > 8) tips.push([`${jd.must.length} must-have requirements. Long lists put off qualified people who don't tick every box; keep it to the 5–7 that truly matter.`, 'warn'])
  if (!s.salary.trim()) tips.push(['No salary range. Posts with pay ranges get more applicants, and pay transparency is required in many places (EU directive, several US states).', 'warn'])
  if (cand > you) tips.push(['Talk to the reader: “you will…” reads warmer than “the candidate will…”.', 'warn'])
  if (r.words > 900) tips.push([`${r.words} words is long; aim for roughly 300–700.`, 'warn'])
  if (!s.eeo.trim()) tips.push(['Add an equal-opportunity and accommodations statement.', 'warn'])
  if (!findings.length && tips.length === 0) tips.push(['Looks inclusive and complete. Nice work!', 'ok'])
  const applyTpl = (k: string) => { const t = TEMPLATES[k]; if (t) set({ title: k, summary: t[0], duties: t[1].join('\n'), must: t[2].join('\n'), nice: t[3].join('\n') }) }
  const addTo = (key: 'benefits', v: string) => !lines(s[key]).includes(v) && set({ [key]: (s[key].trim() ? s[key].trim() + '\n' : '') + v })
  const slug = (s.title || 'job').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const fullHtml = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${s.title.replace(/</g, '&lt;')}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#1f2937}h1{font-size:28px}h2{font-size:20px;margin-top:28px}</style></head><body>\n${html}\n</body></html>`

  return (
    <Split>
      <div>
        <Panel title="Basics" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Start from a role template" value="" onChange={applyTpl} options={[['', 'Choose a template…'], ...Object.keys(TEMPLATES).map((k) => [k, k] as [string, string])]} />
          <Row>
            <Txt label="Job title" value={s.title} onChange={(title) => set({ title })} />
            <Txt label="Company" value={s.company} onChange={(company) => set({ company })} />
          </Row>
          <Row>
            <Txt label="Location" value={s.location} onChange={(location) => set({ location })} />
            <Select label="Workplace" value={s.workplace} onChange={(workplace) => set({ workplace })} options={['On-site', 'Hybrid', 'Remote', 'Remote (same time zone)', '']} />
          </Row>
          <Row>
            <Select label="Employment" value={s.type} onChange={(type) => set({ type })} options={['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary']} />
            <Txt label="Salary range" value={s.salary} onChange={(salary) => set({ salary })} placeholder="$90,000 – $110,000" />
          </Row>
        </Panel>
        <Panel title="Sections">
          <Area label="About the company" value={s.about} onChange={(about) => set({ about })} rows={3} />
          <Area label="The role (summary)" value={s.summary} onChange={(summary) => set({ summary })} rows={3} />
          <Area label="What you will do · one per line" value={s.duties} onChange={(duties) => set({ duties })} rows={5} />
          <Area label={`What you bring (must-haves) · ${lines(s.must).length}`} value={s.must} onChange={(must) => set({ must })} rows={5} />
          <Area label="Nice to have" value={s.nice} onChange={(nice) => set({ nice })} rows={3} />
          <Area label="What we offer" value={s.benefits} onChange={(benefits) => set({ benefits })} rows={4} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {BENEFITS.filter((b) => !lines(s.benefits).includes(b)).map((b) => <Btn key={b} kind="ghost" onClick={() => addTo('benefits', b)}>+ {b}</Btn>)}
          </div>
          <Area label="How to apply" value={s.apply} onChange={(apply) => set({ apply })} rows={3} />
          <Area label="Equal opportunity statement" value={s.eeo} onChange={(eeo) => set({ eeo })} rows={3} />
          {!s.eeo.trim() && <Btn onClick={() => set({ eeo: EEO })}>Insert standard statement</Btn>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Inclusive issues" value={findings.reduce((a, f) => a + f.count, 0)} tone={findings.length ? 'bad' : 'good'} />
          <Stat label="Gender coding" value={g.verdict.replace('-coded', '')} sub={`${g.masc.length} masc. · ${g.fem.length} fem. words`} />
          <Stat label="Readability" value={Number.isFinite(r.score) ? Math.round(r.score) : '—'} sub={<span style={{ color: rc }}>{rl} · {r.words} words</span>} />
        </Stats>
        <Panel title="Inclusive language check">
          {findings.length ? (
            <Table head={['Found', 'Why', 'Try instead']} rows={findings.map((f) => [<b key="t" style={{ color: 'var(--err)' }}>{f.term}{f.count > 1 ? ` ×${f.count}` : ''}</b>, f.category, f.suggestion])} />
          ) : <Note tone="ok">No flagged words found.</Note>}
          <div style={{ marginTop: 12 }}>
            <Row wrap={false}><span style={{ flex: 1 }}>Masculine-coded words</span><b>{g.masc.length}</b></Row>
            <Bar value={g.masc.length} max={Math.max(1, g.masc.length + g.fem.length)} color="#0ea5e9" />
            <Row wrap={false}><span style={{ flex: 1 }}>Feminine-coded words</span><b>{g.fem.length}</b></Row>
            <Bar value={g.fem.length} max={Math.max(1, g.masc.length + g.fem.length)} color="#ec4899" />
            <p className="muted" style={{ fontSize: 13 }}>
              {g.masc.length > 0 && <>Masculine: {[...new Set(g.masc)].join(', ')}. </>}
              {g.fem.length > 0 && <>Feminine: {[...new Set(g.fem)].join(', ')}. </>}
              Research (Gaucher, Friesen &amp; Kay, 2011) found heavily masculine-coded ads feel less appealing to women. Aim for balanced.
            </p>
          </div>
          {tips.map(([t, k]) => <Note key={t} tone={k}>{t}</Note>)}
        </Panel>
        <Panel title="Preview" actions={<>
          <CopyButton text={md} label="Copy Markdown" />
          <CopyButton text={plain} label="Copy text" />
          <Btn onClick={() => download(`${slug}.md`, md, 'text/markdown')}>⬇ .md</Btn>
          <Btn onClick={() => download(`${slug}.html`, fullHtml, 'text/html')}>⬇ .html</Btn>
        </>}>
          <div className="jd-preview" style={{ lineHeight: 1.6, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 18px', maxHeight: 640, overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: html }} />
        </Panel>
      </div>
    </Split>
  )
}
