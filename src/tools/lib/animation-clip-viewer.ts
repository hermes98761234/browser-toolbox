// Procedural rigged character (SkinnedMesh + Bones) with hand-authored AnimationClips,
// so the viewer has something to play without downloading any model file.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type V3 = [number, number, number]
/** name, parent, local offset from parent (bind pose has identity rotations). */
const BONES: [string, string | null, V3][] = [
  ['Hips', null, [0, 1.0, 0]],
  ['Spine', 'Hips', [0, 0.12, 0]],
  ['Chest', 'Spine', [0, 0.2, 0]],
  ['Neck', 'Chest', [0, 0.24, 0]],
  ['Head', 'Neck', [0, 0.08, 0]],
  ['UpperArm.L', 'Chest', [0.21, 0.19, 0]],
  ['LowerArm.L', 'UpperArm.L', [0, -0.29, 0]],
  ['Hand.L', 'LowerArm.L', [0, -0.26, 0]],
  ['UpperArm.R', 'Chest', [-0.21, 0.19, 0]],
  ['LowerArm.R', 'UpperArm.R', [0, -0.29, 0]],
  ['Hand.R', 'LowerArm.R', [0, -0.26, 0]],
  ['Thigh.L', 'Hips', [0.1, -0.05, 0]],
  ['Shin.L', 'Thigh.L', [0, -0.44, 0]],
  ['Foot.L', 'Shin.L', [0, -0.42, 0]],
  ['Thigh.R', 'Hips', [-0.1, -0.05, 0]],
  ['Shin.R', 'Thigh.R', [0, -0.44, 0]],
  ['Foot.R', 'Shin.R', [0, -0.42, 0]],
]
export const BONE_NAMES = BONES.map((b) => b[0])

/** World-space bind position of every bone. */
export function bindPositions(): Record<string, V3> {
  const out: Record<string, V3> = {}
  for (const [n, p, o] of BONES) {
    const b = p ? out[p] : [0, 0, 0]
    out[n] = [b[0] + o[0], b[1] + o[1], b[2] + o[2]]
  }
  return out
}

interface Part { geo: THREE.BufferGeometry; bone: string; parent?: string; from: V3; to: V3; color: string }

/** Tag each vertex with skin indices/weights: blends into the parent bone near the joint. */
function skin(p: Part, idx: Record<string, number>) {
  const pos = p.geo.attributes.position
  const a = new THREE.Vector3(...p.from), ab = new THREE.Vector3(...p.to).sub(a)
  const len2 = ab.lengthSq() || 1
  const si: number[] = [], sw: number[] = [], col: number[] = []
  const c = new THREE.Color(p.color)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(a)
    const t = THREE.MathUtils.clamp(v.dot(ab) / len2, 0, 1)
    const wb = p.parent && t < 0.3 ? 0.5 + (t / 0.3) * 0.5 : 1
    si.push(idx[p.bone], p.parent ? idx[p.parent] : 0, 0, 0)
    sw.push(wb, 1 - wb, 0, 0)
    col.push(c.r, c.g, c.b)
  }
  p.geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
  p.geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
  p.geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  if (p.geo.attributes.uv) p.geo.deleteAttribute('uv')
  return p.geo
}

/** Capsule-ish limb between two world points (along -Y in bind pose). */
function limb(from: V3, to: V3, r0: number, r1: number) {
  const h = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
  const g = new THREE.CylinderGeometry(r0, r1, h, 12, 6)
  g.translate((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2)
  return g
}

export function buildCharacter(): { mesh: THREE.SkinnedMesh; clips: THREE.AnimationClip[] } {
  const P = bindPositions()
  const bones: Record<string, THREE.Bone> = {}
  for (const [n, p, o] of BONES) {
    const b = new THREE.Bone()
    b.name = n
    b.position.set(...o)
    bones[n] = b
    if (p) bones[p].add(b)
  }
  const list = BONES.map(([n]) => bones[n])
  const idx = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]))
  const skinC = '#f2c29b', shirt = '#6366f1', pants = '#334155', shoe = '#0f172a'
  const parts: Part[] = []
  const add = (geo: THREE.BufferGeometry, bone: string, parent: string | undefined, from: V3, to: V3, color: string) => parts.push({ geo, bone, parent, from, to, color })
  const box = (w: number, h: number, d: number, c: V3) => new THREE.BoxGeometry(w, h, d, 2, 3, 2).translate(...c)
  add(box(0.3, 0.18, 0.18, [0, 0.98, 0]), 'Hips', undefined, P.Hips, P.Spine, pants)
  add(limb(P.Spine, P.Chest, 0.13, 0.13), 'Spine', 'Hips', P.Spine, P.Chest, shirt)
  add(box(0.4, 0.28, 0.2, [0, P.Chest[1] + 0.12, 0]), 'Chest', 'Spine', P.Chest, P.Neck, shirt)
  add(limb(P.Neck, P.Head, 0.05, 0.05), 'Neck', 'Chest', P.Neck, P.Head, skinC)
  add(new THREE.SphereGeometry(0.13, 16, 12).scale(1, 1.15, 1.05).translate(P.Head[0], P.Head[1] + 0.13, P.Head[2]), 'Head', undefined, P.Head, P.Head, skinC)
  add(box(0.12, 0.03, 0.04, [0, P.Head[1] + 0.16, 0.13]), 'Head', undefined, P.Head, P.Head, '#1e293b') // eyes band
  for (const s of ['L', 'R']) {
    const u = P[`UpperArm.${s}`], l = P[`LowerArm.${s}`], h = P[`Hand.${s}`]
    const t = P[`Thigh.${s}`], k = P[`Shin.${s}`], f = P[`Foot.${s}`]
    add(limb(u, l, 0.06, 0.05), `UpperArm.${s}`, 'Chest', u, l, shirt)
    add(limb(l, h, 0.05, 0.04), `LowerArm.${s}`, `UpperArm.${s}`, l, h, skinC)
    add(box(0.07, 0.11, 0.04, [h[0], h[1] - 0.06, h[2]]), `Hand.${s}`, `LowerArm.${s}`, h, [h[0], h[1] - 0.12, h[2]], skinC)
    add(limb(t, k, 0.085, 0.065), `Thigh.${s}`, 'Hips', t, k, pants)
    add(limb(k, f, 0.06, 0.05), `Shin.${s}`, `Thigh.${s}`, k, f, pants)
    add(box(0.1, 0.07, 0.22, [f[0], f[1] - 0.04, f[2] + 0.05]), `Foot.${s}`, `Shin.${s}`, f, [f[0], f[1], f[2] + 0.16], shoe)
  }
  const geo = mergeGeometries(parts.map((p) => skin({ ...p, geo: p.geo.toNonIndexed() }, idx)))!
  geo.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, flatShading: true })
  const mesh = new THREE.SkinnedMesh(geo, mat)
  mesh.name = 'Procedural character'
  mesh.add(bones.Hips)
  mesh.bind(new THREE.Skeleton(list))
  return { mesh, clips: buildClips() }
}

type Pose = Partial<Record<string, V3>>
/** Samples pose(t) into quaternion tracks (+ optional hip translation). Periodic functions loop cleanly. */
export function makeClip(name: string, duration: number, pose: (t: number) => Pose, hips?: (t: number) => V3, fps = 30): THREE.AnimationClip {
  const n = Math.max(2, Math.round(duration * fps))
  const times = Array.from({ length: n + 1 }, (_, i) => (i / n) * duration)
  const samples = times.map(pose)
  const used = new Set(samples.flatMap((s) => Object.keys(s)))
  const q = new THREE.Quaternion(), e = new THREE.Euler()
  const tracks: THREE.KeyframeTrack[] = [...used].map((b) => {
    const vals: number[] = []
    for (const s of samples) {
      const r = s[b] ?? [0, 0, 0]
      q.setFromEuler(e.set(r[0], r[1], r[2]))
      vals.push(q.x, q.y, q.z, q.w)
    }
    return new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, vals)
  })
  if (hips) tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, times.flatMap(hips)))
  return new THREE.AnimationClip(name, duration, tracks)
}

const S = Math.sin, C = Math.cos, TAU = Math.PI * 2

export function buildClips(): THREE.AnimationClip[] {
  const arms = (z: number): Pose => ({ 'UpperArm.L': [0, 0, z], 'UpperArm.R': [0, 0, -z] })
  return [
    makeClip('Idle', 3, (t) => {
      const b = S((t / 3) * TAU)
      return { ...arms(0.08 + 0.02 * b), Chest: [0.03 * b, 0, 0], Head: [0.03 * S((t / 3) * TAU * 2), 0.1 * S((t / 3) * TAU), 0], Spine: [0, 0, 0.015 * b], 'LowerArm.L': [-0.12, 0, 0], 'LowerArm.R': [-0.12, 0, 0] }
    }, (t) => [0, 1 + 0.008 * S((t / 3) * TAU), 0]),
    makeClip('Walk', 1.1, (t) => {
      const p = (t / 1.1) * TAU, s = S(p)
      return {
        'Thigh.L': [-0.5 * s, 0, 0], 'Thigh.R': [0.5 * s, 0, 0],
        'Shin.L': [0.55 * Math.max(0, S(p + 1.6)) + 0.05, 0, 0], 'Shin.R': [0.55 * Math.max(0, S(p + Math.PI + 1.6)) + 0.05, 0, 0],
        'Foot.L': [0.2 * s, 0, 0], 'Foot.R': [-0.2 * s, 0, 0],
        'UpperArm.L': [0.45 * s, 0, 0.08], 'UpperArm.R': [-0.45 * s, 0, -0.08],
        'LowerArm.L': [-0.3 - 0.15 * s, 0, 0], 'LowerArm.R': [-0.3 + 0.15 * s, 0, 0],
        Spine: [0.04, 0.08 * s, 0], Chest: [0, -0.12 * s, 0], Head: [0, 0.06 * s, 0],
      }
    }, (t) => [0, 1 - 0.025 * Math.abs(C((t / 1.1) * TAU)), 0]),
    makeClip('Run', 0.7, (t) => {
      const p = (t / 0.7) * TAU, s = S(p)
      return {
        'Thigh.L': [-0.9 * s - 0.15, 0, 0], 'Thigh.R': [0.9 * s - 0.15, 0, 0],
        'Shin.L': [1.1 * Math.max(0, S(p + 1.4)) + 0.25, 0, 0], 'Shin.R': [1.1 * Math.max(0, S(p + Math.PI + 1.4)) + 0.25, 0, 0],
        'UpperArm.L': [0.8 * s, 0, 0.12], 'UpperArm.R': [-0.8 * s, 0, -0.12],
        'LowerArm.L': [-1.3, 0, 0], 'LowerArm.R': [-1.3, 0, 0],
        Spine: [0.22, 0.12 * s, 0], Chest: [0, -0.18 * s, 0], Head: [-0.15, 0, 0],
      }
    }, (t) => [0, 0.97 + 0.06 * Math.abs(S((t / 0.7) * TAU)), 0]),
    makeClip('Wave', 2, (t) => {
      const w = S((t / 2) * TAU * 3)
      const up = Math.min(1, S((t / 2) * Math.PI) * 3)
      return { 'UpperArm.R': [0, 0, -0.1 - 2.6 * up], 'LowerArm.R': [0, 0, -0.5 * up * (1 + 0.6 * w)], 'Hand.R': [0, 0, -0.2 * w * up], 'UpperArm.L': [0, 0, 0.08], Head: [0, -0.15 * up, 0.08 * up], Chest: [0, 0, 0.05 * up] }
    }),
    makeClip('Jump', 1.4, (t) => {
      const u = t / 1.4
      const crouch = u < 0.25 ? S((u / 0.25) * Math.PI / 2) : u < 0.35 ? 1 - (u - 0.25) / 0.1 : u > 0.8 ? S(((u - 0.8) / 0.2) * Math.PI) * 0.8 : 0
      const air = u >= 0.3 && u <= 0.82 ? S(((u - 0.3) / 0.52) * Math.PI) : 0
      return {
        'Thigh.L': [-1.1 * crouch - 0.4 * air, 0, 0], 'Thigh.R': [-1.1 * crouch - 0.4 * air, 0, 0],
        'Shin.L': [1.8 * crouch + 0.6 * air, 0, 0], 'Shin.R': [1.8 * crouch + 0.6 * air, 0, 0],
        'Foot.L': [-0.7 * crouch, 0, 0], 'Foot.R': [-0.7 * crouch, 0, 0],
        Spine: [0.45 * crouch, 0, 0], Head: [-0.3 * crouch, 0, 0],
        'UpperArm.L': [0.9 * crouch - 2.4 * air, 0, 0.15], 'UpperArm.R': [0.9 * crouch - 2.4 * air, 0, -0.15],
        'LowerArm.L': [-0.4 * crouch, 0, 0], 'LowerArm.R': [-0.4 * crouch, 0, 0],
      }
    }, (t) => {
      const u = t / 1.4
      const crouch = u < 0.25 ? S((u / 0.25) * Math.PI / 2) : u < 0.35 ? 1 - (u - 0.25) / 0.1 : u > 0.8 ? S(((u - 0.8) / 0.2) * Math.PI) * 0.8 : 0
      const air = u >= 0.3 && u <= 0.82 ? S(((u - 0.3) / 0.52) * Math.PI) : 0
      return [0, 1 - 0.32 * crouch + 0.7 * air, 0]
    }),
    makeClip('Dance', 2.4, (t) => {
      const p = (t / 2.4) * TAU, b = S(p * 2)
      return {
        Hips: [0, 0.35 * S(p), 0.08 * b], Spine: [0, -0.2 * S(p), -0.1 * b], Chest: [0.05, 0, -0.08 * b], Head: [0.12 * Math.abs(b), 0.2 * S(p), 0],
        'UpperArm.L': [-1.2 - 0.6 * S(p), 0, 0.6 + 0.4 * b], 'UpperArm.R': [-1.2 + 0.6 * S(p), 0, -0.6 + 0.4 * b],
        'LowerArm.L': [-1.2, 0, 0.3 * b], 'LowerArm.R': [-1.2, 0, 0.3 * b],
        'Thigh.L': [-0.3 * Math.max(0, b), 0, 0.1], 'Thigh.R': [-0.3 * Math.max(0, -b), 0, -0.1],
        'Shin.L': [0.6 * Math.max(0, b), 0, 0], 'Shin.R': [0.6 * Math.max(0, -b), 0, 0],
      }
    }, (t) => [0, 1 - 0.05 * Math.abs(S((t / 2.4) * TAU * 2)), 0]),
  ]
}

/** Short description of a track for the track table. */
export function trackInfo(t: THREE.KeyframeTrack) {
  const dot = t.name.lastIndexOf('.')
  return { target: t.name.slice(0, dot), prop: t.name.slice(dot + 1), keys: t.times.length, interp: t.getInterpolation() === THREE.InterpolateDiscrete ? 'step' : t.getInterpolation() === THREE.InterpolateSmooth ? 'smooth' : 'linear' }
}

export function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`
}
