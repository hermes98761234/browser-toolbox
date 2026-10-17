// Helpers for the SQL Query Sandbox: sample CSV tables, error location, result sorting and export.
// The SQL engine itself (an SQLite-flavoured subset) lives in ./sql-query-playground.
import { parseCsv } from './csv-json-converter'
import { tableFromCsv, type Db, type Value } from './sql-query-playground'

export const SAMPLE_CSV: Record<string, string> = {
  employees: `id,name,department_id,title,salary,hired,city
1,Alice Novak,1,Engineering Manager,128000,2019-03-11,Prague
2,Bruno Silva,1,Senior Engineer,112000,2020-07-01,Lisbon
3,Chen Wei,1,Engineer,94000,2022-01-17,Prague
4,Dana Kovalenko,2,Designer,82000,2021-05-24,Kyiv
5,Elif Yilmaz,2,Design Lead,99000,2018-11-05,Berlin
6,Farid Haddad,3,Account Executive,76000,2023-02-13,Berlin
7,Greta Lind,3,Sales Director,135000,2017-09-04,Stockholm
8,Hiro Tanaka,1,Engineer,91000,2023-08-21,Lisbon
9,Ines Moreau,4,Recruiter,64000,2024-01-08,Paris
10,Jonas Weber,3,Account Executive,72000,2024-04-15,Berlin
11,Kasia Nowak,,Contractor,58000,2024-06-03,Warsaw`,
  departments: `id,name,budget
1,Engineering,900000
2,Design,300000
3,Sales,450000
4,People,150000
5,Legal,200000`,
  sales: `id,employee_id,sold_on,region,amount
1,6,2025-01-09,EMEA,12500
2,7,2025-01-15,EMEA,48200
3,10,2025-01-28,DACH,8300
4,6,2025-02-03,DACH,15100
5,7,2025-02-17,Nordics,39900
6,10,2025-02-25,DACH,11800
7,6,2025-03-05,EMEA,9700
8,7,2025-03-12,Nordics,27600
9,10,2025-03-30,EMEA,21400
10,6,2025-04-08,DACH,17300
11,7,2025-04-19,EMEA,52100
12,10,2025-04-27,Nordics,6900`,
}

export function sampleDb(): Db {
  const tables: Db['tables'] = {}
  for (const [name, csv] of Object.entries(SAMPLE_CSV)) tables[name] = tableFromCsv(name, parseCsv(csv))
  return { tables }
}

/** Turns a file name into a safe, unused table name. */
export function tableName(file: string, taken: string[]): string {
  let n = file.replace(/\.[^.]+$/, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'data'
  if (/^\d/.test(n)) n = 't_' + n
  const base = n
  for (let i = 2; taken.includes(n); i++) n = `${base}_${i}`
  return n
}

/** 1-based line/column of a character offset plus the text of that line. */
export function locate(sql: string, pos: number): { line: number; col: number; text: string } {
  const before = sql.slice(0, pos).split('\n')
  const line = before.length
  return { line, col: before[line - 1].length + 1, text: sql.split('\n')[line - 1] ?? '' }
}

/** Index permutation that sorts rows by column `c` (NULLs first ascending, numbers before text). */
export function sortIndex(rows: Value[][], c: number, dir: 1 | -1): number[] {
  const rank = (v: Value) => (v === null ? 0 : typeof v === 'number' ? 1 : 2)
  return rows
    .map((_, i) => i)
    .sort((a, b) => {
      const x = rows[a][c], y = rows[b][c]
      const r = rank(x) - rank(y)
      if (r) return r * dir
      if (x === null || y === null) return a - b
      const d = typeof x === 'number' ? x - (y as number) : String(x).localeCompare(String(y), undefined, { numeric: true })
      return d ? d * dir : a - b
    })
}

/** Markdown table of a result (for pasting into docs/issues). */
export function toMarkdown(cols: string[], rows: Value[][]): string {
  const esc = (v: Value) => (v === null ? 'NULL' : String(v).replace(/\|/g, '\\|').replace(/\n/g, ' '))
  return [`| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n')
}

/** Statement keyword list for the quick-reference card. */
export const SUPPORTED = [
  'SELECT [DISTINCT] … FROM … [AS alias]',
  '[INNER | LEFT | CROSS] JOIN … ON …',
  'WHERE / GROUP BY / HAVING / ORDER BY … [ASC|DESC] / LIMIT n OFFSET m',
  'count sum avg min max total group_concat (with DISTINCT)',
  'CASE WHEN, CAST, IN (list | subquery), EXISTS, BETWEEN, LIKE, IS NULL',
  'upper lower length trim ltrim rtrim substr replace instr ||',
  'abs round floor ceil sqrt power sign coalesce ifnull nullif iif typeof',
  "date datetime julianday strftime('%Y-%m', d) with modifiers ('+7 days', 'start of month')",
  'CREATE TABLE [AS SELECT], INSERT, UPDATE, DELETE, DROP TABLE',
]
