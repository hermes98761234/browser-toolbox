import { useState } from 'react'
import { BarChart, Btn, Check, CsvButton, JsonButtons, Note, num, Num, Panel, Row, Seg, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { roomLoad, U_PRESETS, W_TO_BTUH, type Adj, type Climate, type Kind, type Orient, type Room, type Surface } from './lib/heat-load-estimator'

interface State { climate: Climate; rooms: Room[]; unit: 'W' | 'BTU'; margin: number }

const sf = (name: string, kind: Kind, area: number, u: number, orient: Orient = 'S', adj: Adj = 'outside', shgc = 0.6): Surface => ({ id: uid(), name, kind, area, u, adj, orient, shgc, shade: 1 })

const DEF: State = {
  unit: 'W',
  margin: 10,
  climate: { tinHeat: 21, toutHeat: -7, tinCool: 24, toutCool: 32, tground: 10, dw: 4, solarAllowance: true },
  rooms: [
    { id: 'lr', name: 'Living room', l: 6, w: 4.5, h: 2.6, ach: 0.7, people: 4, equip: 250, light: 6, surfaces: [sf('South wall', 'wall', 11.1, 0.55), sf('South window', 'window', 4.5, 1.4), sf('West wall', 'wall', 11.7, 0.55, 'W'), sf('Floor', 'floor', 27, 0.7, 'H', 'ground')] },
    { id: 'bd', name: 'Bedroom', l: 4, w: 3.5, h: 2.6, ach: 0.5, people: 2, equip: 80, light: 4, surfaces: [sf('East wall', 'wall', 7.6, 0.55, 'E'), sf('East window', 'window', 2.2, 1.4, 'E'), sf('Roof', 'roof', 14, 0.35, 'H')] },
    { id: 'kt', name: 'Kitchen', l: 3.5, w: 3, h: 2.6, ach: 1.5, people: 1, equip: 800, light: 8, surfaces: [sf('North wall', 'wall', 7.1, 0.55, 'N'), sf('North window', 'window', 2, 1.4, 'N'), sf('Wall to garage', 'wall', 7.8, 1.8, 'H', 'unheated')] },
  ],
}

const KINDS: Kind[] = ['wall', 'window', 'door', 'roof', 'floor']
const ORIENTS: Orient[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'H']

export default function HeatLoadEstimator() {
  const [s, set, reset] = useToolState('heat-load-estimator', DEF)
  const [sel, setSel] = useState(s.rooms[0]?.id ?? '')
  const c = s.climate
  const f = (w: number) => (s.unit === 'W' ? `${num(w, 0)} W` : `${num(w * W_TO_BTUH, 0)} BTU/h`)
  const k = 1 + s.margin / 100
  const loads = s.rooms.map((r) => ({ r, l: roomLoad(r, c) }))
  const tot = loads.reduce((a, { l }) => ({ heat: a.heat + l.heat.total, sens: a.sens + l.cool.sensible, lat: a.lat + l.cool.latent, floor: a.floor + l.floor }), { heat: 0, sens: 0, lat: 0, floor: 0 })
  const room = s.rooms.find((r) => r.id === sel) ?? s.rooms[0]
  const load = room && roomLoad(room, c)
  const setC = (p: Partial<Climate>) => set({ climate: { ...c, ...p } })
  const editRoom = (p: Partial<Room>) => room && set({ rooms: s.rooms.map((r) => (r.id === room.id ? { ...r, ...p } : r)) })
  const editSf = (id: string, p: Partial<Surface>) => room && editRoom({ surfaces: room.surfaces.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const coolTons = (tot.sens + tot.lat) * k / 3516.85

  return (
    <Split wide="right">
      <div>
        <Panel title="Design conditions" actions={<Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['W', 'W'], ['BTU', 'BTU/h']]} />}>
          <Row>
            <Num label="Winter outdoor" value={c.toutHeat} onChange={(toutHeat) => setC({ toutHeat })} unit="°C" />
            <Num label="Indoor (heating)" value={c.tinHeat} onChange={(tinHeat) => setC({ tinHeat })} unit="°C" />
          </Row>
          <Row>
            <Num label="Summer outdoor" value={c.toutCool} onChange={(toutCool) => setC({ toutCool })} unit="°C" />
            <Num label="Indoor (cooling)" value={c.tinCool} onChange={(tinCool) => setC({ tinCool })} unit="°C" />
          </Row>
          <Row>
            <Num label="Ground temperature" value={c.tground} onChange={(tground) => setC({ tground })} unit="°C" />
            <Num label="Outdoor − indoor humidity" value={c.dw} onChange={(dw) => setC({ dw })} unit="g/kg" min={0} />
          </Row>
          <Check label="Sol-air allowance on sunlit walls/roofs (+5 K walls, +12 K roofs)" value={c.solarAllowance} onChange={(solarAllowance) => setC({ solarAllowance })} />
          <Num label="Safety margin" value={s.margin} onChange={(margin) => set({ margin })} unit="%" min={0} max={50} />
        </Panel>
        {room && load && (
          <Panel title={`Room: ${room.name}`} actions={<Btn kind="danger" disabled={s.rooms.length < 2} onClick={() => { set({ rooms: s.rooms.filter((r) => r.id !== room.id) }); setSel(s.rooms.find((r) => r.id !== room.id)?.id ?? '') }}>Delete room</Btn>}>
            <label className="k-field"><span className="k-label">Name</span><input className="k-text" value={room.name} onChange={(e) => editRoom({ name: e.target.value })} /></label>
            <Row>
              <Num label="Length" value={room.l} onChange={(l) => editRoom({ l })} unit="m" min={0.5} />
              <Num label="Width" value={room.w} onChange={(w) => editRoom({ w })} unit="m" min={0.5} />
              <Num label="Height" value={room.h} onChange={(h) => editRoom({ h })} unit="m" min={1.8} />
            </Row>
            <Row>
              <Num label="Air changes" value={room.ach} onChange={(ach) => editRoom({ ach })} unit="ACH" min={0} step={0.1} />
              <Num label="Occupants" value={room.people} onChange={(people) => editRoom({ people })} min={0} />
            </Row>
            <Row>
              <Num label="Equipment" value={room.equip} onChange={(equip) => editRoom({ equip })} unit="W" min={0} />
              <Num label="Lighting" value={room.light} onChange={(light) => editRoom({ light })} unit="W/m²" min={0} />
            </Row>
            <p className="muted" style={{ fontSize: 13 }}>{num(load.floor, 1)} m² floor · {num(load.volume, 1)} m³. Infiltration: 0.5 ACH tight modern, 1 typical, 1.5–2 leaky or kitchens.</p>
          </Panel>
        )}
      </div>
      <div>
        <Stats>
          <Stat label="Heating load" value={f(tot.heat * k)} sub={`${num((tot.heat * k) / (tot.floor || 1), 0)} W/m² · incl. ${s.margin}% margin`} tone="accent" />
          <Stat label="Cooling sensible" value={f(tot.sens * k)} />
          <Stat label="Cooling latent" value={f(tot.lat * k)} sub={`SHR ${num(tot.sens / (tot.sens + tot.lat || 1), 2)}`} />
          <Stat label="Cooling total" value={f((tot.sens + tot.lat) * k)} sub={`${num(coolTons, 2)} tons · ${num(coolTons * 12000, 0)} BTU/h`} />
        </Stats>
        <Panel
          title="Room summary"
          actions={<><Btn onClick={() => { const r: Room = { id: uid(), name: `Room ${s.rooms.length + 1}`, l: 4, w: 3, h: 2.6, ach: 0.7, people: 2, equip: 100, light: 5, surfaces: [sf('External wall', 'wall', 10.4, 0.55), sf('Window', 'window', 2, 1.4)] }; set({ rooms: [...s.rooms, r] }); setSel(r.id) }}>+ Room</Btn>
            <CsvButton name="heat-loads.csv" rows={() => [['Room', 'Floor m2', 'Heating W', 'Cooling sensible W', 'Cooling latent W', 'Cooling total W'], ...loads.map(({ r, l }) => [r.name, +l.floor.toFixed(1), Math.round(l.heat.total * k), Math.round(l.cool.sensible * k), Math.round(l.cool.latent * k), Math.round(l.cool.total * k)])]} />
            <JsonButtons name="heat-load.json" data={s} onLoad={(d) => d?.rooms && set(d)} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}
        >
          <Table
            head={['Room', 'Floor', 'Heating', 'W/m²', 'Cool sens.', 'Cool latent', 'Cool total']}
            rows={loads.map(({ r, l }) => [
              <button key="n" type="button" className="k-btn ghost" style={{ fontWeight: r.id === room?.id ? 700 : 400 }} onClick={() => setSel(r.id)}>{r.name}</button>,
              `${num(l.floor, 1)} m²`, f(l.heat.total * k), num((l.heat.total * k) / l.floor, 0), f(l.cool.sensible * k), f(l.cool.latent * k), <b key="t">{f(l.cool.total * k)}</b>,
            ])}
            foot={['Total', `${num(tot.floor, 1)} m²`, f(tot.heat * k), num((tot.heat * k) / (tot.floor || 1), 0), f(tot.sens * k), f(tot.lat * k), f((tot.sens + tot.lat) * k)]}
          />
        </Panel>
        {room && load && (
          <>
            <Panel title={`Surfaces: ${room.name}`} actions={<Btn onClick={() => editRoom({ surfaces: [...room.surfaces, sf('New surface', 'wall', 8, 0.55)] })}>+ Surface</Btn>}>
              <Table
                head={['Name', 'Type', 'Area m²', 'U W/m²K', 'Adjacent', 'Facing', 'SHGC', 'Heat', 'Cool', '']}
                rows={room.surfaces.map((x, i) => [
                  <input key="n" value={x.name} onChange={(e) => editSf(x.id, { name: e.target.value })} style={{ width: 110 }} aria-label="Name" />,
                  <select key="k" value={x.kind} onChange={(e) => editSf(x.id, { kind: e.target.value as Kind, u: U_PRESETS[e.target.value as Kind][1]?.[1] ?? x.u })} aria-label="Type" style={{ minWidth: 84 }}>{KINDS.map((kk) => <option key={kk}>{kk}</option>)}</select>,
                  <input key="a" type="number" min={0} step={0.1} value={x.area} onChange={(e) => editSf(x.id, { area: Math.max(0, +e.target.value) })} style={{ width: 64 }} aria-label="Area" />,
                  <span key="u" style={{ display: 'flex', gap: 2 }}>
                    <input type="number" min={0} step={0.05} value={x.u} onChange={(e) => editSf(x.id, { u: Math.max(0, +e.target.value) })} style={{ width: 58 }} aria-label="U-value" />
                    <select value="" onChange={(e) => e.target.value && editSf(x.id, { u: +e.target.value })} aria-label="U-value preset" style={{ width: 26 }}>
                      <option value="">▾</option>
                      {U_PRESETS[x.kind].map(([n, u]) => <option key={n} value={u}>{n} ({u})</option>)}
                    </select>
                  </span>,
                  <select key="j" value={x.adj} onChange={(e) => editSf(x.id, { adj: e.target.value as Adj })} aria-label="Adjacent" style={{ minWidth: 96 }}>{(['outside', 'ground', 'unheated'] as Adj[]).map((a) => <option key={a}>{a}</option>)}</select>,
                  <select key="o" value={x.orient} onChange={(e) => editSf(x.id, { orient: e.target.value as Orient })} aria-label="Facing" style={{ minWidth: 70 }}>{ORIENTS.map((o) => <option key={o} value={o}>{o === 'H' ? 'horiz.' : o}</option>)}</select>,
                  x.kind === 'window' ? <input key="g" type="number" min={0} max={1} step={0.05} value={x.shgc} onChange={(e) => editSf(x.id, { shgc: Math.min(1, Math.max(0, +e.target.value)) })} style={{ width: 52 }} aria-label="SHGC" /> : '—',
                  num(load.parts[i].heat, 0),
                  num(load.parts[i].cool + load.parts[i].solar, 0),
                  <Btn key="x" kind="ghost" onClick={() => editRoom({ surfaces: room.surfaces.filter((y) => y.id !== x.id) })} title="Remove">✕</Btn>,
                ])}
              />
              <p className="muted" style={{ fontSize: 12 }}>Enter net wall area (wall minus windows/doors). Ground: ΔT to ground temperature, no cooling gain. Unheated space: half the outdoor ΔT. Solar = area × SHGC × peak sun for the orientation (northern hemisphere; swap N/S south of the equator).</p>
            </Panel>
            <Panel title={`Load breakdown: ${room.name} (${s.unit === 'W' ? 'W' : 'BTU/h'})`}>
              <BarChart
                height={220}
                fy={(v) => num(v, 0)}
                bars={[
                  { label: 'Heat fabric', value: load.heat.fabric, color: '#ef4444' },
                  { label: 'Heat infiltr.', value: load.heat.infiltration, color: '#f97316' },
                  { label: 'Cool fabric', value: load.cool.fabric, color: '#0ea5e9' },
                  { label: 'Solar', value: load.cool.solar, color: '#eab308' },
                  { label: 'Cool infiltr.', value: load.cool.infiltration, color: '#14b8a6' },
                  { label: 'People', value: load.cool.people, color: '#a855f7' },
                  { label: 'Lights+equip', value: load.cool.lights + load.cool.equip, color: '#6366f1' },
                  { label: 'Latent', value: load.cool.latent, color: '#64748b' },
                ].map((b) => ({ ...b, value: s.unit === 'W' ? b.value : b.value * W_TO_BTUH }))}
              />
            </Panel>
          </>
        )}
        <Note>
          Simplified steady-state method for sizing guidance (peak heating with no internal gains credited; peak cooling with all gains coinciding). For equipment selection on real projects use a full Manual J / EN 12831 / ASHRAE RTS calculation with thermal mass and hourly sun.
        </Note>
      </div>
    </Split>
  )
}
