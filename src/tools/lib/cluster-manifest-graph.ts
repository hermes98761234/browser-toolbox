// Build a relationship graph from Kubernetes-style multi-document YAML manifests.
import { parseYaml, type Json } from './yaml-validator'

type Obj = { [k: string]: Json }
export interface Res {
  id: string
  kind: string
  name: string
  ns: string
  labels: Record<string, string>
  /** Labels of the pod template (workloads) or of the object itself (Pods). */
  podLabels?: Record<string, string>
  raw: Obj
  missing?: boolean
}
export type EdgeType = 'selects' | 'routes' | 'mounts' | 'env' | 'uses' | 'scales' | 'binds' | 'claims' | 'policy'
export interface Edge { from: string; to: string; type: EdgeType; label: string }
export interface Graph { nodes: Res[]; edges: Edge[]; warnings: string[]; errors: string[] }

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const get = (o: unknown, ...path: (string | number)[]): Json | undefined => {
  let cur: unknown = o
  for (const k of path) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[k as string]
  }
  return cur as Json | undefined
}
const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
const arr = (v: unknown): Json[] => (Array.isArray(v) ? v : [])
const strMap = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {}
  if (isObj(v)) for (const [k, x] of Object.entries(v)) out[k] = str(x)
  return out
}

export const NAMESPACED_NONE = new Set(['Namespace', 'ClusterRole', 'ClusterRoleBinding', 'PersistentVolume', 'StorageClass', 'Node', 'CustomResourceDefinition', 'IngressClass'])
const WORKLOADS = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob', 'Pod', 'ReplicationController'])

/** Tier used for left-to-right layout. */
export function tier(kind: string): number {
  if (['Ingress', 'Gateway', 'HTTPRoute', 'Route'].includes(kind)) return 0
  if (['Service', 'HorizontalPodAutoscaler', 'NetworkPolicy', 'PodDisruptionBudget'].includes(kind)) return 1
  if (WORKLOADS.has(kind) || kind === 'RoleBinding' || kind === 'ClusterRoleBinding') return 2
  if (['ConfigMap', 'Secret', 'PersistentVolumeClaim', 'ServiceAccount'].includes(kind)) return 3
  if (['PersistentVolume', 'Role', 'ClusterRole', 'StorageClass'].includes(kind)) return 4
  return 5
}

/** matchLabels / matchExpressions selector test. Empty selector matches nothing here (safer for a graph). */
export function matches(sel: Json | undefined, labels: Record<string, string> | undefined, plain = false): boolean {
  if (!isObj(sel) || !labels) return false
  const ml = plain ? strMap(sel) : strMap(sel.matchLabels)
  const ex = plain ? [] : arr(sel.matchExpressions)
  if (!Object.keys(ml).length && !ex.length) return false
  for (const [k, v] of Object.entries(ml)) if (labels[k] !== v) return false
  for (const e of ex) {
    if (!isObj(e)) continue
    const k = str(e.key), op = str(e.operator), vals = arr(e.values).map(str)
    const has = k in labels
    if (op === 'In' && !(has && vals.includes(labels[k]))) return false
    if (op === 'NotIn' && has && vals.includes(labels[k])) return false
    if (op === 'Exists' && !has) return false
    if (op === 'DoesNotExist' && has) return false
  }
  return true
}

function podSpec(r: Obj, kind: string): Obj | undefined {
  if (kind === 'Pod') return isObj(r.spec) ? r.spec : undefined
  if (kind === 'CronJob') return get(r, 'spec', 'jobTemplate', 'spec', 'template', 'spec') as Obj | undefined
  return get(r, 'spec', 'template', 'spec') as Obj | undefined
}

export function buildGraph(text: string): Graph {
  const { docs, issues } = parseYaml(text)
  const errors = issues.filter((i) => i.severity === 'error').map((i) => `Line ${i.line}: ${i.message}`)
  const warnings: string[] = []
  const nodes: Res[] = []
  const flat: Obj[] = []
  for (const d of docs) {
    if (!isObj(d)) continue
    if (d.kind === 'List' && Array.isArray(d.items)) d.items.forEach((x) => isObj(x) && flat.push(x))
    else flat.push(d)
  }
  for (const d of flat) {
    const kind = str(d.kind)
    const name = str(get(d, 'metadata', 'name'))
    if (!kind || !name) { warnings.push(`Skipped a document without kind/metadata.name${kind ? ` (${kind})` : ''}`); continue }
    const ns = NAMESPACED_NONE.has(kind) ? '' : str(get(d, 'metadata', 'namespace')) || 'default'
    const labels = strMap(get(d, 'metadata', 'labels'))
    let podLabels: Record<string, string> | undefined
    if (kind === 'Pod') podLabels = labels
    else if (kind === 'CronJob') podLabels = strMap(get(d, 'spec', 'jobTemplate', 'spec', 'template', 'metadata', 'labels'))
    else if (WORKLOADS.has(kind)) podLabels = strMap(get(d, 'spec', 'template', 'metadata', 'labels'))
    const id = `${kind}/${ns ? ns + '/' : ''}${name}`
    if (nodes.some((n) => n.id === id)) warnings.push(`Duplicate resource ${id}`)
    else nodes.push({ id, kind, name, ns, labels, podLabels, raw: d })
  }

  const edges: Edge[] = []
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const ref = (from: Res, kind: string, name: string, type: EdgeType, label: string, ns = from.ns) => {
    if (!name) return
    const id = `${kind}/${NAMESPACED_NONE.has(kind) ? '' : (ns || 'default') + '/'}${name}`
    if (!byId.has(id)) {
      const m: Res = { id, kind, name, ns: NAMESPACED_NONE.has(kind) ? '' : ns || 'default', labels: {}, raw: {}, missing: true }
      byId.set(id, m)
      nodes.push(m)
      warnings.push(`${from.kind} ${from.name} references missing ${kind} "${name}"`)
    }
    if (!edges.some((e) => e.from === from.id && e.to === id && e.type === type)) edges.push({ from: from.id, to: id, type, label })
  }
  const real = nodes.slice()
  const pods = () => real.filter((n) => n.podLabels && Object.keys(n.podLabels).length)
  const selectWorkloads = (from: Res, sel: Json | undefined, plain: boolean, type: EdgeType, label: string) => {
    let hit = 0
    for (const w of pods()) if (w.ns === from.ns && w.id !== from.id && matches(sel, w.podLabels, plain)) { edges.push({ from: from.id, to: w.id, type, label }); hit++ }
    return hit
  }

  for (const n of real) {
    const r = n.raw
    switch (n.kind) {
      case 'Service': {
        const sel = get(r, 'spec', 'selector')
        if (isObj(sel) && Object.keys(sel).length && !selectWorkloads(n, sel, true, 'selects', 'selector'))
          warnings.push(`Service ${n.name} selector {${Object.entries(strMap(sel)).map(([k, v]) => `${k}=${v}`).join(', ')}} matches no pods`)
        break
      }
      case 'Ingress': {
        const svc = (b: Json | undefined, lbl: string) => {
          const name = str(get(b, 'service', 'name')) || str(get(b, 'serviceName'))
          const port = str(get(b, 'service', 'port', 'number')) || str(get(b, 'service', 'port', 'name')) || str(get(b, 'servicePort'))
          ref(n, 'Service', name, 'routes', lbl + (port ? ':' + port : ''))
        }
        svc(get(r, 'spec', 'defaultBackend') ?? get(r, 'spec', 'backend'), 'default')
        for (const rule of arr(get(r, 'spec', 'rules')))
          for (const p of arr(get(rule, 'http', 'paths'))) svc(get(p, 'backend'), `${str(get(rule, 'host')) || '*'}${str(get(p, 'path')) || '/'}`)
        for (const t of arr(get(r, 'spec', 'tls'))) ref(n, 'Secret', str(get(t, 'secretName')), 'mounts', 'tls')
        break
      }
      case 'HorizontalPodAutoscaler': {
        const t = get(r, 'spec', 'scaleTargetRef')
        ref(n, str(get(t, 'kind')) || 'Deployment', str(get(t, 'name')), 'scales', `${str(get(r, 'spec', 'minReplicas')) || 1}–${str(get(r, 'spec', 'maxReplicas'))}`)
        break
      }
      case 'NetworkPolicy':
        selectWorkloads(n, get(r, 'spec', 'podSelector'), false, 'policy', 'applies to')
        break
      case 'PodDisruptionBudget':
        selectWorkloads(n, get(r, 'spec', 'selector'), false, 'policy', 'protects')
        break
      case 'RoleBinding':
      case 'ClusterRoleBinding': {
        const rr = get(r, 'roleRef')
        ref(n, str(get(rr, 'kind')) || 'Role', str(get(rr, 'name')), 'binds', 'roleRef')
        for (const s of arr(get(r, 'subjects'))) if (str(get(s, 'kind')) === 'ServiceAccount') ref(n, 'ServiceAccount', str(get(s, 'name')), 'binds', 'subject', str(get(s, 'namespace')) || n.ns)
        break
      }
      case 'PersistentVolumeClaim':
        if (get(r, 'spec', 'volumeName')) ref(n, 'PersistentVolume', str(get(r, 'spec', 'volumeName')), 'claims', 'bound')
        break
    }
    if (WORKLOADS.has(n.kind)) {
      const sel = get(r, 'spec', 'selector')
      if (n.kind !== 'Pod' && n.kind !== 'CronJob' && n.kind !== 'Job' && isObj(sel) && n.podLabels && !matches(sel, n.podLabels, n.kind === 'ReplicationController'))
        warnings.push(`${n.kind} ${n.name}: spec.selector does not match its pod template labels`)
      const ps = podSpec(r, n.kind)
      if (!ps) continue
      ref(n, 'ServiceAccount', str(ps.serviceAccountName), 'uses', 'serviceAccount')
      for (const v of arr(ps.volumes)) {
        ref(n, 'ConfigMap', str(get(v, 'configMap', 'name')), 'mounts', 'volume')
        ref(n, 'Secret', str(get(v, 'secret', 'secretName')), 'mounts', 'volume')
        ref(n, 'PersistentVolumeClaim', str(get(v, 'persistentVolumeClaim', 'claimName')), 'claims', 'volume')
        for (const s of arr(get(v, 'projected', 'sources'))) {
          ref(n, 'ConfigMap', str(get(s, 'configMap', 'name')), 'mounts', 'projected')
          ref(n, 'Secret', str(get(s, 'secret', 'name')), 'mounts', 'projected')
        }
      }
      for (const ip of arr(ps.imagePullSecrets)) ref(n, 'Secret', str(get(ip, 'name')), 'uses', 'imagePull')
      for (const c of [...arr(ps.containers), ...arr(ps.initContainers)]) {
        for (const ef of arr(get(c, 'envFrom'))) {
          ref(n, 'ConfigMap', str(get(ef, 'configMapRef', 'name')), 'env', 'envFrom')
          ref(n, 'Secret', str(get(ef, 'secretRef', 'name')), 'env', 'envFrom')
        }
        for (const e of arr(get(c, 'env'))) {
          ref(n, 'ConfigMap', str(get(e, 'valueFrom', 'configMapKeyRef', 'name')), 'env', 'env')
          ref(n, 'Secret', str(get(e, 'valueFrom', 'secretKeyRef', 'name')), 'env', 'env')
        }
      }
      if (n.kind === 'StatefulSet') for (const t of arr(get(r, 'spec', 'volumeClaimTemplates'))) {
        const sc = str(get(t, 'spec', 'storageClassName'))
        if (sc) ref(n, 'StorageClass', sc, 'claims', 'volumeClaimTemplate')
      }
      if (n.kind === 'StatefulSet' && get(r, 'spec', 'serviceName')) ref(n, 'Service', str(get(r, 'spec', 'serviceName')), 'uses', 'governing svc')
    }
  }
  return { nodes, edges, warnings, errors }
}

export interface Pos { x: number; y: number }
/** Layered layout: columns by tier, rows ordered by barycentre of neighbours to reduce crossings. */
export function layout(g: Graph, colW = 210, rowH = 64): { pos: Map<string, Pos>; width: number; height: number } {
  const cols = new Map<number, Res[]>()
  for (const n of g.nodes) {
    const t = tier(n.kind)
    if (!cols.has(t)) cols.set(t, [])
    cols.get(t)!.push(n)
  }
  const keys = [...cols.keys()].sort((a, b) => a - b)
  const order = new Map<string, number>()
  keys.forEach((k) => cols.get(k)!.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)).forEach((n, i) => order.set(n.id, i)))
  const nb = new Map<string, string[]>()
  for (const e of g.edges) {
    nb.set(e.from, [...(nb.get(e.from) ?? []), e.to])
    nb.set(e.to, [...(nb.get(e.to) ?? []), e.from])
  }
  for (let pass = 0; pass < 4; pass++)
    for (const k of pass % 2 ? [...keys].reverse() : keys) {
      const col = cols.get(k)!
      const bary = (n: Res) => {
        const ns = nb.get(n.id) ?? []
        return ns.length ? ns.reduce((a, id) => a + (order.get(id) ?? 0), 0) / ns.length : order.get(n.id)!
      }
      const b = new Map(col.map((n) => [n.id, bary(n)]))
      col.sort((x, y) => b.get(x.id)! - b.get(y.id)!)
      col.forEach((n, i) => order.set(n.id, i))
    }
  const pos = new Map<string, Pos>()
  const maxRows = Math.max(1, ...keys.map((k) => cols.get(k)!.length))
  keys.forEach((k, ci) => {
    const col = cols.get(k)!
    const off = ((maxRows - col.length) * rowH) / 2
    col.forEach((n, i) => pos.set(n.id, { x: 20 + ci * colW, y: 20 + off + i * rowH }))
  })
  return { pos, width: 100 + keys.length * colW - (colW - 160), height: 40 + maxRows * rowH - 14 }
}

export const SAMPLE = `# Demo shop: ingress → services → workloads → config
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
  namespace: shop
spec:
  tls:
    - hosts: [shop.example.com]
      secretName: shop-tls
  rules:
    - host: shop.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service: { name: web, port: { number: 80 } }
          - path: /api
            pathType: Prefix
            backend:
              service: { name: api, port: { number: 8080 } }
---
apiVersion: v1
kind: Service
metadata: { name: web, namespace: shop }
spec:
  selector: { app: web }
  ports: [{ port: 80, targetPort: 8080 }]
---
apiVersion: v1
kind: Service
metadata: { name: api, namespace: shop }
spec:
  selector: { app: api, tier: backend }
  ports: [{ port: 8080 }]
---
apiVersion: v1
kind: Service
metadata: { name: postgres, namespace: shop }
spec:
  clusterIP: None
  selector: { app: postgres }
  ports: [{ port: 5432 }]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: shop
spec:
  replicas: 2
  selector:
    matchLabels: { app: web }
  template:
    metadata:
      labels: { app: web }
    spec:
      containers:
        - name: nginx
          image: nginx:1.27
          volumeMounts:
            - { name: conf, mountPath: /etc/nginx/conf.d }
      volumes:
        - name: conf
          configMap: { name: web-nginx }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: shop
  labels: { app: api }
spec:
  replicas: 3
  selector:
    matchLabels: { app: api }
  template:
    metadata:
      labels:
        app: api
        tier: backend
    spec:
      serviceAccountName: api
      containers:
        - name: api
          image: ghcr.io/example/api:2.4.1
          envFrom:
            - configMapRef: { name: api-config }
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef: { name: db-credentials, key: password }
            - name: STRIPE_KEY
              valueFrom:
                secretKeyRef: { name: stripe, key: key }
---
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: postgres, namespace: shop }
spec:
  serviceName: postgres
  selector:
    matchLabels: { app: postgres }
  template:
    metadata:
      labels: { app: postgres }
    spec:
      containers:
        - name: pg
          image: postgres:16
          env:
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef: { name: db-credentials, key: password }
  volumeClaimTemplates:
    - metadata: { name: data }
      spec:
        storageClassName: fast-ssd
        resources: { requests: { storage: 20Gi } }
---
apiVersion: batch/v1
kind: CronJob
metadata: { name: nightly-report, namespace: shop }
spec:
  schedule: "0 3 * * *"
  jobTemplate:
    spec:
      template:
        metadata:
          labels: { app: report }
        spec:
          restartPolicy: OnFailure
          containers:
            - name: report
              image: ghcr.io/example/report:1.0
              envFrom:
                - configMapRef: { name: api-config }
                - secretRef: { name: db-credentials }
---
apiVersion: v1
kind: ConfigMap
metadata: { name: web-nginx, namespace: shop }
data:
  default.conf: |
    server { listen 8080; location / { root /usr/share/nginx/html; } }
---
apiVersion: v1
kind: ConfigMap
metadata: { name: api-config, namespace: shop }
data: { LOG_LEVEL: info, CACHE_TTL: "300" }
---
apiVersion: v1
kind: Secret
metadata: { name: db-credentials, namespace: shop }
type: Opaque
stringData: { password: change-me }
---
apiVersion: v1
kind: Secret
metadata: { name: shop-tls, namespace: shop }
type: kubernetes.io/tls
---
apiVersion: v1
kind: ServiceAccount
metadata: { name: api, namespace: shop }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { name: config-reader, namespace: shop }
rules:
  - apiGroups: [""]
    resources: [configmaps]
    verbs: [get, list, watch]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: api-config-reader, namespace: shop }
subjects:
  - { kind: ServiceAccount, name: api, namespace: shop }
roleRef: { kind: Role, name: config-reader, apiGroup: rbac.authorization.k8s.io }
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: api, namespace: shop }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: api }
  minReplicas: 3
  maxReplicas: 12
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: db-only-from-api, namespace: shop }
spec:
  podSelector:
    matchLabels: { app: postgres }
  ingress:
    - from:
        - podSelector: { matchLabels: { app: api } }
`
