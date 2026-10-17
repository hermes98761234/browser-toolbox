import { useMemo, useState } from 'react'
import { Area, Btn, CsvButton, Note, Panel, Row, Select, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { parse, test } from './lib/robots-txt-tester'

const SAMPLE = `# robots.txt for shop.example.com
User-agent: *
Disallow: /admin/
Allow: /admin/help/
Disallow: /cart
Disallow: /checkout
Disallow: /*?sort=
Disallow: /*.pdf$
Allow: /catalog/*.pdf$
Disallow: /search
Crawl-delay: 2

User-agent: Googlebot
Disallow: /admin/
Disallow: /staging/

User-agent: Googlebot-Image
Allow: /images/
Disallow: /

User-agent: GPTBot
User-agent: CCBot
User-agent: ClaudeBot
Disallow: /

Sitemap: https://shop.example.com/sitemap.xml
Dissallow: /tmp/
`
const URLS = `/
/products/blue-mug
/products/blue-mug?sort=price
/admin/help/faq
/admin/orders
/cart
/search?q=mug
/catalog/spring-2026.pdf
/manuals/mug-care.pdf
/images/blue-mug.jpg
/staging/new-home
https://shop.example.com/robots.txt`
const AGENTS = ['Googlebot', 'Googlebot-Image', 'Bingbot', 'DuckDuckBot', 'YandexBot', 'Applebot', 'GPTBot', 'ClaudeBot', 'CCBot', '*']
const TEMPLATES: [string, string][] = [
  ['Allow all', 'User-agent: *\nDisallow:\n\nSitemap: https://example.com/sitemap.xml\n'],
  ['Block all (staging)', 'User-agent: *\nDisallow: /\n'],
  ['Block AI crawlers', 'User-agent: GPTBot\nUser-agent: ChatGPT-User\nUser-agent: CCBot\nUser-agent: ClaudeBot\nUser-agent: Google-Extended\nUser-agent: PerplexityBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n'],
  ['WordPress', 'User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nDisallow: /?s=\nDisallow: /search/\n\nSitemap: https://example.com/wp-sitemap.xml\n'],
]
const DEF = { text: SAMPLE, urls: URLS, agent: 'Googlebot', custom: '' }

export default function RobotsTxtTester() {
  const [s, set, reset] = useToolState('robots-txt-tester', DEF)
  const [pick, setPick] = useState(0)
  const r = useMemo(() => parse(s.text), [s.text])
  const ua = s.agent === 'custom' ? s.custom || '*' : s.agent
  const urls = s.urls.split('\n').map((u) => u.trim()).filter(Boolean)
  const results = urls.map((u) => ({ u, v: test(r, ua, u) }))
  const sel = results[Math.min(pick, results.length - 1)]
  const blocked = results.filter((x) => !x.v.allowed).length
  const lines = s.text.split(/\r\n|\r|\n/)
  const issueAt = new Map(r.issues.map((i) => [i.line, i]))
  const errors = r.issues.filter((i) => i.level === 'error').length
  const rows = () => [['URL', 'User-agent', 'Result', 'Rule', 'Line', 'Group'], ...results.map(({ u, v }) => [u, ua, v.allowed ? 'allowed' : 'blocked', v.rule ? `${v.rule.allow ? 'Allow' : 'Disallow'}: ${v.rule.path}` : '', v.rule?.line ?? '', v.matched])]

  return (
    <Split>
      <div>
        <Panel title="robots.txt" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>{TEMPLATES.map(([l, t]) => <Btn key={l} kind="ghost" onClick={() => set({ text: t })}>{l}</Btn>)}</Row>
          <Area value={s.text} onChange={(text) => set({ text })} rows={14} mono />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Paste the file from https://yoursite/robots.txt. Matching follows RFC 9309 (as Google does): the most specific User-agent group applies, the longest matching path wins, and Allow wins a tie.</p>
        </Panel>
        <Panel title="Test">
          <Row>
            <Select label="User-agent" value={s.agent} onChange={(agent) => set({ agent })} options={[...AGENTS.map((a) => [a, a === '*' ? '* (any other bot)' : a] as [string, string]), ['custom', 'Custom…']]} />
            {s.agent === 'custom' && <Txt label="User-agent string" value={s.custom} onChange={(custom) => set({ custom })} placeholder="Mozilla/5.0 (compatible; MyBot/1.0)" />}
          </Row>
          <Area label="URLs or paths (one per line)" value={s.urls} onChange={(urls) => set({ urls })} rows={8} mono />
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="URLs tested" value={urls.length} />
          <Stat label="Allowed" value={urls.length - blocked} tone="good" />
          <Stat label="Blocked" value={blocked} tone={blocked ? 'bad' : undefined} />
          <Stat label="Groups / issues" value={`${r.groups.length} / ${r.issues.length}`} sub={errors ? `${errors} error(s)` : 'no errors'} tone={errors ? 'bad' : undefined} />
        </Stats>
        <Panel title={`Results for ${ua}`} actions={<CsvButton name="robots-test.csv" rows={rows} />}>
          <div className="k-table-wrap">
            <table className="k-table">
              <thead><tr><th>URL</th><th>Result</th><th>Winning rule</th><th>Group</th></tr></thead>
              <tbody>
                {results.map(({ u, v }, i) => (
                  <tr key={i} onClick={() => setPick(i)} style={{ cursor: 'pointer', outline: i === pick ? '2px solid var(--accent)' : undefined }}>
                    <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, wordBreak: 'break-all' }}>{u}</td>
                    <td><b style={{ color: v.allowed ? 'var(--ok)' : 'var(--err)' }}>{v.allowed ? '✓ Allowed' : '✕ Blocked'}</b></td>
                    <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>{v.rule ? <>{v.rule.allow ? 'Allow' : 'Disallow'}: {v.rule.path} <span className="muted">L{v.rule.line}</span></> : <span className="muted">—</span>}</td>
                    <td>{v.matched || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sel && <Note tone={sel.v.allowed ? 'ok' : 'err'}><b>{sel.u}</b> is {sel.v.allowed ? 'allowed' : 'blocked'} for {ua}. {sel.v.reason}</Note>}
        </Panel>
        <Panel title="Source with winning rule">
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, border: '1px solid var(--line)', borderRadius: 8, maxHeight: 420, overflow: 'auto' }}>
            {lines.map((l, i) => {
              const n = i + 1
              const win = sel?.v.rule?.line === n
              const iss = issueAt.get(n)
              return (
                <div key={i} title={iss?.msg} style={{ display: 'flex', background: win ? (sel.v.allowed ? 'color-mix(in srgb, var(--ok) 22%, transparent)' : 'color-mix(in srgb, var(--err) 22%, transparent)') : undefined }}>
                  <span style={{ width: 40, textAlign: 'right', padding: '0 8px', color: 'var(--muted)', userSelect: 'none', flex: '0 0 auto' }}>{n}</span>
                  <span style={{ whiteSpace: 'pre-wrap', flex: 1, color: l.trim().startsWith('#') ? 'var(--muted)' : undefined }}>{l || ' '}</span>
                  {win && <b style={{ padding: '0 8px' }}>← wins</b>}
                  {iss && <span style={{ padding: '0 8px', color: iss.level === 'error' ? 'var(--err)' : 'var(--warn)' }}>{iss.level === 'error' ? '✕' : '⚠'}</span>}
                </div>
              )
            })}
          </div>
        </Panel>
        <Panel title="Every bot at a glance">
          <div className="k-table-wrap">
            <table className="k-table">
              <thead><tr><th>Path</th>{AGENTS.map((a) => <th key={a} style={{ fontSize: 11, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{a}</th>)}</tr></thead>
              <tbody>
                {urls.slice(0, 30).map((u, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, wordBreak: 'break-all' }}>{u}</td>
                    {AGENTS.map((a) => { const ok = test(r, a, u).allowed; return <td key={a} style={{ textAlign: 'center', color: ok ? 'var(--ok)' : 'var(--err)', fontWeight: 700 }}>{ok ? '✓' : '✕'}</td> })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        {r.issues.length > 0 && (
          <Panel title="Validation">
            {r.issues.map((i, k) => <Note key={k} tone={i.level === 'error' ? 'err' : 'warn'}>{i.line ? `Line ${i.line}: ` : ''}{i.msg}</Note>)}
          </Panel>
        )}
        {r.sitemaps.length > 0 && <Note tone="ok">Sitemaps declared: {r.sitemaps.join(', ')}</Note>}
        <Note>Blocking a URL in robots.txt stops crawling, not indexing — a blocked page can still appear in search results if other sites link to it. Use a <code>noindex</code> meta tag (on a crawlable page) to keep it out.</Note>
      </div>
    </Split>
  )
}
