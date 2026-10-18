import { useState } from 'react'
import { Area, Btn, Check, CopyButton, CsvButton, Note, Panel, Row, Seg, Split, Stat, Stats, useToolState } from '../kit'
import { decode, encode, parse, pid, rebuild, TRACKING, type Codec, type Param, type Parsed } from './lib/url-parser'

const EXAMPLES = [
  'https://shop.example.co.uk/catalog/running%20shoes/?colour=blue&size=42&size=43&sort=price_asc&utm_source=newsletter&utm_medium=email&fbclid=AbC123#reviews',
  'https://api.example.com:8443/v2/users/42/orders?status=open&from=2026-01-01&fields=id,total,items&page=2',
  'http://admin:hunter2@192.168.1.20:8080/config?redirect=https%3A%2F%2Fevil.example%2Flogin',
  'https://xn--mnchen-3ya.example/stadtplan?q=Marienplatz&zoom=15',
  'https://app.example.com/#/settings/profile?tab=security&highlight=2fa',
  'example.org/search?q=caf%C3%A9+au+lait&lang=fr',
]

interface Ed { src: string; protocol: string; host: string; path: string; hash: string; params: Param[] }
const fromParsed = (src: string, p: Parsed | { error: string }): Ed =>
  'error' in p ? { src, protocol: 'https:', host: '', path: '', hash: '', params: [] } : { src, protocol: p.url.protocol, host: p.url.host, path: p.url.pathname, hash: p.url.hash, params: p.params }

export default function UrlParser() {
  const [s, set] = useToolState('url-parser', { input: EXAMPLES[0], plus: true, codec: 'component' as Codec, text: 'café & crème/brûlée? 100%' })
  const p = parse(s.input)
  const [ed, setEd] = useState<Ed>(() => fromParsed(s.input, p))
  if (ed.src !== s.input) setEd(fromParsed(s.input, p))
  const ok = !('error' in p)
  const out = ok ? rebuild(p.url, { ...ed, plusSpaces: s.plus }) : ''
  const changed = ok && out !== p.url.href
  const up = (patch: Partial<Ed>) => setEd({ ...ed, ...patch })
  const setParam = (id: string, patch: Partial<Param>) => up({ params: ed.params.map((x) => (x.id === id ? { ...x, ...patch } : x)) })
  const keys = ed.params.map((x) => x.key)
  const dup = new Set(keys.filter((k, i) => keys.indexOf(k) !== i))
  const asJson = () => {
    const o: Record<string, string | string[]> = {}
    for (const x of ed.params.filter((q) => q.on)) { const v = o[x.key]; o[x.key] = v === undefined ? x.value : Array.isArray(v) ? [...v, x.value] : [v, x.value] }
    return JSON.stringify(o, null, 2)
  }
  let enc = '', dec = '', decErr = ''
  try { enc = encode(s.text, s.codec) } catch { enc = '' }
  try { dec = decode(s.text, s.codec) } catch (e) { decErr = (e as Error).message }

  const comp: [string, string, string?][] = ok
    ? [
        ['href', p.url.href],
        ['origin', p.url.origin],
        ['protocol', p.url.protocol],
        ...(p.url.username ? [['username', decodeURIComponent(p.url.username)] as [string, string]] : []),
        ...(p.url.password ? [['password', '•'.repeat(p.url.password.length), 'hidden'] as [string, string, string]] : []),
        ['hostname', p.url.hostname, p.host.unicode !== p.url.hostname ? `displays as ${p.host.unicode}` : undefined],
        ['port', p.url.port || '(default)', p.url.port ? undefined : p.url.protocol === 'https:' ? '443' : p.url.protocol === 'http:' ? '80' : undefined],
        ...(!p.host.ip ? [['subdomain', p.host.sub || '—'], ['domain', p.host.domain], ['public suffix', p.host.suffix]] as [string, string][] : []),
        ['pathname', p.url.pathname],
        ['search', p.url.search || '—'],
        ['hash', p.url.hash || '—'],
      ]
    : []

  return (
    <div>
      <Panel title="URL">
        <Area value={s.input} onChange={(input) => set({ input })} rows={3} mono placeholder="https://example.com/path?x=1#top" />
        <Row>
          <span className="muted" style={{ fontSize: 13 }}>Examples:</span>
          {EXAMPLES.map((e, i) => <Btn key={i} kind="ghost" onClick={() => set({ input: e })}>{['Shop + tracking', 'API', 'Credentials', 'IDN', 'SPA hash', 'No scheme'][i]}</Btn>)}
        </Row>
        {!ok && <Note tone="err">{p.error}</Note>}
        {ok && p.warnings.map((w, i) => <Note key={i} tone={w.level === 'warn' ? 'warn' : 'info'}>{w.text}</Note>)}
      </Panel>
      {ok && (
        <>
          <Stats>
            <Stat label="Length" value={p.url.href.length} sub="characters" />
            <Stat label="Path segments" value={p.segments.length} />
            <Stat label="Query parameters" value={p.params.length} sub={p.params.some((x) => TRACKING.test(x.key)) ? `${p.params.filter((x) => TRACKING.test(x.key)).length} tracking` : undefined} tone="accent" />
            <Stat label="Secure" value={p.url.protocol === 'https:' || p.url.protocol === 'wss:' ? 'Yes' : 'No'} tone={p.url.protocol === 'https:' || p.url.protocol === 'wss:' ? 'good' : 'bad'} />
          </Stats>
          <Split>
            <div>
              <Panel title="Components">
                <table className="k-table" style={{ fontSize: 13, tableLayout: 'fixed', width: '100%' }}>
                  <colgroup><col style={{ width: 96 }} /><col /><col style={{ width: 44 }} /></colgroup>
                  <tbody>
                    {comp.map(([k, v, note]) => (
                      <tr key={k}>
                        <td className="muted" style={{ whiteSpace: 'nowrap' }}>{k}</td>
                        <td style={{ fontFamily: 'var(--mono)', wordBreak: 'break-all', whiteSpace: 'normal' }}>{v}{note && <div className="muted" style={{ fontFamily: 'inherit', fontSize: 11 }}>{note}</div>}</td>
                        <td>{v !== '—' && note !== 'hidden' && <CopyButton text={v} label="" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {p.segments.length > 0 && (
                  <>
                    <h4 style={{ margin: '10px 0 6px' }}>Path</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', fontFamily: 'var(--mono)', fontSize: 13 }}>
                      {p.segments.map((g, i) => <span key={i}><span className="muted">/</span><span style={{ background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 6, padding: '1px 6px' }}>{g}</span></span>)}
                    </div>
                  </>
                )}
                {p.hashParams.length > 0 && (
                  <>
                    <h4 style={{ margin: '10px 0 6px' }}>Fragment parameters</h4>
                    <table className="k-table" style={{ fontSize: 13 }}><tbody>{p.hashParams.map((x) => <tr key={x.id}><td style={{ fontFamily: 'var(--mono)' }}>{x.key}</td><td style={{ fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>{x.value}</td></tr>)}</tbody></table>
                  </>
                )}
              </Panel>
              <Panel title="Encode / decode">
                <Seg value={s.codec} onChange={(codec) => set({ codec })} options={[['component', 'Component'], ['uri', 'Whole URI'], ['form', 'Form (+)']]} />
                <Area value={s.text} onChange={(text) => set({ text })} rows={3} mono />
                <div className="k-label" style={{ marginTop: 6 }}>Encoded <CopyButton text={enc} label="" /></div>
                <code style={{ display: 'block', wordBreak: 'break-all', fontSize: 13 }}>{enc}</code>
                <div className="k-label" style={{ marginTop: 6 }}>Decoded <CopyButton text={dec} label="" /></div>
                {decErr ? <span className="muted" style={{ fontSize: 13 }}>{decErr}</span> : <code style={{ display: 'block', wordBreak: 'break-all', fontSize: 13 }}>{dec}</code>}
                <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Component = encodeURIComponent (for one value), Whole URI = encodeURI (keeps / ? & =), Form = application/x-www-form-urlencoded.</p>
              </Panel>
            </div>
            <div>
              <Panel
                title="Edit & rebuild"
                actions={
                  <>
                    <Btn onClick={() => up({ params: [...ed.params, { id: pid(), key: 'key', value: 'value', on: true }] })}>+ Param</Btn>
                    <Btn kind="ghost" onClick={() => up({ params: [...ed.params].sort((a, b) => a.key.localeCompare(b.key)) })}>Sort A–Z</Btn>
                    <Btn kind="ghost" onClick={() => up({ params: ed.params.filter((x) => !TRACKING.test(x.key)) })}>Strip tracking</Btn>
                    <Btn kind="ghost" onClick={() => up({ params: ed.params.filter((x) => x.value !== '') })}>Drop empty</Btn>
                  </>
                }
              >
                <Row>
                  <label className="k-field" style={{ maxWidth: 110 }}><span className="k-label">Scheme</span><input className="k-text" value={ed.protocol} onChange={(e) => up({ protocol: e.target.value })} /></label>
                  <label className="k-field" style={{ flex: 1 }}><span className="k-label">Host[:port]</span><input className="k-text" value={ed.host} onChange={(e) => up({ host: e.target.value })} /></label>
                </Row>
                <Row>
                  <label className="k-field" style={{ flex: 2 }}><span className="k-label">Path</span><input className="k-text" style={{ fontFamily: 'var(--mono)' }} value={ed.path} onChange={(e) => up({ path: e.target.value })} /></label>
                  <label className="k-field" style={{ flex: 1 }}><span className="k-label">Fragment</span><input className="k-text" value={ed.hash} onChange={(e) => up({ hash: e.target.value })} /></label>
                </Row>
                <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                  {ed.params.map((x, i) => (
                    <div key={x.id} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(70px,1fr) minmax(90px,1.6fr) auto auto', gap: 4, alignItems: 'center', opacity: x.on ? 1 : 0.5 }}>
                      <input type="checkbox" checked={x.on} onChange={(e) => setParam(x.id, { on: e.target.checked })} aria-label={`Include ${x.key}`} />
                      <input className="k-text" style={{ fontFamily: 'var(--mono)', borderColor: dup.has(x.key) ? 'var(--warn)' : undefined }} value={x.key} onChange={(e) => setParam(x.id, { key: e.target.value })} aria-label="Key" title={dup.has(x.key) ? 'Repeated key' : TRACKING.test(x.key) ? 'Tracking parameter' : undefined} />
                      <input className="k-text" style={{ fontFamily: 'var(--mono)' }} value={x.value} onChange={(e) => setParam(x.id, { value: e.target.value })} aria-label="Value" />
                      <Btn kind="ghost" disabled={i === 0} onClick={() => { const a = [...ed.params]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; up({ params: a }) }} title="Move up">↑</Btn>
                      <Btn kind="ghost" onClick={() => up({ params: ed.params.filter((y) => y.id !== x.id) })} title="Remove">✕</Btn>
                    </div>
                  ))}
                  {!ed.params.length && <p className="muted" style={{ margin: 0 }}>No query parameters.</p>}
                </div>
                <Check label="Encode spaces as + (form style) instead of %20" value={s.plus} onChange={(plus) => set({ plus })} />
                <div className="k-label" style={{ marginTop: 8 }}>Rebuilt URL {changed && <b style={{ color: 'var(--accent)' }}>· modified</b>}</div>
                <code style={{ display: 'block', wordBreak: 'break-all', fontSize: 13, background: 'var(--panel2)', padding: 8, borderRadius: 8 }}>{out}</code>
                <Row>
                  <CopyButton text={out} label="Copy URL" />
                  <Btn onClick={() => set({ input: out })} disabled={!changed}>Use as input</Btn>
                  <Btn kind="ghost" onClick={() => setEd(fromParsed(s.input, p))} disabled={!changed}>Undo edits</Btn>
                  {/^https?:\/\//i.test(out) && <a className="k-btn ghost" href={out} target="_blank" rel="noopener noreferrer">Open ↗</a>}
                </Row>
              </Panel>
              <Panel title="Parameters as data" actions={<><CopyButton text={asJson} label="JSON" /><CsvButton name="query-params.csv" rows={() => [['key', 'value'], ...ed.params.filter((x) => x.on).map((x) => [x.key, x.value])]} /></>}>
                <pre style={{ margin: 0, fontSize: 12, maxHeight: 220, overflow: 'auto' }}>{asJson()}</pre>
              </Panel>
            </div>
          </Split>
        </>
      )}
      <Note>Parsing uses your browser’s built-in WHATWG URL parser, so the result matches what browsers actually request. Nothing is sent anywhere.</Note>
    </div>
  )
}
