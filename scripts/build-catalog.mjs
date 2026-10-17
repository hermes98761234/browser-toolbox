#!/usr/bin/env node
// Parse data/tools.md (the 1000-tool list) into src/data/catalog.json.
// usage: node scripts/build-catalog.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const md = readFileSync(join(root, 'data/tools.md'), 'utf8')

const slugify = (s) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const cats = []
const tools = []
let cat = null
for (const line of md.split('\n')) {
  const h = line.match(/^## (\d+)\. (.+?) — \*(.+)\*\s*$/)
  if (h) {
    cat = { id: +h[1], name: h[2].trim(), slug: slugify(h[2]), libs: h[3].split(',').map((s) => s.trim()) }
    cats.push(cat)
    continue
  }
  const m = line.match(/^(\d+)\. \*\*(.+?)\*\* `\[(2D|3D)\]` — (.+?) \*Build:\* (.+)$/)
  if (m && cat) {
    const name = m[2].trim()
    tools.push({
      n: +m[1],
      slug: slugify(name),
      name,
      cat: cat.id,
      dim: m[3],
      desc: cap(m[4].trim().replace(/\.$/, '')),
      build: cap(m[5].trim().replace(/\.$/, '')),
    })
  }
}

const seen = new Set()
for (const t of tools) {
  if (seen.has(t.slug)) t.slug = `${t.slug}-${t.n}`
  seen.add(t.slug)
}

if (tools.length !== 1000) throw new Error(`expected 1000 tools, got ${tools.length}`)
mkdirSync(join(root, 'src/data'), { recursive: true })
writeFileSync(join(root, 'src/data/catalog.json'), JSON.stringify({ cats, tools }))
console.log(`${cats.length} categories, ${tools.length} tools`)
