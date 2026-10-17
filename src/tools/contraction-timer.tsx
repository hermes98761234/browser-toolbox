import { useEffect, useRef, useState } from 'react'
import { Btn, Check, CsvButton, LineChart, Note, Panel, Row, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { RULES, checkRule, intervals, mmss, summary, type Contraction } from './lib/contraction-timer'

type Level = NonNullable<Contraction['level']>
interface State { list: Contraction[]; active: number | null; rule: string; level: Level; keepAwake: boolean; sample: boolean }

function sample(): Contraction[] {
  const now = Date.now()
  const gaps = [9, 8.5, 7, 7.5, 6, 6, 5.5, 5, 4.5, 5, 4.5, 4] // minutes between starts, getting closer
  const durs = [38, 42, 45, 50, 48, 55, 58, 62, 60, 65, 64, 70]
  let t = now - gaps.reduce((a, g) => a + g, 0) * 60000 - 3 * 60000
  const out: Contraction[] = []
  gaps.forEach((g, i) => {
    out.push({ start: t, end: t + durs[i] * 1000, level: i < 4 ? 'mild' : i < 9 ? 'moderate' : 'strong' })
    t += g * 60000
  })
  return out
}
const DEF: State = { list: sample(), active: null, rule: '511', level: 'moderate', keepAwake: true, sample: true }
const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const COLORS: Record<Level, string> = { mild: 'var(--ok)', moderate: 'var(--warn)', strong: 'var(--err)' }

export default function ContractionTimer() {
  const [s, set] = useToolState('contraction-timer', DEF)
  const [now, setNow] = useState(() => Date.now())
  const [lock, setLock] = useState<'off' | 'on' | 'unsupported'>('off')
  const sentinel = useRef<{ release: () => Promise<void> } | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), s.active ? 200 : 1000)
    return () => clearInterval(id)
  }, [s.active])

  // keep the screen on while timing
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
    if (!s.keepAwake) return
    if (!wl) {
      const id = setTimeout(() => setLock('unsupported'), 0)
      return () => clearTimeout(id)
    }
    let alive = true
    const get = () => wl.request('screen').then((x) => { if (alive) { sentinel.current = x; setLock('on') } else void x.release() }).catch(() => setLock('off'))
    void get()
    const vis = () => { if (document.visibilityState === 'visible') void get() }
    document.addEventListener('visibilitychange', vis)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', vis)
      void sentinel.current?.release()
      sentinel.current = null
      setLock('off')
    }
  }, [s.keepAwake])

  const press = () => {
    const t = Date.now()
    if (s.active) set({ list: [...s.list, { start: s.active, end: t, level: s.level }], active: null })
    else set(s.sample ? { list: [], sample: false, active: t } : { active: t })
    navigator.vibrate?.(30)
  }

  const list = [...s.list].sort((a, b) => a.start - b.start)
  const sum = summary(list, now)
  const rule = RULES[s.rule] ?? RULES['511']
  const rr = checkRule(list, rule.r)
  const iv = intervals(list)
  const last = list[list.length - 1]
  const since = s.active ? (now - s.active) / 1000 : last ? (now - last.end) / 1000 : NaN
  const t0 = list[0]?.start ?? 0
  const big = s.active !== null

  return (
    <Split wide="left">
      <div>
        {s.sample && (
          <Note>
            Showing <b>sample data</b> so you can see how it works. Pressing Start clears it. <Btn kind="ghost" onClick={() => set({ list: [], sample: false })}>Clear now</Btn>
          </Note>
        )}
        <Panel>
          <div style={{ display: 'grid', placeItems: 'center', gap: 12, padding: '6px 0' }}>
            <button
              type="button"
              onClick={press}
              aria-label={big ? 'Contraction ended' : 'Contraction started'}
              style={{
                width: 'min(78vw, 300px)', height: 'min(78vw, 300px)', borderRadius: '50%', border: 'none', cursor: 'pointer', color: '#fff',
                background: big ? 'radial-gradient(circle at 35% 30%, #fb7185, #be123c)' : 'radial-gradient(circle at 35% 30%, #818cf8, #4338ca)',
                boxShadow: big ? '0 0 0 12px color-mix(in srgb, #e11d48 22%, transparent)' : '0 10px 30px rgba(67,56,202,.35)', fontSize: 26, fontWeight: 800, transition: 'background .2s, box-shadow .2s',
              }}
            >
              {big ? <>STOP<br /><span style={{ fontSize: 46 }}>{mmss(since)}</span><br /><span style={{ fontSize: 15, fontWeight: 600 }}>tap when it ends</span></> : <>START<br /><span style={{ fontSize: 15, fontWeight: 600 }}>tap when a contraction begins</span></>}
            </button>
            {!big && last && <p className="muted" style={{ margin: 0 }}>Last one ended {mmss(since)} ago</p>}
            <Row>
              <span className="muted">Intensity:</span>
              {(['mild', 'moderate', 'strong'] as Level[]).map((l) => (
                <Btn key={l} kind={s.level === l ? 'primary' : 'normal'} onClick={() => set({ level: l })}>{l}</Btn>
              ))}
              {big && <Btn kind="ghost" onClick={() => set({ active: null })}>Cancel</Btn>}
            </Row>
          </div>
        </Panel>
        <Stats>
          <Stat label="Last duration" value={mmss(sum.lastDur)} />
          <Stat label="Last interval" value={mmss(sum.lastGap)} sub="start to start" />
          <Stat label="Avg duration (1 h)" value={mmss(sum.avgDur)} />
          <Stat label="Avg interval (1 h)" value={mmss(sum.avgGap)} sub={`${sum.count} in the last hour`} />
        </Stats>
        <Panel title="Pattern over time">
          {list.length > 1 ? (
            <LineChart
              series={[
                { name: 'Interval (min)', points: list.map((c, i) => [(c.start - t0) / 60000, iv[i] === null ? NaN : (iv[i] as number) / 60] as [number, number]).filter((p) => Number.isFinite(p[1])), color: '#6366f1' },
                { name: 'Duration (min)', points: list.map((c) => [(c.start - t0) / 60000, (c.end - c.start) / 60000] as [number, number]), color: '#ef4444' },
              ]}
              xLabel="minutes since first contraction" fx={(v) => v.toFixed(0)} fy={(v) => v.toFixed(1)} height={220}
            />
          ) : <p className="muted">Time two or more contractions to see the trend.</p>}
        </Panel>
      </div>
      <div>
        <Panel title="When to call">
          <Select label="Rule" value={s.rule} onChange={(rule) => set({ rule })} options={Object.entries(RULES).map(([k, v]) => [k, v.name] as const)} />
          {rr.met ? (
            <Note tone="err"><b>Rule met:</b> contractions about every {rule.r.gap} min or less, lasting {rule.r.dur / 60} min, for {Math.round(rr.minutes)} min. Call your midwife, doctor or birth unit now.</Note>
          ) : (
            <Note tone={rr.count > 2 ? 'warn' : 'info'}>
              {rr.count > 1 ? `Current run: ${rr.count} contractions over ${Math.round(rr.minutes)} min that fit the pattern (needs ${rule.r.span} min).` : `Not met: needs contractions ≤ ${rule.r.gap} min apart, ≥ ${rule.r.dur} s long, for ${rule.r.span} min.`}
            </Note>
          )}
          <p className="muted" style={{ fontSize: 13 }}>Always follow the advice of your own care provider. Call straight away for bleeding, waters breaking (especially green or brown), reduced baby movements, severe constant pain or fever, whatever the timing.</p>
          <Check label={`Keep screen awake ${lock === 'on' ? '(active)' : lock === 'unsupported' ? '(not supported here)' : ''}`} value={s.keepAwake} onChange={(keepAwake) => set({ keepAwake })} />
        </Panel>
        <Panel title={`Log (${list.length})`} actions={<>
          <CsvButton name="contractions.csv" rows={() => [['#', 'Start', 'End', 'Duration (s)', 'Interval (s)', 'Intensity'], ...list.map((c, i) => [i + 1, new Date(c.start).toISOString(), new Date(c.end).toISOString(), Math.round((c.end - c.start) / 1000), iv[i] === null ? '' : Math.round(iv[i] as number), c.level ?? ''])]} />
          <Btn kind="ghost" onClick={() => { if (confirm('Delete all contractions?')) set({ list: [], active: null, sample: false }) }}>Clear</Btn>
        </>}>
          <Table
            head={['#', 'Start', 'Duration', 'Interval', 'Intensity', '']}
            rows={list.map((c, i) => ({ c, i })).reverse().map(({ c, i }) => [
              i + 1, time(c.start), <b key="d">{mmss((c.end - c.start) / 1000)}</b>, iv[i] === null ? '—' : mmss(iv[i] as number),
              <span key="l" style={{ color: c.level ? COLORS[c.level] : undefined, fontWeight: 600 }}>{c.level ?? '—'}</span>,
              <Btn key="x" kind="ghost" title="Delete" onClick={() => set({ list: s.list.filter((x) => x !== c) })}>✕</Btn>,
            ])}
            max={30}
          />
        </Panel>
      </div>
    </Split>
  )
}
