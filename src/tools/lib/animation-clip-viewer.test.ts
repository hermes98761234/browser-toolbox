import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { BONE_NAMES, bindPositions, buildCharacter, fmtTime, makeClip, trackInfo } from './animation-clip-viewer'

describe('animation clip viewer rig', () => {
  it('builds a bound skinned mesh with every bone', () => {
    const { mesh, clips } = buildCharacter()
    expect(mesh.isSkinnedMesh).toBe(true)
    expect(mesh.skeleton.bones.map((b) => b.name)).toEqual(BONE_NAMES)
    const w = mesh.geometry.attributes.skinWeight
    for (let i = 0; i < w.count; i += 37) expect(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i)).toBeCloseTo(1, 6)
    expect(clips.map((c) => c.name)).toEqual(['Idle', 'Walk', 'Run', 'Wave', 'Jump', 'Dance'])
    for (const c of clips) expect(c.validate()).toBe(true)
  })
  it('bind positions accumulate parent offsets', () => {
    const p = bindPositions()
    expect(p.Head[1]).toBeCloseTo(1.64, 6)
    expect(p['Foot.L']).toEqual([0.1, 1 - 0.05 - 0.44 - 0.42, 0])
  })
  it('periodic poses loop seamlessly and tracks target real bones', () => {
    const c = makeClip('t', 1, (t) => ({ Head: [0, Math.sin(t * Math.PI * 2), 0] }), () => [0, 1, 0], 10)
    const tr = c.tracks[0]
    expect(tr.times.length).toBe(11)
    const v = tr.values
    for (let k = 0; k < 4; k++) expect(v[k]).toBeCloseTo(v[v.length - 4 + k], 6)
    expect(trackInfo(c.tracks[1])).toEqual({ target: 'Hips', prop: 'position', keys: 11, interp: 'linear' })
    const names = new Set(BONE_NAMES)
    for (const clip of buildCharacter().clips) for (const t of clip.tracks) expect(names.has(t.name.split('.').slice(0, -1).join('.'))).toBe(true)
  })
  it('formats times', () => {
    expect(fmtTime(65.5)).toBe('1:05.50')
    expect(new THREE.Quaternion().w).toBe(1)
  })
})
