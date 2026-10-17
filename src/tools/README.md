# Writing a tool

Every catalog entry (see `data/tools.md` → `src/data/catalog.json`) becomes **ready** when a file
`src/tools/<slug>.tsx` exists. The slug is the kebab-case name (`node -e "console.log(require('./src/data/catalog.json').tools.find(t=>t.n===N))"`).
The file default-exports a React component with no props. It is lazy-loaded as its own chunk,
so it may import heavy libraries (three.js via `../kit/three`).

```tsx
import { Panel, Num, Split, Stat, Stats, useToolState, LineChart, money } from '../kit'

const DEF = { principal: 10000, rate: 7, years: 20 }

export default function CompoundInterest() {
  const [s, set, reset] = useToolState('compound-interest-calculator', DEF)
  …
  return (
    <Split>
      <Panel title="Inputs">…</Panel>
      <div>
        <Stats>…</Stats>
        <Panel title="Growth"><LineChart series={…} /></Panel>
      </div>
    </Split>
  )
}
```

## Rules

- **Real, useful, complete.** Implement what the entry's *Build* notes describe (adapt where a
  library is not available: charts use the kit's SVG charts, storage uses `useToolState`
  (localStorage) and the JSON backup/restore buttons). Correct formulas, sensible defaults, so the
  first screen already shows a meaningful result (sample data, presets, examples).
- **English only** inside tools, no `t()` calls and no i18n keys.
- **Kit first:** `src/kit/index.tsx` has layout (`Panel`, `Split`, `Row`, `Note`), inputs (`Num`,
  `Slider`, `Txt`, `Area`, `Select`, `Seg`, `Check`, `Btn`, `FileDrop`), results (`Stats`/`Stat`,
  `Table`, `Bar`, `Ring`), charts (`LineChart`, `BarChart`, `Donut`, `Legend`), exports
  (`CsvButton`, `JsonButtons`, `CopyButton`, `download`, `toCsv`), format helpers (`money`, `num`,
  `pct`, `fmt`, `uid`, `today`, `color`/`PALETTE`) and `useToolState(slug, default)` which persists
  to localStorage and accepts share links (`shareLink(state)`).
- **3D tools** use `useStage3D(setup, update, deps, opts)` + `<View3D refEl={ref} />` from
  `src/kit/three.tsx` (orbit controls, lights, grid, resize and render loop handled), `THREE` and
  `label()` for text sprites.
- Pure logic worth testing (finance formulas, parsers, unit conversion, solvers) goes in
  `src/tools/lib/<slug>.ts` with `src/tools/lib/<slug>.test.ts` (vitest) checking reference values.
- Style with the kit's classes and CSS variables (`var(--accent)`, `var(--muted)`, `var(--line)`,
  `var(--panel)`, …). Small inline styles are fine; no new global CSS unless reusable (`src/index.css`).
- Layout must work on phones (≥ 360 px): `Split` stacks automatically; wrap wide tables in `Table`.
- No network calls except where the entry demands a public keyless API, with an offline fallback.
  Data never leaves the browser.
- TypeScript strict. `npm run lint && npx tsc -b && npx vitest run` must pass.
