import { describe, expect, it } from 'vitest'
import { execute, SqlError, sqlDate, strftime } from './sql-query-playground'
import { locate, sampleDb, sortIndex, tableName, toMarkdown } from './sql-query-sandbox'

const q = (sql: string) => execute(sampleDb(), sql).results[0]

describe('sql-query-sandbox', () => {
  it('loads typed sample tables from CSV', () => {
    const db = sampleDb()
    expect(db.tables.employees.cols.find((c) => c.name === 'salary')?.type).toBe('INTEGER')
    expect(db.tables.employees.rows).toHaveLength(11)
  })
  it('joins, groups and filters', () => {
    const r = q(`SELECT d.name, count(e.id) AS n, avg(e.salary) AS avg FROM departments d LEFT JOIN employees e ON e.department_id = d.id
      GROUP BY d.name HAVING n > 0 ORDER BY n DESC, d.name`)
    expect(r.rows[0]).toEqual(['Engineering', 4, (128000 + 112000 + 94000 + 91000) / 4])
    expect(r.rows).toHaveLength(4)
  })
  it('date functions follow SQLite semantics', () => {
    expect(q(`SELECT date('2025-01-31', '+1 month')`).rows[0][0]).toBe('2025-03-03')
    expect(q(`SELECT date('2025-02-17', 'start of month')`).rows[0][0]).toBe('2025-02-01')
    expect(q(`SELECT julianday('2000-01-01')`).rows[0][0]).toBe(2451544.5)
    expect(q(`SELECT julianday('2025-03-01') - julianday('2025-02-01')`).rows[0][0]).toBe(28)
    expect(q(`SELECT strftime('%Y-%m', sold_on) AS m, sum(amount) FROM sales GROUP BY m ORDER BY m LIMIT 1`).rows[0]).toEqual(['2025-01', 69000])
    expect(strftime('%j %w', sqlDate(['2025-01-05'])!)).toBe('005 0')
    expect(sqlDate(['nonsense'])).toBeNull()
  })
  it('reports error positions', () => {
    try {
      execute(sampleDb(), 'SELECT name\nFROM employees WHERE salary >')
      throw new Error('should fail')
    } catch (e) {
      expect(e).toBeInstanceOf(SqlError)
      const pos = (e as SqlError).pos!
      expect(locate('SELECT name\nFROM employees WHERE salary >', pos)).toMatchObject({ line: 2, col: 30 })
    }
  })
  it('helpers', () => {
    expect(tableName('My Sales 2025.csv', [])).toBe('my_sales_2025')
    expect(tableName('2025.csv', ['t_2025'])).toBe('t_2025_2')
    expect(sortIndex([[3], [null], ['b'], [1]], 0, 1)).toEqual([1, 3, 0, 2])
    expect(toMarkdown(['a'], [[null], ['x|y']])).toBe('| a |\n| --- |\n| NULL |\n| x\\|y |')
  })
})
