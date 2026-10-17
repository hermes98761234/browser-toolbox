import { useMemo, useState } from 'react'
import { Area, Btn, Check, CopyButton, CsvButton, download, FileDrop, Note, Panel, Ring, Row, Seg, Split, Stat, Stats, useToolState } from '../kit'
import { lint, RULES, score, type Issue, type Severity } from './lib/container-file-linter'

const SAMPLES: Record<string, string> = {
  'Node (needs work)': `FROM node
MAINTAINER dev@example.com
WORKDIR app
COPY . .
RUN apt-get update
RUN apt-get install curl git
RUN npm install
RUN curl -fsSL https://example.com/install.sh | bash
ENV API_TOKEN=sk_live_123456
EXPOSE 3000
CMD npm start
`,
  'Python (decent)': `FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \\
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
RUN useradd -m app
USER app
EXPOSE 8000
CMD ["gunicorn", "-b", "0.0.0.0:8000", "app:app"]
`,
  'Go multi-stage (good)': `# syntax=docker/dockerfile:1
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot@sha256:8dd8d3ca2cf283383304fd45a5c9c74d5f2cd9da8d3b077d720e264880077c65
COPY --from=build /out/server /server
USER nonroot:nonroot
EXPOSE 8080
HEALTHCHECK CMD ["/server", "-health"]
ENTRYPOINT ["/server"]
`,
}

const DEF = { text: SAMPLES['Node (needs work)'], disabled: [] as string[], filter: 'all' as 'all' | Severity }

const SEV: Record<Severity, { c: string; icon: string }> = {
  error: { c: 'var(--err)', icon: '✖' },
  warning: { c: 'var(--warn)', icon: '▲' },
  info: { c: 'var(--accent)', icon: 'ℹ' },
}

export default function ContainerFileLinter() {
  const [s, set, reset] = useToolState('container-file-linter', DEF)
  const [sel, setSel] = useState<number | null>(null)
  const issues = useMemo(() => lint(s.text, s.disabled), [s.text, s.disabled])
  const sc = score(issues)
  const count = (v: Severity) => issues.filter((i) => i.severity === v).length
  const shown = s.filter === 'all' ? issues : issues.filter((i) => i.severity === s.filter)
  const byLine = new Map<number, Issue[]>()
  for (const i of issues) byLine.set(i.line, [...(byLine.get(i.line) ?? []), i])
  const lines = s.text.replace(/\r\n?/g, '\n').split('\n')
  const groups = [...new Set(RULES.map((r) => r.group))]
  const md = () => `# Dockerfile lint (score ${sc}/100)\n\n` + issues.map((i) => `- **L${i.line}** [${i.severity}] \`${i.rule}\` ${i.message} — _${i.fix}_`).join('\n')
  const toggle = (id: string, on: boolean) => set({ disabled: on ? s.disabled.filter((d) => d !== id) : [...s.disabled, id] })

  return (
    <Split>
      <div>
        <Panel
          title="Dockerfile / Containerfile"
          actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}
        >
          <Row>
            {Object.keys(SAMPLES).map((k) => (
              <Btn key={k} onClick={() => set({ text: SAMPLES[k] })}>{k}</Btn>
            ))}
          </Row>
          <div style={{ marginTop: 10 }}>
            <Area value={s.text} onChange={(text) => set({ text })} rows={18} mono placeholder="Paste a Dockerfile…" />
          </div>
          <div style={{ marginTop: 10 }}>
            <FileDrop onFiles={async ([f]) => set({ text: await f.text() })} label="Open a Dockerfile / Containerfile" />
          </div>
        </Panel>
        <Panel title="Rules">
          {groups.map((g) => (
            <div key={g} style={{ marginBottom: 10 }}>
              <b className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{g}</b>
              {RULES.filter((r) => r.group === g).map((r) => (
                <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Check label={r.title} value={!s.disabled.includes(r.id)} onChange={(on) => toggle(r.id, on)} />
                  <span style={{ color: SEV[r.severity].c, fontSize: 12 }}>{SEV[r.severity].icon}</span>
                </div>
              ))}
            </div>
          ))}
          <Row>
            <Btn kind="ghost" onClick={() => set({ disabled: [] })}>Enable all</Btn>
            <Btn kind="ghost" onClick={() => set({ disabled: RULES.filter((r) => r.severity === 'info').map((r) => r.id) })}>Hide info rules</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Panel title="Summary">
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <Ring value={sc / 100} label={<b>{sc}</b>} color={sc >= 85 ? 'var(--ok)' : sc >= 60 ? 'var(--warn)' : 'var(--err)'} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <Stats>
                <Stat label="Errors" value={count('error')} tone={count('error') ? 'bad' : 'good'} />
                <Stat label="Warnings" value={count('warning')} />
                <Stat label="Suggestions" value={count('info')} />
              </Stats>
            </div>
          </div>
          {issues.length === 0 && <Note tone="ok">No problems found with the enabled rules. ✓</Note>}
        </Panel>
        <Panel
          title={`Findings (${shown.length})`}
          actions={
            <>
              <CopyButton text={md} label="Markdown" />
              <CsvButton name="dockerfile-lint.csv" rows={() => [['line', 'severity', 'rule', 'message', 'fix'], ...issues.map((i) => [i.line, i.severity, i.rule, i.message, i.fix])]} />
              <Btn onClick={() => download('dockerfile-lint.json', JSON.stringify({ score: sc, issues }, null, 2), 'application/json')}>⬇ JSON</Btn>
            </>
          }
        >
          <Seg value={s.filter} onChange={(filter) => set({ filter })} options={[['all', 'All'], ['error', 'Errors'], ['warning', 'Warnings'], ['info', 'Info']]} />
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {shown.map((i, k) => (
              <button
                type="button"
                key={k}
                onClick={() => setSel(i.line)}
                style={{ textAlign: 'left', border: '1px solid var(--line)', borderLeft: `4px solid ${SEV[i.severity].c}`, borderRadius: 8, padding: '8px 10px', background: sel === i.line ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ color: SEV[i.severity].c }}>{SEV[i.severity].icon}</span>
                  <b>Line {i.line}</b>
                  <code className="muted" style={{ fontSize: 12 }}>{i.rule}</code>
                </div>
                <div>{i.message}</div>
                <div className="muted" style={{ fontSize: 13 }}>→ {i.fix}</div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Annotated file">
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12.5, overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
            {lines.map((l, i) => {
              const hit = byLine.get(i + 1)
              const worst = hit?.find((x) => x.severity === 'error') ?? hit?.find((x) => x.severity === 'warning') ?? hit?.[0]
              return (
                <div
                  key={i}
                  title={hit?.map((x) => `${x.rule}: ${x.message}`).join('\n')}
                  onClick={() => hit && setSel(i + 1)}
                  style={{ display: 'flex', whiteSpace: 'pre', background: sel === i + 1 ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : worst ? `color-mix(in srgb, ${SEV[worst.severity].c} 9%, transparent)` : undefined, cursor: hit ? 'pointer' : undefined }}
                >
                  <span className="muted" style={{ width: 34, textAlign: 'right', paddingRight: 8, userSelect: 'none', borderRight: '1px solid var(--line)' }}>{i + 1}</span>
                  <span style={{ width: 18, textAlign: 'center', color: worst ? SEV[worst.severity].c : undefined }}>{worst ? SEV[worst.severity].icon : ''}</span>
                  <span>{l || ' '}</span>
                </div>
              )
            })}
          </div>
        </Panel>
        <Note>Everything runs locally. Rules follow Docker's best-practice guide: pin base images, keep cache-friendly layer order (manifests before sources), clean package caches in the same RUN, and drop root.</Note>
      </div>
    </Split>
  )
}
