// Principal component analysis: covariance/correlation matrix + Jacobi eigen decomposition.

/** Eigen decomposition of a symmetric matrix (cyclic Jacobi). Columns of `vectors` are eigenvectors, sorted by descending value. */
export function eigSym(A: number[][]): { values: number[]; vectors: number[][] } {
  const n = A.length
  const a = A.map((r) => [...r])
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] ** 2
    if (off < 1e-22) break
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q]
          a[k][p] = c * akp - s * akq
          a[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k]
          a[p][k] = c * apk - s * aqk
          a[q][k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q]
          v[k][p] = c * vkp - s * vkq
          v[k][q] = s * vkp + c * vkq
        }
      }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[j][j] - a[i][i])
  const values = order.map((i) => Math.max(0, a[i][i]))
  const vectors = v.map((row) => order.map((i) => row[i]))
  // deterministic sign: largest |loading| of each component is positive
  for (let j = 0; j < n; j++) {
    let big = 0
    for (let i = 0; i < n; i++) if (Math.abs(vectors[i][j]) > Math.abs(vectors[big][j])) big = i
    if (vectors[big][j] < 0) for (let i = 0; i < n; i++) vectors[i][j] = -vectors[i][j]
  }
  return { values, vectors }
}

export interface PCA {
  mean: number[]
  scale: number[]
  values: number[] // eigenvalues (variance per PC)
  loadings: number[][] // [feature][pc]
  explained: number[] // fraction per PC
  cumulative: number[]
  scores: number[][] // [row][pc]
}

export function pca(X: number[][], standardize: boolean): PCA {
  const n = X.length
  const d = X[0]?.length ?? 0
  const mean = Array.from({ length: d }, (_, j) => X.reduce((s, r) => s + r[j], 0) / n)
  const sd = Array.from({ length: d }, (_, j) => Math.sqrt(X.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / (n - 1)))
  const scale = sd.map((s) => (standardize ? s || 1 : 1))
  const Z = X.map((r) => r.map((x, j) => (x - mean[j]) / scale[j]))
  const C = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => Z.reduce((s, r) => s + r[i] * r[j], 0) / (n - 1)))
  const { values, vectors } = eigSym(C)
  const total = values.reduce((a, b) => a + b, 0) || 1
  const explained = values.map((v) => v / total)
  let acc = 0
  const cumulative = explained.map((e) => (acc += e))
  const scores = Z.map((r) => vectors[0].map((_, k) => r.reduce((s, x, j) => s + x * vectors[j][k], 0)))
  return { mean, scale, values, loadings: vectors, explained, cumulative, scores }
}

export interface Dataset {
  features: string[]
  rows: number[][]
  labels: string[]
}

/** Parses CSV/TSV with a header. Numeric columns become features; the first non-numeric column becomes the label. */
export function parseTable(text: string): Dataset | string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 3) return 'Need a header row and at least 2 data rows.'
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') && !lines[0].includes(',') ? ';' : ','
  const cells = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')))
  const head = cells[0]
  const body = cells.slice(1).filter((r) => r.length >= head.length)
  const numeric = head.map((_, j) => body.every((r) => r[j] !== '' && Number.isFinite(Number(r[j]))))
  const feat = head.map((_, j) => j).filter((j) => numeric[j])
  if (feat.length < 2) return 'Need at least 2 numeric columns.'
  const lab = head.findIndex((_, j) => !numeric[j])
  return {
    features: feat.map((j) => head[j]),
    rows: body.map((r) => feat.map((j) => Number(r[j]))),
    labels: body.map((r) => (lab >= 0 ? r[lab] : 'all')),
  }
}

// Fisher's Iris (UCI), values ×10: sepal length, sepal width, petal length, petal width.
const IRIS =
  '51351402 49301402 47321302 46311502 50361402 54391704 46341403 50341502 44291402 49311501 54371502 48341602 48301401 43301101 58401202 57441504 54391304 51351403 57381703 51381503 ' +
  '54341702 51371504 46361002 51331705 48341902 50301602 50341604 52351502 52341402 47321602 48311602 54341504 52411501 55421402 49311502 50321202 55351302 49361401 44301302 51341502 ' +
  '50351303 45231303 44321302 50351606 51381904 48301403 51381602 46321402 53371502 50331402 ' +
  '70324714 64324515 69314915 55234013 65284615 57284513 63334716 49243310 66294613 52273914 50203510 59304215 60224010 61294714 56293613 67314414 56304515 58274110 62224515 56253911 ' +
  '59324818 61284013 63254915 61284712 64294313 66304414 68284814 67305017 60294515 57263510 55243811 55243710 58273912 60275116 54304515 60344516 67314715 63234413 56304113 55254013 ' +
  '55264412 61304614 58264012 50233310 56274213 57304212 57294213 62294313 51253011 57284113 ' +
  '63336025 58275119 71305921 63295618 65305822 76306621 49254517 73296318 67255818 72366125 65325120 64275319 68305521 57255020 58285124 64325323 65305518 77386722 77266923 60225015 ' +
  '69325723 56284920 77286720 63274918 67335721 72326018 62284818 61304918 64285621 72305816 74286119 79386420 64285622 63285115 61265614 77306123 63345624 64315518 60304818 69315421 ' +
  '67315624 69315123 58275119 68325923 67335725 67305223 63255019 65305220 62345423 59305118'

export function iris(): Dataset {
  const rows = IRIS.split(' ').map((r) => [0, 2, 4, 6].map((k) => Number(r.slice(k, k + 2)) / 10))
  const sp = ['setosa', 'versicolor', 'virginica']
  return { features: ['sepal length', 'sepal width', 'petal length', 'petal width'], rows, labels: rows.map((_, i) => sp[Math.floor(i / 50)]) }
}

/** Seeded synthetic data: 3 clusters living on a tilted 2-D plane inside 6-D space plus small noise. */
export function blobs(seed = 7): Dataset {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd())
  const u = [0.5, 0.3, -0.4, 0.6, 0.2, -0.3], w = [-0.2, 0.6, 0.5, 0.1, -0.5, 0.3]
  const centers = [[-3, -1], [2, -2], [0.5, 3]]
  const rows: number[][] = []
  const labels: string[] = []
  centers.forEach(([cx, cy], k) => {
    for (let i = 0; i < 60; i++) {
      const a = cx + gauss() * 0.9, b = cy + gauss() * 0.9
      rows.push(u.map((ui, j) => 10 + a * ui + b * w[j] + gauss() * 0.25))
      labels.push(`cluster ${'ABC'[k]}`)
    }
  })
  return { features: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'], rows, labels }
}
