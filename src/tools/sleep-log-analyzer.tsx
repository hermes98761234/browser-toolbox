import { useMemo, useState } from 'react'
import { BarChart, Btn, CsvButton, JsonButtons, LineChart, Note, Num, Panel, pct, Row, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { clock, corr, hm, isFreeNight, mean, nightStats, rolling, summary, timeInBed, toMin, type Night } from './lib/sleep-log-analyzer'

const DAY = 864e5
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Three weeks of plausible nights: late weekends, one rough night, a couple of early ones. */
function sampleNights(): Night[] {
  const out: Night[] = []
  const start = Date.now() - 21 * DAY
  const beds = [23.2, 23.0, 23.5, 22.9, 0.6, 1.1, 23.6, 23.1, 22.8, 23.4, 23.0, 0.3, 1.4, 23.9, 23.3, 23.0, 22.7, 23.6, 0.9, 0.5, 23.2]
  const lens = [7.6, 7.9, 7.1, 8.0, 8.6, 9.0, 6.9, 7.5, 7.8, 6.2, 7.7, 8.8, 8.4, 6.8, 7.4, 7.9, 8.1, 7.0, 8.9, 9.1, 7.6]
  const t = (h: number) => { const m = Math.round(((h + 24) % 24) * 60 / 5) * 5; return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
  beds.forEach((b, i) => {
    out.push({
      id: `s${i}`, date: iso(new Date(start + i * DAY)), bed: t(b), wake: t(b + lens[i]),
      latency: [12, 8, 25, 10, 15, 6, 40, 12, 9, 35, 11, 7, 10, 30, 14, 9, 8, 22, 6, 5, 12][i],
      waso: [10, 5, 20, 0, 15, 10, 35, 5, 5, 45, 10, 0, 5, 25, 10, 5, 0, 15, 5, 10, 10][i],
      quality: [4, 4, 3, 5, 4, 5, 2, 4, 4, 2, 4, 5, 4, 2, 3, 4, 5, 3, 5, 5, 4][i],
      note: i === 9 ? 'Late coffee' : i === 6 ? 'Screen until bed' : i === 13 ? 'Stressful day' : '',
    })
  })
  return out
}

const DEF = { goal: 8, nights: sampleNights(), draft: { bed: '23:15', wake: '07:00', latency: 15, waso: 10, quality: 4, note: '' } }
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Horizontal sleep bars, one row per night, on an 18:00 → 14:00 axis. */
function Timeline({ nights }: { nights: Night[] }) {
  const x0 = 360, x1 = 1560 // evening clock minutes (18:00 → 14:00 next day)
  const W = 720, L = 58, R = 8, rowH = 16, T = 22
  const sx = (m: number) => L + ((m - x0) / (x1 - x0)) * (W - L - R)
  const H = T + nights.length * rowH + 6
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Sleep timeline" style={{ display: 'block', fontSize: 10 }}>
      {[360, 480, 600, 720, 840, 960, 1080, 1200, 1320, 1440, 1560].map((m) => (
        <g key={m}>
          <line x1={sx(m)} x2={sx(m)} y1={T - 4} y2={H} stroke="var(--line)" strokeDasharray={m === 720 ? undefined : '2 3'} />
          <text x={sx(m)} y={12} textAnchor="middle" fill="var(--muted)">{clock(m)}</text>
        </g>
      ))}
      {nights.map((n, i) => {
        const s = nightStats(n)
        const y = T + i * rowH
        const free = isFreeNight(n.date)
        const lat = Math.max(0, n.latency)
        return (
          <g key={n.id}>
            <text x={L - 6} y={y + 11} textAnchor="end" fill={free ? 'var(--accent)' : 'var(--muted)'}>{WD[new Date(n.date + 'T12:00').getDay()]} {n.date.slice(8)}</text>
            <rect x={sx(s.start)} y={y + 2} width={Math.max(1, sx(s.start + lat) - sx(s.start))} height={rowH - 4} rx={3} fill="#94a3b8" opacity={0.6} />
            <rect x={sx(s.start + lat)} y={y + 2} width={Math.max(1, sx(s.end) - sx(s.start + lat))} height={rowH - 4} rx={3} fill={['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981', '#6366f1'][Math.round(n.quality)] ?? '#6366f1'} opacity={0.85}>
              <title>{`${n.date}: ${n.bed} → ${n.wake}, slept ${hm(s.sleep)}, quality ${n.quality}/5${n.note ? ' · ' + n.note : ''}`}</title>
            </rect>
            {n.waso > 0 && <rect x={sx(s.mid) - 1} y={y + 2} width={Math.max(2, sx(s.start + n.waso) - sx(s.start))} height={rowH - 4} fill="var(--panel)" opacity={0.55} />}
          </g>
        )
      })}
    </svg>
  )
}

export default function SleepLogAnalyzer() {
  const [s, set, reset] = useToolState('sleep-log-analyzer', DEF)
  const [date, setDate] = useState(() => iso(new Date(Date.now() - DAY)))
  const sorted = useMemo(() => [...s.nights].sort((a, b) => a.date.localeCompare(b.date)), [s.nights])
  const sum = useMemo(() => summary(sorted, s.goal), [sorted, s.goal])
  const d = s.draft
  const draftTib = timeInBed(d.bed, d.wake)
  const valid = Number.isFinite(draftTib) && /^\d{4}-\d{2}-\d{2}$/.test(date)
  const recent = sorted.slice(-21)
  const sleepsH = sorted.map((n) => nightStats(n).sleep / 60)
  const roll = rolling(sleepsH, 7)
  const byWd = WD.map((w, i) => {
    const v = sorted.filter((n) => new Date(n.date + 'T12:00').getDay() === i).map((n) => nightStats(n).sleep / 60)
    return { label: w, value: v.length ? mean(v) : 0 }
  })
  const rq = corr(sorted.map((n) => nightStats(n).sleep), sorted.map((n) => n.quality))
  const rLat = corr(sorted.map((n) => n.latency), sorted.map((n) => n.quality))

  const add = () => {
    if (!valid) return
    const n: Night = { id: uid(), date, ...d }
    set({ nights: [...s.nights.filter((x) => x.date !== date), n] })
    setDate(iso(new Date(new Date(date + 'T12:00').getTime() + DAY)))
  }

  const tips: string[] = []
  if (sum.avgSleep < s.goal * 60 - 30) tips.push(`You average ${hm(sum.avgSleep)}, ${hm(s.goal * 60 - sum.avgSleep)} below your goal.`)
  if (Math.abs(sum.jetLag) >= 60) tips.push(`Social jet lag of ${hm(Math.abs(sum.jetLag))}: weekend sleep is shifted ${sum.jetLag > 0 ? 'later' : 'earlier'}. Keeping wake time within an hour helps.`)
  if (sum.avgEff < 0.85) tips.push(`Sleep efficiency ${pct(sum.avgEff, 0)} is under 85%. Going to bed only when sleepy often improves it.`)
  if (sum.sdBed > 45) tips.push(`Bedtime varies by ±${Math.round(sum.sdBed)} min. A steadier routine usually improves sleep quality.`)

  return (
    <Split wide="right">
      <div>
        <Panel title="Log a night">
          <Txt label="Night of (date you went to bed)" type="date" value={date} onChange={setDate} />
          <Row>
            <Txt label="Lights out" type="time" value={d.bed} onChange={(bed) => set({ draft: { ...d, bed } })} />
            <Txt label="Woke up" type="time" value={d.wake} onChange={(wake) => set({ draft: { ...d, wake } })} />
          </Row>
          <Row>
            <Num label="Time to fall asleep" unit="min" min={0} max={300} value={d.latency} onChange={(latency) => set({ draft: { ...d, latency } })} />
            <Num label="Awake during night" unit="min" min={0} max={600} value={d.waso} onChange={(waso) => set({ draft: { ...d, waso } })} />
          </Row>
          <div className="k-field">
            <span className="k-label">Quality</span>
            <Row wrap={false}>
              {[1, 2, 3, 4, 5].map((q) => (
                <Btn key={q} kind={d.quality === q ? 'primary' : 'normal'} onClick={() => set({ draft: { ...d, quality: q } })}>{['😫', '😕', '😐', '🙂', '😴'][q - 1]}</Btn>
              ))}
            </Row>
          </div>
          <Txt label="Note (caffeine, exercise, stress…)" value={d.note} onChange={(note) => set({ draft: { ...d, note } })} />
          {valid ? (
            <Note tone="ok">Time in bed {hm(draftTib)} → about {hm(Math.max(0, draftTib - d.latency - d.waso))} asleep.</Note>
          ) : (
            <Note tone="err">Enter a valid date and times.</Note>
          )}
          <Btn kind="primary" disabled={!valid} onClick={add}>
            {s.nights.some((x) => x.date === date) ? 'Replace night' : 'Add night'}
          </Btn>
        </Panel>
        <Panel title="Goal">
          <Num label="Sleep goal per night" unit="h" min={4} max={12} step={0.25} value={s.goal} onChange={(goal) => set({ goal })} />
          <Note>Adults generally need 7–9 h. Sleep = time in bed − time to fall asleep − time awake.</Note>
        </Panel>
        <Panel title="Insights">
          {sum.n < 3 ? <Note>Log at least three nights to see patterns.</Note> : tips.length ? tips.map((t) => <Note key={t} tone="warn">{t}</Note>) : <Note tone="ok">Duration, timing and efficiency all look healthy. Keep it up.</Note>}
          {Number.isFinite(rq) && <p className="muted">Duration vs quality correlation: <b>{rq.toFixed(2)}</b> · time-to-sleep vs quality: <b>{Number.isFinite(rLat) ? rLat.toFixed(2) : '—'}</b></p>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Average sleep" value={hm(sum.avgSleep)} sub={`±${Math.round(sum.sdSleep)} min · ${sum.n} nights`} tone={sum.avgSleep >= s.goal * 60 - 15 ? 'good' : 'bad'} />
          <Stat label="Efficiency" value={pct(sum.avgEff, 0)} sub="asleep ÷ in bed" tone={sum.avgEff >= 0.85 ? 'good' : 'bad'} />
          <Stat label="Consistency" value={Number.isFinite(sum.consistency) ? `${Math.round(sum.consistency)}/100` : '—'} sub={`bed ±${Math.round(sum.sdBed)}m · wake ±${Math.round(sum.sdWake)}m`} tone="accent" />
          <Stat label="Typical window" value={`${clock(sum.avgBed)}–${clock(sum.avgWake)}`} sub={`quality ${Number.isFinite(sum.avgQuality) ? sum.avgQuality.toFixed(1) : '—'}/5`} />
          <Stat label="Social jet lag" value={Number.isFinite(sum.jetLag) ? hm(Math.abs(sum.jetLag)) : '—'} sub="weekend vs weekday mid-sleep" />
          <Stat label="7-night debt" value={hm(sum.debt7)} sub={sum.debt7 > 0 ? 'owed vs goal' : 'surplus'} tone={sum.debt7 > 120 ? 'bad' : 'good'} />
        </Stats>
        <Panel title="Timeline (last 21 nights)">
          {recent.length ? <Timeline nights={recent} /> : <Note>No nights logged yet.</Note>}
          <p className="muted" style={{ fontSize: 12 }}>Grey = falling asleep, colour = asleep (red poor → violet great quality), pale gap = time awake. Weekend nights in accent colour.</p>
        </Panel>
        <Panel title="Sleep duration">
          <LineChart
            series={[
              { name: 'Sleep (h)', points: sleepsH.map((v, i) => [i + 1, v]), area: true },
              { name: '7-night average', points: roll.map((v, i) => [i + 1, v]), dashed: true },
              { name: 'Goal', points: (sleepsH.length ? [[1, s.goal], [sleepsH.length, s.goal]] : []) as [number, number][], color: '#10b981' },
            ]}
            yMin={Math.max(0, Math.floor(Math.min(s.goal, ...sleepsH) - 1))}
            fx={(v) => sorted[Math.round(v) - 1]?.date.slice(5) ?? ''}
            fy={(v) => `${v.toFixed(1)}h`}
            height={220}
          />
        </Panel>
        <Panel title="Average by weekday">
          <BarChart bars={byWd} fy={(v) => `${v.toFixed(1)}h`} height={190} />
        </Panel>
        <Panel
          title="Entries"
          actions={
            <>
              <CsvButton name="sleep-log.csv" rows={() => [['Date', 'Bed', 'Wake', 'Latency min', 'Awake min', 'Time in bed min', 'Sleep min', 'Efficiency', 'Quality', 'Note'], ...sorted.map((n) => { const x = nightStats(n); return [n.date, n.bed, n.wake, n.latency, n.waso, x.tib, x.sleep, x.eff.toFixed(3), n.quality, n.note] })]} />
              <JsonButtons name="sleep-log.json" data={s} onLoad={(v) => set({ ...DEF, ...v })} />
              <Btn kind="ghost" onClick={() => set({ nights: [] })}>Clear</Btn>
              <Btn kind="ghost" onClick={reset}>Sample</Btn>
            </>
          }
        >
          <Table
            max={60}
            head={['Night', 'Bed → wake', 'Asleep', 'Eff.', 'Q', 'Note', '']}
            rows={[...sorted].reverse().map((n) => {
              const x = nightStats(n)
              return [
                `${WD[new Date(n.date + 'T12:00').getDay()]} ${n.date}`,
                `${n.bed} → ${n.wake}`,
                <b key="s" style={{ color: x.sleep < s.goal * 60 - 60 ? 'var(--err)' : undefined }}>{hm(x.sleep)}</b>,
                pct(x.eff, 0),
                `${n.quality}/5`,
                n.note,
                <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ nights: s.nights.filter((y) => y.id !== n.id) })}>✕</Btn>,
              ]
            })}
          />
          {sorted.some((n) => !Number.isFinite(toMin(n.bed))) && <Note tone="warn">Some imported rows have invalid times and are ignored.</Note>}
        </Panel>
      </div>
    </Split>
  )
}
