import type { ReactNode } from 'react'
import { Btn, CopyButton, Note, Panel, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { IN, LB, bmi, fromCm, fromKg, ftIn, lbOz, round, stLb, toCm, toKg, type HUnit, type WUnit } from './lib/weight-height-converter'

type WIn = 'kg' | 'lb' | 'st' | 'g' | 'oz'
type HIn = 'cm' | 'm' | 'ft' | 'in'
interface State { w: string; w2: string; wu: WIn; h: string; h2: string; hu: HIn; prec: number }
const DEF: State = { w: '72', w2: '', wu: 'kg', h: '5', h2: '9', hu: 'ft', prec: 1 }

const parse = (s: string) => (s.trim() === '' ? 0 : Number(s.replace(',', '.')))

function kgOf(s: State): number {
  const a = parse(s.w), b = parse(s.w2)
  if (s.wu === 'st') return toKg(a, 'st') + toKg(b, 'lb')
  return toKg(a, s.wu as WUnit)
}
function cmOf(s: State): number {
  const a = parse(s.h), b = parse(s.h2)
  if (s.hu === 'ft') return toCm(a, 'ft') + toCm(b, 'in')
  return toCm(a, s.hu as HUnit)
}

function Big({ value, onChange, unit, label }: { value: string; onChange: (v: string) => void; unit: string; label: string }) {
  const bad = value.trim() !== '' && !(Number(value.replace(',', '.')) >= 0)
  return (
    <label style={{ flex: 1, minWidth: 0, display: 'block' }}>
      <span className="k-label">{label}</span>
      <span className="k-input" style={{ borderColor: bad ? 'var(--err)' : undefined }}>
        <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} onFocus={(e) => e.target.select()} style={{ fontSize: 30, fontWeight: 700, padding: '10px 12px', minHeight: 60 }} aria-label={label} />
        <span className="k-unit" style={{ fontSize: 18 }}>{unit}</span>
      </span>
    </label>
  )
}

function Result({ label, value, copy }: { label: ReactNode; value: string; copy: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <span className="muted" style={{ width: 110, flexShrink: 0 }}>{label}</span>
      <b style={{ flex: 1, fontSize: 22, overflowWrap: 'anywhere' }}>{value}</b>
      <CopyButton text={copy} label="" />
    </div>
  )
}

export default function WeightHeightConverter() {
  const [s, set, reset] = useToolState('weight-height-converter', DEF)
  const d = s.prec
  const kg = kgOf(s), cm = cmOf(s)
  const okW = Number.isFinite(kg) && kg >= 0, okH = Number.isFinite(cm) && cm >= 0

  const switchW = (wu: WIn) => {
    if (!okW) return set({ wu, w: '', w2: '' })
    if (wu === 'st') {
      const tot = kg / LB
      const st = Math.floor(tot / 14)
      return set({ wu, w: String(st), w2: round(tot - st * 14, d) })
    }
    set({ wu, w: round(fromKg(kg, wu), wu === 'g' ? 0 : d), w2: '' })
  }
  const switchH = (hu: HIn) => {
    if (!okH) return set({ hu, h: '', h2: '' })
    if (hu === 'ft') {
      const tot = cm / IN
      const ft = Math.floor(tot / 12)
      return set({ hu, h: String(ft), h2: round(tot - ft * 12, d) })
    }
    set({ hu, h: round(fromCm(cm, hu), hu === 'm' ? Math.max(2, d) : d), h2: '' })
  }

  const wRes: [string, string, string][] = [
    ['Kilograms', `${round(kg, d)} kg`, round(kg, d)],
    ['Pounds', `${round(fromKg(kg, 'lb'), d)} lb`, round(fromKg(kg, 'lb'), d)],
    ['Stone & lb', stLb(kg, d), stLb(kg, d)],
    ['Pounds & oz', lbOz(kg, d), lbOz(kg, d)],
    ['Grams', `${round(kg * 1000, Math.max(0, d - 1))} g`, round(kg * 1000, Math.max(0, d - 1))],
    ['Ounces', `${round(fromKg(kg, 'oz'), d)} oz`, round(fromKg(kg, 'oz'), d)],
  ]
  const hRes: [string, string, string][] = [
    ['Centimetres', `${round(cm, d)} cm`, round(cm, d)],
    ['Feet & inches', ftIn(cm, d), ftIn(cm, d)],
    ['Inches', `${round(cm / IN, d)} in`, round(cm / IN, d)],
    ['Metres', `${round(cm / 100, d + 2)} m`, round(cm / 100, d + 2)],
    ['Feet (decimal)', `${round(cm / IN / 12, d + 1)} ft`, round(cm / IN / 12, d + 1)],
    ['Millimetres', `${round(cm * 10, Math.max(0, d - 1))} mm`, round(cm * 10, Math.max(0, d - 1))],
  ]
  const b = okW && okH && cm > 50 && kg > 2 ? bmi(kg, cm) : null
  const nearKg = Math.round(kg / 5) * 5, nearCm = Math.round(cm / 5) * 5
  const hl = (on: boolean, v: ReactNode) => (on ? <b style={{ color: 'var(--accent)' }}>{v}</b> : v)

  return (
    <Split wide="right">
      <div>
        <Panel title="⚖️ Weight">
          <Seg value={s.wu} onChange={switchW} options={[['kg', 'kg'], ['lb', 'lb'], ['st', 'st + lb'], ['g', 'g'], ['oz', 'oz']]} label="Weight unit" />
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <Big label={s.wu === 'st' ? 'Stone' : 'Weight'} value={s.w} onChange={(w) => set({ w })} unit={s.wu} />
            {s.wu === 'st' && <Big label="Pounds" value={s.w2} onChange={(w2) => set({ w2 })} unit="lb" />}
          </div>
        </Panel>
        <Panel title="📏 Height">
          <Seg value={s.hu} onChange={switchH} options={[['cm', 'cm'], ['ft', 'ft + in'], ['in', 'in'], ['m', 'm']]} label="Height unit" />
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <Big label={s.hu === 'ft' ? 'Feet' : 'Height'} value={s.h} onChange={(h) => set({ h })} unit={s.hu} />
            {s.hu === 'ft' && <Big label="Inches" value={s.h2} onChange={(h2) => set({ h2 })} unit="in" />}
          </div>
        </Panel>
        <Panel title="Precision" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={String(d) as '0'} onChange={(v) => set({ prec: Number(v) })} options={[['0', '0'], ['1', '0.1'], ['2', '0.01'], ['3', '0.001'], ['4', '0.0001']]} label="Decimal places" />
          <p className="muted" style={{ fontSize: 13 }}>Uses the exact definitions 1 lb = 0.45359237 kg and 1 in = 2.54 cm. Compound values carry correctly (5′ 11.99″ rounds to 6′ 0″).</p>
        </Panel>
        {b && (
          <Stats>
            <Stat label="BMI" value={round(b.v, 1)} sub={b.cat} tone={b.cat === 'Healthy weight' ? 'good' : 'accent'} />
            <Stat label="Healthy range" value={`${round(18.5 * (cm / 100) ** 2, 0)}–${round(24.9 * (cm / 100) ** 2, 0)} kg`} sub={`${round(fromKg(18.5 * (cm / 100) ** 2, 'lb'), 0)}–${round(fromKg(24.9 * (cm / 100) ** 2, 'lb'), 0)} lb for this height`} />
          </Stats>
        )}
      </div>
      <div>
        <Panel title="Weight in every unit">
          {okW ? wRes.map(([l, v, c]) => <Result key={l} label={l} value={v} copy={c} />) : <Note tone="err">Enter a valid, non-negative weight.</Note>}
        </Panel>
        <Panel title="Height in every unit">
          {okH ? hRes.map(([l, v, c]) => <Result key={l} label={l} value={v} copy={c} />) : <Note tone="err">Enter a valid, non-negative height.</Note>}
        </Panel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <div><Panel title="Weight chart">
            <Table head={['kg', 'lb', 'st lb']} rows={Array.from({ length: 19 }, (_, i) => 40 + i * 5).map((k) => [hl(k === nearKg, k), hl(k === nearKg, round(fromKg(k, 'lb'), 1)), hl(k === nearKg, stLb(k, 0))])} />
          </Panel></div>
          <div><Panel title="Height chart">
            <Table head={['cm', 'ft in', 'in']} rows={Array.from({ length: 13 }, (_, i) => 145 + i * 5).map((c) => [hl(c === nearCm, c), hl(c === nearCm, ftIn(c, 0)), hl(c === nearCm, round(c / IN, 1))])} />
          </Panel></div>
        </div>
      </div>
    </Split>
  )
}
