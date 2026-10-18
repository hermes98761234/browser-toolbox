import { Btn, Check, CopyButton, CsvButton, Note, Panel, Row, Seg, Split, Stat, Stats, useToolState } from '../kit'
import { CACHEABLE, CATS, catOf, RETRYABLE, rfcUrl, search, STATUSES, type Cat, type Status } from './lib/http-status-reference'

interface State { q: string; cat: 'all' | Cat; unofficial: boolean; open: number }
const DEF: State = { q: '', cat: 'all', unofficial: true, open: 404 }

const TONE: Record<Cat, string> = { '1xx': '#64748b', '2xx': '#10b981', '3xx': '#0ea5e9', '4xx': '#f59e0b', '5xx': '#ef4444' }

const SCENARIOS: [string, number][] = [
  ['Created a resource', 201], ['Accepted, processing later', 202], ['Success, nothing to return', 204], ['Redirect after form POST', 303],
  ['Moved forever (keep method)', 308], ['Not logged in / token expired', 401], ['Logged in but not allowed', 403], ['Validation failed', 422],
  ['Edit conflict / duplicate', 409], ['Rate limited', 429], ['Upstream app is down', 502], ['Maintenance', 503],
]

function Code({ s, big }: { s: Status; big?: boolean }) {
  return (
    <span style={{ display: 'inline-block', minWidth: big ? 74 : 46, textAlign: 'center', padding: big ? '6px 10px' : '2px 6px', borderRadius: 8, fontWeight: 800, fontSize: big ? 28 : 14, fontVariantNumeric: 'tabular-nums', color: '#fff', background: TONE[catOf(s.code)], opacity: s.official ? 1 : 0.75 }}>
      {s.code}
    </span>
  )
}

function Detail({ s }: { s: Status }) {
  const cat = CATS.find((c) => c.id === catOf(s.code))!
  const tags = [
    s.official ? (s.deprecated ? 'Deprecated / unused' : 'IANA registered') : `Unofficial (${s.vendor})`,
    CACHEABLE.has(s.code) ? 'Cacheable by default' : '',
    RETRYABLE.has(s.code) ? 'Retry with backoff' : '',
  ].filter(Boolean)
  return (
    <div>
      <Row wrap={false}>
        <Code s={s} big />
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>{s.name}</h2>
          <div className="muted" style={{ fontSize: 13 }}>{cat.id} {cat.name} — {cat.blurb}</div>
        </div>
      </Row>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
        {tags.map((t) => <span key={t} style={{ fontSize: 12, border: '1px solid var(--line)', borderRadius: 999, padding: '2px 8px' }}>{t}</span>)}
      </div>
      <p style={{ fontSize: 16, lineHeight: 1.5 }}>{s.summary}</p>
      {s.causes.length > 0 && (
        <>
          <h4 style={{ margin: '12px 0 4px' }}>Common causes</h4>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>{s.causes.map((c) => <li key={c}>{c}</li>)}</ul>
        </>
      )}
      <h4 style={{ margin: '12px 0 4px' }}>{s.code >= 400 ? 'How to fix' : 'Notes'}</h4>
      <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>{s.fixes.map((c) => <li key={c}>{c}</li>)}</ul>
      {s.headers !== '—' && <p style={{ marginTop: 12 }}><b>Related headers:</b> <code>{s.headers}</code></p>}
      <Row>
        {s.ref ? (
          <a className="k-btn" href={rfcUrl(s.ref)} target="_blank" rel="noreferrer">📄 RFC {s.ref.replace(' ', ' § ')}</a>
        ) : (
          <span className="muted" style={{ fontSize: 13 }}>Not defined by an RFC — vendor-specific, never send it from your own server.</span>
        )}
        <CopyButton text={`HTTP/1.1 ${s.code} ${s.name}`} label="Copy status line" />
      </Row>
    </div>
  )
}

export default function HttpStatusReference() {
  const [s, set, reset] = useToolState('http-status-reference', DEF)
  const list = search(s.q).filter((x) => (s.cat === 'all' || catOf(x.code) === s.cat) && (s.unofficial || x.official))
  const open = STATUSES.find((x) => x.code === s.open && (s.unofficial || x.official)) ?? list[0]
  const official = STATUSES.filter((x) => x.official).length

  return (
    <>
      <Stats>
        <Stat label="Codes in reference" value={STATUSES.length} sub={`${official} registered · ${STATUSES.length - official} vendor`} />
        <Stat label="Matching" value={list.length} tone="accent" />
        {CATS.slice(3).map((c) => <Stat key={c.id} label={`${c.id} ${c.name}`} value={STATUSES.filter((x) => catOf(x.code) === c.id).length} />)}
      </Stats>
      <Split>
        <div>
          <Panel title="Find a status code" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <input className="k-text" placeholder="Code (404, 5xx) or words: rate limit, cookie, timeout…" value={s.q} onChange={(e) => set({ q: e.target.value })} aria-label="Search" style={{ width: '100%', fontSize: 16, padding: '10px 12px' }} />
            <div style={{ margin: '10px 0' }}>
              <Seg value={s.cat} onChange={(cat) => set({ cat })} label="Category" options={[['all', 'All'], ...CATS.map((c) => [c.id, c.id] as [Cat, string])]} />
            </div>
            <Check label="Show unofficial codes (nginx, Cloudflare)" value={s.unofficial} onChange={(unofficial) => set({ unofficial })} />
            <div style={{ maxHeight: 520, overflowY: 'auto', marginTop: 10, borderTop: '1px solid var(--line)' }}>
              {list.map((x) => (
                <button key={x.code} type="button" onClick={() => set({ open: x.code })}
                  style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left', padding: '7px 6px', border: 0, borderBottom: '1px solid var(--line)', background: open?.code === x.code ? 'var(--accent-soft, rgba(99,102,241,.12))' : 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' }}>
                  <Code s={x} />
                  <span style={{ flex: 1 }}>
                    <b>{x.name}</b>
                    {x.deprecated && <span className="muted"> · deprecated</span>}
                    {!x.official && <span className="muted"> · {x.vendor}</span>}
                  </span>
                </button>
              ))}
              {!list.length && <Note tone="warn">Nothing matches "{s.q}". Try a code, a class like 4xx, or words like "auth" or "upload".</Note>}
            </div>
          </Panel>
          <Panel title="Which code should I return?">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 6 }}>
              {SCENARIOS.map(([label, code]) => (
                <button key={label} type="button" className="k-btn ghost" style={{ justifyContent: 'space-between', display: 'flex' }} onClick={() => set({ open: code, q: '', cat: 'all' })}>
                  <span>{label}</span> <b>{code}</b>
                </button>
              ))}
            </div>
          </Panel>
        </div>
        <div>
          <Panel title="Details" actions={<CsvButton name="http-status-codes.csv" rows={() => [['code', 'name', 'category', 'rfc', 'summary', 'causes', 'fixes'], ...list.map((x) => [x.code, x.name, catOf(x.code), x.ref ? `RFC ${x.ref}` : x.vendor ?? '', x.summary, x.causes.join('; '), x.fixes.join('; ')])]} />}>
            {open ? <Detail s={open} /> : <Note>Select a status code.</Note>}
          </Panel>
          <Panel title="Quick rules">
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7, fontSize: 14 }}>
              <li><b>401 vs 403:</b> 401 = "who are you?" (log in), 403 = "I know you, but no".</li>
              <li><b>400 vs 422:</b> 400 for malformed requests, 422 for well-formed data that fails validation.</li>
              <li><b>301/302 vs 308/307:</b> the newer pair guarantees the method and body are kept.</li>
              <li><b>502 vs 504:</b> 502 = upstream answered badly, 504 = upstream didn't answer in time.</li>
              <li>Section numbers refer to RFC 9110 (HTTP Semantics, 2022) unless another RFC is named.</li>
            </ul>
          </Panel>
        </div>
      </Split>
    </>
  )
}
