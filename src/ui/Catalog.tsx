import { useEffect, useMemo, useRef, useState } from 'react'
import type { T } from '../kitlib'
import { DEFAULT_FILTERS, filterTools, filtersToQuery, KINDS, pageList, paginate, queryToFilters, TECH, type Filters, type Kind } from '../lib/catalog'
import { ADDED, CAT_BY_ID, CAT_STYLE, CATS, TOOLS } from '../lib/data'
import { useStore } from '../lib/store'
import { isReady, READY_COUNT } from '../tools'
import { rememberCatalog } from './nav'
import { ToolCard } from './ToolCard'

function go(f: Filters) {
  const q = filtersToQuery(f)
  const h = q ? `#/?${q}` : '#/'
  if (location.hash !== h) location.hash = h
}

const catName = (id: number) => CAT_BY_ID.get(id)?.name ?? ''

export function Catalog({ t, query }: { t: T; query: string }) {
  const f = useMemo(() => queryToFilters(query), [query])
  const mine = useStore()
  const list = useMemo(() => filterTools(TOOLS, f, isReady, mine, catName, ADDED), [f, mine])
  const { items, page, pages } = paginate(list, f.page)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const top = useRef<HTMLDivElement>(null)
  const set = (patch: Partial<Filters>) => go({ ...f, page: 1, ...patch })
  const toPage = (p: number) => {
    go({ ...f, page: p })
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  useEffect(() => {
    rememberCatalog(query ? `#/?${query}` : '#/')
  }, [query])
  useEffect(() => () => clearTimeout(timer.current), [])
  const onSearch = (q: string) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => set({ q }), 250)
  }

  const active = filtersToQuery({ ...f, page: 1, sort: 'featured' }) !== ''
  const home = !active && page === 1 && f.sort === 'featured'
  const counts = useMemo(() => {
    const m = new Map<number, [number, number]>()
    for (const tl of TOOLS) {
      const c = m.get(tl.cat) ?? [0, 0]
      c[0]++
      if (isReady(tl.slug)) c[1]++
      m.set(tl.cat, c)
    }
    return m
  }, [])
  const fresh = useMemo(() => filterTools(TOOLS, { ...DEFAULT_FILTERS, status: 'ready', sort: 'newest' }, isReady, mine, catName, ADDED).slice(0, 12), [mine])

  const sel = <K extends keyof Filters>(k: K, label: string, opts: [string, string][]) => (
    <label className="fsel">
      <span>{label}</span>
      <select value={String(f[k] || '')} onChange={(e) => set({ [k]: k === 'cat' ? Number(e.target.value) : e.target.value } as Partial<Filters>)}>
        <option value="">{t('Any')}</option>
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )

  const cat = f.cat ? CAT_BY_ID.get(f.cat) : undefined
  const title = f.fav ? t('Your favorites') : f.recent ? t('Recently opened') : cat ? `${CAT_STYLE[cat.id]?.icon} ${t(cat.name)}` : t('All tools')

  return (
    <main className="catalog">
      {home && (
        <section className="hero">
          <div className="hero-text">
            <h1>
              {t('1000 tools.')} <span>{t('Zero uploads.')}</span>
            </h1>
            <p>{t('Calculators, converters, trackers, editors and 3D visualizers for 40 fields of work and life. Everything runs in your browser: no registration, no login, your data never leaves your device.')}</p>
            <div className="hero-stats">
              <b>{TOOLS.length}</b> {t('tools')} · <b>{READY_COUNT}</b> {t('ready to use')} · <b>{CATS.length}</b> {t('categories')} · <b>{TOOLS.filter((x) => x.dim === '3D').length}</b> {t('in 3D')}
            </div>
            <div className="progress" aria-label={t('Ready to use')}>
              <span style={{ width: `${(READY_COUNT / TOOLS.length) * 100}%` }} />
            </div>
          </div>
          {fresh.length > 0 && (
            <div className="hero-fresh">
              <h2>✨ {t('Newest tools')}</h2>
              <div className="fresh-row">
                {fresh.map((x) => (
                  <ToolCard key={x.slug} tool={x} t={t} compact />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {home && (
        <section className="cats" aria-label={t('Categories')}>
          {CATS.map((c) => {
            const [n, r] = counts.get(c.id) ?? [0, 0]
            return (
              <button type="button" key={c.id} className="cat-tile" style={{ ['--h' as string]: CAT_STYLE[c.id]?.hue }} onClick={() => set({ cat: c.id })}>
                <span className="cat-icon">{CAT_STYLE[c.id]?.icon}</span>
                <span className="cat-name">{t(c.name)}</span>
                <span className="cat-count">{t('{0} tools', n)}{r ? ` · ${t('{0} ready', r)}` : ''}</span>
              </button>
            )
          })}
        </section>
      )}

      <div className="kind-chips" role="toolbar" aria-label={t('Type')}>
        <button type="button" className={!f.kind ? 'on' : ''} onClick={() => set({ kind: '' })}>
          ✨ {t('All types')}
        </button>
        {(Object.keys(KINDS) as Kind[]).map((k) => (
          <button type="button" key={k} className={f.kind === k ? 'on' : ''} onClick={() => set({ kind: f.kind === k ? '' : k })}>
            {t(KINDS[k])}
          </button>
        ))}
      </div>

      <div className="toolbar" ref={top}>
        <input className="search" type="search" key={f.q ? 'q' : 'empty'} defaultValue={f.q} placeholder={t('Search 1000 tools…')} aria-label={t('Search')} onChange={(e) => onSearch(e.target.value)} />
        <button type="button" className={`btn-filters ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
          ⚙ {t('Filters')} {active && <span className="dot" />}
        </button>
        <label className="fsel sort">
          <span>{t('Sort')}</span>
          <select value={f.sort} onChange={(e) => set({ sort: e.target.value as Filters['sort'] })}>
            <option value="featured">{t('Featured')}</option>
            <option value="newest">{t('Newest first')}</option>
            <option value="az">{t('Name A–Z')}</option>
            <option value="za">{t('Name Z–A')}</option>
            <option value="category">{t('By category')}</option>
            <option value="number">{t('Catalog number')}</option>
          </select>
        </label>
      </div>

      {open && (
        <div className="filters">
          {sel('cat', t('Category'), CATS.map((c) => [String(c.id), `${CAT_STYLE[c.id]?.icon} ${t(c.name)}`]))}
          {sel('kind', t('Type'), (Object.keys(KINDS) as Kind[]).map((k) => [k, t(KINDS[k])]))}
          {sel('dim', t('Graphics'), [['2D', '2D'], ['3D', '3D']])}
          {sel('tech', t('Technology'), TECH.map(([k]) => [k, t(k)]))}
          {sel('status', t('Status'), [['ready', t('Ready to use')], ['soon', t('Coming soon')]])}
          <button type="button" className="btn-reset" onClick={() => go(DEFAULT_FILTERS)}>
            ✕ {t('Reset filters')}
          </button>
        </div>
      )}

      <div className="results-head">
        <h2>{title}</h2>
        <span>
          {t('{0} tools', list.length)}
          {pages > 1 && ` · ${t('page {0} of {1}', page, pages)}`}
        </span>
      </div>

      {items.length ? (
        <div className="grid">
          {items.map((x) => (
            <ToolCard key={x.slug} tool={x} t={t} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <div>🧰</div>
          <p>{f.fav ? t('No favorites yet — tap ☆ on any tool to save it here.') : f.recent ? t('Nothing opened yet. Pick a tool!') : t('No tools match these filters.')}</p>
          <button type="button" onClick={() => go(DEFAULT_FILTERS)}>
            {t('Show all tools')}
          </button>
        </div>
      )}

      {pages > 1 && (
        <nav className="pager" aria-label={t('Pages')}>
          <button type="button" disabled={page <= 1} onClick={() => toPage(page - 1)} aria-label={t('Previous page')}>
            ‹
          </button>
          {pageList(page, pages).map((p, i) =>
            p === 0 ? (
              <span key={`e${i}`} className="ellipsis">
                …
              </span>
            ) : (
              <button type="button" key={p} className={p === page ? 'on' : ''} onClick={() => toPage(p)} aria-current={p === page ? 'page' : undefined}>
                {p}
              </button>
            ),
          )}
          <button type="button" disabled={page >= pages} onClick={() => toPage(page + 1)} aria-label={t('Next page')}>
            ›
          </button>
        </nav>
      )}
    </main>
  )
}
