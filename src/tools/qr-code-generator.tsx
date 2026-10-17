import { Area, Btn, Check, CopyButton, download, FileDrop, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import type { Ecl } from './lib/barcode-label-maker'
import { contrast, payload, toSvg, validate, type ContentType, type Dot, type Eye, type Fields, type Style } from './lib/qr-code-generator'

const TYPES: [ContentType, string][] = [['url', '🔗 URL'], ['wifi', '📶 Wi-Fi'], ['vcard', '👤 Contact'], ['email', '✉ Email'], ['sms', '💬 SMS'], ['geo', '📍 Location'], ['event', '📅 Event'], ['text', '📝 Text']]

const FIELDS: Record<ContentType, [string, string, string?][]> = {
  url: [['url', 'Website address', 'https://example.com']],
  text: [],
  wifi: [['ssid', 'Network name (SSID)'], ['pass', 'Password']],
  vcard: [['first', 'First name'], ['last', 'Last name'], ['org', 'Company'], ['title', 'Job title'], ['phone', 'Phone', '+1 555 0100'], ['email', 'Email'], ['web', 'Website'], ['street', 'Street'], ['city', 'City'], ['zip', 'Postcode'], ['country', 'Country']],
  email: [['to', 'To', 'name@example.com'], ['subject', 'Subject']],
  sms: [['phone', 'Phone number', '+1 555 0100']],
  geo: [['lat', 'Latitude', '48.8584'], ['lon', 'Longitude', '2.2945'], ['label', 'Label (optional)']],
  event: [['summary', 'Title'], ['location', 'Location']],
}

const DEF_FIELDS: Record<ContentType, Fields> = {
  url: { url: 'https://hermes98761234.github.io/browser-toolbox/' },
  text: { text: 'Thanks for visiting our stand! Show this code at the till for 10% off.' },
  wifi: { ssid: 'Cafe Guest', pass: 'espresso-2026', sec: 'WPA', hidden: 'false' },
  vcard: { first: 'Alex', last: 'Morgan', org: 'Northwind Studio', title: 'Product Designer', phone: '+1 555 0142', email: 'alex@northwind.example', web: 'https://northwind.example', city: 'Portland', country: 'USA' },
  email: { to: 'hello@example.com', subject: 'Brochure request', body: 'Hi! Please send me the 2027 catalogue.' },
  sms: { phone: '+1 555 0100', msg: 'JOIN' },
  geo: { lat: '48.85837', lon: '2.294481', label: 'Eiffel Tower' },
  event: { summary: 'Product launch party', start: '2026-11-20T18:30', end: '2026-11-20T21:00', location: 'Pier 39, San Francisco', desc: 'Drinks, demos and music.' },
}

const PRESETS: [string, Partial<Style>][] = [
  ['Classic', { fg: '#000000', gradient: false, bg: '#ffffff', dot: 'square', eye: 'square', eyeColor: '' }],
  ['Indigo glow', { fg: '#4f46e5', fg2: '#0369a1', gradient: true, bg: '#ffffff', dot: 'rounded', eye: 'rounded', eyeColor: '#312e81' }],
  ['Dots', { fg: '#0f766e', gradient: false, bg: '#f0fdfa', dot: 'dots', eye: 'circle', eyeColor: '#134e4a' }],
  ['Sunset', { fg: '#db2777', fg2: '#c2410c', gradient: true, bg: '#fff7ed', dot: 'vertical', eye: 'rounded', eyeColor: '#9d174d' }],
  ['Night', { fg: '#e2e8f0', gradient: false, bg: '#0f172a', dot: 'rounded', eye: 'rounded', eyeColor: '#38bdf8' }],
]

const DEF = {
  type: 'url' as ContentType,
  fields: DEF_FIELDS,
  ecl: 'Q' as Ecl,
  logoMode: 'badge' as 'none' | 'badge' | 'image',
  badge: 'GO',
  image: '',
  px: 1024,
  style: { fg: '#4f46e5', fg2: '#0369a1', gradient: true, bg: '#ffffff', transparent: false, dot: 'rounded', eye: 'rounded', eyeColor: '#312e81', margin: 4, logo: '', logoSize: 0.22 } as Style,
}

function badgeSvg(text: string, c1: string, c2: string) {
  const fs = text.length <= 2 ? 44 : text.length <= 3 ? 34 : 24
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="100" height="100" rx="24" fill="url(#b)"/><text x="50" y="52" font-family="system-ui,Arial,sans-serif" font-weight="800" font-size="${fs}" fill="#fff" text-anchor="middle" dominant-baseline="middle">${text.replace(/[<&>"]/g, '').slice(0, 4)}</text></svg>`
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

const ECL_INFO: Record<Ecl, string> = { L: 'L · 7 % recovery', M: 'M · 15 % recovery', Q: 'Q · 25 % recovery', H: 'H · 30 % recovery' }

export default function QrCodeGenerator() {
  const [s, set, reset] = useToolState('qr-code-generator', DEF)
  const f = { ...DEF_FIELDS[s.type], ...s.fields[s.type] }
  const setF = (k: string, v: string) => set({ fields: { ...s.fields, [s.type]: { ...f, [k]: v } } })
  const st = s.style
  const setS = (p: Partial<Style>) => set({ style: { ...st, ...p } })
  const logo = s.logoMode === 'badge' && s.badge.trim() ? badgeSvg(s.badge.trim(), st.fg, st.gradient ? st.fg2 : st.fg) : s.logoMode === 'image' ? s.image : ''
  const text = payload(s.type, f)
  const errs = validate(s.type, f)
  // A logo hides modules: never go below Q with one.
  const ecl: Ecl = logo && (s.ecl === 'L' || s.ecl === 'M') ? 'Q' : s.ecl
  let out: { svg: string; version: number; size: number; err: string }
  try {
    out = { ...toSvg(text || ' ', ecl, { ...st, logo }, 320), err: '' }
  } catch (e) {
    out = { svg: '', version: 0, size: 0, err: (e as Error).message }
  }
  const ratio = contrast(st.fg, st.bg)
  const ratio2 = st.gradient ? contrast(st.fg2, st.bg) : ratio
  const inverted = !st.transparent && contrast(st.bg, '#000000') < contrast(st.fg, '#000000')
  const logoShare = logo ? (Math.round(out.size * st.logoSize) | 1) ** 2 / (out.size * out.size) : 0
  const budget = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 }[ecl]
  const name = `qr-${s.type}`

  const savePng = () => {
    const big = toSvg(text, ecl, { ...st, logo }, s.px).svg
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = s.px
      c.getContext('2d')!.drawImage(img, 0, 0, s.px, s.px)
      c.toBlob((b) => b && download(`${name}.png`, b))
    }
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(big)))}`
  }
  const loadLogo = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const im = new Image()
      im.onload = () => {
        // downscale to keep state small
        const k = Math.min(1, 256 / Math.max(im.width, im.height))
        const c = document.createElement('canvas')
        c.width = Math.round(im.width * k)
        c.height = Math.round(im.height * k)
        c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height)
        set({ image: c.toDataURL('image/png'), logoMode: 'image' })
      }
      im.src = String(r.result)
    }
    r.readAsDataURL(file)
  }

  return (
    <Split>
      <div>
        <Panel title="Content">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {TYPES.map(([t, l]) => (
              <button key={t} type="button" className={`k-btn ${s.type === t ? 'primary' : ''}`} onClick={() => set({ type: t })}>{l}</button>
            ))}
          </div>
          {s.type === 'text' && <Area label="Text" value={f.text ?? ''} onChange={(v) => setF('text', v)} rows={4} />}
          {s.type === 'wifi' && <Select label="Security" value={f.sec ?? 'WPA'} onChange={(v) => setF('sec', v)} options={[['WPA', 'WPA / WPA2 / WPA3'], ['WEP', 'WEP (legacy)'], ['none', 'Open network']]} />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0 12px' }}>
            {FIELDS[s.type].filter(([k]) => !(s.type === 'wifi' && k === 'pass' && f.sec === 'none')).map(([k, l, ph]) => (
              <Txt key={k} label={l} value={f[k] ?? ''} onChange={(v) => setF(k, v)} placeholder={ph} />
            ))}
          </div>
          {s.type === 'wifi' && <Check label="Hidden network" value={f.hidden === 'true'} onChange={(v) => setF('hidden', String(v))} />}
          {s.type === 'email' && <Area label="Message" value={f.body ?? ''} onChange={(v) => setF('body', v)} rows={3} />}
          {s.type === 'sms' && <Area label="Message" value={f.msg ?? ''} onChange={(v) => setF('msg', v)} rows={2} />}
          {s.type === 'event' && (
            <>
              <Row>
                <Txt label="Starts" type="datetime-local" value={f.start ?? ''} onChange={(v) => setF('start', v)} />
                <Txt label="Ends" type="datetime-local" value={f.end ?? ''} onChange={(v) => setF('end', v)} />
              </Row>
              <Area label="Description" value={f.desc ?? ''} onChange={(v) => setF('desc', v)} rows={2} />
            </>
          )}
          {s.type === 'geo' && navigator.geolocation && (
            <Btn onClick={() => navigator.geolocation.getCurrentPosition((p) => set({ fields: { ...s.fields, geo: { ...f, lat: p.coords.latitude.toFixed(6), lon: p.coords.longitude.toFixed(6) } } }))}>📍 Use my location</Btn>
          )}
          {errs.map((e) => <Note key={e} tone="warn">{e}</Note>)}
        </Panel>
        <Panel title="Style">
          <Row>
            {PRESETS.map(([n, p]) => <Btn key={n} kind="ghost" onClick={() => setS(p)}>{n}</Btn>)}
          </Row>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10, margin: '10px 0' }}>
            <Swatch label="Modules" value={st.fg} onChange={(fg) => setS({ fg })} />
            {st.gradient && <Swatch label="Gradient to" value={st.fg2} onChange={(fg2) => setS({ fg2 })} />}
            <Swatch label="Eyes" value={st.eyeColor || st.fg} onChange={(eyeColor) => setS({ eyeColor })} />
            {!st.transparent && <Swatch label="Background" value={st.bg} onChange={(bg) => setS({ bg })} />}
          </div>
          <Row>
            <Check label="Gradient" value={st.gradient} onChange={(gradient) => setS({ gradient })} />
            <Check label="Transparent background" value={st.transparent} onChange={(transparent) => setS({ transparent })} />
          </Row>
          <Row>
            <Select label="Modules" value={st.dot} onChange={(dot: Dot) => setS({ dot })} options={[['square', 'Square'], ['rounded', 'Rounded'], ['dots', 'Dots'], ['vertical', 'Vertical bars']]} />
            <Select label="Eyes" value={st.eye} onChange={(eye: Eye) => setS({ eye })} options={[['square', 'Square'], ['rounded', 'Rounded'], ['circle', 'Circle']]} />
          </Row>
          <Slider label="Quiet zone" value={st.margin} onChange={(margin) => setS({ margin })} min={0} max={8} unit=" modules" />
        </Panel>
        <Panel title="Logo & error correction">
          <Seg value={s.logoMode} onChange={(logoMode) => set({ logoMode })} options={[['none', 'No logo'], ['badge', 'Text badge'], ['image', 'Image']]} />
          <div style={{ marginTop: 10 }}>
            {s.logoMode === 'badge' && <Txt label="Badge text (1–4 chars)" value={s.badge} onChange={(badge) => set({ badge: badge.slice(0, 4) })} />}
            {s.logoMode === 'image' && <FileDrop accept="image/*" onFiles={(fs) => loadLogo(fs[0])} label={s.image ? 'Replace logo image' : 'Drop a logo (PNG / SVG / JPG)'} />}
            {s.logoMode !== 'none' && <Slider label="Logo size" value={Math.round(st.logoSize * 100)} onChange={(v) => setS({ logoSize: v / 100 })} min={10} max={30} unit="% of width" />}
          </div>
          <Select label="Error correction" value={s.ecl} onChange={(e: Ecl) => set({ ecl: e })} options={(['L', 'M', 'Q', 'H'] as Ecl[]).map((e) => [e, ECL_INFO[e]] as [Ecl, string])} />
          {ecl !== s.ecl && <Note>Using Q because a logo covers part of the code.</Note>}
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Version" value={out.version || '—'} sub={`${out.size}×${out.size} modules`} />
          <Stat label="Data" value={`${new TextEncoder().encode(text).length} B`} sub={`level ${ecl}`} />
          <Stat label="Contrast" value={`${Math.min(ratio, ratio2).toFixed(1)}:1`} tone={Math.min(ratio, ratio2) >= 4 && !inverted ? 'good' : 'bad'} sub={inverted ? 'inverted colours' : Math.min(ratio, ratio2) >= 4 ? 'scans well' : 'too low'} />
        </Stats>
        <Panel
          title="Your QR code"
          actions={
            <>
              <Btn kind="primary" onClick={savePng} disabled={!out.svg || errs.length > 0}>⬇ PNG</Btn>
              <Btn onClick={() => download(`${name}.svg`, toSvg(text, ecl, { ...st, logo }, s.px).svg, 'image/svg+xml')} disabled={!out.svg || errs.length > 0}>⬇ SVG</Btn>
              <CopyButton text={() => toSvg(text, ecl, { ...st, logo }, s.px).svg} label="SVG code" />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          <div style={{ display: 'grid', placeItems: 'center', padding: 16, borderRadius: 12, background: st.transparent ? 'repeating-conic-gradient(#e2e8f0 0 25%, #fff 0 50%) 0 0 / 20px 20px' : 'var(--bg, transparent)' }}>
            {out.err ? <Note tone="err">{out.err}</Note> : <div style={{ width: 'min(100%, 340px)', aspectRatio: '1', boxShadow: '0 8px 30px rgb(0 0 0 / .12)', borderRadius: 8, overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: out.svg.replace(/width="320" height="320"/, 'width="100%" height="100%"') }} />}
          </div>
          <Row>
            <Num label="PNG size" value={s.px} onChange={(px) => set({ px: Math.max(64, Math.min(4096, Math.round(px))) })} unit="px" min={64} max={4096} />
            <span className="k-hint" style={{ alignSelf: 'end' }}>{(s.px / (out.size + 2 * st.margin || 1)).toFixed(1)} px per module · print at ≥ 2 cm wide</span>
          </Row>
          {logo && logoShare > budget * 0.8 && <Note tone="warn">The logo hides {(logoShare * 100).toFixed(0)}% of the modules — close to the {budget * 100}% this level can repair. Shrink it or use level H.</Note>}
          {inverted && <Note tone="warn">Light modules on a dark background are not supported by some older scanners.</Note>}
          {!st.transparent && Math.min(ratio, ratio2) < 4 && <Note tone="err">Contrast is low — many phones will fail to read this code.</Note>}
          {st.margin < 2 && <Note tone="warn">A quiet zone under 2 modules can break scanning when the code is placed on a busy background.</Note>}
        </Panel>
        <Panel title="Encoded payload" actions={<CopyButton text={text} />}>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 13, margin: 0 }}>{text}</pre>
          <p className="k-hint">This is exactly what a phone reads. Wi-Fi, contact and event codes are recognised by the built-in camera apps on iOS and Android.</p>
        </Panel>
      </div>
    </Split>
  )
}

function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--line)', borderRadius: 10, padding: '6px 8px', cursor: 'pointer', fontSize: 13 }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 26, height: 26, border: '1px solid var(--line)', borderRadius: 4, padding: 0, background: 'none' }} />
      {label}
    </label>
  )
}
