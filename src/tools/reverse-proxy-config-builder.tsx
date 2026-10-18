import { Btn, Check, CopyButton, download, Note, Num, Panel, Row, Seg, Select, Split, Txt, useToolState } from '../kit'
import { DEFAULTS, FILE, GEN, highlightLine, warnings, type Cache, type Lb, type ProxyOpts, type Server, type Tls, type TokKind, type Upstream } from './lib/reverse-proxy-config-builder'

interface State extends ProxyOpts { server: Server }
const DEF: State = { ...DEFAULTS, server: 'nginx' }

const SERVERS: [Server, string][] = [['nginx', 'nginx'], ['caddy', 'Caddy'], ['apache', 'Apache'], ['traefik', 'Traefik'], ['haproxy', 'HAProxy']]

const PRESETS: { name: string; p: Partial<ProxyOpts> }[] = [
  { name: 'Node app + WebSockets', p: { ...DEFAULTS } },
  { name: 'API under /api', p: { ...DEFAULTS, domain: 'example.com', aliases: '', path: '/api', stripPath: true, upstreams: [{ host: '10.0.0.12', port: 8080, weight: 1 }], websockets: false, cache: 'off', lb: 'round_robin', rps: 20, burst: 40 } },
  { name: 'Cached static site', p: { ...DEFAULTS, domain: 'docs.example.org', aliases: '', upstreams: [{ host: '127.0.0.1', port: 8080, weight: 1 }], websockets: false, cache: 'all', cacheMinutes: 240, brotli: true, http3: true, rateLimit: false, hstsPreload: true } },
  { name: 'Local dev (no TLS)', p: { ...DEFAULTS, domain: 'localhost', aliases: '', tls: 'none', hsts: false, http2: false, http3: false, rateLimit: false, cache: 'off', upstreams: [{ host: '127.0.0.1', port: 5173, weight: 1 }], secHeaders: false } },
]

const TOK: Record<TokKind, string | undefined> = { kw: '#7dd3fc', com: '#64748b', str: '#86efac', var: '#f0abfc', num: '#fbbf24', punct: '#94a3b8', txt: undefined }

function Code({ text }: { text: string }) {
  return (
    <pre style={{ fontFamily: 'var(--mono)', fontSize: 12.5, lineHeight: 1.5, background: '#0b1220', color: '#e2e8f0', padding: 14, borderRadius: 10, margin: 0, overflow: 'auto', maxHeight: 640 }}>
      {text.split('\n').map((line, i) => (
        <div key={i} style={{ display: 'flex' }}>
          <span style={{ color: '#475569', userSelect: 'none', width: 34, flex: 'none', textAlign: 'right', paddingRight: 12 }}>{i + 1}</span>
          <span style={{ whiteSpace: 'pre' }}>
            {highlightLine(line).map(([k, t], j) => (
              <span key={j} style={{ color: TOK[k], fontStyle: k === 'com' ? 'italic' : undefined }}>{t}</span>
            ))}
          </span>
        </div>
      ))}
    </pre>
  )
}

export default function ReverseProxyConfigBuilder() {
  const [s, set, reset] = useToolState('reverse-proxy-config-builder', DEF)
  const text = GEN[s.server](s)
  const warns = warnings(s, s.server)
  const tls = s.tls !== 'none'
  const editUp = (i: number, p: Partial<Upstream>) => set({ upstreams: s.upstreams.map((u, j) => (j === i ? { ...u, ...p } : u)) })

  return (
    <Split wide="right">
      <div>
        <Panel title="Presets" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            {PRESETS.map((p) => <Btn key={p.name} onClick={() => set(p.p)}>{p.name}</Btn>)}
          </Row>
        </Panel>
        <Panel title="Site">
          <Txt label="Domain" value={s.domain} onChange={(domain) => set({ domain })} />
          <Txt label="Aliases" value={s.aliases} onChange={(aliases) => set({ aliases })} hint="Space or comma separated" />
          <Row>
            <Txt label="Path prefix" value={s.path} onChange={(path) => set({ path })} />
            <Num label="Max upload" value={s.maxBodyMb} onChange={(maxBodyMb) => set({ maxBodyMb })} unit="MB" min={0} />
          </Row>
          <Check label="Strip the prefix before passing upstream" value={s.stripPath} onChange={(stripPath) => set({ stripPath })} />
        </Panel>
        <Panel title="Upstreams" actions={<Btn onClick={() => set({ upstreams: [...s.upstreams, { host: '127.0.0.1', port: 3000 + s.upstreams.length, weight: 1 }] })}>+ Add</Btn>}>
          {s.upstreams.map((u, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 70px auto', gap: 6, alignItems: 'end' }}>
              <Txt label={i ? '' : 'Host'} value={u.host} onChange={(host) => editUp(i, { host })} />
              <Num label={i ? '' : 'Port'} value={u.port} onChange={(port) => editUp(i, { port })} min={1} max={65535} />
              <Num label={i ? '' : 'Weight'} value={u.weight} onChange={(weight) => editUp(i, { weight: Math.max(1, Math.round(weight)) })} min={1} />
              <Btn kind="ghost" title="Remove" onClick={() => set({ upstreams: s.upstreams.filter((_, j) => j !== i) })}>✕</Btn>
            </div>
          ))}
          <Row>
            <Select<Lb> label="Load balancing" value={s.lb} onChange={(lb) => set({ lb })} options={[['round_robin', 'Round robin'], ['least_conn', 'Least connections'], ['ip_hash', 'Sticky (client IP / cookie)']]} />
            <Txt label="Health check path" value={s.healthPath} onChange={(healthPath) => set({ healthPath })} />
          </Row>
          <Row>
            <Num label="Connect timeout" value={s.connectTimeout} onChange={(connectTimeout) => set({ connectTimeout })} unit="s" min={1} />
            <Num label="Read timeout" value={s.readTimeout} onChange={(readTimeout) => set({ readTimeout })} unit="s" min={1} />
          </Row>
          <Check label="Upstreams speak HTTPS" value={s.upstreamTls} onChange={(upstreamTls) => set({ upstreamTls })} />
        </Panel>
        <Panel title="TLS & protocols">
          <Seg<Tls> value={s.tls} onChange={(t) => set({ tls: t })} options={[['none', 'No TLS'], ['acme', "Let's Encrypt"], ['custom', 'Own certificate']]} />
          {s.tls === 'acme' && <Txt label="ACME e-mail" value={s.email} onChange={(email) => set({ email })} />}
          {s.tls === 'custom' && (
            <>
              <Txt label="Certificate (full chain)" value={s.certFile} onChange={(certFile) => set({ certFile })} />
              <Txt label="Private key" value={s.keyFile} onChange={(keyFile) => set({ keyFile })} />
            </>
          )}
          {tls && (
            <Row>
              <Select label="Minimum TLS" value={s.tlsMin} onChange={(tlsMin) => set({ tlsMin })} options={[['1.2', 'TLS 1.2'], ['1.3', 'TLS 1.3']]} />
              <Check label="Redirect HTTP → HTTPS" value={s.redirectHttp} onChange={(redirectHttp) => set({ redirectHttp })} />
            </Row>
          )}
          <Row>
            <Check label="HTTP/2" value={s.http2} onChange={(http2) => set({ http2 })} />
            <Check label="HTTP/3 (QUIC)" value={s.http3} onChange={(http3) => set({ http3 })} />
            <Check label="WebSockets" value={s.websockets} onChange={(websockets) => set({ websockets })} />
          </Row>
        </Panel>
        <Panel title="Performance">
          <Row>
            <Check label="gzip" value={s.gzip} onChange={(gzip) => set({ gzip })} />
            <Check label="Brotli" value={s.brotli} onChange={(brotli) => set({ brotli })} />
          </Row>
          <Row>
            <Select<Cache> label="Proxy cache" value={s.cache} onChange={(cache) => set({ cache })} options={[['off', 'Off'], ['static', 'Static assets only'], ['all', 'All responses']]} />
            {s.cache !== 'off' && <Num label="Cache TTL" value={s.cacheMinutes} onChange={(cacheMinutes) => set({ cacheMinutes })} unit="min" min={1} />}
          </Row>
          <Check label="Rate limit per client IP" value={s.rateLimit} onChange={(rateLimit) => set({ rateLimit })} />
          {s.rateLimit && (
            <Row>
              <Num label="Rate" value={s.rps} onChange={(rps) => set({ rps })} unit="req/s" min={1} />
              <Num label="Burst" value={s.burst} onChange={(burst) => set({ burst })} min={0} />
            </Row>
          )}
        </Panel>
        <Panel title="Security headers">
          <Check label="HSTS (Strict-Transport-Security)" value={s.hsts} onChange={(hsts) => set({ hsts })} />
          {s.hsts && (
            <Row>
              <Num label="max-age" value={s.hstsMaxAge} onChange={(hstsMaxAge) => set({ hstsMaxAge })} unit="s" min={0} />
              <Check label="preload" value={s.hstsPreload} onChange={(hstsPreload) => set({ hstsPreload })} />
            </Row>
          )}
          <Check label="nosniff, frame, referrer & permissions policies" value={s.secHeaders} onChange={(secHeaders) => set({ secHeaders })} />
          {s.secHeaders && <Txt label="Content-Security-Policy" value={s.csp} onChange={(csp) => set({ csp })} hint="Leave empty to omit" />}
        </Panel>
      </div>
      <div>
        <Panel
          title="Generated config"
          actions={
            <>
              <CopyButton text={text} />
              <Btn onClick={() => download(FILE[s.server], text, 'text/plain')}>⬇ {FILE[s.server]}</Btn>
            </>
          }
        >
          <Seg<Server> value={s.server} onChange={(server) => set({ server })} options={SERVERS} label="Server" />
          <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
            {warns.length === 0 && <Note tone="ok">No risky combinations found for {SERVERS.find((x) => x[0] === s.server)?.[1]}.</Note>}
            {warns.map((w, i) => (
              <Note key={i} tone={w.level === 'err' ? 'err' : w.level === 'warn' ? 'warn' : 'info'}>{w.text}</Note>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <Code text={text} />
          </div>
        </Panel>
        <Panel title="Before you deploy">
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li>Validate syntax first: <code>nginx -t</code>, <code>caddy validate</code>, <code>apachectl configtest</code>, <code>haproxy -c -f haproxy.cfg</code>; Traefik logs file-provider errors on load.</li>
            <li>Paths, cache directories and certificate locations follow common Debian/Ubuntu defaults — adjust to your distro.</li>
            <li>Check the result with <code>curl -I https://{s.domain}</code> and a TLS scanner; HSTS and CSP mistakes can lock users out.</li>
            <li>Everything is generated in your browser; nothing is sent anywhere.</li>
          </ul>
        </Panel>
      </div>
    </Split>
  )
}
