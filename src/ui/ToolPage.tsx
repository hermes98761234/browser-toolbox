import { Component, Suspense, lazy, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import type { T } from '../kitlib'
import { KINDS, type Tool } from '../lib/catalog'
import { CAT_BY_ID, CAT_STYLE, TOOLS } from '../lib/data'
import { markOpened, toggleFav, useStore } from '../lib/store'
import { isReady, toolLoader } from '../tools'
import { lastCatalog } from './nav'
import { Thumb, ToolCard } from './ToolCard'

class Boundary extends Component<{ children: ReactNode; fallback: (e: Error, retry: () => void) => ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) {
    return { err }
  }
  render() {
    return this.state.err ? this.props.fallback(this.state.err, () => this.setState({ err: null })) : this.props.children
  }
}

const cache = new Map<string, ComponentType>()
function lazyTool(slug: string): ComponentType | null {
  const load = toolLoader(slug)
  if (!load) return null
  let c = cache.get(slug)
  if (!c) {
    c = lazy(load)
    cache.set(slug, c)
  }
  return c
}

export function ToolPage({ tool, t }: { tool: Tool; t: T }) {
  const { fav } = useStore()
  const isFav = fav.includes(tool.slug)
  const ready = isReady(tool.slug)
  const Impl = useMemo(() => lazyTool(tool.slug), [tool.slug])
  const cat = CAT_BY_ID.get(tool.cat)
  const [copied, setCopied] = useState(false)
  useEffect(() => markOpened(tool.slug), [tool.slug])

  const sameCat = TOOLS.filter((x) => x.cat === tool.cat)
  const idx = sameCat.indexOf(tool)
  const prev = sameCat[(idx - 1 + sameCat.length) % sameCat.length]
  const next = sameCat[(idx + 1) % sameCat.length]
  const related = useMemo(() => {
    const r = sameCat.filter((x) => x !== tool)
    return [...r.filter((x) => isReady(x.slug)), ...r.filter((x) => !isReady(x.slug))].slice(0, 8)
  }, [tool, sameCat])

  const share = () => {
    const url = `${location.origin}${location.pathname}#/tool/${tool.slug}`
    if (navigator.share) void navigator.share({ title: tool.name, url }).catch(() => {})
    else
      void navigator.clipboard?.writeText(url).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
  }

  return (
    <main className="toolpage" style={{ ['--h' as string]: CAT_STYLE[tool.cat]?.hue ?? 220 }}>
      <nav className="crumbs">
        <a href={lastCatalog()}>← {t('Catalog')}</a>
        <span>/</span>
        <a href={`#/?cat=${tool.cat}`}>
          {CAT_STYLE[tool.cat]?.icon} {cat ? t(cat.name) : ''}
        </a>
      </nav>
      <div className="tool-head">
        <div>
          <h1>{tool.name}</h1>
          <p className="pitch">{tool.desc}.</p>
          <div className="tags">
            <span>{tool.dim}</span>
            <span>{t(KINDS[tool.kind])}</span>
            {tool.tech.map((x) => (
              <span key={x}>{t(x)}</span>
            ))}
            <span>#{tool.n}</span>
          </div>
        </div>
        <div className="head-btns">
          <button type="button" className={`fav big ${isFav ? 'on' : ''}`} onClick={() => toggleFav(tool.slug)} aria-pressed={isFav}>
            {isFav ? '★' : '☆'} {isFav ? t('Saved') : t('Save')}
          </button>
          <button type="button" className="fav big" onClick={share}>
            🔗 {copied ? t('Link copied') : t('Share')}
          </button>
        </div>
      </div>

      <div className="tool-frame">
        {ready && Impl ? (
          <Boundary
            key={tool.slug}
            fallback={(e, retry) => (
              <div className="tool-error">
                <p>⚠️ {t('This tool crashed.')}</p>
                <pre>{e.message}</pre>
                <button type="button" onClick={retry}>
                  {t('Try again')}
                </button>
              </div>
            )}
          >
            <Suspense
              fallback={
                <div className="tool-loading">
                  <div className="spinner" /> {t('Loading tool…')}
                </div>
              }
            >
              <Impl />
            </Suspense>
          </Boundary>
        ) : (
          <div className="soon-box">
            <Thumb tool={tool} />
            <div>
              <h2>🚧 {t('This tool is in development')}</h2>
              <p>{t('It is on the build list. Meanwhile, try one of the ready tools from the same category below.')}</p>
              <a className="btn-primary" href={`#/?cat=${tool.cat}&status=ready`}>
                {t('Ready tools in this category')}
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="info">
        <section>
          <h2>{t('How it works')}</h2>
          <p>{tool.build}.</p>
          <p className="muted">🔒 {t('Runs entirely in your browser. Nothing is uploaded.')}</p>
        </section>
        <section>
          <h2>{t('About this tool')}</h2>
          <ul className="facts">
            <li>
              <span>{t('Category')}</span>
              {cat ? t(cat.name) : ''}
            </li>
            <li>
              <span>{t('Type')}</span>
              {t(KINDS[tool.kind])}
            </li>
            <li>
              <span>{t('Graphics')}</span>
              {tool.dim}
            </li>
            <li>
              <span>{t('Status')}</span>
              {ready ? `✓ ${t('Ready to use')}` : t('Coming soon')}
            </li>
          </ul>
          <div className="prevnext">
            <a href={`#/tool/${prev.slug}`}>← {prev.name}</a>
            <a href={`#/tool/${next.slug}`}>{next.name} →</a>
          </div>
        </section>
      </div>

      <h2 className="more">{t('More in this category')}</h2>
      <div className="grid">
        {related.map((x) => (
          <ToolCard key={x.slug} tool={x} t={t} />
        ))}
      </div>
    </main>
  )
}
