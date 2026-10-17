import { useEffect, useMemo, useState } from 'react'
import { Area, Btn, CopyButton, CsvButton, Donut, Note, Panel, Row, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { majorVersion, parseUA, type UA } from './lib/user-agent-parser'

const SAMPLES = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.80',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A.240305.019) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.99 Mobile Safari/537.36',
  'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/4.0 Chrome/76.0.3809.146 TV Safari/537.36',
  'curl/8.4.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 OPR/108.0.0.0',
]

interface State { tab: 'single' | 'batch'; single: string; batch: string }
const DEF: State = { tab: 'single', single: '', batch: SAMPLES.join('\n') }

type Hints = Record<string, unknown>
const ICON: Record<UA['device'], string> = { desktop: '🖥', mobile: '📱', tablet: '📲', tv: '📺', console: '🎮', wearable: '⌚', bot: '🤖', unknown: '❔' }

/** Split a UA string into product/version tokens and parenthesised comments. */
function parts(ua: string): { t: string; c: boolean }[] {
  return [...ua.matchAll(/\([^)]*\)|[^\s()]+/g)].map((m) => ({ t: m[0], c: m[0].startsWith('(') }))
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', display: 'flex', gap: 10 }}>
      <span className="muted" style={{ width: 120, flex: 'none' }}>{k}</span>
      <b style={{ wordBreak: 'break-word' }}>{v || '—'}</b>
    </div>
  )
}

export default function UserAgentParser() {
  const [s, set, reset] = useToolState('user-agent-parser', DEF)
  const [hints, setHints] = useState<Hints | null>(null)
  const own = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const single = s.single.trim() || own
  const r = parseUA(single)
  const batch = useMemo(() => s.batch.split('\n').map((l) => l.trim()).filter(Boolean).map(parseUA), [s.batch])

  useEffect(() => {
    const d = (navigator as Navigator & { userAgentData?: { brands: { brand: string; version: string }[]; mobile: boolean; platform: string; getHighEntropyValues(k: string[]): Promise<Hints> } }).userAgentData
    if (!d) return
    void d
      .getHighEntropyValues(['platformVersion', 'architecture', 'bitness', 'model', 'fullVersionList', 'uaFullVersion'])
      .then((h) => setHints({ brands: d.brands, mobile: d.mobile, platform: d.platform, ...h }))
      .catch(() => setHints({ brands: d.brands, mobile: d.mobile, platform: d.platform }))
  }, [])

  const count = (key: (u: UA) => string) => {
    const mp = new Map<string, number>()
    for (const u of batch) mp.set(key(u), (mp.get(key(u)) ?? 0) + 1)
    return [...mp.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))
  }
  const brands = (hints?.fullVersionList ?? hints?.brands) as { brand: string; version: string }[] | undefined
  const win11 = hints?.platform === 'Windows' && Number(String(hints.platformVersion ?? '0').split('.')[0]) >= 13

  return (
    <Split wide="right">
      <div>
        <Panel title="Your browser">
          <code style={{ display: 'block', fontSize: 12, wordBreak: 'break-all', background: 'var(--bg)', padding: 10, borderRadius: 8 }}>{own || 'navigator.userAgent unavailable'}</code>
          <Row>
            <CopyButton text={own} label="Copy UA" />
            <Btn onClick={() => set({ tab: 'single', single: own })}>Parse mine</Btn>
          </Row>
          <h4 style={{ margin: '12px 0 4px' }}>Client hints</h4>
          {hints ? (
            <>
              <Field k="Brands" v={(brands ?? []).filter((b) => !/Not.?A.?Brand/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`).join(', ')} />
              <Field k="Platform" v={`${String(hints.platform ?? '')} ${String(hints.platformVersion ?? '')}${win11 ? ' (Windows 11)' : ''}`} />
              <Field k="Architecture" v={`${String(hints.architecture ?? '')} ${hints.bitness ? `${String(hints.bitness)}-bit` : ''}`} />
              <Field k="Mobile" v={hints.mobile ? 'yes' : 'no'} />
              <Field k="Model" v={String(hints.model ?? '')} />
            </>
          ) : (
            <Note>This browser does not expose User-Agent Client Hints (navigator.userAgentData) — Firefox and Safari rely on the UA string only.</Note>
          )}
          <p className="k-hint">Servers receive hints via <code>Sec-CH-UA*</code> headers after sending <code>Accept-CH</code>.</p>
        </Panel>
      </div>

      <div>
        <Panel title="Parse" actions={<><Seg value={s.tab} onChange={(tab) => set({ tab })} options={[['single', 'Single'], ['batch', 'Batch']]} label="Mode" /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          {s.tab === 'single' ? (
            <>
              <Area value={s.single} onChange={(single) => set({ single })} rows={3} mono placeholder="Paste a user-agent string (empty = your browser)" />
              <Row>
                {SAMPLES.slice(0, 8).map((u, i) => {
                  const p = parseUA(u)
                  return <Btn key={i} kind="ghost" onClick={() => set({ single: u })}>{ICON[p.device]} {p.bot || p.browser.replace('Microsoft ', '')}</Btn>
                })}
              </Row>
            </>
          ) : (
            <>
              <Area value={s.batch} onChange={(batch) => set({ batch })} rows={8} mono placeholder="One user-agent per line (e.g. from server logs)" />
              <p className="k-hint">{batch.length} user agents</p>
            </>
          )}
        </Panel>

        {s.tab === 'single' ? (
          <>
            <Stats>
              <Stat label="Browser" value={r.browser} sub={r.version ? `version ${r.version}` : undefined} tone="accent" />
              <Stat label="OS" value={`${r.os} ${r.osVersion}`.trim()} />
              <Stat label="Device" value={`${ICON[r.device]} ${r.device}`} sub={[r.vendor, r.model].filter(Boolean).join(' ') || undefined} />
              <Stat label="Engine" value={r.engine} sub={r.engineVersion || undefined} />
            </Stats>
            <Panel title="Details" actions={<CopyButton text={() => JSON.stringify(r, null, 2)} label="Copy JSON" />}>
              <Field k="Browser" v={`${r.browser} ${r.version}`} />
              <Field k="Engine" v={`${r.engine} ${r.engineVersion}`} />
              <Field k="OS" v={`${r.os} ${r.osVersion}`} />
              <Field k="Device type" v={r.device} />
              <Field k="Vendor / model" v={[r.vendor, r.model].filter(Boolean).join(' · ')} />
              <Field k="Bot / client" v={r.bot} />
              {r.notes.map((n) => <Note key={n} tone="warn">{n}</Note>)}
              <h4 style={{ margin: '12px 0 6px' }}>Tokens</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {parts(single).map((p, i) => (
                  <code key={i} style={{ padding: '3px 7px', borderRadius: 6, fontSize: 12, background: p.c ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--bg)', border: '1px solid var(--line)' }} title={p.c ? 'comment: platform details' : 'product/version'}>{p.t}</code>
                ))}
              </div>
            </Panel>
          </>
        ) : (
          <>
            <Stats>
              <Stat label="Parsed" value={batch.length} />
              <Stat label="Bots / tools" value={batch.filter((u) => u.bot).length} tone="accent" />
              <Stat label="Mobile + tablet" value={batch.filter((u) => u.device === 'mobile' || u.device === 'tablet').length} />
              <Stat label="Unknown browser" value={batch.filter((u) => u.browser === 'Unknown').length} tone={batch.some((u) => u.browser === 'Unknown') ? 'bad' : 'good'} />
            </Stats>
            <Panel title="Results" actions={<CsvButton name="user-agents.csv" rows={() => [['User agent', 'Browser', 'Version', 'Engine', 'OS', 'OS version', 'Device', 'Vendor', 'Model', 'Bot'], ...batch.map((u) => [u.ua, u.browser, u.version, u.engine, u.os, u.osVersion, u.device, u.vendor, u.model, u.bot])]} />}>
              <Table
                head={['', 'Browser', 'OS', 'Engine', 'Model', 'User agent']}
                rows={batch.map((u) => [
                  ICON[u.device],
                  <b key="b">{u.browser} {majorVersion(u.version)}</b>,
                  `${u.os} ${u.osVersion}`.trim(),
                  u.engine,
                  [u.vendor, u.model].filter(Boolean).join(' ') || '—',
                  <span key="u" className="muted" style={{ fontSize: 11, display: 'inline-block', maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={u.ua}>{u.ua}</span>,
                ])}
                max={300}
              />
            </Panel>
            <Panel title="Breakdown">
              <Row>
                <div style={{ flex: 1, minWidth: 260 }}><h4>Browsers</h4><Donut slices={count((u) => u.browser)} size={180} /></div>
                <div style={{ flex: 1, minWidth: 260 }}><h4>Devices</h4><Donut slices={count((u) => u.device)} size={180} /></div>
              </Row>
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
