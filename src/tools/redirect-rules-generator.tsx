import { Area, Btn, Check, CopyButton, download, Note, Panel, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { analyze, flatten, generate, key, parse, type Code, type Finding, type Format } from './lib/redirect-rules-generator'

const SAMPLE = `old,new,code
/blog/2019/hello-world,/blog/hello-world
/blog/2019/hello-world/,/blog/hello-world
/products/widget-v1,/products/widget
/products/widget,/shop/widget
/shop/widget,/shop/widgets/classic
/about-us,/about
/About-Us,/company
/team,/about/team,302
/about/team,/team
/old-landing,https://campaign.example.com/autumn,302
/press-kit.pdf,/media/press-kit.pdf,308
/discontinued-gadget,410
/contact/,/contact/`

const DEF = { text: SAMPLE, format: 'nginx' as Format, code: 301 as Code, ignoreCase: true, trailingSlash: true, keepQuery: true, flat: true }

const FORMATS: [Format, string][] = [['nginx', 'Nginx'], ['apache', 'Apache'], ['netlify', 'Netlify / CF'], ['vercel', 'Vercel'], ['caddy', 'Caddy']]
const FILE: Record<Format, string> = { nginx: 'redirects.conf', apache: '.htaccess', netlify: '_redirects', vercel: 'vercel.json', caddy: 'Caddyfile' }
const KIND: Record<Finding['kind'], [string, 'err' | 'warn']> = { loop: ['🔁 Loop', 'err'], self: ['↩ Self', 'err'], conflict: ['⚔ Conflict', 'err'], duplicate: ['⧉ Duplicate', 'warn'], chain: ['⛓ Chain', 'warn'] }

export default function RedirectRulesGenerator() {
  const [s, set, reset] = useToolState('redirect-rules-generator', DEF)
  const o = { code: s.code, ignoreCase: s.ignoreCase, trailingSlash: s.trailingSlash, keepQuery: s.keepQuery }
  const { rules, errors } = parse(s.text, s.code)
  const findings = analyze(rules, o)
  const isSelf = (r: { from: string; to: string }) => r.to.startsWith('/') && key(r.to, o) === key(r.from, o)
  const out = (s.flat ? flatten(rules, o) : rules).filter((r) => !isSelf(r))
  const config = generate(out, s.format, o)
  const loops = findings.filter((f) => f.kind === 'loop' || f.kind === 'self').length
  const chains = findings.filter((f) => f.kind === 'chain').length
  const bad = new Set(findings.filter((f) => KIND[f.kind][1] === 'err').flatMap((f) => f.lines))
  const warn = new Set(findings.filter((f) => KIND[f.kind][1] === 'warn').flatMap((f) => f.lines))

  return (
    <Split>
      <div>
        <Panel title="URL mapping" actions={<><Btn kind="ghost" onClick={() => set({ text: '' })}>Clear</Btn><Btn kind="ghost" onClick={reset}>Sample</Btn></>}>
          <Area value={s.text} onChange={(text) => set({ text })} rows={14} mono placeholder={'/old-path,/new-path\n/another /target 302\nhttps://old.site/page\thttps://new.site/page'} />
          <p className="k-hint">One rule per line: old, new, optional status (301 302 307 308 410). Comma, tab or space separated — paste straight from a spreadsheet. Full URLs in the first column are reduced to their path.</p>
          {errors.map((e) => <Note key={e} tone="err">{e}</Note>)}
        </Panel>
        <Panel title="Options">
          <Select label="Default status" value={s.code} onChange={(code) => set({ code })} options={[[301, '301 Moved Permanently'], [302, '302 Found (temporary)'], [307, '307 Temporary (keeps method)'], [308, '308 Permanent (keeps method)'], [410, '410 Gone']]} />
          <Check label="Match case-insensitively" value={s.ignoreCase} onChange={(ignoreCase) => set({ ignoreCase })} />
          <Check label="Treat /path and /path/ as the same" value={s.trailingSlash} onChange={(trailingSlash) => set({ trailingSlash })} />
          <Check label="Pass query strings through (?utm=…)" value={s.keepQuery} onChange={(keepQuery) => set({ keepQuery })} />
          <Check label="Flatten chains (point each old URL at its final target)" value={s.flat} onChange={(flat) => set({ flat })} />
        </Panel>
        <Panel title={`Checks · ${findings.length || 'none'}`}>
          {findings.length === 0 && <Note tone="ok">No duplicates, loops or chains.</Note>}
          {findings.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}>
              <b style={{ minWidth: 92, color: KIND[f.kind][1] === 'err' ? 'var(--err)' : 'var(--warn, #b45309)' }}>{KIND[f.kind][0]}</b>
              <span style={{ flex: 1, wordBreak: 'break-word' }}>{f.msg} <span className="muted">(line {f.lines.join(', ')})</span></span>
            </div>
          ))}
          {chains > 0 && <p className="k-hint">{s.flat ? 'Chains are flattened in the output, so visitors and crawlers get a single hop.' : 'Turn on “Flatten chains” so every old URL needs only one hop.'}</p>}
          {findings.some((f) => f.kind === 'self') && <p className="k-hint">Self-redirects are left out of the config.</p>}
          {findings.some((f) => f.kind === 'loop') && <p className="k-hint">Loops are emitted as written — fix them in the mapping, they would make browsers show “too many redirects”.</p>}
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Rules" value={out.length} sub={`${rules.length} lines parsed`} />
          <Stat label="Loops / conflicts" value={loops + findings.filter((f) => f.kind === 'conflict').length} tone={loops ? 'bad' : 'good'} />
          <Stat label="Chains" value={chains} tone={chains && !s.flat ? 'accent' : undefined} sub={s.flat && chains ? 'flattened' : ''} />
        </Stats>
        <Panel title="Server config" actions={<><CopyButton text={config} /><Btn kind="primary" onClick={() => download(FILE[s.format], config, s.format === 'vercel' ? 'application/json' : 'text/plain')}>⬇ {FILE[s.format]}</Btn></>}>
          <Seg value={s.format} onChange={(format) => set({ format })} options={FORMATS} />
          <pre style={{ marginTop: 10, maxHeight: 420, overflow: 'auto', background: '#0f172a', color: '#e2e8f0', padding: 14, borderRadius: 10, fontSize: 12.5, lineHeight: 1.5 }}>{config}</pre>
          {s.format === 'nginx' && <p className="k-hint">Paste inside the matching <code>server {'{ }'}</code> block, then run <code>nginx -t &amp;&amp; nginx -s reload</code>.</p>}
          {s.format === 'apache' && <p className="k-hint">Put at the top of the site’s .htaccess (or a &lt;VirtualHost&gt; with a leading slash added to each pattern).</p>}
          {(s.format === 'netlify' || s.format === 'vercel') && <p className="k-hint">Rules are matched top to bottom; 410 rules are not supported by this platform and are left out.</p>}
          {s.format === 'caddy' && <p className="k-hint">Caddy’s redir drops query strings unless you append <code>{'{query}'}</code> to the target.</p>}
        </Panel>
        <Panel title="Final mapping">
          <Table
            head={['#', 'Old', 'New', 'Code']}
            rows={out.map((r) => [
              <span key="l" style={{ color: bad.has(r.line) ? 'var(--err)' : warn.has(r.line) ? 'var(--warn, #b45309)' : undefined, fontWeight: bad.has(r.line) || warn.has(r.line) ? 700 : 400 }}>{r.line}</span>,
              <code key="f" style={{ wordBreak: 'break-all' }}>{r.from}</code>,
              <code key="t" style={{ wordBreak: 'break-all' }}>{r.to || '—'}</code>,
              r.code,
            ])}
            max={200}
          />
        </Panel>
      </div>
    </Split>
  )
}
