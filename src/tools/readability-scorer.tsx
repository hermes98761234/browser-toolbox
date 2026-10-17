import { useMemo, type ReactNode } from 'react'
import { Area, Bar, Btn, Check, CopyButton, Note, num, Panel, Row, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { analyze, freBand, isComplex, sentences, syllables } from './lib/readability-scorer'

const SAMPLES: Record<string, string> = {
  Blog: `Most people never read the instructions. They open the box, look at the pictures, and start building. That is fine for a bookshelf.

It is less fine for software documentation, where the consequences of misunderstanding a configuration option can include data loss, security vulnerabilities, or hours of troubleshooting that could have been avoided entirely if the original explanation had been written with the reader's actual circumstances in mind.

So write short sentences. Use common words. Put the important part first. If a sentence needs a second breath, split it in two.`,
  Legal: `Notwithstanding any provision of this Agreement to the contrary, the Licensee shall indemnify, defend and hold harmless the Licensor and its affiliates from and against any and all liabilities, damages, losses, costs and expenses, including reasonable attorneys' fees, arising out of or relating to any unauthorized utilization of the Licensed Materials. The obligations set forth herein shall survive termination.`,
  Children: `Tom has a red ball. He likes to throw it high. The ball goes up and up. Then it falls down. Tom runs to catch it. He is fast! His dog runs too. They play all day in the sun.`,
}

interface State { text: string; long: number; showComplex: boolean }
const DEF: State = { text: SAMPLES.Blog, long: 20, showComplex: true }

const grade = (g: number) => (!Number.isFinite(g) ? '—' : g < 1 ? 'K' : g > 16 ? 'Post-grad' : `Grade ${Math.round(g)}`)

export default function ReadabilityScorer() {
  const [s, set, reset] = useToolState('readability-scorer', DEF)
  const r = useMemo(() => analyze(s.text), [s.text])
  const ss = useMemo(() => sentences(s.text), [s.text])
  const [band, level] = freBand(r.fre)
  const grades = [r.fk, r.fog, r.smog, r.cli, r.ari].filter(Number.isFinite)
  const consensus = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : NaN
  const long = ss.filter((x) => x.words.length > s.long)
  const veryLong = ss.filter((x) => x.words.length > s.long * 1.5)

  const hard = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of ss) x.words.forEach((w, i) => { if (isComplex(w, i === 0)) m.set(w.toLowerCase(), (m.get(w.toLowerCase()) ?? 0) + 1) })
    return [...m.entries()].sort((a, b) => b[1] - a[1] || syllables(b[0]) - syllables(a[0])).slice(0, 12)
  }, [ss])

  // Inline highlighting: walk sentences, keep the gaps between them untouched.
  const preview: ReactNode[] = []
  let pos = 0
  ss.forEach((x, si) => {
    if (x.start > pos) preview.push(s.text.slice(pos, x.start))
    const n = x.words.length
    const bg = n > s.long * 1.5 ? 'color-mix(in srgb, var(--err) 22%, transparent)' : n > s.long ? 'color-mix(in srgb, var(--warn) 25%, transparent)' : undefined
    const parts: ReactNode[] = []
    if (s.showComplex) {
      let p = 0, wi = 0
      const re = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g
      let m: RegExpExecArray | null
      while ((m = re.exec(x.text))) {
        if (!/[A-Za-z]/.test(m[0])) continue
        if (isComplex(m[0], wi === 0)) {
          parts.push(x.text.slice(p, m.index))
          parts.push(<span key={m.index} style={{ textDecoration: 'underline wavy var(--accent)', textUnderlineOffset: 3 }} title={`${syllables(m[0])} syllables`}>{m[0]}</span>)
          p = m.index + m[0].length
        }
        wi++
      }
      parts.push(x.text.slice(p))
    } else parts.push(x.text)
    preview.push(<span key={si} style={{ background: bg, borderRadius: 3 }} title={`${n} words`}>{parts}</span>)
    pos = x.end
  })
  if (pos < s.text.length) preview.push(s.text.slice(pos))

  const rows: [string, number, string, string][] = [
    ['Flesch Reading Ease', r.fre, `${band} · ${level}`, '206.835 − 1.015·(words/sentences) − 84.6·(syllables/words)'],
    ['Flesch–Kincaid Grade', r.fk, grade(r.fk), '0.39·(words/sentences) + 11.8·(syllables/words) − 15.59'],
    ['Gunning Fog Index', r.fog, grade(r.fog), '0.4·[(words/sentences) + 100·(complex/words)]'],
    ['SMOG Index', r.smog, grade(r.smog), '1.043·√(polysyllables·30/sentences) + 3.1291'],
    ['Coleman–Liau Index', r.cli, grade(r.cli), '0.0588·L − 0.296·S − 15.8 (per 100 words)'],
    ['Automated Readability', r.ari, grade(r.ari), '4.71·(chars/words) + 0.5·(words/sentences) − 21.43'],
  ]

  return (
    <Split wide="left">
      <div>
        <Panel title="Your text" actions={<>
          <Select label="" value="" onChange={(k) => k && set({ text: SAMPLES[k] })} options={[['', 'Load sample…'], ...Object.keys(SAMPLES).map((k) => [k, k] as [string, string])]} />
          <Btn kind="ghost" onClick={() => set({ text: '' })}>Clear</Btn>
        </>}>
          <Area value={s.text} onChange={(text) => set({ text })} rows={9} placeholder="Paste or type English text…" />
        </Panel>
        <Panel title="Highlighted" actions={<CopyButton text={() => long.map((x) => x.text.trim()).join('\n\n')} label="Copy long sentences" />}>
          <Row>
            <Check label="Underline complex words (3+ syllables)" value={s.showComplex} onChange={(showComplex) => set({ showComplex })} />
            <label className="k-check">Long sentence over <input type="number" min={8} max={60} value={s.long} onChange={(e) => set({ long: Math.max(8, Math.min(60, Number(e.target.value) || 20)) })} style={{ width: 56 }} className="k-text" /> words</label>
          </Row>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75, fontSize: 15, padding: 12, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, maxHeight: 460, overflowY: 'auto' }}>
            {s.text.trim() ? preview : <span className="muted">Nothing to analyse yet.</span>}
          </div>
          <div className="k-legend">
            <span><i style={{ background: 'color-mix(in srgb, var(--warn) 45%, transparent)' }} />Long (&gt; {s.long} words): {long.length - veryLong.length}</span>
            <span><i style={{ background: 'color-mix(in srgb, var(--err) 40%, transparent)' }} />Very long (&gt; {Math.round(s.long * 1.5)}): {veryLong.length}</span>
            <span><i style={{ background: 'var(--accent)' }} />Complex words: {r.complex}</span>
          </div>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Flesch Reading Ease" value={num(r.fre, 1)} sub={band} tone="accent" />
          <Stat label="Grade (consensus)" value={grade(consensus)} sub={Number.isFinite(consensus) ? `avg of 5 formulas: ${num(consensus, 1)}` : undefined} />
        </Stats>
        <Panel title="Ease meter">
          <Bar value={Math.max(0, Math.min(100, r.fre))} max={100} color={r.fre >= 60 ? 'var(--ok)' : r.fre >= 30 ? 'var(--warn)' : 'var(--err)'} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginTop: 4 }} className="muted"><span>0 hard</span><span>60 plain English</span><span>100 easy</span></div>
        </Panel>
        <Panel title="All scores">
          <Table head={['Formula', 'Score', 'Meaning']} rows={rows.map(([n, v, m, f]) => [<span key="n" title={f}>{n}</span>, <b key="v">{num(v, 1)}</b>, m])} />
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Hover a formula name to see its equation. Grade levels are US school grades.</p>
        </Panel>
        <Panel title="Text statistics">
          <Table
            head={['Measure', 'Value']}
            rows={[
              ['Words', num(r.words, 0)], ['Sentences', num(r.sentences, 0)], ['Syllables', num(r.syllables, 0)],
              ['Words per sentence', num(r.avgWps, 1)], ['Syllables per word', num(r.avgSpw, 2)],
              ['Complex words (Fog)', `${r.complex} (${num((r.complex / (r.words || 1)) * 100, 1)}%)`],
              ['Reading time', `${Math.max(1, Math.round(r.minutes * 60))} s · ${num(r.minutes, 1)} min`],
              ['Speaking time', `${num(r.words / 150, 1)} min`],
            ]}
          />
        </Panel>
        {hard.length > 0 && (
          <Panel title="Hardest words">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {hard.map(([w, n]) => <span key={w} className="k-btn" style={{ cursor: 'default', fontSize: 12.5, padding: '3px 9px' }}>{w} <span className="muted">· {syllables(w)} syl{n > 1 ? ` · ×${n}` : ''}</span></span>)}
            </div>
          </Panel>
        )}
        <Note>Aim for Flesch 60+ and grade 8 or lower for a general audience. Syllables are counted with a heuristic, so scores may differ slightly from other tools.</Note>
        <Btn kind="ghost" onClick={reset}>Reset</Btn>
      </div>
    </Split>
  )
}
