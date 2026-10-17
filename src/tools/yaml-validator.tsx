import { useMemo, useRef, useState } from 'react'
import { Btn, CopyButton, download, Note, Panel, Row, Seg, Select, Split, Stat, Stats, Check, useToolState } from '../kit'
import { docsToYaml, fixWhitespace, jsonErrorPos, parseYaml, stats, type Json, type YamlIssue } from './lib/yaml-validator'

const SAMPLES: Record<string, string> = {
  'Kubernetes deployment': `# A typical Kubernetes manifest
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: &labels
    app: web
    tier: frontend
spec:
  replicas: 3
  selector:
    matchLabels: *labels
  template:
    metadata:
      labels: *labels
    spec:
      containers:
        - name: nginx
          image: "nginx:1.27"
          ports:
            - containerPort: 80
          env:
            - name: GREETING
              value: >
                Hello from a folded
                block scalar.
          resources:
            limits: {cpu: 500m, memory: 256Mi}
`,
  'GitHub Actions': `name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
      - run: |
          npm ci
          npm test
`,
  'Docker Compose': `services:
  db: &service
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: example
  cache:
    <<: *service
    image: redis:7
    ports:
      - "6379:6379"
volumes:
  data: {}
`,
  'Broken example': `server:
  host: example.com
  port: 8080
	debug: true
  port: 9090
country: NO
paths:
  - /home
  -/tmp
title: "unterminated
`,
}

const DEF = { mode: 'y2j' as 'y2j' | 'j2y', yaml: SAMPLES['Kubernetes deployment'], json: '{\n  "name": "toolbox",\n  "private": true,\n  "tags": ["yaml", "json"],\n  "build": {"target": "es2022", "minify": true, "notes": "line one\\nline two\\n"}\n}\n', indent: 2, jsonIndent: 2 as 0 | 2 | 4, sortKeys: false }

function Editor({ value, onChange, issues, edRef }: { value: string; onChange: (v: string) => void; issues: YamlIssue[]; edRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const gutter = useRef<HTMLDivElement>(null)
  const lines = value.split('\n').length
  const marks = new Map<number, 'error' | 'warning'>()
  for (const i of issues) if (marks.get(i.line) !== 'error') marks.set(i.line, i.severity)
  return (
    <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', height: 440, background: 'var(--panel)' }}>
      <div ref={gutter} aria-hidden style={{ overflow: 'hidden', padding: '10px 0', minWidth: 44, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, lineHeight: '20px', color: 'var(--muted)', borderRight: '1px solid var(--line)', userSelect: 'none' }}>
        {Array.from({ length: lines }, (_, i) => {
          const m = marks.get(i + 1)
          return (
            <div key={i} style={{ padding: '0 8px', background: m === 'error' ? 'rgba(239,68,68,.22)' : m === 'warning' ? 'rgba(245,158,11,.2)' : undefined, color: m === 'error' ? 'var(--err)' : undefined, fontWeight: m ? 700 : undefined }}>
              {i + 1}
            </div>
          )
        })}
      </div>
      <textarea
        ref={edRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop
        }}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault()
            const t = e.currentTarget
            const a = t.selectionStart
            onChange(value.slice(0, a) + '  ' + value.slice(t.selectionEnd))
            requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2))
          }
        }}
        spellCheck={false}
        wrap="off"
        aria-label="Editor"
        style={{ flex: 1, border: 0, outline: 'none', resize: 'none', padding: 10, fontFamily: 'var(--mono)', fontSize: 13, lineHeight: '20px', background: 'transparent', color: 'var(--fg)', whiteSpace: 'pre', overflow: 'auto' }}
      />
    </div>
  )
}

function jumpTo(ta: HTMLTextAreaElement | null, line: number, col: number) {
  if (!ta) return
  const ls = ta.value.split('\n')
  let pos = 0
  for (let i = 0; i < line - 1 && i < ls.length; i++) pos += ls[i].length + 1
  pos += Math.max(0, col - 1)
  ta.focus()
  ta.setSelectionRange(pos, pos)
  ta.scrollTop = Math.max(0, (line - 5) * 20)
}

export default function YamlValidator() {
  const [s, set, reset] = useToolState('yaml-validator', DEF)
  const ed = useRef<HTMLTextAreaElement>(null)
  const [sample, setSample] = useState('')

  const y = useMemo(() => parseYaml(s.yaml), [s.yaml])
  const j = useMemo(() => {
    try {
      const v = JSON.parse(s.json) as Json
      return { ok: true as const, v, out: docsToYaml([v], s.indent, s.sortKeys) }
    } catch (e) {
      const msg = (e as Error).message
      const at = jsonErrorPos(s.json, msg)
      return { ok: false as const, issue: { line: at?.line ?? 1, col: at?.col ?? 1, message: msg, severity: 'error' as const } }
    }
  }, [s.json, s.indent, s.sortKeys])

  const y2j = s.mode === 'y2j'
  const errors = y.issues.filter((i) => i.severity === 'error')
  const warns = y.issues.filter((i) => i.severity === 'warning')
  const jsonOut = useMemo(() => {
    if (!y.docs.length) return ''
    const sortDeep = (v: Json): Json =>
      Array.isArray(v) ? v.map(sortDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])])) : v
    const v = y.docs.length === 1 ? y.docs[0] : y.docs
    return JSON.stringify(s.sortKeys ? sortDeep(v) : v, (_k, val) => (typeof val === 'number' && !Number.isFinite(val) ? String(val) : val), s.jsonIndent || undefined)
  }, [y.docs, s.jsonIndent, s.sortKeys])
  const st = y.docs.length ? stats(y.docs.length === 1 ? y.docs[0] : y.docs) : null
  const issues = y2j ? y.issues : j.ok ? [] : [j.issue]
  const parseErr = errors.find((e) => !/Duplicate/.test(e.message))

  return (
    <div>
      <Stats>
        {y2j ? (
          <>
            <Stat label="Status" value={errors.length ? '✗ Invalid' : '✓ Valid YAML'} tone={errors.length ? 'bad' : 'good'} sub={errors.length ? `${errors.length} error${errors.length > 1 ? 's' : ''}` : 'parses cleanly'} />
            <Stat label="Warnings" value={warns.length} tone={warns.length ? 'accent' : undefined} sub="style & portability" />
            <Stat label="Documents" value={y.docs.length} sub={`${s.yaml.split('\n').length} lines`} />
            <Stat label="Keys / items" value={st ? `${st.keys} / ${st.items}` : '—'} sub={st ? `depth ${st.depth}` : ''} />
          </>
        ) : (
          <>
            <Stat label="Status" value={j.ok ? '✓ Valid JSON' : '✗ Invalid'} tone={j.ok ? 'good' : 'bad'} />
            <Stat label="JSON size" value={`${new Blob([s.json]).size} B`} />
            <Stat label="YAML size" value={j.ok ? `${new Blob([j.out]).size} B` : '—'} />
          </>
        )}
      </Stats>
      <Split>
        <div>
          <Panel
            title={y2j ? 'YAML input' : 'JSON input'}
            actions={
              <>
                <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['y2j', 'YAML → JSON'], ['j2y', 'JSON → YAML']]} />
              </>
            }
          >
            <Editor value={y2j ? s.yaml : s.json} onChange={(v) => set(y2j ? { yaml: v } : { json: v })} issues={issues} edRef={ed} />
            <div style={{ height: 10 }} />
            <Row>
              {y2j && (
                <Select
                  label="Load a sample"
                  value={sample}
                  onChange={(k) => {
                    setSample(k)
                    if (k) set({ yaml: SAMPLES[k] })
                  }}
                  options={[['', 'Choose…'], ...Object.keys(SAMPLES).map((k) => [k, k] as [string, string])]}
                />
              )}
              <label className="k-btn" style={{ alignSelf: 'flex-end' }}>
                ⬆ Open file
                <input
                  type="file"
                  accept={y2j ? '.yml,.yaml,.txt' : '.json,application/json'}
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) set(y2j ? { yaml: await f.text() } : { json: await f.text() })
                  }}
                />
              </label>
            </Row>
            {y2j && (
              <Row>
                <Btn onClick={() => set({ yaml: fixWhitespace(s.yaml, s.indent) })} title="Tabs → spaces, remove trailing whitespace, normalize line endings">
                  Fix whitespace
                </Btn>
                <Btn kind="primary" disabled={!!parseErr || !y.docs.length} onClick={() => set({ yaml: docsToYaml(y.docs, s.indent, s.sortKeys) })} title="Re-indent and normalize style (comments are dropped)">
                  Reformat ({s.indent} spaces)
                </Btn>
                <Btn kind="ghost" onClick={reset}>Reset</Btn>
              </Row>
            )}
          </Panel>
          <Panel title={`Problems (${issues.length})`}>
            {!issues.length && <Note tone="ok">No problems found.</Note>}
            <div style={{ maxHeight: 260, overflow: 'auto' }}>
              {issues.map((i, k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => jumpTo(ed.current, i.line, i.col)}
                  style={{ display: 'flex', gap: 8, width: '100%', textAlign: 'left', padding: '6px 4px', border: 0, borderBottom: '1px solid var(--line)', background: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit' }}
                >
                  <span style={{ color: i.severity === 'error' ? 'var(--err)' : 'var(--warn)', fontWeight: 700 }}>{i.severity === 'error' ? '✗' : '⚠'}</span>
                  <span className="muted" style={{ minWidth: 64, fontFamily: 'var(--mono)' }}>
                    {i.line}:{i.col}
                  </span>
                  <span>{i.message}</span>
                </button>
              ))}
            </div>
          </Panel>
        </div>
        <div>
          <Panel
            title={y2j ? 'JSON output' : 'YAML output'}
            actions={
              y2j ? (
                <>
                  <CopyButton text={jsonOut} />
                  <Btn disabled={!jsonOut} onClick={() => download('data.json', jsonOut, 'application/json')}>⬇ .json</Btn>
                  <Btn disabled={!jsonOut} onClick={() => set({ mode: 'j2y', json: JSON.stringify(y.docs.length === 1 ? y.docs[0] : y.docs, null, 2) })}>Edit as JSON →</Btn>
                </>
              ) : (
                <>
                  <CopyButton text={j.ok ? j.out : ''} />
                  <Btn disabled={!j.ok} onClick={() => j.ok && download('data.yaml', j.out, 'application/yaml')}>⬇ .yaml</Btn>
                  <Btn disabled={!j.ok} onClick={() => j.ok && set({ mode: 'y2j', yaml: j.out })}>← Validate as YAML</Btn>
                </>
              )
            }
          >
            <Row>
              {y2j ? (
                <Seg value={String(s.jsonIndent) as '0' | '2' | '4'} onChange={(v) => set({ jsonIndent: Number(v) as 0 | 2 | 4 })} options={[['2', '2 spaces'], ['4', '4 spaces'], ['0', 'Minified']]} />
              ) : null}
              <Seg value={String(s.indent) as '2' | '4'} onChange={(v) => set({ indent: Number(v) })} options={[['2', 'YAML indent 2'], ['4', 'YAML indent 4']]} />
              <Check label="Sort keys" value={s.sortKeys} onChange={(sortKeys) => set({ sortKeys })} />
            </Row>
            {y2j && parseErr && <Note tone="err">Line {parseErr.line}, column {parseErr.col}: {parseErr.message}</Note>}
            {!y2j && !j.ok && <Note tone="err">{j.issue.message}</Note>}
            <pre className="mono" style={{ margin: 0, height: 440, overflow: 'auto', padding: 10, border: '1px solid var(--line)', borderRadius: 10, fontSize: 13, lineHeight: '20px', background: 'var(--bg)' }}>
              {y2j ? (parseErr ? '' : jsonOut) : j.ok ? j.out : ''}
            </pre>
            {y2j && y.docs.length > 1 && <Note>{y.docs.length} documents (separated by ---) are shown as a JSON array.</Note>}
          </Panel>
          <Panel title="Tips">
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
              <li>Indent with spaces only — tabs are illegal in YAML indentation. <b>Fix whitespace</b> converts them.</li>
              <li>Quote values like <code>NO</code>, <code>yes</code>, <code>on</code> or <code>0123</code>: older YAML 1.1 parsers turn them into booleans or octal numbers.</li>
              <li>A value containing <code>": "</code> or starting with <code>{"{"}</code>, <code>[</code>, <code>*</code>, <code>&amp;</code>, <code>!</code>, <code>@</code> needs quotes.</li>
              <li>Anchors (<code>&amp;name</code>), aliases (<code>*name</code>) and merge keys (<code>{'<<'}: *name</code>) are expanded in the JSON.</li>
              <li>Everything runs locally; nothing is uploaded.</li>
            </ul>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
