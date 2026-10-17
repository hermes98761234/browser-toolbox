import { useMemo } from 'react'
import { Area, Btn, Check, CopyButton, download, Note, Panel, Ring, Row, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { analyze, parseHeaders, SAMPLES, type Level } from './lib/security-headers-analyzer'

interface State { text: string; https: boolean; filter: 'all' | 'issues' }
const DEF: State = { text: SAMPLES['Typical SPA on a CDN'], https: true, filter: 'all' }

const ICON: Record<Level, string> = { pass: '✓', warn: '!', fail: '✕', info: 'i' }
const COL: Record<Level, string> = { pass: 'var(--ok)', warn: 'var(--warn)', fail: 'var(--err)', info: 'var(--muted)' }
const gradeColor = (g: string) => (g.startsWith('A') ? 'var(--ok)' : g === 'B' ? '#84cc16' : g === 'C' ? 'var(--warn)' : 'var(--err)')

export default function SecurityHeadersAnalyzer() {
  const [s, set, reset] = useToolState('security-headers-analyzer', DEF)
  const parsed = useMemo(() => parseHeaders(s.text), [s.text])
  const rep = useMemo(() => analyze(s.text, s.https), [s.text, s.https])
  const count = (l: Level) => rep.findings.filter((f) => f.level === l).length
  const shown = rep.findings.filter((f) => s.filter === 'all' || f.level === 'fail' || f.level === 'warn').sort((a, b) => ['fail', 'warn', 'info', 'pass'].indexOf(a.level) - ['fail', 'warn', 'info', 'pass'].indexOf(b.level))
  const report = () => [`Security headers report — grade ${rep.grade} (${rep.score}/100)`, '', ...rep.findings.map((f) => `[${f.level.toUpperCase()}] ${f.area}: ${f.title}\n    ${f.detail}${f.fix ? `\n    Fix: ${f.fix}` : ''}`)].join('\n')

  return (
    <Split wide="right">
      <div>
        <Panel title="Response headers" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Area value={s.text} onChange={(text) => set({ text })} rows={14} mono placeholder={'Paste the output of:\ncurl -sI https://example.com\nor DevTools → Network → Response headers'} />
          <Row>
            {Object.keys(SAMPLES).map((k) => <Btn key={k} kind="ghost" onClick={() => set({ text: SAMPLES[k] })}>{k}</Btn>)}
          </Row>
          <Check label="Site is served over HTTPS" value={s.https} onChange={(https) => set({ https })} />
          <p className="muted" style={{ fontSize: 12 }}>
            {parsed.headers.size} headers parsed{parsed.status ? ` · ${parsed.status}` : ''}{parsed.bad.length ? ` · ${parsed.bad.length} line(s) ignored` : ''}. Nothing is sent anywhere: paste headers from <code>curl -sI URL</code>, then review them here.
          </p>
        </Panel>
        <Panel title="Headers found">
          <Table head={['Header', 'Value']} rows={[...parsed.headers].map(([k, v]) => [<code key="k">{parsed.names.get(k)}</code>, <span key="v" style={{ wordBreak: 'break-all', fontSize: 13 }}>{v.join(' ⏎ ')}</span>])} />
          {!parsed.headers.size && <p className="muted">No headers recognised yet.</p>}
        </Panel>
      </div>
      <div>
        <Panel title="Grade">
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <Ring value={rep.score / 100} size={120} color={gradeColor(rep.grade)} label={<span style={{ fontSize: 34, fontWeight: 800, color: gradeColor(rep.grade) }}>{rep.grade}</span>} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <Stats>
                <Stat label="Score" value={`${rep.score}/100`} />
                <Stat label="Failures" value={count('fail')} tone={count('fail') ? 'bad' : 'good'} />
                <Stat label="Warnings" value={count('warn')} />
                <Stat label="Passed" value={count('pass')} tone="good" />
              </Stats>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Weighted: CSP 25, HSTS 20, framing 15, cookies 12, nosniff 10, referrer 10, permissions 8; minus penalties for version disclosure and unsafe CORS. Any failure caps the grade below A.</p>
        </Panel>
        <Panel title="Findings" actions={<><Seg value={s.filter} onChange={(filter) => set({ filter })} options={[['all', 'All'], ['issues', 'Issues only']]} /><CopyButton label="Report" text={report} /><Btn onClick={() => download('security-headers-report.txt', report())}>⬇ TXT</Btn></>}>
          {shown.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--line)' : undefined }}>
              <span style={{ flex: 'none', width: 22, height: 22, borderRadius: 11, background: COL[f.level], color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13 }}>{ICON[f.level]}</span>
              <div style={{ minWidth: 0 }}>
                <div><span className="muted" style={{ fontSize: 12, marginRight: 6 }}>{f.area}</span><b>{f.title}</b></div>
                <div style={{ fontSize: 14 }}>{f.detail}</div>
                {f.fix && <code style={{ fontSize: 12, display: 'block', marginTop: 3, wordBreak: 'break-all', color: 'var(--accent)' }}>{f.fix}</code>}
              </div>
            </div>
          ))}
          {!shown.length && <Note tone="ok">No issues. 🎉</Note>}
        </Panel>
        {rep.recommended.length > 0 && (
          <Panel title="Suggested headers to add" actions={<CopyButton text={rep.recommended.join('\n')} />}>
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{rep.recommended.join('\n')}</pre>
            <Note tone="warn">Start a new CSP as Content-Security-Policy-Report-Only and watch the reports before enforcing it: a strict policy can break inline scripts, analytics and embeds.</Note>
          </Panel>
        )}
      </div>
    </Split>
  )
}
