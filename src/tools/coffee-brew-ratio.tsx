import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, CopyButton, Note, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, num, useToolState } from '../kit'
import { amounts, beverage, clock, METHODS, schedule, stepAt } from './lib/coffee-brew-ratio'

const DEF = { method: 'v60', by: 'coffee' as 'coffee' | 'water' | 'cups', coffee: 20, water: 320, cups: 2, cupSize: 250, ratio: 16, sound: true }

let ctx: AudioContext | null = null
function beep(freq = 880, dur = 0.18, times = 1) {
  try {
    ctx ??= new AudioContext()
    for (let i = 0; i < times; i++) {
      const t = ctx.currentTime + i * (dur + 0.08)
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + dur + 0.02)
    }
  } catch {
    /* audio unavailable */
  }
}

export default function CoffeeBrewRatio() {
  const [s, set, reset] = useToolState('coffee-brew-ratio', DEF)
  const m = METHODS.find((x) => x.id === s.method) ?? METHODS[0]
  const ratio = Math.min(m.max, Math.max(m.min, s.ratio))
  // In "cups" mode the target is the drink in the cup, so add back what the grounds absorb.
  const cupsWater = (s.cups * s.cupSize * ratio) / (ratio - m.absorb || ratio)
  const a = s.by === 'cups' ? amounts('water', m.kind === 'espresso' ? s.cups * 36 : cupsWater, ratio) : amounts(s.by, s.by === 'coffee' ? s.coffee : s.water, ratio)
  const valid = a.coffee > 0 && a.water > 0
  const steps = useMemo(() => (valid ? schedule(m, a.coffee, a.water) : []), [valid, m, a.coffee, a.water])
  const drink = beverage(m, a.coffee, a.water)
  const total = steps.length ? steps[steps.length - 1].at : 0

  const [run, setRun] = useState<{ start: number; base: number } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const lastStep = useRef(-1)
  useEffect(() => {
    if (!run) return
    const id = setInterval(() => {
      const t = run.base + (performance.now() - run.start) / 1000
      setElapsed(t)
      const k = stepAt(steps, t)
      if (k !== lastStep.current) {
        lastStep.current = k
        if (s.sound) beep(k === steps.length - 1 ? 660 : 880, 0.18, k === steps.length - 1 ? 3 : 1)
        if (k === steps.length - 1) setRun(null)
      }
    }, 200)
    return () => clearInterval(id)
  }, [run, steps, s.sound])

  const cur = stepAt(steps, elapsed)
  const next = steps[cur + 1]
  const start = () => {
    if (elapsed >= total) {
      setElapsed(0)
      lastStep.current = -1
    }
    setRun({ start: performance.now(), base: elapsed >= total ? 0 : elapsed })
  }
  const resetTimer = () => {
    setRun(null)
    setElapsed(0)
    lastStep.current = -1
  }
  const pick = (id: string) => {
    const mm = METHODS.find((x) => x.id === id)!
    resetTimer()
    set({ method: id, ratio: mm.ratio, coffee: mm.kind === 'espresso' ? 18 : mm.kind === 'cold' ? 100 : s.coffee > 60 || s.coffee < 10 ? 20 : s.coffee })
  }
  const recipe = () =>
    `${m.name} — 1:${num(ratio, 1)}\nCoffee: ${num(a.coffee, 1)} g (${m.grind})\nWater: ${num(a.water, 0)} g at ${m.temp}\n\n` +
    steps.map((x) => `${clock(x.at)}  ${x.label}`).join('\n')

  return (
    <Split>
      <div>
        <Panel title="Brew method" actions={<Btn kind="ghost" onClick={() => { resetTimer(); reset() }}>Reset</Btn>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 6 }}>
            {METHODS.map((x) => (
              <Btn key={x.id} kind={x.id === m.id ? 'primary' : 'normal'} onClick={() => pick(x.id)}>{x.name}</Btn>
            ))}
          </div>
        </Panel>
        <Panel title="Recipe">
          <Seg value={s.by} onChange={(by) => set({ by })} options={[['coffee', 'I have coffee'], ['water', 'I have water'], ['cups', 'I want cups']]} label="Calculate from" />
          {s.by === 'coffee' && <Num label="Coffee" value={s.coffee} onChange={(coffee) => set({ coffee })} unit="g" min={1} />}
          {s.by === 'water' && <Num label={m.kind === 'espresso' ? 'Shot yield' : 'Water'} value={s.water} onChange={(water) => set({ water })} unit="g" min={1} />}
          {s.by === 'cups' && (
            <Row>
              <Num label={m.kind === 'espresso' ? 'Shots' : 'Cups'} value={s.cups} onChange={(cups) => set({ cups })} min={1} step={1} />
              {m.kind !== 'espresso' && <Num label="Cup size" value={s.cupSize} onChange={(cupSize) => set({ cupSize })} unit="ml" min={30} />}
            </Row>
          )}
          <Slider label="Ratio 1 :" value={ratio} onChange={(r) => set({ ratio: r })} min={m.min} max={m.max} step={0.5} show={(v) => num(v, 1)} />
          <Row>
            {[m.min, m.ratio, m.max].map((r, i) => (
              <Btn key={i} kind="ghost" onClick={() => set({ ratio: r })}>{['Stronger', 'Classic', 'Lighter'][i]} 1:{r}</Btn>
            ))}
          </Row>
          {!valid && <Note tone="err">Enter an amount above zero.</Note>}
          <Note>
            <b>Grind:</b> {m.grind}. <b>Water:</b> {m.temp}.{m.kind === 'cold' ? ' Dilute the concentrate about 1:1 before drinking.' : ''}
          </Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Coffee" value={`${num(a.coffee, 1)} g`} tone="accent" sub={`≈ ${num(a.coffee / 7, 1)} level tbsp of beans`} />
          <Stat label={m.kind === 'espresso' ? 'Yield (in cup)' : 'Water'} value={`${num(a.water, 0)} g`} sub={`ratio 1:${num(ratio, 1)}`} />
          <Stat label="In the cup" value={`≈ ${num(drink, 0)} ml`} sub={m.kind === 'espresso' ? 'espresso shot weight' : `grounds keep ~${num(a.coffee * m.absorb, 0)} g`} />
          <Stat label="Brew time" value={clock(total)} sub={m.name} />
        </Stats>
        <Panel title="Step timer" actions={<CopyButton text={recipe} label="Copy recipe" />}>
          <div style={{ textAlign: 'center', padding: '6px 0 10px' }}>
            <div style={{ fontSize: 56, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{clock(elapsed)}</div>
            <div className="muted" style={{ minHeight: 22, marginTop: 6 }}>
              {cur < 0 ? 'Press start when you begin pouring' : cur === steps.length - 1 ? '☕ Brew complete' : next ? `Next in ${clock(next.at - elapsed)}: ${next.label}` : ''}
            </div>
            <div style={{ height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden', margin: '8px 0' }}>
              <div style={{ width: `${total ? Math.min(100, (elapsed / total) * 100) : 0}%`, height: '100%', background: 'var(--accent)', transition: 'width .2s linear' }} />
            </div>
            <Row>
              {run ? <Btn onClick={() => setRun(null)}>⏸ Pause</Btn> : <Btn kind="primary" onClick={start} disabled={!valid}>▶ {elapsed > 0 && elapsed < total ? 'Resume' : 'Start'}</Btn>}
              <Btn kind="ghost" onClick={resetTimer}>↺ Reset</Btn>
              <Check label="Sound at each step" value={s.sound} onChange={(sound) => set({ sound })} />
            </Row>
          </div>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {steps.map((x, i) => (
              <li key={i} style={{
                display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 8, marginBottom: 4,
                background: i === cur ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent', border: '1px solid var(--line)', opacity: i < cur ? 0.55 : 1,
              }}>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{clock(x.at)}</b>
                <span>{i < cur ? '✓ ' : ''}{x.label}</span>
                {x.water !== undefined && <span className="muted" style={{ whiteSpace: 'nowrap' }}>⚖ {x.water} g</span>}
              </li>
            ))}
          </ol>
          {m.kind === 'cold' && <Note>Cold brew steeps for hours: the timer keeps counting only while this tab stays open.</Note>}
        </Panel>
        <Panel title="Dial it in">
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li><b>Sour, thin, or fast?</b> Grind finer or use hotter water.</li>
            <li><b>Bitter, dry, or slow?</b> Grind coarser or shorten the brew.</li>
            <li><b>Too strong or too weak?</b> Move the ratio slider; it doesn't change extraction much.</li>
            <li>Weigh with a scale in grams; 1 ml of water ≈ 1 g.</li>
          </ul>
        </Panel>
      </div>
    </Split>
  )
}
