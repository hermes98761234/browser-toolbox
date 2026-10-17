// Lazy registry: every tool is src/tools/<slug>.tsx with a default-exported React component,
// loaded as its own chunk only when opened.
import type { ComponentType } from 'react'

type Loader = () => Promise<{ default: ComponentType }>

const modules = import.meta.glob<{ default: ComponentType }>('./*.tsx')

export const toolLoader = (slug: string): Loader | undefined => modules[`./${slug}.tsx`]
export const isReady = (slug: string) => !!modules[`./${slug}.tsx`]
export const READY_COUNT = Object.keys(modules).length
