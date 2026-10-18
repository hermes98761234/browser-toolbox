import { useMemo } from 'react'
import { Area, Btn, CopyButton, Note, Panel, Ring, Split, Stat, Stats, Table, useToolState } from '../kit'
import { analyze, registrable, scriptOf, type Report, type Sev } from './lib/phishing-url-inspector'

const EXAMPLES: [string, string][] = [
  ['Homograph', 'https://xn--80ak6aa92e.com/account/verify'],
  ['@ trick', 'http://www.paypal.com@192.0.2.44/webscr?cmd=login'],
  ['Typosquat', 'https://rnicrosoft-support.xyz/office365/signin'],
  ['Nested redirect', 'https://www.google.com/url?q=https%253A%252F%252Fsecure-paypal-login.top%252Fverify%253Fid%253D8842'],
  ['Shortener', 'https://bit.ly/3xYz9Qa'],
  ['Hex IP', 'http://0xC6336407/wp-admin/bank/'],
  ['Clean', 'https://github.com/features/actions'],
]
const DEF = { url: EXAMPLES[3][1] }

const SEV_COLOR: Record<Sev, string> = { info: 'var(--muted)', low: '#0ea5e9', medium: '#f59e0b', high: '#ef4444', critical: '#b91c1c' }
const VERDICT_COLOR = { Low: '#10b981', Medium: '#f59e0b', High: '#ef4444' }

function Anatomy({ r }: { r: Report }) {
  if (!r.host) return null
  const reg = registrable(r.host)
  let url: URL | null = null
  try {
    url = new URL(r.href)
  } catch {
    /* ignore */
  }
  const parts: [string, string, string][] = [
    [r.scheme + '://', 'scheme', '#64748b'],
    ...(r.user ? ([[r.user + '@', 'ignored user-info', '#ef4444']] as [string, string, string][]) : []),
    ...(reg.subs.length ? ([[reg.subs.join('.') + '.', 'subdomain (anyone can choose)', '#a855f7']] as [string, string, string][]) : []),
    [reg.domain, 'REAL DOMAIN (owner)', '#10b981'],
    ...(r.port ? ([[':' + r.port, 'port', '#f59e0b']] as [string, string, string][]) : []),
    [r.path, 'path', '#0ea5e9'],
    ...(url?.search ? ([[url.search, 'query', '#f97316']] as [string, string, string][]) : []),
    ...(url?.hash ? ([[url.hash, 'fragment', '#64748b']] as [string, string, string][]) : []),
  ]
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, fontFamily: 'ui-monospace, monospace', fontSize: 14, wordBreak: 'break-all' }}>
      {parts.map(([t, l, c], i) => (
        <span key={i} title={l} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '100%' }}>
          <span style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, border: `1px solid ${c}`, color: 'var(--text)', borderRadius: 5, padding: '2px 5px', fontWeight: l.startsWith('REAL') ? 800 : 400 }}>{t}</span>
          <span style={{ fontSize: 10, color: c, fontFamily: 'system-ui', padding: '1px 3px' }}>{l}</span>
        </span>
      ))}
    </div>
  )
}

function Findings({ r }: { r: Report }) {
  if (!r.findings.length) return <Note tone="ok">No warning signs found by the offline checks.</Note>
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {r.findings.map((f, i) => (
        <div key={i} style={{ borderLeft: `4px solid ${SEV_COLOR[f.sev]}`, padding: '6px 10px', background: 'color-mix(in srgb, var(--line) 30%, transparent)', borderRadius: 6 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <b style={{ color: SEV_COLOR[f.sev], textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>{f.sev}</b>
            <b>{f.title}</b>
            {f.points > 0 && <span className="muted" style={{ fontSize: 12 }}>+{f.points}</span>}
          </div>
          <div style={{ fontSize: 14 }}>{f.detail}</div>
        </div>
      ))}
    </div>
  )
}

function CharTable({ r }: { r: Report }) {
  const odd = [...new Set([...r.unicodeHost].filter((c) => c.codePointAt(0)! > 127))]
  if (!odd.length) return null
  return (
    <Panel title="Non-ASCII characters in the domain">
      <Table
        head={['Char', 'Code point', 'Script', 'Looks like']}
        rows={odd.map((c) => [<span key="c" style={{ fontSize: 20 }}>{c}</span>, 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'), scriptOf(c), <code key="l">{lookLike(c)}</code>])}
      />
    </Panel>
  )
}
const LOOK: Record<string, string> = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', һ: 'h', ӏ: 'l', ο: 'o', α: 'a', ν: 'v', ρ: 'p', ι: 'i', κ: 'k', υ: 'u', ı: 'i', ɑ: 'a', ɡ: 'g' }
const lookLike = (c: string) => LOOK[c] ?? (c.normalize('NFD').replace(/[̀-ͯ]/g, '') !== c ? c.normalize('NFD')[0] : '—')

function Nested({ r, depth }: { r: Report; depth: number }) {
  return (
    <div style={{ marginLeft: depth * 8, borderLeft: '2px dashed var(--line)', paddingLeft: 10, marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ color: VERDICT_COLOR[r.verdict] }}>{r.verdict} risk ({r.score})</b>
        <code style={{ wordBreak: 'break-all' }}>{r.unicodeHost || r.input}</code>
      </div>
      <Findings r={r} />
      {r.nested.map((n, i) => <Nested key={i} r={n} depth={depth + 1} />)}
    </div>
  )
}

export default function PhishingUrlInspector() {
  const [s, set, reset] = useToolState('phishing-url-inspector', DEF)
  const r = useMemo(() => analyze(s.url), [s.url])
  const summary = () => [`URL: ${r.input}`, `Real domain: ${r.domain}`, `Verdict: ${r.verdict} (${r.score}/100)`, ...r.findings.map((f) => `- [${f.sev}] ${f.title}: ${f.detail}`)].join('\n')

  return (
    <Split wide="right">
      <div>
        <Panel title="Link to inspect" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Area value={s.url} onChange={(url) => set({ url })} rows={4} mono placeholder="Paste a suspicious link (it is never opened or fetched)" />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0' }}>Try an example:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EXAMPLES.map(([n, u]) => (
              <Btn key={n} onClick={() => set({ url: u })}>{n}</Btn>
            ))}
          </div>
        </Panel>
        <Note>
          🔒 100 % offline: the link is only parsed as text in your browser. Nothing is fetched, so redirects behind shorteners cannot be followed — and no check can prove a link is safe.
        </Note>
        <Panel title="What to do with a suspicious link">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.5 }}>
            <li>Don’t click it — type the company’s address yourself or use its app.</li>
            <li>Read the <b>real domain</b> (green): the part just before the first single “/”.</li>
            <li>Never enter passwords or codes after following a link from a message.</li>
            <li>Report phishing to your e-mail provider or the impersonated company.</li>
          </ul>
        </Panel>
      </div>
      <div>
        {!r.ok ? (
          <Note tone="warn">{r.error}</Note>
        ) : (
          <>
            <Stats>
              <div className="k-stat" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Ring value={r.score / 100} label={String(r.score)} color={VERDICT_COLOR[r.verdict]} size={84} />
                <div>
                  <span className="k-stat-label">Risk score</span>
                  <b className="k-stat-value" style={{ color: VERDICT_COLOR[r.verdict], display: 'block' }}>{r.verdict}</b>
                </div>
              </div>
              <Stat label="Real domain" value={<span style={{ wordBreak: 'break-all' }}>{r.domain ? r.unicodeHost.split('.').slice(-r.domain.split('.').length).join('.') : r.scheme}</span>} sub={r.host !== r.unicodeHost ? r.domain : undefined} />
              <Stat label="Warning signs" value={r.findings.filter((f) => f.points > 0).length} sub={r.nested.length ? `+ ${r.nested.length} hidden URL${r.nested.length > 1 ? 's' : ''}` : undefined} />
            </Stats>
            {r.lookalike && <Note tone="err">⚠ This imitates <b>{r.lookalike.brand}</b> — it {r.lookalike.how}.</Note>}
            <Panel title="Anatomy of the link">
              <Anatomy r={r} />
              {r.host !== r.unicodeHost && (
                <p style={{ margin: '10px 0 0', fontSize: 14 }}>
                  Shown in the address bar as <b style={{ fontSize: 16 }}>{r.unicodeHost}</b> · actual (punycode) name <code>{r.host}</code>
                </p>
              )}
            </Panel>
            <Panel title="Findings" actions={<CopyButton text={summary} label="Copy report" />}>
              <Findings r={r} />
            </Panel>
            <CharTable r={r} />
            {r.params.length > 0 && (
              <Panel title="Query parameters (decoded)">
                <Table
                  head={['Key', 'Value', 'Decoded']}
                  rows={r.params.map((p) => [<code key="k">{p.key}</code>, <code key="v" style={{ wordBreak: 'break-all', whiteSpace: 'normal' }}>{p.value.slice(0, 80)}</code>, <div key="d" style={{ wordBreak: 'break-all', whiteSpace: 'normal', fontSize: 13, minWidth: 180 }}>{p.layers.length > 1 ? p.layers.slice(1).map((l, i) => <div key={i}>{'↳'.repeat(i + 1)} {l.slice(0, 140)}</div>) : '—'}</div>])}
                />
              </Panel>
            )}
            {r.nested.length > 0 && (
              <Panel title="Hidden destination(s)">
                {r.nested.map((n, i) => <Nested key={i} r={n} depth={0} />)}
              </Panel>
            )}
          </>
        )}
      </div>
    </Split>
  )
}
