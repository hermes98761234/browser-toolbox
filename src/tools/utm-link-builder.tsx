import { useState, type ReactNode } from 'react'
import { Area, Btn, Check, CopyButton, CsvButton, Note, Panel, Row, Seg, Split, Table, uid, useToolState } from '../kit'
import { buildUtm, lint, normalize, parseUtm, UTM_KEYS, type NormOpts, type Utm, type UtmKey } from './lib/utm-link-builder'

interface Preset { id: string; name: string; utm: Utm }
interface Hist { id: string; url: string; at: string }

interface State {
  base: string
  utm: Utm
  opts: NormOpts
  presets: Preset[]
  history: Hist[]
  bulk: string
  advanced: boolean
}

const DEF: State = {
  base: 'https://shop.example.com/spring-collection?lang=en',
  utm: { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'Spring Sale 2025', utm_content: 'hero-button' },
  opts: { lower: true, space: '-', strip: false },
  presets: [
    { id: 'p1', name: 'Google Ads', utm: { utm_source: 'google', utm_medium: 'cpc' } },
    { id: 'p2', name: 'Meta paid', utm: { utm_source: 'facebook', utm_medium: 'paid-social' } },
    { id: 'p3', name: 'Newsletter', utm: { utm_source: 'newsletter', utm_medium: 'email' } },
    { id: 'p4', name: 'LinkedIn post', utm: { utm_source: 'linkedin', utm_medium: 'social' } },
    { id: 'p5', name: 'QR on flyer', utm: { utm_source: 'flyer', utm_medium: 'qr' } },
  ],
  history: [],
  bulk: 'newsletter | email | hero-button\nnewsletter | email | footer-link\nfacebook | paid-social | carousel-1\ninstagram | social | bio-link\ngoogle | cpc | ad-variant-a',
  advanced: false,
}

const FIELDS: [UtmKey, string, string, string[]][] = [
  ['utm_source', 'Source', 'Who sends the traffic', ['google', 'facebook', 'instagram', 'linkedin', 'newsletter', 'twitter', 'tiktok', 'youtube', 'bing', 'partner-site']],
  ['utm_medium', 'Medium', 'Marketing channel', ['cpc', 'email', 'social', 'paid-social', 'display', 'referral', 'affiliate', 'video', 'sms', 'qr', 'print']],
  ['utm_campaign', 'Campaign', 'Promotion or initiative', []],
  ['utm_term', 'Term', 'Paid keyword (optional)', []],
  ['utm_content', 'Content', 'Differentiates ads or links (optional)', []],
  ['utm_id', 'Campaign ID', 'Ads campaign ID (optional)', []],
  ['utm_source_platform', 'Source platform', 'e.g. Google Ads, DV360 (optional)', []],
]

const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ')

const Tip = ({ children }: { children: ReactNode }) => (
  <div className="k-note" style={{ background: 'color-mix(in srgb, var(--accent2) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent2) 35%, transparent)' }}>{children}</div>
)

export default function UtmLinkBuilder() {
  const [s, set, reset] = useToolState('utm-link-builder', DEF)
  const [decode, setDecode] = useState('')
  const [pname, setPname] = useState('')
  const url = buildUtm(s.base, s.utm, s.opts)
  const warns = lint(Object.fromEntries(Object.entries(s.utm).map(([k, v]) => [k, v ? normalize(v, s.opts) : v])), url)
  const setU = (k: UtmKey, v: string) => set({ utm: { ...s.utm, [k]: v } })
  const shown = FIELDS.filter(([k]) => s.advanced || !['utm_id', 'utm_source_platform'].includes(k))

  const bulk = s.bulk
    .split('\n')
    .map((l) => l.split('|').map((x) => x.trim()))
    .filter((p) => p[0])
    .map(([source, medium, content]) => {
      const utm: Utm = { ...s.utm, utm_source: source, utm_medium: medium || s.utm.utm_medium, utm_content: content || s.utm.utm_content }
      return { source, medium: utm.utm_medium ?? '', content: utm.utm_content ?? '', url: buildUtm(s.base, utm, s.opts) }
    })

  const save = () => url && set({ history: [{ id: uid(), url, at: stamp() }, ...s.history.filter((h) => h.url !== url)].slice(0, 50) })
  const decoded = decode.trim() ? parseUtm(decode) : null
  const parts = url ? new URL(url) : null

  return (
    <Split>
      <div>
        <Panel title="Campaign link" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <label className="k-field">
            <span className="k-label">Website URL</span>
            <input className="k-text" value={s.base} onChange={(e) => set({ base: e.target.value })} placeholder="https://example.com/page" />
            {!url && s.base.trim() && <span className="k-hint" style={{ color: 'var(--err)' }}>Not a valid URL</span>}
          </label>
          {shown.map(([k, label, hint, sugg]) => (
            <label key={k} className="k-field">
              <span className="k-label">
                {label} <code className="muted" style={{ fontSize: 11 }}>{k}</code>
              </span>
              <input className="k-text" value={s.utm[k] ?? ''} onChange={(e) => setU(k, e.target.value)} placeholder={hint} list={sugg.length ? `utm-${k}` : undefined} />
              {sugg.length > 0 && (
                <datalist id={`utm-${k}`}>
                  {sugg.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              )}
            </label>
          ))}
          <Check label="Show utm_id and utm_source_platform" value={s.advanced} onChange={(advanced) => set({ advanced })} />
        </Panel>
        <Panel title="Naming rules">
          <Check label="Force lowercase" value={s.opts.lower} onChange={(lower) => set({ opts: { ...s.opts, lower } })} />
          <Check label="Remove special characters" value={s.opts.strip} onChange={(strip) => set({ opts: { ...s.opts, strip } })} />
          <div className="k-label" style={{ fontSize: 13, fontWeight: 650, margin: '8px 0 6px' }}>Replace spaces with</div>
          <Seg value={s.opts.space} onChange={(space) => set({ opts: { ...s.opts, space } })} options={[['-', 'dash -'], ['_', 'underscore _'], ['+', 'plus +'], ['keep', 'keep spaces']]} label="Spaces" />
          <Tip>Consistent, lowercase values keep reports clean: analytics treat “Email”, “email” and “e-mail” as three different mediums.</Tip>
        </Panel>
        <Panel title="Presets">
          <Row>
            {s.presets.map((p) => (
              <span key={p.id} className="k-btn" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <button type="button" onClick={() => set({ utm: { ...s.utm, ...p.utm } })} style={{ all: 'unset', cursor: 'pointer' }} title={Object.entries(p.utm).map(([k, v]) => `${k}=${v}`).join('&')}>{p.name}</button>
                <button type="button" onClick={() => set({ presets: s.presets.filter((x) => x.id !== p.id) })} style={{ all: 'unset', cursor: 'pointer', opacity: 0.5 }} aria-label={`Delete ${p.name}`}>✕</button>
              </span>
            ))}
          </Row>
          <Row>
            <input className="k-text" placeholder="Preset name" value={pname} onChange={(e) => setPname(e.target.value)} style={{ flex: 1 }} aria-label="Preset name" />
            <Btn disabled={!pname.trim()} onClick={() => { set({ presets: [...s.presets, { id: uid(), name: pname.trim(), utm: { utm_source: s.utm.utm_source, utm_medium: s.utm.utm_medium, utm_campaign: s.utm.utm_campaign } }] }); setPname('') }}>Save source + medium + campaign</Btn>
          </Row>
        </Panel>
      </div>

      <div>
        <Panel
          title="Tagged URL"
          actions={
            url ? (
              <>
                <CopyButton text={url} label="Copy" />
                <a className="k-btn" href={url} target="_blank" rel="noreferrer noopener">↗ Open</a>
                <Btn kind="primary" onClick={save}>Save to history</Btn>
              </>
            ) : undefined
          }
        >
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, padding: 12, borderRadius: 10, background: 'var(--panel)', border: '1px solid var(--line)', overflowWrap: 'anywhere' }}>
            {parts ? (
              <>
                <span className="muted">{parts.origin}{parts.pathname}</span>
                {[...parts.searchParams].map(([k, v], i) => (
                  <span key={k + i}>
                    <span className="muted">{i ? '&' : '?'}</span>
                    <span style={{ color: k.startsWith('utm_') ? 'var(--accent)' : undefined, fontWeight: k.startsWith('utm_') ? 700 : 400 }}>{k}</span>=<span>{new URLSearchParams([[k, v]]).toString().slice(k.length + 1)}</span>
                  </span>
                ))}
                <span className="muted">{parts.hash}</span>
              </>
            ) : (
              <span style={{ color: 'var(--err)' }}>Enter a valid website URL.</span>
            )}
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>{url ? `${url.length} characters` : ''}</p>
          {warns.map((w) => (
            <Note key={w} tone="warn">{w}</Note>
          ))}
          {url && !warns.length && <Note tone="ok">Looks good: source, medium and campaign are set and consistently formatted.</Note>}
        </Panel>

        <Panel title="Bulk variants" actions={<CsvButton name="utm-links.csv" rows={() => [['Source', 'Medium', 'Content', 'URL'], ...bulk.map((b) => [b.source, b.medium, b.content, b.url ?? ''])]} />}>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>One line per link: <code>source | medium | content</code>. Campaign, term and URL come from the form.</p>
          <Area value={s.bulk} onChange={(bulk) => set({ bulk })} rows={5} mono />
          {bulk.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 13 }}>{b.source}</b> <span className="muted" style={{ fontSize: 13 }}>/ {b.medium}{b.content ? ` / ${b.content}` : ''}</span>
                <code style={{ display: 'block', fontSize: 12, wordBreak: 'break-all', whiteSpace: 'normal' }}>{b.url ?? 'invalid URL'}</code>
              </div>
              {b.url && <CopyButton text={b.url} label="" />}
            </div>
          ))}
        </Panel>

        <Panel title="Decode an existing link">
          <input className="k-text" placeholder="Paste a URL with utm_ parameters" value={decode} onChange={(e) => setDecode(e.target.value)} style={{ width: '100%' }} aria-label="URL to decode" />
          {decoded && (
            <>
              <Table head={['Parameter', 'Value']} rows={[['base URL', decoded.base], ...Object.entries(decoded.utm).map(([k, v]) => [k, v ?? ''])]} />
              <Btn onClick={() => set({ base: decoded.base, utm: { ...decoded.utm } })}>Load into the form</Btn>
            </>
          )}
          {decode.trim() && !decoded && <Note tone="err">That does not look like a URL.</Note>}
        </Panel>

        <Panel title={`History (${s.history.length})`} actions={s.history.length ? <><CsvButton name="utm-history.csv" rows={() => [['Saved', 'URL', ...UTM_KEYS], ...s.history.map((h) => { const p = parseUtm(h.url); return [h.at, h.url, ...UTM_KEYS.map((k) => p?.utm[k] ?? '')] })]} /><Btn kind="ghost" onClick={() => set({ history: [] })}>Clear</Btn></> : undefined}>
          {s.history.length ? (
            <Table
              head={['Saved', 'Campaign', 'Source / medium', '']}
              rows={s.history.map((h) => {
                const p = parseUtm(h.url)
                return [h.at, p?.utm.utm_campaign ?? '—', `${p?.utm.utm_source ?? '—'} / ${p?.utm.utm_medium ?? '—'}`, <Row key="a" wrap={false}><CopyButton text={h.url} label="" /><Btn kind="ghost" onClick={() => p && set({ base: p.base, utm: p.utm })} title="Load">↺</Btn></Row>]
              })}
            />
          ) : (
            <Tip>Saved links appear here (stored only in this browser) so you can reuse exactly the same tags later.</Tip>
          )}
        </Panel>
      </div>
    </Split>
  )
}
