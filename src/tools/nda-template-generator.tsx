import { Btn, Check, CopyButton, download, Note, Num, Panel, Row, Seg, Split, Txt, today, useToolState } from '../kit'
import { makeDocx, render, toMarkdown, toSections, type Section } from './lib/nda-template-generator'

interface Party {
  name: string
  kind: string
  addr: string
  signer: string
  title: string
}
interface State {
  mutual: boolean
  effective: string
  a: Party
  b: Party
  purpose: string
  termYears: number
  surviveYears: number
  law: string
  venue: string
  clauses: Record<string, boolean>
  nonSolicitMonths: number
}

const CLAUSES: [string, string, string][] = [
  ['returnDocs', 'Return or destruction', 'Recipient must return or destroy materials on request'],
  ['compelled', 'Compelled disclosure', 'Allows disclosure required by law, with notice'],
  ['noLicense', 'No licence', 'No IP rights are granted'],
  ['noWarranty', 'No warranty', 'Information is provided “as is”'],
  ['remedies', 'Injunctive relief', 'Breach may be stopped by court order'],
  ['tradeSecrets', 'Trade secrets survive', 'Trade secrets stay protected while they remain secret'],
  ['nonSolicit', 'Non-solicitation', 'No poaching of employees for a period'],
  ['nonCircumvent', 'Non-circumvention', 'No going around the other party to its contacts'],
  ['residuals', 'Residuals', 'Unaided memory of general ideas may be used'],
  ['noObligation', 'No obligation to proceed', 'Either party may walk away from the deal'],
  ['eSign', 'Counterparts & e-signatures', 'Electronic signatures are valid'],
]

const DEF: State = {
  mutual: true,
  effective: today(),
  a: { name: 'Northwind Analytics Ltd.', kind: 'a company incorporated in England and Wales', addr: '14 King Street, London EC2V 8EA, United Kingdom', signer: 'Priya Shah', title: 'Chief Executive Officer' },
  b: { name: 'Bluefin Robotics, Inc.', kind: 'a Delaware corporation', addr: '500 Harbor Blvd, Suite 210, Boston, MA 02210, USA', signer: 'Daniel Ortiz', title: 'VP Business Development' },
  purpose: 'evaluating a potential partnership to integrate Northwind’s demand-forecasting software with Bluefin’s warehouse robots',
  termYears: 2,
  surviveYears: 3,
  law: 'the State of New York',
  venue: 'the state and federal courts located in New York County, New York',
  clauses: { returnDocs: true, compelled: true, noLicense: true, noWarranty: true, remedies: true, tradeSecrets: true, nonSolicit: false, nonCircumvent: false, residuals: false, noObligation: true, eSign: true },
  nonSolicitMonths: 12,
}

const TPL = `This {{kind}} Non-Disclosure Agreement (the "**Agreement**") is entered into as of {{effective}} (the "**Effective Date**") by and between **{{aName}}**, {{aKind}}, with its principal place of business at {{aAddr}} ({{#if mutual}}"**{{aShort}}**"{{else}}the "**Disclosing Party**"{{/if}}), and **{{bName}}**, {{bKind}}, with its principal place of business at {{bAddr}} ({{#if mutual}}"**{{bShort}}**"{{else}}the "**Receiving Party**"{{/if}}){{#if mutual}}, each a "**Party**" and together the "**Parties**"{{/if}}.

{{#if mutual}}The Parties wish to exchange certain confidential information for the purpose of {{purpose}} (the "**Purpose**"). In this Agreement, a Party disclosing information is the "**Disclosing Party**" and a Party receiving it is the "**Receiving Party**".{{else}}The Disclosing Party wishes to disclose certain confidential information to the Receiving Party for the purpose of {{purpose}} (the "**Purpose**").{{/if}}

## Confidential Information

"**Confidential Information**" means all non-public information disclosed by the Disclosing Party to the Receiving Party, whether before or after the Effective Date, in any form, including business plans, customer and supplier information, financial data, product designs, software, source code, know-how and trade secrets, that is marked or identified as confidential or that a reasonable person would understand to be confidential given its nature and the circumstances of disclosure.

## Exclusions

Confidential Information does not include information that the Receiving Party can demonstrate (a) is or becomes publicly available through no fault of the Receiving Party; (b) was lawfully known to the Receiving Party before disclosure without a duty of confidentiality; (c) is lawfully received from a third party without restriction on disclosure; or (d) is independently developed by the Receiving Party without use of or reference to the Confidential Information.

## Obligations of the Receiving Party

The Receiving Party shall (a) use the Confidential Information solely for the Purpose; (b) not disclose it to any third party other than its employees, officers, advisers and contractors who need to know it for the Purpose and are bound by confidentiality obligations at least as protective as this Agreement; and (c) protect it using at least the same degree of care it uses for its own confidential information of a similar nature, and no less than reasonable care. The Receiving Party is responsible for any breach of this Agreement by persons to whom it discloses Confidential Information.

{{#if compelled}}## Compelled Disclosure

If the Receiving Party is required by law, regulation or court order to disclose any Confidential Information, it shall, where legally permitted, give the Disclosing Party prompt written notice so that the Disclosing Party may seek a protective order, and shall disclose only the portion that is legally required.

{{/if}}## Term

This Agreement remains in effect for **{{termYears}} year(s)** from the Effective Date unless terminated earlier by either {{#if mutual}}Party{{else}}party{{/if}} on thirty (30) days' written notice. The obligations of confidentiality shall survive for **{{surviveYears}} year(s)** after expiry or termination{{#if tradeSecrets}}, except that obligations relating to trade secrets shall continue for as long as such information remains a trade secret under applicable law{{/if}}.

{{#if returnDocs}}## Return or Destruction of Materials

Upon the Disclosing Party's written request, or upon termination of this Agreement, the Receiving Party shall promptly return or destroy all Confidential Information in its possession and, on request, certify the destruction in writing. The Receiving Party may retain copies required by law or held in routine backups, which remain subject to this Agreement.

{{/if}}{{#if noLicense}}## No Licence

All Confidential Information remains the property of the Disclosing Party. Nothing in this Agreement grants the Receiving Party any licence or right under any patent, copyright, trademark or other intellectual property right, except the limited right to use the Confidential Information for the Purpose.

{{/if}}{{#if noWarranty}}## No Warranty

Confidential Information is provided "as is". The Disclosing Party makes no representation or warranty as to its accuracy or completeness and shall have no liability arising from its use, except as expressly provided in a definitive written agreement.

{{/if}}{{#if noObligation}}## No Obligation to Proceed

Nothing in this Agreement obliges either {{#if mutual}}Party{{else}}party{{/if}} to disclose any particular information or to enter into any further transaction. Either {{#if mutual}}Party{{else}}party{{/if}} may end discussions relating to the Purpose at any time.

{{/if}}{{#if nonSolicit}}## Non-Solicitation

During the term of this Agreement and for **{{nonSolicitMonths}} months** thereafter, the Receiving Party shall not directly solicit for employment any employee of the Disclosing Party with whom it had contact in connection with the Purpose. General advertisements not targeted at such employees are not a breach of this clause.

{{/if}}{{#if nonCircumvent}}## Non-Circumvention

The Receiving Party shall not use Confidential Information to circumvent the Disclosing Party by directly or indirectly contacting, dealing with or entering into any transaction with any customer, supplier, investor or other contact introduced by the Disclosing Party in connection with the Purpose, without the Disclosing Party's prior written consent.

{{/if}}{{#if residuals}}## Residuals

Nothing in this Agreement restricts the Receiving Party from using general ideas, concepts, know-how or techniques retained in the unaided memory of its personnel who had access to Confidential Information, provided that this clause does not grant any right under the Disclosing Party's patents or copyrights or permit disclosure of the source of such information.

{{/if}}{{#if remedies}}## Remedies

The Receiving Party acknowledges that unauthorised use or disclosure of Confidential Information may cause irreparable harm for which damages would not be an adequate remedy. The Disclosing Party is therefore entitled to seek injunctive or other equitable relief, without the need to post a bond, in addition to any other remedies available at law.

{{/if}}## Governing Law and Jurisdiction

This Agreement is governed by the laws of {{law}}, without regard to its conflict-of-laws rules. Each {{#if mutual}}Party{{else}}party{{/if}} submits to the exclusive jurisdiction of {{venue}}.

## General

This Agreement constitutes the entire agreement between the parties regarding its subject matter and supersedes all prior understandings. It may be amended only in writing signed by both parties. Neither party may assign this Agreement without the other party's prior written consent, except to a successor of its entire business. If any provision is held unenforceable, the remaining provisions remain in full force.{{#if eSign}} This Agreement may be executed in counterparts, each of which is an original, and signatures delivered electronically or by PDF are binding.{{/if}}

IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.`

const short = (n: string) => n.replace(/[,.]?\s+(Ltd|Limited|Inc|LLC|GmbH|S\.?A|plc|Corp(oration)?|Co)\.?$/i, '').split(/\s+/)[0] || n

function build(s: State): { title: string; sections: Section[] } {
  const v = {
    ...s.clauses,
    mutual: s.mutual,
    kind: s.mutual ? 'Mutual' : 'One-Way',
    effective: s.effective ? new Date(s.effective + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '',
    aName: s.a.name, aKind: s.a.kind, aAddr: s.a.addr, aShort: short(s.a.name),
    bName: s.b.name, bKind: s.b.kind, bAddr: s.b.addr, bShort: short(s.b.name),
    purpose: s.purpose, termYears: s.termYears, surviveYears: s.surviveYears, law: s.law, venue: s.venue, nonSolicitMonths: s.nonSolicitMonths,
  }
  const title = `${s.mutual ? 'Mutual' : 'One-Way'} Non-Disclosure Agreement`
  const sections = toSections(render(TPL, v))
  const sig = (p: Party, role: string) => `**${p.name || '[Party]'}**${s.mutual ? '' : ` (${role})`} — Signature: ______________________   Name: ${p.signer || '__________'}   Title: ${p.title || '__________'}   Date: ____________`
  sections.push({ heading: '', paras: [sig(s.a, 'Disclosing Party'), sig(s.b, 'Receiving Party')] })
  return { title, sections }
}

function PartyForm({ label, p, on }: { label: string; p: Party; on: (p: Party) => void }) {
  const f = (k: keyof Party) => (v: string) => on({ ...p, [k]: v })
  return (
    <Panel title={label}>
      <Txt label="Legal name" value={p.name} onChange={f('name')} />
      <Txt label="Entity description" value={p.kind} onChange={f('kind')} placeholder="a Delaware corporation / an individual" />
      <Txt label="Address" value={p.addr} onChange={f('addr')} />
      <Row>
        <Txt label="Signatory" value={p.signer} onChange={f('signer')} />
        <Txt label="Title" value={p.title} onChange={f('title')} />
      </Row>
    </Panel>
  )
}

const Bold = ({ t }: { t: string }) => <>{t.split(/(\*\*[^*]+\*\*)/).map((x, i) => (x.startsWith('**') && x.endsWith('**') ? <b key={i}>{x.slice(2, -2)}</b> : x))}</>

export default function NdaTemplateGenerator() {
  const [s, set, reset] = useToolState('nda-template-generator', DEF)
  const { title, sections } = build(s)
  const md = toMarkdown(title, sections)
  const words = md.split(/\s+/).length
  const file = `NDA-${short(s.a.name)}-${short(s.b.name)}`.replace(/[^\w-]+/g, '')
  let n = 0

  return (
    <Split>
      <div>
        <Panel title="Agreement type">
          <Seg value={s.mutual ? 'm' : 'o'} onChange={(v) => set({ mutual: v === 'm' })} options={[['m', 'Mutual (both share)'], ['o', 'One-way (A discloses to B)']]} />
          <Row>
            <Txt label="Effective date" type="date" value={s.effective} onChange={(effective) => set({ effective })} />
            <Num label="Agreement term" value={s.termYears} onChange={(termYears) => set({ termYears })} min={1} max={20} unit="years" />
            <Num label="Confidentiality survives" value={s.surviveYears} onChange={(surviveYears) => set({ surviveYears })} min={0} max={20} unit="years" />
          </Row>
          <Txt label="Purpose (completes “for the purpose of …”)" value={s.purpose} onChange={(purpose) => set({ purpose })} />
        </Panel>
        <PartyForm label={s.mutual ? 'Party A' : 'Party A — Disclosing Party'} p={s.a} on={(a) => set({ a })} />
        <PartyForm label={s.mutual ? 'Party B' : 'Party B — Receiving Party'} p={s.b} on={(b) => set({ b })} />
        <Panel title="Optional clauses">
          {CLAUSES.map(([k, l, hint]) => (
            <div key={k} style={{ marginBottom: 4 }}>
              <Check label={<span><b>{l}</b> <span className="muted" style={{ fontSize: 13 }}>— {hint}</span></span>} value={!!s.clauses[k]} onChange={(v) => set({ clauses: { ...s.clauses, [k]: v } })} />
            </div>
          ))}
          {s.clauses.nonSolicit && <Num label="Non-solicitation period" value={s.nonSolicitMonths} onChange={(nonSolicitMonths) => set({ nonSolicitMonths })} min={1} max={36} unit="months" />}
        </Panel>
        <Panel title="Law & disputes">
          <Txt label="Governing law (“the laws of …”)" value={s.law} onChange={(law) => set({ law })} />
          <Txt label="Courts with jurisdiction" value={s.venue} onChange={(venue) => set({ venue })} />
          <Row>
            {[['New York', 'the State of New York', 'the state and federal courts located in New York County, New York'], ['Delaware', 'the State of Delaware', 'the state and federal courts located in Wilmington, Delaware'], ['California', 'the State of California', 'the state and federal courts located in San Francisco County, California'], ['England', 'England and Wales', 'the courts of England and Wales']].map(([l, law, venue]) => (
              <Btn key={l} kind="ghost" onClick={() => set({ law, venue })}>{l}</Btn>
            ))}
          </Row>
        </Panel>
      </div>
      <div>
        <Panel
          title={`Document · ${sections.filter((x) => x.heading).length} clauses · ${words} words`}
          actions={
            <>
              <Btn kind="primary" onClick={() => download(`${file}.docx`, new Blob([makeDocx(title, sections).slice().buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))}>⬇ DOCX</Btn>
              <Btn onClick={() => download(`${file}.md`, md, 'text/markdown')}>⬇ Markdown</Btn>
              <CopyButton text={md} label="Copy" />
              <Btn onClick={() => window.print()}>🖨 Print</Btn>
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          <style>{'@media print { body * { visibility: hidden } .nda-paper, .nda-paper * { visibility: visible } .nda-paper { position: absolute; inset: 0 0 auto 0; box-shadow: none !important; max-height: none !important; overflow: visible !important } }'}</style>
          <article className="nda-paper" style={{ background: '#fff', color: '#1b1b1b', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 14, lineHeight: 1.55, padding: 'clamp(16px, 4vw, 44px)', borderRadius: 6, boxShadow: '0 2px 14px #0002', maxHeight: 900, overflowY: 'auto', textAlign: 'justify' }}>
            <h2 style={{ textAlign: 'center', fontSize: 20, margin: '0 0 18px', letterSpacing: 0.5 }}>{title.toUpperCase()}</h2>
            {sections.map((sec, i) => {
              if (sec.heading) n++
              const last = i === sections.length - 1
              return (
                <section key={i}>
                  {sec.heading && <h3 style={{ fontSize: 15, margin: '16px 0 6px' }}>{n}. {sec.heading}</h3>}
                  {last ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 28, marginTop: 26, textAlign: 'left' }}>
                      {[s.a, s.b].map((p, k) => (
                        <div key={k}>
                          <b>{p.name}</b>
                          {!s.mutual && <div style={{ fontSize: 12, color: '#666' }}>{k ? 'Receiving Party' : 'Disclosing Party'}</div>}
                          {['Signature', 'Name', 'Title', 'Date'].map((f) => (
                            <div key={f} style={{ marginTop: 18, borderBottom: '1px solid #999', fontSize: 12, color: '#666', display: 'flex', justifyContent: 'space-between' }}>
                              <span>{f}</span>
                              <span style={{ color: '#1b1b1b' }}>{f === 'Name' ? p.signer : f === 'Title' ? p.title : ''}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    sec.paras.map((p, k) => <p key={k} style={{ margin: '0 0 10px' }}><Bold t={p} /></p>)
                  )}
                </section>
              )
            })}
          </article>
          <Note tone="warn">
            <div style={{ gridColumn: '1 / -1' }}>This template is a starting point, not legal advice. Laws differ between jurisdictions — have a qualified lawyer review the agreement before signing.</div>
          </Note>
        </Panel>
      </div>
    </Split>
  )
}
