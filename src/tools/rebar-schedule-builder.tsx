import { BarChart, Btn, CsvButton, JsonButtons, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, today, uid, useToolState } from '../kit'
import { calc, DIAMETERS, kgPerM, shapeBy, SHAPES, summary, type Bar } from './lib/rebar-schedule-builder'

const SKETCH: Record<string, string> = {
  '00': 'M4,20 H56',
  '01': 'M10,14 a4,4 0 1 0 0,6 M10,20 H50 a4,4 0 1 0 0,-6',
  '11': 'M8,6 V30 H56',
  '21': 'M8,6 V30 H52 V6',
  '41': 'M4,8 H22 V30 H56',
  '25': 'M2,30 H16 L26,10 H36 L46,30 H58',
  '51': 'M14,6 H48 V32 H12 V6 L20,14 M14,6 L22,12',
  '67': 'M30,4 a15,15 0 1 0 0.1,0 M30,4 l6,8',
  '77': 'M6,30 C10,4 16,4 18,30 C22,4 28,4 30,30 C34,4 40,4 42,30 C46,4 52,4 54,30',
}
const Sketch = ({ code }: { code: string }) => (
  <svg viewBox="0 0 60 36" width={60} height={36} style={{ display: 'block' }}><path d={SKETCH[code] ?? ''} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
)

const bar = (mark: string, member: string, shape: string, dia: number, dims: Record<string, number>, members: number, perMember: number): Bar => ({ id: uid(), mark, member, shape, dia, dims, members, perMember })
const DEF = {
  project: 'Residence G+2 — Block A', element: 'Beams B1–B4, columns C1–C6', engineer: '', date: today(), stock: 12000, waste: 3, price: 0.85,
  bars: [
    bar('B1-01', 'Beam B1 (230×450)', '00', 16, { A: 4600 }, 4, 3),
    bar('B1-02', 'Beam B1 top', '21', 12, { A: 300, B: 4600, C: 300 }, 4, 2),
    bar('B1-03', 'Beam B1 extra', '25', 16, { A: 4600, H: 350 }, 4, 1),
    bar('B1-S', 'Beam B1 stirrups', '51', 8, { A: 180, B: 400 }, 4, 31),
    bar('C1-01', 'Column C1 (300×300)', '11', 16, { A: 3600, B: 450 }, 6, 8),
    bar('C1-T', 'Column C1 ties', '51', 8, { A: 250, B: 250 }, 6, 24),
    bar('P1-H', 'Pile P1 helix', '77', 8, { D: 400, P: 150, H: 6000 }, 2, 1),
  ],
}
type S = typeof DEF

async function exportPdf(s: S) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const W = 842, H = 595
  let page = doc.addPage([W, H])
  let y = H - 40
  const txt = (t: string, x: number, yy: number, size = 9, f = font) => page.drawText(t.replace(/[^\x20-\x7E]/g, (c) => ({ '×': 'x', '—': '-', '–': '-', 'Ø': 'D', '√': 'sqrt', 'π': 'pi', '·': '*', '−': '-', '°': ' deg' }[c] ?? '?')), { x, y: yy, size, font: f, color: rgb(0.1, 0.1, 0.15) })
  txt('BAR BENDING SCHEDULE', 36, y, 16, bold)
  txt(`Project: ${s.project}`, 36, (y -= 20), 10)
  txt(`Element: ${s.element}`, 36, (y -= 14), 10)
  txt(`Date: ${s.date}${s.engineer ? '   Prepared by: ' + s.engineer : ''}`, 36, (y -= 14), 10)
  const cols = [['Mark', 36], ['Member', 86], ['Shape', 236], ['Dia', 300], ['Dimensions (mm)', 330], ['No.', 520], ['Cut len (mm)', 560], ['Total (m)', 640], ['Weight (kg)', 710]] as const
  const header = () => {
    y -= 24
    page.drawRectangle({ x: 30, y: y - 4, width: W - 60, height: 16, color: rgb(0.9, 0.92, 0.97) })
    cols.forEach(([h, x]) => txt(h, x, y, 9, bold))
  }
  header()
  let tot = 0
  for (const b of s.bars) {
    const c = calc(b)
    tot += c.kg
    if (y < 60) { page = doc.addPage([W, H]); y = H - 30; header() }
    y -= 16
    const sh = shapeBy(b.shape)
    const vals = [b.mark, b.member.slice(0, 28), `${sh.code} ${sh.name.split(' ')[0]}`, `${b.dia}`, sh.dims.map((k) => `${k}=${b.dims[k] ?? 0}`).join('  '), `${c.count}`, `${c.cut}`, c.totalM.toFixed(2), c.kg.toFixed(2)]
    vals.forEach((v, i) => txt(v, cols[i][1], y))
    page.drawLine({ start: { x: 30, y: y - 5 }, end: { x: W - 30, y: y - 5 }, thickness: 0.3, color: rgb(0.8, 0.8, 0.85) })
  }
  y -= 26
  if (y < 120) { page = doc.addPage([W, H]); y = H - 40 }
  txt('Summary by diameter', 36, y, 11, bold)
  for (const r of summary(s.bars, s.stock)) {
    y -= 14
    txt(`D${r.dia}: ${r.count} pcs, ${r.m.toFixed(1)} m, ${r.kg.toFixed(1)} kg, ${r.stock.bars} stock bars of ${s.stock / 1000} m`, 46, y)
  }
  y -= 18
  txt(`Total net weight: ${tot.toFixed(1)} kg   With ${s.waste}% wastage: ${(tot * (1 + s.waste / 100)).toFixed(1)} kg`, 36, y, 11, bold)
  const bytes = await doc.save()
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'bar-bending-schedule.pdf'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export default function RebarScheduleBuilder() {
  const [s, set, reset] = useToolState('rebar-schedule-builder', DEF)
  const edit = (id: string, p: Partial<Bar>) => set({ bars: s.bars.map((b) => (b.id === id ? { ...b, ...p } : b)) })
  const sum = summary(s.bars, s.stock)
  const net = sum.reduce((a, r) => a + r.kg, 0)
  const gross = net * (1 + s.waste / 100)
  const tooLong = sum.reduce((a, r) => a + r.stock.tooLong, 0)
  const numIn = (v: number, on: (v: number) => void, w = 70, label = '') => (
    <input type="number" min={0} value={v} aria-label={label} style={{ width: w }} onChange={(e) => on(Math.max(0, Number(e.target.value) || 0))} />
  )

  return (
    <div>
      <Split wide="right">
        <Panel title="Project" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label="Project" value={s.project} onChange={(project) => set({ project })} />
          <Txt label="Element / drawing ref" value={s.element} onChange={(element) => set({ element })} />
          <Row>
            <Txt label="Prepared by" value={s.engineer} onChange={(engineer) => set({ engineer })} />
            <Txt label="Date" type="date" value={s.date} onChange={(date) => set({ date })} />
          </Row>
          <Row>
            <Select label="Stock bar length" value={s.stock} onChange={(stock) => set({ stock })} options={[[6000, '6 m'], [9000, '9 m'], [12000, '12 m']]} />
            <Num label="Wastage" unit="%" value={s.waste} min={0} max={30} onChange={(waste) => set({ waste })} />
            <Num label="Steel price" unit="/kg" value={s.price} min={0} step={0.01} onChange={(price) => set({ price })} />
          </Row>
        </Panel>
        <div>
          <Stats>
            <Stat label="Net steel" value={`${net.toFixed(1)} kg`} sub={`${(net / 1000).toFixed(3)} t`} />
            <Stat label={`With ${s.waste}% wastage`} value={`${gross.toFixed(1)} kg`} tone="accent" />
            <Stat label="Pieces" value={sum.reduce((a, r) => a + r.count, 0)} sub={`${s.bars.length} bar marks`} />
            <Stat label="Estimated cost" value={(gross * s.price).toFixed(2)} sub="gross weight × price" />
          </Stats>
          <Panel title="Weight by diameter">
            <BarChart height={180} bars={sum.map((r) => ({ label: `Ø${r.dia}`, value: Math.round(r.kg * 10) / 10 }))} fy={(v) => v + ' kg'} />
          </Panel>
        </div>
      </Split>
      <Panel title="Schedule" actions={<>
        <Btn onClick={() => set({ bars: [...s.bars, bar(`M${s.bars.length + 1}`, 'New member', '00', 12, { A: 3000 }, 1, 1)] })}>+ Bar mark</Btn>
        <Btn kind="primary" onClick={() => exportPdf(s)}>⬇ PDF</Btn>
        <CsvButton name="bar-bending-schedule.csv" rows={() => [['Mark', 'Member', 'Shape', 'Dia (mm)', 'Dimensions', 'Members', 'Per member', 'Total no.', 'Cut length (mm)', 'Total length (m)', 'Weight (kg)'],
          ...s.bars.map((b) => { const c = calc(b); const sh = shapeBy(b.shape); return [b.mark, b.member, `${sh.code} ${sh.name}`, b.dia, sh.dims.map((k) => `${k}=${b.dims[k] ?? 0}`).join(' '), b.members, b.perMember, c.count, c.cut, +c.totalM.toFixed(3), +c.kg.toFixed(3)] })]} />
        <JsonButtons name="rebar-schedule.json" data={s} onLoad={(d) => set(d)} />
      </>}>
        <Table head={['Mark', 'Member', 'Shape', 'Ø', 'Dimensions (mm)', 'Members × per', 'Cut length', 'Total', 'Weight', '']} rows={s.bars.map((b) => {
          const c = calc(b)
          const sh = shapeBy(b.shape)
          return [
            <input key="m" value={b.mark} aria-label="Mark" style={{ width: 64 }} onChange={(e) => edit(b.id, { mark: e.target.value })} />,
            <input key="n" value={b.member} aria-label="Member" style={{ width: 150 }} onChange={(e) => edit(b.id, { member: e.target.value })} />,
            <div key="s" style={{ display: 'flex', gap: 6, alignItems: 'center' }} title={`${sh.formula} — ${sh.hint}`}>
              <Sketch code={b.shape} />
              <select value={b.shape} aria-label="Shape code" onChange={(e) => edit(b.id, { shape: e.target.value })}>{SHAPES.map((x) => <option key={x.code} value={x.code}>{x.code} {x.name}</option>)}</select>
            </div>,
            <select key="d" value={b.dia} aria-label="Diameter" onChange={(e) => edit(b.id, { dia: Number(e.target.value) })}>{DIAMETERS.map((d) => <option key={d} value={d}>{d}</option>)}</select>,
            <div key="dims" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{sh.dims.map((k) => (
              <label key={k} style={{ fontSize: 12 }}>{k} {numIn(b.dims[k] ?? 0, (v) => edit(b.id, { dims: { ...b.dims, [k]: v } }), 70, k)}</label>
            ))}</div>,
            <span key="c" style={{ whiteSpace: 'nowrap' }}>{numIn(b.members, (members) => edit(b.id, { members }), 52, 'Members')} × {numIn(b.perMember, (perMember) => edit(b.id, { perMember }), 52, 'Per member')} = <b>{c.count}</b></span>,
            <b key="l" style={{ color: c.cut > s.stock ? 'var(--err)' : undefined }}>{c.cut} mm</b>,
            `${c.totalM.toFixed(1)} m`,
            `${c.kg.toFixed(1)} kg`,
            <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ bars: s.bars.filter((x) => x.id !== b.id) })}>✕</Btn>,
          ]
        })} foot={['Total', '', '', '', '', String(sum.reduce((a, r) => a + r.count, 0)), '', `${sum.reduce((a, r) => a + r.m, 0).toFixed(1)} m`, `${net.toFixed(1)} kg`, '']} />
        {tooLong > 0 && <Note tone="warn">{tooLong} piece(s) are longer than the {s.stock / 1000} m stock bar — they need a lap splice or coupler.</Note>}
      </Panel>
      <Split>
        <Panel title="Cutting plan (first-fit decreasing)">
          <Table head={['Ø (mm)', 'kg/m', 'Pieces', 'Length', 'Weight', 'Stock bars', 'Offcut']} rows={sum.map((r) => [
            r.dia, kgPerM(r.dia).toFixed(3), r.count, `${r.m.toFixed(1)} m`, `${r.kg.toFixed(1)} kg`, `${r.stock.bars} × ${s.stock / 1000} m`,
            `${(r.stock.waste / 1000).toFixed(1)} m (${r.stock.bars ? ((r.stock.waste / (r.stock.bars * s.stock)) * 100).toFixed(1) : 0}%)`,
          ])} />
        </Panel>
        <Panel title="Shape codes & rules">
          <Table head={['', 'Code', 'Cut length']} rows={SHAPES.map((x) => [<Sketch key="k" code={x.code} />, `${x.code} ${x.name}`, <span key="f" style={{ fontSize: 12 }}>{x.formula}<br /><span className="muted">{x.hint}</span></span>])} />
          <Note>Bend deductions: 45° = 1d, 90° = 2d, 135° = 3d. Hooks: 180° = 9d; 135° link hook = max(10d, 75 mm). Unit weight = d²/162 kg/m. Cut lengths rounded to 5 mm. Check your local code (BS 8666, IS 2502, ACI 315).</Note>
        </Panel>
      </Split>
    </div>
  )
}
