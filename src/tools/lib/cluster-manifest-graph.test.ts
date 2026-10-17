import { describe, expect, it } from 'vitest'
import { buildGraph, layout, matches, SAMPLE } from './cluster-manifest-graph'

describe('cluster manifest graph', () => {
  it('parses the sample and links resources', () => {
    const g = buildGraph(SAMPLE)
    expect(g.errors).toEqual([])
    const has = (from: string, to: string) => g.edges.some((e) => e.from === from && e.to === to)
    expect(has('Ingress/shop/shop', 'Service/shop/web')).toBe(true)
    expect(has('Ingress/shop/shop', 'Service/shop/api')).toBe(true)
    expect(has('Service/shop/api', 'Deployment/shop/api')).toBe(true)
    expect(has('Deployment/shop/api', 'Secret/shop/db-credentials')).toBe(true)
    expect(has('HorizontalPodAutoscaler/shop/api', 'Deployment/shop/api')).toBe(true)
    expect(has('RoleBinding/shop/api-config-reader', 'ServiceAccount/shop/api')).toBe(true)
    expect(has('NetworkPolicy/shop/db-only-from-api', 'StatefulSet/shop/postgres')).toBe(true)
    // Missing secret "stripe" becomes a dangling node with a warning
    expect(g.nodes.find((n) => n.id === 'Secret/shop/stripe')?.missing).toBe(true)
    expect(g.warnings.some((w) => w.includes('stripe'))).toBe(true)
    const l = layout(g)
    expect(l.pos.size).toBe(g.nodes.length)
  })
  it('selector semantics', () => {
    expect(matches({ matchLabels: { app: 'a' } }, { app: 'a', x: '1' })).toBe(true)
    expect(matches({ matchExpressions: [{ key: 'env', operator: 'In', values: ['prod'] }] }, { env: 'dev' })).toBe(false)
    expect(matches({ matchExpressions: [{ key: 'env', operator: 'DoesNotExist' }] }, { app: 'x' })).toBe(true)
    expect(matches({ app: 'a' }, { app: 'b' }, true)).toBe(false)
  })
  it('warns when a service selects nothing and on namespace mismatch', () => {
    const g = buildGraph(`kind: Service\nmetadata: {name: s, namespace: a}\nspec: {selector: {app: x}}\n---\nkind: Pod\nmetadata: {name: p, namespace: b, labels: {app: x}}\nspec: {containers: [{name: c, image: i}]}`)
    expect(g.edges.length).toBe(0)
    expect(g.warnings[0]).toMatch(/matches no pods/)
  })
})
