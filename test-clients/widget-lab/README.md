# Widget Lab

A tiny standalone tool for testing dashboard widgets locally — no worker, no auth,
no server. Open `index.html` and pick a widget; each gets its own page with controls
matching *that* widget's config, rendered in both light and dark themes.

Each page exercises both directions of the widget contract:

- **Out:** every `iot-command` the widget dispatches is logged with its payload, so
  you can see exactly what would be written to the variable.
- **In:** push a "reported value" (or state) to simulate what the device reports back,
  and watch the widget reflect it.

## Layout

```
widget-lab/
  index.html          landing / nav
  pages/              one page per widget (color.html, gauge.html, … chart.html, map.html)
  assets/             lab.css, lab.js — shared styles + helpers
  src/                entry.ts (defines the elements), build.ts (the bundler)
  dist/               widget-bundle.js — generated, gitignored
```

## Pages

| Page | Widget | What you can drive |
|------|--------|--------------------|
| `index.html`        | —          | Landing / nav |
| `pages/color.html`  | iot-color  | format (hex/hsv/rgb), brightness, hex input, presets; push hex or JSON `{h,s,v}`/`{r,g,b}` |
| `pages/slider.html` | iot-slider | orientation, min/max/step, unit; push a number |
| `pages/toggle.html` | iot-toggle | on/off values; set reported state |
| `pages/value.html`  | iot-value  | unit; push a number/string (read-only widget) |
| `pages/gauge.html`  | iot-gauge  | min/max; push a number (read-only widget) |
| `pages/percent.html`| iot-percent| min/max/decimals/unit + colour thresholds (JSON); push a number to watch the ring recolour |
| `pages/push.html`   | iot-push   | payload value, label; press to fire |
| `pages/chart.html`  | iot-chart  | title, chart type, zoom; regenerate series / append live ticks |
| `pages/map.html`    | iot-map    | title, basemap, markers (JSON); push a marker's live position |

`iot-chart` / `iot-map` need apexcharts / leaflet, which are **not** bundled — those two
pages load them from a CDN (so they need network; the map also needs network for its tiles).
`src/build.ts` aliases the widgets' `import('apexcharts')` / `import('leaflet')` to the CDN
globals and inlines their stylesheets, so the shared `dist/widget-bundle.js` stays lean.

## Run

The widgets are TypeScript, so build the bundle once, then open any page:

```sh
cd internal/test-clients/widget-lab
bun run build        # writes dist/widget-bundle.js (defines every element)
open index.html
```

While iterating on a widget, keep a rebuild running and refresh the page:

```sh
bun run dev          # rebuilds dist/widget-bundle.js on change
```

> Note: [src/entry.ts](src/entry.ts) imports widget source from the parent monorepo's
> `shared/` package (`../../../../shared/...`), so build from a full checkout, not a
> standalone clone of this submodule.

`dist/` is generated — it's gitignored.

## Files & how to add a widget page

- `assets/lab.css` — shared styles + theme tokens (mirrors `web/src/style.css`)
- `assets/lab.js` — shared helpers: `$`, `startLog(preEl)`, `parsePush(raw)`
- `src/entry.ts` — imports + defines the widget classes into the bundle
- `src/build.ts` — the bundler: a Bun.build script that aliases apexcharts/leaflet to
  CDN globals and inlines `?raw` stylesheets (see the chart/map note above)
- `pages/*.html` — one page per widget

To add a widget: import + define its class in [src/entry.ts](src/entry.ts), copy an
existing page (e.g. [pages/value.html](pages/value.html)) and swap in the element tag +
its config fields, then link it from [index.html](index.html). Classes are imported
individually (not the full registry) to keep the bundle lean.
