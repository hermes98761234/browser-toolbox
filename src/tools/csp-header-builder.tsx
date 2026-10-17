import { useState } from 'react'
import { Area, Btn, Check, CopyButton, Note, Panel, Row, Select, Split, Stat, Stats, useToolState } from '../kit'
import { DIRECTIVES, evaluate, grade, KEYWORDS, makeNonce, parsePolicy, PRESETS, SCHEMES, serialize, snippets, type Directive, type Severity } from './lib/csp-header-builder'

type Fmt = 'header' | 'meta' | 'nginx' | 'apache' | 'netlify' | 'express' | 'iis'
interface State {
  ds: Directive[]
  reportOnly: boolean
  fmt: Fmt
}

const withNonce = (ds: Directive[]) => {
  const n = makeNonce()
  return ds.map(([k, v]) => [k, v.map((x) => x.replace('{NONCE}', n))] as Directive)
}
const DEF: State = { ds: PRESETS[2].ds, reportOnly: false, fmt: 'header' }
const SEV: Record<Severity, [string, string]> = { high: ['#dc2626', 'High'], medium: ['#d97706', 'Medium'], low: ['#0ea5e9', 'Low'], info: ['#64748b', 'Info'] }
const FMTS: [Fmt, string][] = [['header', 'HTTP header'], ['meta', '<meta> tag'], ['nginx', 'nginx'], ['apache', 'Apache'], ['netlify', 'Netlify _headers'], ['express', 'Express / Node'], ['iis', 'IIS web.config']]
const chip = (c: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 4px 2px 9px', borderRadius: 999, fontFamily: 'var(--mono)', fontSize: 12.5, border: '1px solid var(--line)', background: c.startsWith("'unsafe") ? 'rgba(220,38,38,.12)' : c.startsWith("'") ? 'var(--panel2)' : 'transparent' })

function SourceAdder({ onAdd }: { onAdd: (v: string) => void }) {
  const [v, setV] = useState('')
  const add = () => {
    const parts = v.trim().split(/\s+/).filter(Boolean)
    parts.forEach(onAdd)
    setV('')
  }
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      <input
        list="csp-sources"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        placeholder="add source…"
        aria-label="Add source"
        style={{ width: 150, fontFamily: 'var(--mono)', fontSize: 12.5 }}
      />
      <button type="button" className="k-btn" onClick={add} disabled={!v.trim()}>+</button>
    </span>
  )
}

export default function CspHeaderBuilder() {
  const [s, set, reset] = useToolState('csp-header-builder', DEF)
  const [paste, setPaste] = useState('')
  const [script, setScript] = useState("console.log('hello from an inline script')")
  const [hashMsg, setHashMsg] = useState('')
  const findings = evaluate(s.ds)
  const g = grade(findings)
  const sn = snippets(s.ds, s.reportOnly)
  const used = new Set(s.ds.map((d) => d[0]))
  const upd = (i: number, srcs: string[]) => set({ ds: s.ds.map((d, k) => (k === i ? [d[0], srcs] : d)) })
  const addTo = (name: string, src: string) => {
    const i = s.ds.findIndex((d) => d[0] === name)
    if (i < 0) set({ ds: [...s.ds, [name, [src]]] })
    else if (!s.ds[i][1].includes(src)) upd(i, [...s.ds[i][1], src])
  }
  const hash = async () => {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script))
      const h = `'sha256-${btoa(String.fromCharCode(...new Uint8Array(buf)))}'`
      addTo('script-src', h)
      setHashMsg(`Added ${h}. The hash must match the script text exactly, including whitespace.`)
    } catch {
      setHashMsg('Hashing needs a secure context (https or localhost).')
    }
  }
  const counts = (['high', 'medium', 'low'] as Severity[]).map((k) => findings.filter((f) => f.sev === k).length)

  return (
    <Split>
      <div>
        <datalist id="csp-sources">
          {[...KEYWORDS, ...SCHEMES, '*', 'https://*.example.com'].map((k) => <option key={k} value={k} />)}
        </datalist>
        <Panel title="Start from a preset">
          <div style={{ display: 'grid', gap: 6 }}>
            {PRESETS.map((p) => (
              <button key={p.name} type="button" className="k-btn" style={{ textAlign: 'left', display: 'block', height: 'auto', padding: '8px 12px', whiteSpace: 'normal', width: '100%', boxSizing: 'border-box' }} onClick={() => set({ ds: withNonce(p.ds) })}>
                <b>{p.name}</b>
                <div className="muted" style={{ fontSize: 12.5, fontWeight: 400 }}>{p.desc}</div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title={`Directives (${s.ds.length})`} actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          {s.ds.map(([name, srcs], i) => {
            const meta = DIRECTIVES.find((d) => d[0] === name)
            return (
              <div key={`${name}${i}`} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <code style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{name}</code>
                  <span className="muted" style={{ fontSize: 12, flex: 1 }}>{meta?.[2] ?? 'Unknown or deprecated directive'}</span>
                  <button type="button" className="k-btn ghost" title="Remove directive" onClick={() => set({ ds: s.ds.filter((_, k) => k !== i) })}>✕</button>
                </div>
                {meta?.[1] !== 'flag' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                    {srcs.map((src, k) => (
                      <span key={k} style={chip(src)}>
                        {src.length > 38 ? src.slice(0, 36) + '…' : src}
                        <button type="button" onClick={() => upd(i, srcs.filter((_, j) => j !== k))} aria-label={`Remove ${src}`} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0 4px' }}>×</button>
                      </span>
                    ))}
                    <SourceAdder onAdd={(v) => { if (!srcs.includes(v)) upd(i, [...srcs, v]) }} />
                  </div>
                )}
              </div>
            )
          })}
          <div style={{ marginTop: 10 }}>
            <Select
              label="Add a directive"
              value=""
              onChange={(v) => v && set({ ds: [...s.ds, [v, DIRECTIVES.find((d) => d[0] === v)?.[1] === 'flag' ? [] : v === 'object-src' || v === 'base-uri' || v === 'frame-ancestors' ? ["'none'"] : ["'self'"]]] })}
              options={[['', '— choose —'] as const, ...DIRECTIVES.filter((d) => !used.has(d[0])).map((d) => [d[0], `${d[0]} — ${d[2].slice(0, 50)}`] as const)]}
            />
          </div>
        </Panel>
        <Panel title="Nonces and hashes">
          <Row>
            <Btn onClick={() => addTo('script-src', `'nonce-${makeNonce()}'`)}>+ Random nonce to script-src</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>A nonce must be regenerated by your server for every response and added to each script tag: <code>&lt;script nonce="…"&gt;</code>.</p>
          <Area label="Inline script to allow by hash" value={script} onChange={setScript} rows={3} mono />
          <Btn onClick={() => void hash()}>+ SHA-256 hash to script-src</Btn>
          {hashMsg && <Note>{hashMsg}</Note>}
        </Panel>
        <Panel title="Import an existing policy">
          <Area value={paste} onChange={setPaste} rows={3} mono placeholder="Paste a header value, a full header line or a <meta> tag" />
          <Btn disabled={!paste.trim()} onClick={() => { set({ ds: parsePolicy(paste) }); setPaste('') }}>Parse and edit</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Grade" value={g.letter} sub={`${g.score}/100`} tone={g.letter === 'A' || g.letter === 'B' ? 'good' : g.letter === 'C' ? 'accent' : 'bad'} />
          <Stat label="High" value={counts[0]} tone={counts[0] ? 'bad' : 'good'} sub="exploitable gaps" />
          <Stat label="Medium" value={counts[1]} sub="should fix" />
          <Stat label="Header size" value={`${serialize(s.ds).length} B`} sub={`${s.ds.length} directives`} />
        </Stats>
        <Panel title="Output" actions={<CopyButton text={sn[s.fmt] as string} />}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {FMTS.map(([k, l]) => (
              <button key={k} type="button" className={`k-btn ${s.fmt === k ? 'primary' : ''}`} onClick={() => set({ fmt: k })}>{l}</button>
            ))}
          </div>
          <pre style={{ fontFamily: 'var(--mono)', fontSize: 13, background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 10, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}>{sn[s.fmt] as string}</pre>
          <Check label="Report-Only mode (monitor violations without blocking — recommended for rollout)" value={s.reportOnly} onChange={(reportOnly) => set({ reportOnly })} />
          {s.fmt === 'meta' && sn.metaDropped.length > 0 && <Note tone="warn">Removed from the &lt;meta&gt; version because browsers ignore them there: {sn.metaDropped.join(', ')}. Send those via the HTTP header.</Note>}
          {s.ds.some(([n]) => n === 'report-to') && <Note>report-to needs a matching header, e.g. <code>Reporting-Endpoints: csp-endpoint="https://example.com/csp-reports"</code>.</Note>}
        </Panel>
        <Panel title={`Evaluation (${findings.length} findings)`}>
          {findings.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ flex: 'none', width: 62, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: SEV[f.sev][0] }}>{SEV[f.sev][1]}</span>
              <div>
                <code style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent)' }}>{f.directive}</code>
                <div style={{ fontSize: 14 }}>{f.msg}</div>
              </div>
            </div>
          ))}
          {!findings.length && <Note tone="ok">No issues found.</Note>}
        </Panel>
      </div>
    </Split>
  )
}
