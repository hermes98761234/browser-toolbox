import { useEffect, useRef } from 'react'
import type { T } from '../kitlib'
import { KINDS, type Tool } from '../lib/catalog'
import { CAT_BY_ID, CAT_STYLE } from '../lib/data'
import { toggleFav, useStore } from '../lib/store'
import { drawPreview } from '../previews'
import { isReady } from '../tools'

/** Canvas thumbnail, drawn once when the card scrolls into view. */
export function Thumb({ tool }: { tool: Tool }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          drawPreview(c, tool)
          io.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(c)
    return () => io.disconnect()
  }, [tool])
  return <canvas ref={ref} className="thumb" width={320} height={180} aria-hidden />
}

export function ToolCard({ tool, t, compact }: { tool: Tool; t: T; compact?: boolean }) {
  const { fav } = useStore()
  const isFav = fav.includes(tool.slug)
  const ready = isReady(tool.slug)
  const cat = CAT_BY_ID.get(tool.cat)
  return (
    <article className={`card ${compact ? 'compact' : ''} ${ready ? 'is-ready' : ''}`} style={{ ['--h' as string]: CAT_STYLE[tool.cat]?.hue ?? 220 }}>
      <a href={`#/tool/${tool.slug}`} className="card-link" aria-label={tool.name}>
        <div className="thumb-wrap">
          <Thumb tool={tool} />
          <span className="badge dim">{tool.dim}</span>
          {ready ? <span className="badge ready">✓ {t('Ready')}</span> : <span className="badge soon">{t('Coming soon')}</span>}
          <span className="open-hint">{ready ? `▶ ${t('Open tool')}` : t('See the plan')}</span>
        </div>
        <div className="card-body">
          <h3>{tool.name}</h3>
          {!compact && <p>{tool.desc}</p>}
          <div className="tags">
            <span>{CAT_STYLE[tool.cat]?.icon} {cat ? t(cat.name) : ''}</span>
            {!compact && <span>{t(KINDS[tool.kind])}</span>}
          </div>
        </div>
      </a>
      <button type="button" className={`fav ${isFav ? 'on' : ''}`} onClick={() => toggleFav(tool.slug)} aria-pressed={isFav} aria-label={isFav ? t('Remove from favorites') : t('Add to favorites')}>
        {isFav ? '★' : '☆'}
      </button>
    </article>
  )
}
