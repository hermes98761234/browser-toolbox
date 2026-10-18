// Consent form model, templates and fillable PDF (AcroForm) generation with pdf-lib.
import { winAnsi } from './word-to-pdf'

export type Kind = 'text' | 'checks' | 'choice' | 'fields'
export interface Section { id: string; kind: Kind; title: string; body: string }
export interface Form {
  title: string
  org: string
  contact: string
  intro: string
  sections: Section[]
  signers: string[]
  paper: 'A4' | 'Letter'
  accent: string
}

let n = 0
const sid = () => `s${Date.now().toString(36)}${(n++).toString(36)}`
const S = (kind: Kind, title: string, body: string): Section => ({ id: sid(), kind, title, body })

const PHOTO: Form = {
  title: 'Photo and Video Consent',
  org: 'Riverside Community Arts',
  contact: 'hello@riverside-arts.example · +1 555 0100',
  intro: 'During {{org}} events we take photos and short videos to show what we do. This form lets you choose how images of you (or your child) may be used. You can change your mind at any time by contacting us at {{contact}}.',
  sections: [
    S('fields', 'About the person in the photos', 'Full name\nEvent or programme\nDate of birth (if under 18)'),
    S('checks', 'I agree that photos/videos may be used in:', 'Printed materials such as flyers and annual reports\nOur website\nOur social media channels\nLocal press and news articles\nInternal training only (not shared publicly)'),
    S('choice', 'Name display', 'Please show my first name only\nPlease show my full name\nPlease do not show my name'),
    S('text', 'How we look after images', 'Images are stored securely and kept for up to three years, after which they are deleted or archived. We never sell images or use them for third-party advertising. If you withdraw consent, we will stop using the images in new materials; items already printed cannot be recalled.'),
  ],
  signers: ['Participant (or parent/guardian if under 18)'],
  paper: 'A4',
  accent: '#2f6fbf',
}

const DATA: Form = {
  title: 'Consent to Process Personal Data',
  org: 'Northwind Fitness Studio',
  contact: 'privacy@northwind.example',
  intro: '{{org}} collects the personal information below to manage your membership. Please tick the uses you agree to. Required processing for your contract does not need consent and is explained in our privacy notice.',
  sections: [
    S('fields', 'Your details', 'Full name\nEmail address\nPhone number'),
    S('checks', 'I consent to:', 'Receiving the monthly newsletter by email\nReceiving text reminders about booked classes\nUse of my anonymised attendance data for planning timetables\nSharing my name with class instructors'),
    S('text', 'Your rights', 'You may access, correct or delete your data and withdraw consent at any time by writing to {{contact}}. Withdrawing consent does not affect processing that happened before. We keep membership records for the period required by law and delete marketing preferences when you leave.'),
  ],
  signers: ['Member'],
  paper: 'A4',
  accent: '#1f8a5b',
}

const RESEARCH: Form = {
  title: 'Research Participation Consent',
  org: 'Usability Lab, Department of Design',
  contact: 'study-team@university.example',
  intro: 'You are invited to take part in a 45-minute study about how people use a budgeting app. Taking part is voluntary. Please read each statement and initial or tick the boxes that apply.',
  sections: [
    S('checks', 'Please confirm:', 'I have read the information sheet and had the chance to ask questions\nI understand that I can stop at any time without giving a reason\nI agree to the session being audio recorded\nI agree to anonymised quotes being used in reports\nI would like to receive a summary of the findings'),
    S('choice', 'Recordings may be kept', 'Until the study ends, then deleted\nFor up to five years for future research by this team'),
    S('fields', 'Participant', 'Name\nParticipant ID (office use)'),
    S('text', 'Contact', 'If you have questions or concerns about this study, contact {{contact}}. You will receive a copy of this signed form.'),
  ],
  signers: ['Participant', 'Researcher'],
  paper: 'A4',
  accent: '#7a3fb0',
}

const EVENT: Form = {
  title: 'Activity Participation and Parental Consent',
  org: 'Hilltop Youth Climbing Club',
  contact: 'coach@hilltop.example · +1 555 0144',
  intro: 'Please complete this form for each young person attending {{org}} sessions. Climbing involves some risk; our coaches follow the club safety policy and use certified equipment.',
  sections: [
    S('fields', 'Young person', 'Full name\nDate of birth\nMedical conditions or allergies\nEmergency contact name and phone'),
    S('checks', 'I give permission for my child to:', 'Take part in indoor climbing sessions\nTake part in outdoor sessions supervised by club coaches\nReceive basic first aid from a trained coach\nTravel in club minibuses to venues'),
    S('choice', 'Collection after sessions', 'My child may leave on their own\nMy child must be collected by a named adult'),
  ],
  signers: ['Parent or guardian'],
  paper: 'A4',
  accent: '#c0582b',
}

export const TEMPLATES: Record<string, Form> = { 'Photo & video': PHOTO, 'Data processing': DATA, Research: RESEARCH, 'Activity (minor)': EVENT }
export const newSection = (kind: Kind): Section => S(kind, kind === 'checks' ? 'I agree to:' : kind === 'choice' ? 'Please choose one' : kind === 'fields' ? 'Details' : 'Information', kind === 'text' ? 'Explain the purpose here.' : 'Option one\nOption two')

export const fill = (s: string, f: Pick<Form, 'org' | 'contact'>) => s.replace(/\{\{\s*org\s*\}\}/gi, f.org || 'our organisation').replace(/\{\{\s*contact\s*\}\}/gi, f.contact || 'the contact below')
export const lines = (body: string) => body.split('\n').map((l) => l.trim()).filter(Boolean)

/** Field names created in the PDF (used by tests and shown in the UI). */
export function fieldNames(f: Form): string[] {
  const out: string[] = []
  f.sections.forEach((s, i) => {
    if (s.kind === 'checks') lines(s.body).forEach((_, j) => out.push(`sec${i + 1}.check${j + 1}`))
    if (s.kind === 'choice' && lines(s.body).length) out.push(`sec${i + 1}.choice`)
    if (s.kind === 'fields') lines(s.body).forEach((_, j) => out.push(`sec${i + 1}.field${j + 1}`))
  })
  f.signers.forEach((_, i) => out.push(`signer${i + 1}.name`, `signer${i + 1}.signature`, `signer${i + 1}.date`))
  return out
}

interface FontLike { widthOfTextAtSize: (t: string, s: number) => number }
export function wrap(text: string, font: FontLike, size: number, width: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w }
      else line = t
    }
    out.push(line)
  }
  return out
}

const hex = (h: string): [number, number, number] => { const m = /^#?([0-9a-f]{6})$/i.exec(h); const v = m ? m[1] : '333333'; return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) as [number, number, number] }

export async function buildPdf(f: Form): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  pdf.setTitle(winAnsi(f.title).text)
  pdf.setCreator('Browser Toolbox — Consent Form Builder')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const form = pdf.getForm()
  const [PW, PH] = f.paper === 'Letter' ? [612, 792] : [595.28, 841.89]
  const M = 54, W = PW - 2 * M
  const accent = rgb(...hex(f.accent))
  const ink = rgb(0.13, 0.13, 0.15), grey = rgb(0.45, 0.45, 0.5)
  const T = (s: string) => winAnsi(s).text
  let page = pdf.addPage([PW, PH])
  let y = PH - M
  const ensure = (h: number) => { if (y - h < M + 20) { page = pdf.addPage([PW, PH]); y = PH - M } }
  const para = (text: string, size: number, fnt = font, color = ink, indent = 0) => {
    for (const ln of wrap(T(text), fnt, size, W - indent)) {
      ensure(size * 1.4)
      page.drawText(ln, { x: M + indent, y: y - size, size, font: fnt, color })
      y -= size * 1.4
    }
  }
  // header
  page.drawRectangle({ x: 0, y: PH - 8, width: PW, height: 8, color: accent })
  para(f.org, 10, bold, accent)
  y -= 4
  para(f.title, 19, bold)
  y -= 4
  if (f.intro) para(fill(f.intro, f), 10.5)
  y -= 6

  f.sections.forEach((s, i) => {
    const items = lines(s.body)
    ensure(40)
    y -= 8
    page.drawText(T(fill(s.title, f)), { x: M, y: y - 12, size: 12, font: bold, color: accent })
    y -= 20
    if (s.kind === 'text') para(fill(s.body, f), 10.5)
    else if (s.kind === 'checks') {
      items.forEach((it, j) => {
        const wl = wrap(T(fill(it, f)), font, 10.5, W - 22)
        ensure(wl.length * 14 + 4)
        const cb = form.createCheckBox(`sec${i + 1}.check${j + 1}`)
        cb.addToPage(page, { x: M, y: y - 12, width: 12, height: 12, borderColor: grey, borderWidth: 1 })
        wl.forEach((ln, k) => page.drawText(ln, { x: M + 20, y: y - 10.5 - k * 14, size: 10.5, font, color: ink }))
        y -= wl.length * 14 + 5
      })
    } else if (s.kind === 'choice' && items.length) {
      const rg = form.createRadioGroup(`sec${i + 1}.choice`)
      items.forEach((it, j) => {
        const wl = wrap(T(fill(it, f)), font, 10.5, W - 22)
        ensure(wl.length * 14 + 4)
        rg.addOptionToPage(`option${j + 1}`, page, { x: M, y: y - 12, width: 12, height: 12, borderColor: grey, borderWidth: 1 })
        wl.forEach((ln, k) => page.drawText(ln, { x: M + 20, y: y - 10.5 - k * 14, size: 10.5, font, color: ink }))
        y -= wl.length * 14 + 5
      })
    } else if (s.kind === 'fields') {
      items.forEach((it, j) => {
        ensure(40)
        page.drawText(T(fill(it, f)), { x: M, y: y - 9, size: 9, font, color: grey })
        const tf = form.createTextField(`sec${i + 1}.field${j + 1}`)
        tf.addToPage(page, { x: M, y: y - 34, width: W, height: 20, borderColor: grey, borderWidth: 0.8 })
        tf.setFontSize(10)
        y -= 40
      })
    }
  })

  // signatures
  ensure(30)
  y -= 14
  page.drawText('Signatures', { x: M, y: y - 12, size: 12, font: bold, color: accent })
  y -= 22
  f.signers.forEach((who, i) => {
    ensure(86)
    page.drawText(T(who), { x: M, y: y - 10, size: 10.5, font: bold, color: ink })
    y -= 18
    const col = (W - 20) / 2
    page.drawText('Printed name', { x: M, y: y - 8, size: 8.5, font, color: grey })
    page.drawText('Date', { x: M + col + 20, y: y - 8, size: 8.5, font, color: grey })
    const nm = form.createTextField(`signer${i + 1}.name`)
    nm.addToPage(page, { x: M, y: y - 30, width: col, height: 19, borderColor: grey, borderWidth: 0.8 })
    const dt = form.createTextField(`signer${i + 1}.date`)
    dt.addToPage(page, { x: M + col + 20, y: y - 30, width: col, height: 19, borderColor: grey, borderWidth: 0.8 })
    y -= 40
    page.drawText('Signature (sign by hand, or type your name)', { x: M, y: y - 8, size: 8.5, font, color: grey })
    const sg = form.createTextField(`signer${i + 1}.signature`)
    sg.addToPage(page, { x: M, y: y - 32, width: col, height: 21, borderWidth: 0 })
    page.drawLine({ start: { x: M, y: y - 34 }, end: { x: M + col, y: y - 34 }, thickness: 0.8, color: ink })
    y -= 46
  })
  // footer on every page
  const pages = pdf.getPages()
  pages.forEach((pg, i) => {
    const t = T(`${f.org}${f.contact ? ' · ' + f.contact : ''} — page ${i + 1} of ${pages.length}`)
    pg.drawText(t, { x: M, y: 28, size: 8, font, color: grey, maxWidth: W })
  })
  return pdf.save()
}

export function toText(f: Form): string {
  const out = [f.org, f.title.toUpperCase(), '', fill(f.intro, f), '']
  for (const s of f.sections) {
    out.push(fill(s.title, f))
    const it = lines(fill(s.body, f))
    if (s.kind === 'text') out.push(fill(s.body, f))
    else if (s.kind === 'checks') it.forEach((x) => out.push(`[ ] ${x}`))
    else if (s.kind === 'choice') it.forEach((x) => out.push(`( ) ${x}`))
    else it.forEach((x) => out.push(`${x}: ______________________________`))
    out.push('')
  }
  for (const w of f.signers) out.push(`${w}`, 'Name: ____________________   Date: ____________', 'Signature: ______________________________', '')
  return out.join('\n')
}
