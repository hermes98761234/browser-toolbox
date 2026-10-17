import { Area, Btn, Check, CopyButton, Note, Num, Panel, Row, Select, Split, Txt, download, today, useToolState } from '../kit'
import { makeDocx, toMarkdown } from './lib/nda-template-generator'
import { POWERS, build, longDate, problems, title, wordCount, type Kind, type PoaData } from './lib/power-of-attorney-template'

const P = (name: string, address: string, relation = '', phone = '') => ({ name, address, phone, relation })
const DEF: PoaData = {
  kind: 'durable',
  principal: P('Margaret A. Collins', '418 Willow Lane, Portland, OR 97205', '', '(503) 555-0142'),
  agent: P('Daniel R. Collins', '72 Harbor View Rd, Seattle, WA 98109', 'son', '(206) 555-0198'),
  successor: P('Laura Collins-Reyes', '15 Cedar Court, Eugene, OR 97401', 'daughter'),
  useSuccessor: true,
  coAgent: P('', ''),
  useCoAgent: false,
  coMode: 'severally',
  powers: ['realEstate', 'banking', 'investments', 'insurance', 'retirement', 'benefits', 'tax', 'family'],
  limitedPurpose: 'the sale of my 2019 Subaru Outback (VIN 4S4BSANC5K3xxxxxx), including signing the title transfer and receiving the proceeds',
  start: '',
  end: '',
  state: 'the State of Oregon',
  county: 'Multnomah',
  compensation: 'none',
  fee: '',
  gifts: false,
  giftLimit: '$1,000',
  accounting: true,
  instructions: '',
  witnesses: 2,
  notary: true,
  signDate: today(),
}
const KINDS: [Kind, string, string][] = [
  ['durable', 'Durable general', 'Broad powers that stay valid if you become incapacitated — the usual choice for long-term planning.'],
  ['general', 'General (non-durable)', 'Broad powers that end automatically if you become incapacitated — e.g. while travelling abroad.'],
  ['limited', 'Limited / special', 'One specific transaction or purpose, such as selling a car or closing on a house.'],
  ['springing', 'Springing durable', 'Takes effect only when a doctor certifies that you are incapacitated.'],
]

function Bold({ t }: { t: string }) {
  return <>{t.split(/(\*\*[^*]+\*\*)/).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))}</>
}
const Line = ({ label, value = '' }: { label: string; value?: string }) => (
  <div style={{ marginTop: 22, borderBottom: '1px solid #888', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', gap: 8 }}>
    <span>{label}</span><span style={{ color: '#1b1b1b' }}>{value}</span>
  </div>
)

export default function PowerOfAttorneyTemplate() {
  const [s, set, reset] = useToolState('power-of-attorney-template', DEF)
  const sections = build(s)
  const issues = problems(s)
  const t = title(s.kind)
  const md = toMarkdown(t, sections) + `\n\nSigned on ${longDate(s.signDate)}.\n\n______________________  ${s.principal.name || 'Principal'}, Principal\n\n` + Array.from({ length: s.witnesses }, (_, i) => `Witness ${i + 1}: ______________________  Name: __________  Address: __________`).join('\n\n') + (s.notary ? `\n\nNOTARY ACKNOWLEDGMENT\nState of ${s.state.replace(/^the State of /, '')}, County of ${s.county || '________'}\nOn ${longDate(s.signDate)}, before me personally appeared ${s.principal.name || '________'}, proved to me on the basis of satisfactory evidence to be the person who signed this instrument, and acknowledged that he/she signed it voluntarily.\n\nNotary Public: ______________________  My commission expires: ________\n` : '')
  const file = `power-of-attorney-${(s.principal.name || 'draft').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const person = (k: 'principal' | 'agent' | 'successor' | 'coAgent', withRel: boolean) => (
    <>
      <Row>
        <Txt label="Full legal name" value={s[k].name} onChange={(name) => set({ [k]: { ...s[k], name } } as Partial<PoaData>)} />
        {withRel && <Txt label="Relationship" value={(s[k] as { relation: string }).relation} onChange={(relation) => set({ [k]: { ...s[k], relation } } as Partial<PoaData>)} placeholder="e.g. spouse, friend" />}
      </Row>
      <Txt label="Address" value={s[k].address} onChange={(address) => set({ [k]: { ...s[k], address } } as Partial<PoaData>)} />
    </>
  )
  let n = 0

  return (
    <Split wide="right">
      <div>
        <Panel title="Type of power of attorney">
          {KINDS.map(([k, l, hint]) => (
            <label key={k} className="k-check" style={{ alignItems: 'flex-start', marginBottom: 6 }}>
              <input type="radio" name="poa-kind" checked={s.kind === k} onChange={() => set({ kind: k })} />
              <span><b>{l}</b><br /><span className="muted" style={{ fontSize: 13 }}>{hint}</span></span>
            </label>
          ))}
        </Panel>
        <Panel title="Principal (you)">{person('principal', false)}</Panel>
        <Panel title="Agent (attorney-in-fact)">
          {person('agent', true)}
          <Check label="Name a successor agent" value={s.useSuccessor} onChange={(useSuccessor) => set({ useSuccessor })} />
          {s.useSuccessor && person('successor', true)}
          <Check label="Add a co-agent" value={s.useCoAgent} onChange={(useCoAgent) => set({ useCoAgent })} />
          {s.useCoAgent && (
            <>
              {person('coAgent', true)}
              <Select label="Co-agents act" value={s.coMode} onChange={(coMode) => set({ coMode })} options={[['severally', 'Separately — either may act alone'], ['jointly', 'Jointly — both must agree']]} />
            </>
          )}
        </Panel>
        <Panel title={s.kind === 'limited' ? 'Purpose and powers' : 'Powers'} actions={s.kind !== 'limited' && <><Btn kind="ghost" onClick={() => set({ powers: POWERS.map(([k]) => k) })}>All</Btn><Btn kind="ghost" onClick={() => set({ powers: [] })}>None</Btn></>}>
          {s.kind === 'limited' && <Area label="Limited purpose (“…only for …”)" value={s.limitedPurpose} onChange={(limitedPurpose) => set({ limitedPurpose })} rows={3} />}
          {POWERS.map(([k, l]) => (
            <Check key={k} value={s.powers.includes(k)} onChange={(on) => set({ powers: on ? [...s.powers, k] : s.powers.filter((x) => x !== k) })}
              label={<span><b>{l.split(':')[0]}</b><span className="muted" style={{ fontSize: 13 }}>{l.includes(':') ? ' —' + l.split(':')[1] : ''}</span></span>} />
          ))}
        </Panel>
        <Panel title="Timing, duties and law">
          <Row>
            <Txt type="date" label={s.kind === 'springing' ? 'Start (ignored: springing)' : 'Start date (blank = on signing)'} value={s.start} onChange={(start) => set({ start })} />
            <Txt type="date" label="End date (blank = until revoked)" value={s.end} onChange={(end) => set({ end })} />
          </Row>
          <Row>
            <Select label="Agent compensation" value={s.compensation} onChange={(compensation) => set({ compensation })} options={[['none', 'None (expenses only)'], ['reasonable', 'Reasonable compensation'], ['fixed', 'Fixed fee']]} />
            {s.compensation === 'fixed' && <Txt label="Fee" value={s.fee} onChange={(fee) => set({ fee })} placeholder="$50 per hour" />}
          </Row>
          <Check label="Agent must keep records and account on request" value={s.accounting} onChange={(accounting) => set({ accounting })} />
          <Check label="Allow gifts (annual limit per person)" value={s.gifts} onChange={(gifts) => set({ gifts })} />
          {s.gifts && <Txt label="Gift limit per recipient per year" value={s.giftLimit} onChange={(giftLimit) => set({ giftLimit })} />}
          <Area label="Special instructions (optional)" value={s.instructions} onChange={(instructions) => set({ instructions })} rows={3} placeholder="e.g. My agent may not sell my home at 418 Willow Lane without the written consent of my daughter." />
          <Row>
            <Txt label="Governing law" value={s.state} onChange={(state) => set({ state })} />
            <Txt label="County (notary)" value={s.county} onChange={(county) => set({ county })} />
          </Row>
          <Row>
            <Num label="Witnesses" value={s.witnesses} onChange={(w) => set({ witnesses: Math.max(0, Math.min(3, Math.round(w))) })} min={0} max={3} />
            <Txt type="date" label="Signing date" value={s.signDate} onChange={(signDate) => set({ signDate })} />
          </Row>
          <Check label="Include notary acknowledgment" value={s.notary} onChange={(notary) => set({ notary })} />
        </Panel>
      </div>

      <div>
        {issues.length > 0 ? <Note tone="warn"><b>Check before printing:</b><ul style={{ margin: '4px 0 0 18px', padding: 0 }}>{issues.map((i) => <li key={i}>{i}</li>)}</ul></Note> : <Note tone="ok">All required fields are filled in. Review the wording, then print and sign in front of the witnesses / notary.</Note>}
        <Panel title={`${t} · ${wordCount(sections)} words`} actions={
          <>
            <Btn kind="primary" onClick={() => window.print()}>🖨 Print</Btn>
            <Btn onClick={() => download(`${file}.docx`, new Blob([makeDocx(t, sections).slice().buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))}>⬇ DOCX</Btn>
            <Btn onClick={() => download(`${file}.md`, md, 'text/markdown')}>⬇ Text</Btn>
            <CopyButton text={md} label="Copy" />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </>
        }>
          <style>{'@media print { body * { visibility: hidden } .poa-paper, .poa-paper * { visibility: visible } .poa-paper { position: absolute; inset: 0 0 auto 0; box-shadow: none !important; max-height: none !important; overflow: visible !important; padding: 0 !important } .poa-sign { break-inside: avoid } }'}</style>
          <article className="poa-paper" style={{ background: '#fff', color: '#1b1b1b', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 14, lineHeight: 1.6, padding: 'clamp(16px, 4vw, 48px)', borderRadius: 6, boxShadow: '0 2px 14px #0002', maxHeight: 1100, overflowY: 'auto', textAlign: 'justify' }}>
            <h2 style={{ textAlign: 'center', fontSize: 20, margin: '0 0 4px', letterSpacing: 0.6 }}>{t.toUpperCase()}</h2>
            <p style={{ textAlign: 'center', fontSize: 12, color: '#666', margin: '0 0 18px' }}>{s.kind === 'durable' || s.kind === 'springing' ? 'This power of attorney survives the incapacity of the principal' : 'Read this document carefully before signing'}</p>
            {sections.map((sec, i) => {
              if (sec.heading) n++
              return (
                <section key={i}>
                  {sec.heading && <h3 style={{ fontSize: 15, margin: '16px 0 6px' }}>{n}. {sec.heading}</h3>}
                  {sec.paras.map((p, k) => <p key={k} style={{ margin: '0 0 8px', paddingLeft: /^\([a-z]\)/.test(p) ? 18 : 0 }}><Bold t={p} /></p>)}
                </section>
              )
            })}
            <section className="poa-sign" style={{ marginTop: 26, textAlign: 'left' }}>
              <p>Signed on {longDate(s.signDate)}.</p>
              <div style={{ maxWidth: 360 }}>
                <Line label="Signature of Principal" />
                <Line label="Printed name" value={s.principal.name} />
              </div>
              {s.witnesses > 0 && (
                <>
                  <h3 style={{ fontSize: 14, margin: '22px 0 0' }}>Witnesses</h3>
                  <p style={{ fontSize: 13, margin: '4px 0' }}>We declare that the Principal signed this document in our presence, appeared to be of sound mind and under no duress, and that neither of us is the Agent{s.useSuccessor ? ' or successor agent' : ''}.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24 }}>
                    {Array.from({ length: s.witnesses }, (_, i) => (
                      <div key={i}><Line label={`Witness ${i + 1} signature`} /><Line label="Printed name" /><Line label="Address" /></div>
                    ))}
                  </div>
                </>
              )}
              {s.notary && (
                <div style={{ marginTop: 26, border: '1px solid #bbb', padding: 14, fontSize: 13 }}>
                  <b>NOTARY ACKNOWLEDGMENT</b>
                  <p style={{ margin: '6px 0' }}>State of {s.state.replace(/^the State of /, '') || '________'}, County of {s.county || '________'}</p>
                  <p style={{ margin: '6px 0' }}>On {longDate(s.signDate)}, before me personally appeared <b>{s.principal.name || '________'}</b>, proved to me on the basis of satisfactory evidence to be the person whose name is subscribed to this instrument, and acknowledged that he/she executed it voluntarily.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24 }}>
                    <div><Line label="Notary Public signature" /><Line label="My commission expires" /></div>
                    <div style={{ border: '1px dashed #bbb', minHeight: 80, display: 'grid', placeItems: 'center', color: '#999', marginTop: 16 }}>Seal</div>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 26, fontSize: 13 }}>
                <b>Agent’s acceptance</b>
                <p style={{ margin: '4px 0' }}>I, {s.agent.name || '________'}, accept this appointment and agree to act in the Principal’s best interest, in good faith and within the authority granted.</p>
                <div style={{ maxWidth: 360 }}><Line label="Signature of Agent" /><Line label="Date" /></div>
              </div>
            </section>
          </article>
          <Note tone="warn">This is a drafting template, not legal advice. Execution rules differ by state and country (statutory forms, witness and notary requirements, recording for real estate). Many US states have an official statutory form — have a lawyer review the final document.</Note>
        </Panel>
      </div>
    </Split>
  )
}
