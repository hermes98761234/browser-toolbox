import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Btn, Check, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, useToolState } from '../kit'
import {
  answer, check, DEFAULT_TABLES, denomLabel, generate, prompt, TOPIC_INFO, type Currency, type Grade, type Prob, type Topic,
} from './lib/math-worksheet-generator'

const TOPICS = Object.keys(TOPIC_INFO) as Topic[]
const INK = '#1e293b'

// ---------- pictures ----------

function Bond({ p, show }: { p: Extract<Prob, { k: 'bond' }>; show: boolean }) {
  const v = (which: 'whole' | 'a' | 'b', n: number) => (p.hide === which && !show ? '' : String(n))
  const c = (x: number, y: number, r: number, t: string, hidden: boolean) => (
    <g>
      <circle cx={x} cy={y} r={r} fill={hidden ? '#fff' : '#eef2ff'} stroke={INK} strokeWidth={1.5} />
      <text x={x} y={y + 5} textAnchor="middle" fontSize={t.length > 3 ? 12 : 15} fontWeight={700} fill={hidden && show ? '#dc2626' : INK}>{t}</text>
    </g>
  )
  return (
    <svg viewBox="0 0 120 92" width={120} height={92}>
      <line x1={60} y1={24} x2={28} y2={68} stroke={INK} strokeWidth={1.5} />
      <line x1={60} y1={24} x2={92} y2={68} stroke={INK} strokeWidth={1.5} />
      {c(60, 22, 20, v('whole', p.whole), p.hide === 'whole')}
      {c(28, 70, 18, v('a', p.a), p.hide === 'a')}
      {c(92, 70, 18, v('b', p.b), p.hide === 'b')}
    </svg>
  )
}

function Clock({ h, m, size = 110, hands = true }: { h: number; m: number; size?: number; hands?: boolean }) {
  const ha = ((h % 12) + m / 60) * 30, ma = m * 6
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      <circle cx={50} cy={50} r={46} fill="#fff" stroke={INK} strokeWidth={2.5} />
      {Array.from({ length: 60 }, (_, i) => {
        const a = (i * 6 * Math.PI) / 180, r1 = i % 5 ? 42 : 39
        return <line key={i} x1={50 + r1 * Math.sin(a)} y1={50 - r1 * Math.cos(a)} x2={50 + 45 * Math.sin(a)} y2={50 - 45 * Math.cos(a)} stroke={INK} strokeWidth={i % 5 ? 0.6 : 1.6} />
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const a = ((i + 1) * 30 * Math.PI) / 180
        return <text key={i} x={50 + 32 * Math.sin(a)} y={50 - 32 * Math.cos(a) + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={INK}>{i + 1}</text>
      })}
      {hands && <>
        <line x1={50} y1={50} x2={50 + 20 * Math.sin((ha * Math.PI) / 180)} y2={50 - 20 * Math.cos((ha * Math.PI) / 180)} stroke={INK} strokeWidth={4} strokeLinecap="round" />
        <line x1={50} y1={50} x2={50 + 34 * Math.sin((ma * Math.PI) / 180)} y2={50 - 34 * Math.cos((ma * Math.PI) / 180)} stroke="#2563eb" strokeWidth={2.5} strokeLinecap="round" />
      </>}
      <circle cx={50} cy={50} r={2.5} fill={INK} />
    </svg>
  )
}

function Blocks({ p }: { p: Extract<Prob, { k: 'place' }> }) {
  const items: ReactNode[] = []
  let x = 2
  const U = 4.2
  for (let i = 0; i < p.th; i++, x += 50) {
    // isometric thousand cube
    items.push(<g key={`k${i}`} transform={`translate(${x} 4)`} stroke={INK} strokeWidth={0.8}><path d="M0,12 L12,0 L46,0 L34,12Z" fill="#fde68a" /><path d="M34,12 L46,0 L46,34 L34,46Z" fill="#fcd34d" /><rect x={0} y={12} width={34} height={34} fill="#fef3c7" /></g>)
  }
  for (let i = 0; i < p.h; i++, x += 10 * U + 4) {
    items.push(<g key={`h${i}`}>{Array.from({ length: 100 }, (_, j) => <rect key={j} x={x + (j % 10) * U} y={4 + Math.floor(j / 10) * U} width={U} height={U} fill="#bfdbfe" stroke={INK} strokeWidth={0.3} />)}</g>)
  }
  for (let i = 0; i < p.t; i++, x += U + 3) {
    items.push(<g key={`t${i}`}>{Array.from({ length: 10 }, (_, j) => <rect key={j} x={x} y={4 + j * U} width={U} height={U} fill="#bbf7d0" stroke={INK} strokeWidth={0.3} />)}</g>)
  }
  x += 3
  for (let i = 0; i < p.o; i++) items.push(<rect key={`o${i}`} x={x + (i % 3) * (U + 2)} y={4 + Math.floor(i / 3) * (U + 2)} width={U} height={U} fill="#fecaca" stroke={INK} strokeWidth={0.3} />)
  x += 3 * (U + 2)
  const w = Math.min(300, (x + 4) * 2)
  return <svg viewBox={`0 0 ${x + 4} 52`} width={w} height={(w / (x + 4)) * 52}>{items}</svg>
}

const COIN: Record<number, [string, number]> = { 1: ['#c2773d', 15], 2: ['#c2773d', 16.5], 5: ['#cbd5e1', 17], 10: ['#e2e8f0', 15.5], 20: ['#fcd34d', 17.5], 25: ['#cbd5e1', 19], 50: ['#fcd34d', 19.5], 100: ['#fbbf24', 20], 200: ['#e2e8f0', 21] }

function Money({ p }: { p: Extract<Prob, { k: 'money' }> }) {
  const pos: number[] = []
  let w = 2
  for (const v of p.items) {
    pos.push(w)
    w += v >= 500 ? 62 : 2 * (COIN[v]?.[1] ?? 18) + 3
  }
  w += 2
  const parts = p.items.map((v, i) => {
    const x = pos[i]
    if (v >= 500) {
      return <g key={i} transform={`translate(${x} 8)`}><rect width={58} height={30} rx={3} fill={v === 500 ? '#bbf7d0' : '#bfdbfe'} stroke={INK} strokeWidth={0.8} /><circle cx={29} cy={15} r={9} fill="none" stroke={INK} strokeWidth={0.5} /><text x={29} y={19} textAnchor="middle" fontSize={10} fontWeight={700} fill={INK}>{denomLabel(v, p.cur)}</text></g>
    }
    const [col, r] = COIN[v] ?? ['#e2e8f0', 18]
    return <g key={i}><circle cx={x + r} cy={24} r={r} fill={col} stroke={INK} strokeWidth={0.8} /><circle cx={x + r} cy={24} r={r - 3} fill="none" stroke={INK} strokeWidth={0.3} /><text x={x + r} y={28} textAnchor="middle" fontSize={r > 17 ? 10 : 9} fontWeight={700} fill={INK}>{denomLabel(v, p.cur)}</text></g>
  })
  return <svg viewBox={`0 0 ${w} 48`} width={Math.min(330, w * 1.1)} height={48 * Math.min(1.1, 330 / w)}>{parts}</svg>
}

function Problem({ p, show }: { p: Prob; show: boolean }) {
  const ans = <b style={{ color: '#dc2626' }}>{answer(p)}</b>
  const blank = <span style={{ display: 'inline-block', minWidth: 54, borderBottom: `1.5px solid ${INK}`, textAlign: 'center' }}>{show ? ans : '\u00a0'}</span>
  switch (p.k) {
    case 'bond': return <Bond p={p} show={show} />
    case 'times': return <span style={{ fontSize: 20 }}>{p.div ? `${p.a * p.b} ÷ ${p.a}` : `${p.a} × ${p.b}`} = {blank}</span>
    case 'place': return <div><Blocks p={p} /><div>= {blank}</div></div>
    case 'clock': return <div style={{ textAlign: 'center' }}><Clock h={p.h} m={p.m} /><div>{blank}</div></div>
    case 'money': return <div><Money p={p} /><div>Total: {blank}</div></div>
    case 'seq': return (
      <span style={{ fontSize: 18, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {p.items.map((v, i) => (
          <span key={i} style={{ minWidth: 40, height: 34, border: `1.5px solid ${INK}`, borderRadius: v === null ? 6 : 17, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: v === null ? '#fff' : '#f1f5f9', padding: '0 4px' }}>
            {v === null ? (show ? <b style={{ color: '#dc2626' }}>{p.full[i]}</b> : '') : v}
          </span>
        ))}
      </span>
    )
  }
}

const COLS: Record<Topic, number> = { bond: 4, times: 4, place: 2, clock: 4, money: 2, seq: 2 }

function Sheet({ title, sets, show, grade }: { title: string; sets: [Topic, Prob[]][]; show: boolean; grade: Grade }) {
  let n = 0
  return (
    <div className="mw-sheet" style={{ background: '#fff', color: INK, padding: 24, borderRadius: 8, boxShadow: '0 1px 4px #0002', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, borderBottom: `2px solid ${INK}`, paddingBottom: 6 }}>
        <h2 style={{ margin: 0, color: INK }}>{title}{show ? ' — Answer key' : ''}</h2>
        <span>Name: ______________ &nbsp; Date: ________ &nbsp; {grade === 'K' ? 'Kindergarten' : `Grade ${grade}`}</span>
      </div>
      {sets.map(([t, ps]) => (
        <section key={t} className="mw-sec" style={{ marginTop: 14, breakInside: 'avoid' }}>
          <h3 style={{ margin: '0 0 2px', color: INK }}>{TOPIC_INFO[t][0]}</h3>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#475569' }}>{TOPIC_INFO[t][1]}</p>
          <div className="mw-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${COLS[t] === 4 ? 140 : 280}px, 1fr))`, gap: '14px 18px' }}>
            {ps.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', breakInside: 'avoid' }}>
                <span style={{ fontSize: 12, color: '#64748b', minWidth: 18 }}>{++n}.</span>
                <Problem p={p} show={show} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function printSheets(html: string, title: string) {
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;width:0;height:0;border:0'
  document.body.appendChild(f)
  const d = f.contentDocument!
  d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title><style>@page{margin:12mm}body{margin:0;font-family:system-ui,sans-serif}.mw-sheet{box-shadow:none!important;padding:0!important}.mw-sheet+.mw-sheet{break-before:page}.mw-sec{break-inside:avoid}</style></head><body>${html}</body></html>`)
  d.close()
  setTimeout(() => {
    f.contentWindow!.print()
    setTimeout(() => f.remove(), 1500)
  }, 150)
}

// ---------- drill ----------

interface Best { [k: string]: { score: number; acc: number; date: string } }

function Drill({ grade, tables, cur, topics, best, saveBest }: { grade: Grade; tables: number[]; cur: Currency; topics: Topic[]; best: Best; saveBest: (k: string, v: Best[string]) => void }) {
  const [dTopic, setDTopic] = useState<Topic>(topics.includes('times') ? 'times' : topics[0] ?? 'times')
  const [secs, setSecs] = useState(60)
  const [run, setRun] = useState<{ ps: Prob[]; i: number; start: number; log: { p: Prob; given: string; ok: boolean }[] } | null>(null)
  const [now, setNow] = useState(0)
  const [input, setInput] = useState('')
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null)
  const inp = useRef<HTMLInputElement>(null)
  const left = run ? Math.max(0, secs - (now - run.start) / 1000) : secs
  const over = !!run && left <= 0
  const key = `${dTopic}-${grade}-${secs}`

  useEffect(() => {
    if (!run || over) return
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [run, over])

  const correct = run ? run.log.filter((l) => l.ok).length : 0
  const acc = run && run.log.length ? correct / run.log.length : 0
  useEffect(() => {
    if (over && run && (!best[key] || correct > best[key].score)) saveBest(key, { score: correct, acc, date: new Date().toISOString().slice(0, 10) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])

  const start = () => {
    const t = Date.now()
    setRun({ ps: generate(dTopic, grade, 200, t % 1e9, { tables, cur, division: grade === '3' }), i: 0, start: t, log: [] })
    setNow(t)
    setInput('')
    setTimeout(() => inp.current?.focus(), 50)
  }
  const submit = () => {
    if (!run || over || !input.trim()) return
    const p = run.ps[run.i]
    const ok = check(p, input)
    setFlash(ok ? 'ok' : 'bad')
    setTimeout(() => setFlash(null), 250)
    setRun({ ...run, i: run.i + 1, log: [...run.log, { p, given: input, ok }] })
    setInput('')
  }
  const p = run?.ps[run.i]
  return (
    <Panel title="⏱ Timed drill (on screen)">
      <Row>
        <Select label="Topic" value={dTopic} onChange={(v) => { setDTopic(v); setRun(null) }} options={TOPICS.map((t) => [t, TOPIC_INFO[t][0]] as [Topic, string])} />
        <Select label="Time" value={secs} onChange={(v) => { setSecs(v); setRun(null) }} options={[[30, '30 s'], [60, '1 min'], [120, '2 min'], [180, '3 min']]} />
      </Row>
      {!run || over ? (
        <div>
          {over && run && (
            <>
              <Stats>
                <Stat label="Correct" value={correct} tone="good" />
                <Stat label="Accuracy" value={`${Math.round(acc * 100)}%`} />
                <Stat label="Per minute" value={Math.round((correct / secs) * 60)} />
              </Stats>
              {run.log.some((l) => !l.ok) && (
                <p style={{ fontSize: 14 }}>Review: {run.log.filter((l) => !l.ok).map((l, i) => <span key={i} style={{ marginRight: 12 }}>{prompt(l.p)} → <b style={{ color: 'var(--ok)' }}>{answer(l.p)}</b> <s className="muted">{l.given}</s></span>)}</p>
              )}
            </>
          )}
          {best[key] && <p className="muted">Personal best: {best[key].score} correct ({Math.round(best[key].acc * 100)}%) on {best[key].date}</p>}
          <Btn kind="primary" onClick={start}>{over ? 'Go again' : 'Start drill'}</Btn>
        </div>
      ) : p ? (
        <div style={{ textAlign: 'center', padding: 8, borderRadius: 12, transition: 'background .2s', background: flash === 'ok' ? 'color-mix(in srgb, var(--ok) 20%, transparent)' : flash === 'bad' ? 'color-mix(in srgb, var(--err) 20%, transparent)' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>⏱ {Math.ceil(left)} s</b><span>✓ {correct} / {run.log.length}</span></div>
          <div style={{ background: '#fff', color: INK, borderRadius: 10, padding: 10, margin: '8px auto', display: 'inline-block' }}>
            {p.k === 'clock' ? <Clock h={p.h} m={p.m} size={150} /> : p.k === 'money' ? <Money p={p} /> : p.k === 'place' ? <Blocks p={p} /> : null}
            <div style={{ fontSize: 28, fontWeight: 700 }}>{p.k === 'place' ? 'What number?' : prompt(p)}</div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); submit() }}>
            <input ref={inp} value={input} onChange={(e) => setInput(e.target.value)} inputMode={p.k === 'clock' || p.k === 'seq' || p.k === 'money' ? 'text' : 'numeric'} placeholder={p.k === 'clock' ? 'h:mm' : p.k === 'seq' ? 'a, b' : 'answer'} className="k-text" style={{ fontSize: 24, width: 170, textAlign: 'center', padding: 6, margin: '0 auto 8px', display: 'block' }} aria-label="Answer" />
            <div><Btn kind="primary" onClick={submit}>Enter ↵</Btn> <Btn kind="ghost" onClick={() => setRun(null)}>Stop</Btn></div>
          </form>
        </div>
      ) : null}
    </Panel>
  )
}

// ---------- main ----------

interface State {
  title: string
  grade: Grade
  topics: Topic[]
  count: number
  seed: number
  tables: number[]
  cur: Currency
  division: boolean
  showKey: boolean
  best: Best
}

const DEF: State = { title: 'Math practice', grade: '1', topics: ['bond', 'clock', 'money', 'place', 'seq'], count: 6, seed: 2026, tables: [], cur: 'USD', division: false, showKey: false, best: {} }

export default function MathWorksheetGenerator() {
  const [s, set, reset] = useToolState('math-worksheet-generator', DEF)
  const [mode, setMode] = useState<'sheet' | 'drill'>('sheet')
  const sheetRef = useRef<HTMLDivElement>(null)
  const keyRef = useRef<HTMLDivElement>(null)
  const tables = s.tables.length ? s.tables : DEFAULT_TABLES[s.grade]
  const count = Math.max(1, Math.min(24, Math.round(s.count)))
  const sets: [Topic, Prob[]][] = TOPICS.filter((t) => s.topics.includes(t)).map((t) => [t, generate(t, s.grade, count, s.seed, { tables, cur: s.cur, division: s.division })])
  const toggleTopic = (t: Topic, on: boolean) => set({ topics: on ? [...s.topics, t] : s.topics.filter((x) => x !== t) })
  const toggleTable = (n: number) => {
    const cur = s.tables.length ? s.tables : DEFAULT_TABLES[s.grade]
    const next = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort((a, b) => a - b)
    set({ tables: next.length ? next : cur })
  }
  return (
    <Split>
      <div>
        <Panel title="Worksheet" actions={<Seg value={mode} onChange={setMode} options={[['sheet', '📄 Printable'], ['drill', '⏱ Drill']]} />}>
          <Txt label="Title" value={s.title} onChange={(title) => set({ title })} />
          <Seg value={s.grade} onChange={(grade) => set({ grade, tables: [] })} options={[['K', 'Kinder'], ['1', 'Grade 1'], ['2', 'Grade 2'], ['3', 'Grade 3']]} label="Level" />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0' }}>
            {s.grade === 'K' ? 'Bonds to 10, o’clock & half past, tens and ones, small coins.' : s.grade === '1' ? 'Bonds to 20, quarter hours, numbers to 100, coins to $1.' : s.grade === '2' ? 'Bonds to 100, 5-minute times, hundreds, money to $5.' : 'Bonds to 1000, times to the minute, thousands, notes and coins.'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {TOPICS.map((t) => <Check key={t} label={TOPIC_INFO[t][0]} value={s.topics.includes(t)} onChange={(on) => toggleTopic(t, on)} />)}
          </div>
          <Row>
            <Num label="Problems per topic" value={s.count} min={1} max={24} step={1} onChange={(c) => c >= 1 && set({ count: c })} />
            <Num label="Seed" value={s.seed} step={1} onChange={(seed) => set({ seed: Math.round(seed) })} />
          </Row>
          <Row>
            <Btn onClick={() => set({ seed: Math.floor(Math.random() * 100000) })}>🎲 New problems</Btn>
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 12 }}>The same seed always gives the same sheet — note it to reprint a sheet later.</p>
        </Panel>
        <Panel title="Options">
          <b style={{ fontSize: 14 }}>Times tables</b>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '6px 0' }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" onClick={() => toggleTable(n)} aria-pressed={tables.includes(n)}
                style={{ width: 34, height: 30, borderRadius: 8, border: '1px solid var(--line)', background: tables.includes(n) ? 'var(--accent)' : 'transparent', color: tables.includes(n) ? '#fff' : 'inherit', fontWeight: 700 }}>{n}</button>
            ))}
          </div>
          <Check label="Include division facts" value={s.division} onChange={(division) => set({ division })} />
          <Select label="Money" value={s.cur} onChange={(cur) => set({ cur })} options={[['USD', 'US dollars & cents'], ['EUR', 'Euro'], ['GBP', 'Pounds & pence']]} />
        </Panel>
      </div>
      <div>
        {mode === 'drill' ? (
          <Drill grade={s.grade} tables={tables} cur={s.cur} topics={s.topics} best={s.best} saveBest={(k, v) => set((st) => ({ ...st, best: { ...st.best, [k]: v } }))} />
        ) : (
          <Panel
            title={`${sets.reduce((a, [, ps]) => a + ps.length, 0)} problems`}
            actions={
              <>
                <Check label="Show answers" value={s.showKey} onChange={(showKey) => set({ showKey })} />
                <Btn kind="primary" onClick={() => printSheets((sheetRef.current?.innerHTML ?? '') + (keyRef.current?.innerHTML ?? ''), s.title)}>🖨 Print + answer key</Btn>
                <Btn onClick={() => printSheets(sheetRef.current?.innerHTML ?? '', s.title)}>Print sheet only</Btn>
              </>
            }
          >
            {!sets.length ? <Note tone="warn">Pick at least one topic.</Note> : (
              <>
                <div ref={sheetRef}><Sheet title={s.title} sets={sets} show={s.showKey} grade={s.grade} /></div>
                <div ref={keyRef} style={{ display: 'none' }}><Sheet title={s.title} sets={sets} show grade={s.grade} /></div>
              </>
            )}
            <p className="muted" style={{ fontSize: 12 }}>Printing puts the answer key on its own page. Use “Save as PDF” in the print dialog to keep a copy. Clock answers: hours:minutes (e.g. 3:05).</p>
          </Panel>
        )}
      </div>
    </Split>
  )
}

