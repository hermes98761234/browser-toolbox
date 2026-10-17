// Meeting Minutes: quorum and vote rules, document model, Markdown and DOCX (with tables) output.
import { makeZip } from './image-compressor'
import { longDate } from './rental-agreement-template'

export type Status = 'present' | 'remote' | 'absent' | 'excused' | 'guest'
export interface Person { id: string; name: string; role: string; status: Status; voting: boolean }
export type Threshold = 'majority' | 'two-thirds' | 'unanimous'
export interface Motion { id: string; text: string; mover: string; seconder: string; yes: number; no: number; abstain: number; threshold: Threshold }
export interface Action { id: string; task: string; owner: string; due: string }
export interface Item { id: string; title: string; presenter: string; notes: string; motions: Motion[]; actions: Action[] }
export interface Minutes {
  org: string; body: string; kind: string; date: string; start: string; end: string; place: string
  chair: string; secretary: string; quorumRule: 'majority' | 'number'; quorumN: number
  people: Person[]; items: Item[]; next: string; nextPlace: string
}

export const isPresent = (p: Person) => p.status === 'present' || p.status === 'remote'

/** Members needed for quorum: majority of voting members (⌊n/2⌋+1) or a fixed number. */
export function quorum(m: Pick<Minutes, 'people' | 'quorumRule' | 'quorumN'>): { need: number; have: number; ok: boolean; members: number } {
  const voters = m.people.filter((p) => p.voting)
  const need = m.quorumRule === 'majority' ? Math.floor(voters.length / 2) + 1 : Math.max(0, Math.round(m.quorumN))
  const have = voters.filter(isPresent).length
  return { need, have, ok: have >= need, members: voters.length }
}

/** Carried if yes votes meet the threshold of votes cast (abstentions are not votes cast). */
export function result(mo: Pick<Motion, 'yes' | 'no' | 'abstain' | 'threshold'>): 'carried' | 'failed' | 'pending' {
  const cast = mo.yes + mo.no
  if (cast === 0) return 'pending'
  if (mo.threshold === 'unanimous') return mo.no === 0 ? 'carried' : 'failed'
  if (mo.threshold === 'two-thirds') return mo.yes * 3 >= cast * 2 ? 'carried' : 'failed'
  return mo.yes * 2 > cast ? 'carried' : 'failed'
}

const fmtTime = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t)
  if (!m) return t
  const h = Number(m[1])
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'a.m.' : 'p.m.'}`
}

export type Block =
  | { t: 'title' | 'subtitle' | 'h' | 'p' | 'bullet' | 'small'; text: string }
  | { t: 'table'; head: string[]; rows: string[][]; widths?: number[] }

export function build(m: Minutes): Block[] {
  const q = quorum(m)
  const B: Block[] = []
  const present = m.people.filter(isPresent), absent = m.people.filter((p) => p.status === 'absent' || p.status === 'excused'), guests = m.people.filter((p) => p.status === 'guest')
  B.push({ t: 'title', text: m.org || 'Organization' })
  B.push({ t: 'subtitle', text: `Minutes of the ${m.kind} Meeting of the ${m.body}` })
  B.push({ t: 'small', text: `${m.date ? longDate(m.date) : ''}${m.place ? ' · ' + m.place : ''}` })
  B.push({ t: 'h', text: 'Call to order' })
  B.push({ t: 'p', text: `The meeting was called to order at ${fmtTime(m.start)} by ${m.chair || 'the Chair'}, who presided. ${m.secretary || 'The Secretary'} recorded the minutes.` })
  B.push({ t: 'h', text: 'Attendance and quorum' })
  B.push({ t: 'table', head: ['Name', 'Role', 'Attendance'], rows: m.people.map((p) => [p.name, p.role + (p.voting ? '' : ' (non-voting)'), { present: 'Present', remote: 'Present (remote)', absent: 'Absent', excused: 'Excused', guest: 'Guest' }[p.status]]), widths: [40, 35, 25] })
  B.push({ t: 'p', text: `${present.length} attended${absent.length ? `, ${absent.length} absent or excused` : ''}${guests.length ? `, ${guests.length} guest${guests.length > 1 ? 's' : ''}` : ''}. ${q.have} of ${q.members} voting members were present; ${q.need} required. ${q.ok ? 'A quorum was present.' : 'A quorum was NOT present; any actions taken require later ratification.'}` })
  m.items.forEach((it, i) => {
    B.push({ t: 'h', text: `${i + 1}. ${it.title}` })
    if (it.presenter) B.push({ t: 'small', text: `Presented by ${it.presenter}` })
    for (const para of it.notes.split(/\n+/).map((x) => x.trim()).filter(Boolean)) B.push(para.startsWith('- ') ? { t: 'bullet', text: para.slice(2) } : { t: 'p', text: para })
    it.motions.forEach((mo, k) => {
      const r = result(mo)
      B.push({ t: 'p', text: `Motion ${i + 1}.${k + 1}: ${mo.text} Moved by ${mo.mover || '—'}, seconded by ${mo.seconder || '—'}. Vote: ${mo.yes} in favour, ${mo.no} opposed, ${mo.abstain} abstaining. Motion ${r === 'pending' ? 'not yet voted' : r.toUpperCase()}${mo.threshold !== 'majority' ? ` (${mo.threshold} required)` : ''}.` })
    })
    if (it.actions.length) B.push({ t: 'table', head: ['Action', 'Owner', 'Due'], rows: it.actions.map((a) => [a.task, a.owner, a.due ? longDate(a.due) : '']), widths: [55, 25, 20] })
  })
  B.push({ t: 'h', text: 'Adjournment' })
  B.push({ t: 'p', text: `There being no further business, the meeting was adjourned at ${fmtTime(m.end)}.${m.next ? ` The next meeting is scheduled for ${longDate(m.next)}${m.nextPlace ? ` at ${m.nextPlace}` : ''}.` : ''}` })
  B.push({ t: 'p', text: '' })
  B.push({ t: 'table', head: ['Submitted by', 'Approved by'], rows: [[`${m.secretary}, Secretary`, `${m.chair}, Chair`], ['Signature: ____________________', 'Signature: ____________________'], ['Date: ____________', 'Date: ____________']], widths: [50, 50] })
  return B
}

/** All action items across the agenda, for a follow-up list. */
export const allActions = (m: Minutes) => m.items.flatMap((it) => it.actions.map((a) => ({ ...a, item: it.title })))

export function toMarkdown(blocks: Block[]): string {
  return blocks.map((b) => {
    if (b.t === 'table') return `| ${b.head.join(' | ')} |\n| ${b.head.map(() => '---').join(' | ')} |\n${b.rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`).join('\n')}\n`
    if (b.t === 'title') return `# ${b.text}\n`
    if (b.t === 'subtitle') return `## ${b.text}\n`
    if (b.t === 'h') return `### ${b.text}\n`
    if (b.t === 'small') return `*${b.text}*\n`
    if (b.t === 'bullet') return `- ${b.text}`
    return `${b.text}\n`
  }).join('\n')
}

const xe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function docxXml(blocks: Block[]): string {
  const font = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>'
  const run = (t: string, rpr = '') => `<w:r><w:rPr>${font}${rpr}</w:rPr><w:t xml:space="preserve">${xe(t)}</w:t></w:r>`
  const para = (inner: string, ppr = '') => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${inner}</w:p>`
  const W = 9360 // text width in twips (8.5in − 2 × 1in)
  const body = blocks.map((b) => {
    switch (b.t) {
      case 'title': return para(run(b.text, '<w:b/><w:sz w:val="36"/>'), '<w:jc w:val="center"/><w:spacing w:after="60"/>')
      case 'subtitle': return para(run(b.text, '<w:b/><w:sz w:val="26"/>'), '<w:jc w:val="center"/><w:spacing w:after="60"/>')
      case 'small': return para(run(b.text, '<w:i/><w:color w:val="555555"/><w:sz w:val="20"/>'), '<w:spacing w:after="120"/>')
      case 'h': return para(run(b.text, '<w:b/><w:color w:val="1F3864"/><w:sz w:val="24"/>'), '<w:keepNext/><w:spacing w:before="240" w:after="80"/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="BFBFBF"/></w:pBdr>')
      case 'bullet': return para(run('•\t' + b.text, '<w:sz w:val="22"/>'), '<w:ind w:left="360" w:hanging="240"/><w:spacing w:after="40"/>')
      case 'p': return para(run(b.text, '<w:sz w:val="22"/>'), '<w:jc w:val="both"/><w:spacing w:after="120"/>')
      case 'table': {
        const ws = (b.widths ?? b.head.map(() => 100 / b.head.length)).map((p) => Math.round((p / 100) * W))
        const cell = (t: string, i: number, head: boolean) => `<w:tc><w:tcPr><w:tcW w:w="${ws[i]}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="E7ECF5"/>' : ''}</w:tcPr>${para(run(t, `${head ? '<w:b/>' : ''}<w:sz w:val="20"/>`), '<w:spacing w:before="20" w:after="20"/>')}</w:tc>`
        const border = (n: string) => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`
        return `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${ws.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
          `<w:tr><w:trPr><w:tblHeader/></w:trPr>${b.head.map((h, i) => cell(h, i, true)).join('')}</w:tr>` +
          b.rows.map((r) => `<w:tr>${b.head.map((_, i) => cell(r[i] ?? '', i, false)).join('')}</w:tr>`).join('') + '</w:tbl>' + para('', '<w:spacing w:after="80"/>')
      }
    }
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`
}

export function makeDocx(blocks: Block[]): Uint8Array {
  const enc = new TextEncoder()
  return makeZip([
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: 'word/document.xml', data: enc.encode(docxXml(blocks)) },
  ])
}
