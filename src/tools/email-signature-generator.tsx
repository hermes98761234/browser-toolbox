import { useRef, useState } from 'react'
import { Btn, CopyButton, download, FileDrop, Note, Panel, Row, Select, Seg, Slider, Split, Txt, useToolState } from '../kit'
import { buildSignature, plainSignature, type Layout, type Sig } from './lib/email-signature-generator'

/** Small PNG logo with initials, so the preview has a logo before one is uploaded. */
function initialsLogo(text: string, color: string, size = 160): string {
  if (typeof document === 'undefined') return ''
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  if (!g) return ''
  g.fillStyle = color
  g.beginPath()
  g.roundRect(0, 0, size, size, size * 0.18)
  g.fill()
  g.fillStyle = '#fff'
  g.font = `bold ${size * 0.42}px Arial, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text.slice(0, 2).toUpperCase(), size / 2, size / 2 + size * 0.03)
  return c.toDataURL('image/png')
}

const DEF: Sig = {
  name: 'Olivia Hart',
  title: 'Head of Partnerships',
  company: 'Northwind Studio',
  phone: '+1 (415) 555-0142',
  mobile: '',
  email: 'olivia@northwind.studio',
  website: 'northwind.studio',
  address: '500 Market St, San Francisco, CA',
  logo: initialsLogo('NW', '#4f46e5'),
  logoSize: 72,
  accent: '#4f46e5',
  font: 'Arial, Helvetica, sans-serif',
  layout: 'classic',
  linkedin: 'linkedin.com/in/oliviahart',
  x: 'x.com/northwind',
  github: '',
  instagram: '',
  cta: 'Book a 15-min intro',
  ctaUrl: 'cal.com/olivia',
  disclaimer: '',
}

const FONTS: [string, string][] = [
  ['Arial, Helvetica, sans-serif', 'Arial'],
  ['Verdana, Geneva, sans-serif', 'Verdana'],
  ['Tahoma, Geneva, sans-serif', 'Tahoma'],
  ["'Trebuchet MS', Helvetica, sans-serif", 'Trebuchet MS'],
  ['Georgia, serif', 'Georgia'],
  ["'Times New Roman', Times, serif", 'Times New Roman'],
]
const ACCENTS = ['#4f46e5', '#0ea5e9', '#059669', '#dc2626', '#ea580c', '#111827', '#9333ea', '#db2777']

function resizeLogo(f: File, px: number): Promise<string> {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => {
      const k = Math.min(1, px / Math.max(im.width, im.height))
      const c = document.createElement('canvas')
      c.width = Math.round(im.width * k)
      c.height = Math.round(im.height * k)
      c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height)
      URL.revokeObjectURL(im.src)
      res(c.toDataURL('image/png'))
    }
    im.onerror = () => rej(new Error('not an image'))
    im.src = URL.createObjectURL(f)
  })
}

export default function EmailSignatureGenerator() {
  const [s, set, reset] = useToolState('email-signature-generator', DEF)
  const [copied, setCopied] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const html = buildSignature(s)
  const field = (k: keyof Sig, label: string, placeholder?: string) => <Txt label={label} value={String(s[k])} onChange={(v) => set({ [k]: v } as Partial<Sig>)} placeholder={placeholder} />

  const copyRich = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plainSignature(s)], { type: 'text/plain' }) })])
    } catch {
      // Fallback: select the rendered preview and copy it.
      const r = document.createRange()
      r.selectNodeContents(box.current!)
      const sel = getSelection()!
      sel.removeAllRanges()
      sel.addRange(r)
      document.execCommand('copy')
      sel.removeAllRanges()
    }
    setCopied('✓ Signature copied. Paste it into your mail app’s signature settings.')
    setTimeout(() => setCopied(''), 3000)
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="You" actions={<Btn kind="ghost" onClick={reset}>Example</Btn>}>
          <Row>
            {field('name', 'Full name')}
            {field('title', 'Job title')}
          </Row>
          <Row>
            {field('company', 'Company')}
            {field('website', 'Website', 'example.com')}
          </Row>
          <Row>
            {field('email', 'Email')}
            {field('phone', 'Phone')}
          </Row>
          <Row>
            {field('mobile', 'Mobile')}
            {field('address', 'Address')}
          </Row>
        </Panel>
        <Panel title="Logo">
          <FileDrop accept="image/*" label="Upload a logo or headshot (resized to fit)" onFiles={async ([f]) => set({ logo: await resizeLogo(f, s.logoSize * 2) })} />
          <Txt label="…or image URL (best for email)" value={s.logo.startsWith('data:') ? '' : s.logo} onChange={(logo) => set({ logo })} placeholder="https://example.com/logo.png" />
          <Row>
            <Btn kind="ghost" onClick={() => set({ logo: initialsLogo((s.company || s.name).split(/\s+/).map((w) => w[0]).join(''), s.accent) })}>Initials logo</Btn>
            <Btn kind="ghost" onClick={() => set({ logo: '' })}>No logo</Btn>
          </Row>
          <Slider label="Logo width" value={s.logoSize} onChange={(logoSize) => set({ logoSize })} min={32} max={160} unit=" px" show={String} />
        </Panel>
        <Panel title="Style">
          <Seg value={s.layout} onChange={(layout: Layout) => set({ layout })} options={[['classic', 'Classic'], ['stacked', 'Stacked'], ['banner', 'Banner'], ['minimal', 'Minimal']]} label="Layout" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0' }}>
            {ACCENTS.map((c) => (
              <button type="button" key={c} aria-label={`Accent ${c}`} onClick={() => set({ accent: c })} style={{ width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer', border: s.accent === c ? '3px solid var(--fg)' : '2px solid var(--line)' }} />
            ))}
            <input type="color" value={s.accent} onChange={(e) => set({ accent: e.target.value })} aria-label="Custom accent" style={{ width: 36, height: 30 }} />
          </div>
          <Select label="Font (email-safe)" value={s.font} onChange={(font) => set({ font })} options={FONTS} />
        </Panel>
        <Panel title="Social & call to action">
          <Row>
            {field('linkedin', 'LinkedIn', 'linkedin.com/in/…')}
            {field('x', 'X / Twitter', 'x.com/…')}
          </Row>
          <Row>
            {field('github', 'GitHub', 'github.com/…')}
            {field('instagram', 'Instagram', 'instagram.com/…')}
          </Row>
          <Row>
            {field('cta', 'Button text', 'Book a call')}
            {field('ctaUrl', 'Button link', 'calendly.com/…')}
          </Row>
          <label className="k-field">
            <span className="k-label">Disclaimer (optional)</span>
            <textarea className="k-area" rows={2} value={s.disclaimer} onChange={(e) => set({ disclaimer: e.target.value })} placeholder="This email and any attachments are confidential…" />
          </label>
        </Panel>
      </div>
      <div>
        <Panel
          title="Preview"
          actions={
            <>
              <Btn kind="primary" onClick={() => void copyRich()}>⧉ Copy signature</Btn>
              <CopyButton text={html} label="Copy HTML" />
              <Btn onClick={() => download('email-signature.html', `<!doctype html><meta charset="utf-8"><title>Email signature</title><body>${html}</body>`, 'text/html')}>⬇ .html</Btn>
            </>
          }
        >
          <div style={{ background: '#fff', color: '#111827', borderRadius: 10, border: '1px solid var(--line)', overflow: 'hidden' }}>
            <div style={{ background: '#f3f4f6', padding: '8px 14px', fontSize: 13, color: '#4b5563', borderBottom: '1px solid #e5e7eb' }}>
              <div><b>To:</b> sam@client.com</div>
              <div><b>Subject:</b> Great to meet you</div>
            </div>
            <div style={{ padding: 18, fontFamily: 'Arial, sans-serif', fontSize: 14, lineHeight: 1.5, overflowX: 'auto' }}>
              <p style={{ margin: '0 0 10px' }}>Hi Sam,</p>
              <p style={{ margin: '0 0 10px' }}>Thanks for your time today. I’ve attached the proposal we discussed.</p>
              <p style={{ margin: '0 0 16px' }}>Best regards,</p>
              <div ref={box} dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>
          {copied && <Note tone="ok">{copied}</Note>}
          <p className="muted" style={{ marginBottom: 0 }}>
            HTML size: <b>{html.length.toLocaleString()}</b> characters {html.length > 10000 && <span style={{ color: 'var(--warn)' }}>· over Gmail’s 10,000-character signature limit: use a hosted logo URL instead of an upload</span>}
          </p>
        </Panel>
        <Panel title="How to install">
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li><b>Gmail:</b> Settings → See all settings → General → Signature → Create new → paste.</li>
            <li><b>Outlook (web/new):</b> Settings → Mail → Compose and reply → Email signature → paste.</li>
            <li><b>Apple Mail:</b> Settings → Signatures → +, untick “Always match my default message font”, paste.</li>
          </ul>
          <Note>Uploaded logos are embedded as data, which some clients (notably Gmail and Outlook) block. For reliable images, host the logo (website, Google Drive public link, CDN) and paste its URL.</Note>
        </Panel>
      </div>
    </Split>
  )
}
