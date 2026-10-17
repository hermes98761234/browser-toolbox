import { describe, expect, it } from 'vitest'
import { execute, likeToRegex, sampleDb, SqlError, tableFromCsv, tokenize, type Db } from './sql-query-playground'

const q = (sql: string, db: Db = sampleDb()) => execute(db, sql).results.at(-1)!

describe('tokenizer', () => {
  it('handles strings, quoted names and comments', () => {
    const t = tokenize(`SELECT 'it''s', "my col" -- note\n FROM t /* x */`)
    expect(t.map((x) => x.v)).toEqual(['SELECT', "it's", ',', 'my col', 'FROM', 't', ''])
  })
})

describe('select', () => {
  it('where, order, limit, offset', () => {
    const r = q('SELECT name, price FROM products WHERE price > 50 ORDER BY price DESC LIMIT 2 OFFSET 1')
    expect(r.columns).toEqual(['name', 'price'])
    expect(r.rows).toEqual([['34" ultrawide', 429], ['27" monitor', 249]])
  })
  it('expressions, aliases, LIKE, IN, BETWEEN, CASE', () => {
    expect(q("SELECT upper(name) AS n, price * 2 FROM products WHERE name LIKE '%desk%' ORDER BY 1").rows).toEqual([['DESK LAMP', 76], ['STANDING DESK', 998]])
    expect(q('SELECT count(*) FROM products WHERE id IN (1, 3, 99) OR price BETWEEN 30 AND 36').rows).toEqual([[3]])
    expect(q("SELECT CASE WHEN price < 50 THEN 'cheap' ELSE 'pricey' END AS band, count(*) FROM products GROUP BY band ORDER BY band").rows).toEqual([['cheap', 3], ['pricey', 7]])
    expect(q('SELECT 7 / 2, 7 % 3, 1 / 0, NULL + 1, round(2.345, 2)').rows).toEqual([[3.5, 1, null, null, 2.35]])
  })
  it('group by + aggregates + having', () => {
    const r = q('SELECT category, count(*) AS n, round(avg(price), 2) AS avg_price, max(price) FROM products GROUP BY category HAVING count(*) > 1 ORDER BY n DESC, category')
    expect(r.rows).toEqual([['Accessories', 3, 55.5, 89], ['Furniture', 3, 198.97, 499], ['Displays', 2, 339, 429]])
  })
  it('aggregate over empty input yields one row', () => {
    expect(q('SELECT count(*), sum(price) FROM products WHERE price < 0').rows).toEqual([[0, null]])
  })
  it('inner and left joins', () => {
    const r = q(`SELECT c.name, sum(p.price * i.qty) AS revenue
      FROM orders o JOIN customers c ON c.id = o.customer_id
      JOIN order_items i ON i.order_id = o.id JOIN products p ON p.id = i.product_id
      WHERE o.status <> 'cancelled' GROUP BY c.name ORDER BY revenue DESC LIMIT 1`)
    expect(r.rows).toEqual([['Lucas Meyer', 249 * 2 + 499]])
    const l = q('SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL ORDER BY c.name')
    expect(l.rows).toEqual([['Hugo García']])
  })
  it('subqueries and distinct', () => {
    expect(q('SELECT name FROM products WHERE price = (SELECT max(price) FROM products)').rows).toEqual([['Standing desk']])
    expect(q("SELECT DISTINCT country FROM customers WHERE id IN (SELECT customer_id FROM orders WHERE status = 'pending') ORDER BY country").rows).toEqual([['Ireland'], ['Ukraine']])
    expect(q('SELECT count(DISTINCT customer_id) FROM orders').rows).toEqual([[9]])
    expect(q('SELECT name FROM customers c WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)').rows).toEqual([['Hugo García']])
  })
  it('select * expands all joined columns', () => {
    expect(q('SELECT * FROM orders o JOIN customers c ON c.id = o.customer_id LIMIT 1').columns.length).toBe(9)
  })
})

describe('mutations', () => {
  it('create, insert, update, delete, drop', () => {
    const { db, results } = execute({ tables: {} }, `
      CREATE TABLE t (id INTEGER PRIMARY KEY, label TEXT, n REAL);
      INSERT INTO t (label, n) VALUES ('a', '1.5'), ('b', 2);
      INSERT INTO t VALUES (10, 'c', 3);
      UPDATE t SET n = n * 10 WHERE label <> 'a';
      DELETE FROM t WHERE id = 2;
      SELECT * FROM t ORDER BY id`)
    expect(results.map((r) => r.message).slice(0, 5)).toEqual(['Created table t (3 columns)', 'Inserted 2 rows into t', 'Inserted 1 row into t', 'Updated 2 rows in t', 'Deleted 1 row from t'])
    expect(results[5].rows).toEqual([[1, 'a', 1.5], [10, 'c', 30]])
    expect(() => execute(db, 'INSERT INTO t VALUES (1, "x", 0)')).toThrow(SqlError)
    expect(Object.keys(execute(db, 'DROP TABLE t').db.tables)).toEqual([])
  })
  it('does not mutate the input database', () => {
    const db = sampleDb()
    execute(db, 'DELETE FROM products')
    expect(db.tables.products.rows.length).toBe(10)
  })
  it('create table as select', () => {
    const r = execute(sampleDb(), "CREATE TABLE big AS SELECT name, price FROM products WHERE price > 200; SELECT count(*) FROM big")
    expect(r.results[1].rows).toEqual([[3]])
  })
})

describe('errors and helpers', () => {
  it('reports useful errors', () => {
    expect(() => q('SELECT nope FROM products')).toThrow('No such column: nope')
    expect(() => q('SELECT * FROM missing')).toThrow('No such table: missing')
    expect(() => q('SELECT id FROM orders o JOIN customers c ON 1 = 1')).toThrow('Ambiguous')
    expect(() => q('SELEC 1')).toThrow(/Unknown statement/)
  })
  it('LIKE regex and CSV import', () => {
    expect(likeToRegex('a_c%').test('ABCdef')).toBe(true)
    const t = tableFromCsv('sales', [['Region', 'Units', 'Price', '2024 total'], ['North', '3', '9.5', ''], ['South', '4', '10', 'x']])
    expect(t.cols).toEqual([{ name: 'Region', type: 'TEXT' }, { name: 'Units', type: 'INTEGER' }, { name: 'Price', type: 'REAL' }, { name: 'c_2024_total', type: 'TEXT' }])
    expect(t.rows[0]).toEqual(['North', 3, 9.5, null])
  })
})
