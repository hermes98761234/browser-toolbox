// Towing weight checks: trailer vs tow rating, tongue weight, payload, GVWR, GCWR, axle loads.

export interface Inputs {
  gvwr: number; gcwr: number; towBraked: number; towUnbraked: number; maxTongue: number; curb: number; payload: number
  rearGawr: number; frontGawr: number
  people: number; cargo: number; hitch: number
  trailerEmpty: number; trailerCargo: number; trailerGvwr: number; tonguePct: number; braked: boolean; fifth: boolean
  axleOn: boolean; frontUnhitched: number; rearUnhitched: number; wheelbase: number; overhang: number
}

export type Status = 'ok' | 'warn' | 'fail' | 'na'
export interface Check { name: string; actual: number; limit: number; ratio: number; status: Status; tip: string; unit?: string }

export const LB_PER_KG = 2.20462262185

const status = (r: number, warnAt = 0.9): Status => (!Number.isFinite(r) ? 'na' : r > 1 ? 'fail' : r >= warnAt ? 'warn' : 'ok')

export function derive(i: Inputs) {
  const trailer = i.trailerEmpty + i.trailerCargo
  const tongue = (trailer * i.tonguePct) / 100
  const payloadCap = i.payload > 0 ? i.payload : i.gvwr - i.curb
  const payloadUsed = i.people + i.cargo + i.hitch + tongue
  const vehicleGross = i.curb + payloadUsed
  const combined = i.curb + i.people + i.cargo + i.hitch + trailer
  const tow = i.braked ? i.towBraked : i.towUnbraked
  // weight-on-axle shift from tongue load acting behind the rear axle (lever rule)
  const wb = i.wheelbase, oh = i.overhang
  const rearAxle = i.axleOn && wb > 0 ? i.rearUnhitched + (tongue * (wb + oh)) / wb : NaN
  const frontAxle = i.axleOn && wb > 0 ? i.frontUnhitched - (tongue * oh) / wb : NaN
  return { trailer, tongue, payloadCap, payloadUsed, vehicleGross, combined, tow, rearAxle, frontAxle }
}

export function checks(i: Inputs): Check[] {
  const d = derive(i)
  const [lo, hi] = i.fifth ? [15, 25] : [10, 15]
  const out: Check[] = [
    { name: `Trailer weight vs ${i.braked ? 'braked' : 'unbraked'} towing capacity`, actual: d.trailer, limit: d.tow, ratio: d.trailer / d.tow, status: status(d.trailer / d.tow, 0.8),
      tip: 'Many experts suggest staying below about 80% of the rated capacity for margin on hills, wind and heat.' },
    { name: 'Tongue weight vs hitch rating', actual: d.tongue, limit: i.maxTongue, ratio: d.tongue / i.maxTongue, status: status(d.tongue / i.maxTongue), tip: 'Use the lowest rating of the vehicle, hitch receiver and ball mount.' },
    { name: 'Payload (people + cargo + hitch + tongue)', actual: d.payloadUsed, limit: d.payloadCap, ratio: d.payloadUsed / d.payloadCap, status: status(d.payloadUsed / d.payloadCap), tip: 'Payload is usually the first limit you hit with a pickup or SUV.' },
    { name: 'Vehicle gross weight vs GVWR', actual: d.vehicleGross, limit: i.gvwr, ratio: d.vehicleGross / i.gvwr, status: status(d.vehicleGross / i.gvwr), tip: 'GVWR includes the tongue weight pressing on the hitch.' },
    { name: 'Combined weight vs GCWR', actual: d.combined, limit: i.gcwr, ratio: d.combined / i.gcwr, status: status(d.combined / i.gcwr), tip: 'Everything rolling: tow vehicle, occupants, cargo and loaded trailer.' },
    { name: 'Loaded trailer vs trailer GVWR', actual: d.trailer, limit: i.trailerGvwr, ratio: d.trailer / i.trailerGvwr, status: status(d.trailer / i.trailerGvwr), tip: 'Shown on the trailer’s VIN plate or sticker.' },
  ]
  const pctStatus: Status = i.tonguePct < lo ? 'fail' : i.tonguePct > hi ? 'warn' : 'ok'
  out.push({ name: `Tongue weight share (${lo}–${hi}% recommended)`, actual: i.tonguePct, limit: hi, ratio: i.tonguePct / hi, status: pctStatus, unit: '%',
    tip: i.tonguePct < lo ? 'Too little tongue weight makes trailers sway: move cargo forward.' : i.tonguePct > hi ? 'Heavy tongue overloads the rear axle and lightens steering: move cargo back over the trailer axles.' : 'Good balance.' })
  if (i.axleOn && i.wheelbase > 0) {
    out.push({ name: 'Rear axle load vs rear GAWR', actual: d.rearAxle, limit: i.rearGawr, ratio: d.rearAxle / i.rearGawr, status: status(d.rearAxle / i.rearGawr), tip: 'Estimated with the lever rule from your scale readings. A weight-distribution hitch shifts some load forward.' })
    const loss = i.frontUnhitched > 0 ? 1 - d.frontAxle / i.frontUnhitched : 0
    out.push({ name: 'Front axle unloading', actual: loss * 100, limit: 100, ratio: loss, unit: '%', status: loss > 0.1 ? 'warn' : 'ok',
      tip: loss > 0.1 ? 'More than ~10% lighter steering axle: consider a weight-distribution hitch.' : 'Steering axle keeps most of its load.' })
  }
  return out
}

export const worst = (cs: Check[]): Status => (cs.some((c) => c.status === 'fail') ? 'fail' : cs.some((c) => c.status === 'warn') ? 'warn' : 'ok')
