# Widget Lab

A tiny standalone tool for testing dashboard widgets locally — no worker, no auth,
no server. Open `index.html` and pick a widget; each gets its own page with controls
matching *that* widget's config, rendered in both light and dark themes.

Each page exercises both directions of the widget contract:

- **Out:** every `iot-command` the widget dispatches is logged with its payload, so
  you can see exactly what would be written to the variable.
- **In:** push a "reported value" (or state) to simulate what the device reports back,
  and watch the widget reflect it.

## Pages

| Page | Widget | What you can drive |
|------|--------|--------------------|
| `index.html`  | —          | Landing / nav |
| `color.html`  | iot-color  | format (hex/hsv/rgb), brightness, hex input, presets; push hex or JSON `{h,s,v}`/`{r,g,b}` |
| `slider.html` | iot-slider | orientation, min/max/step, unit; push a number |
| `toggle.html` | iot-toggle | on/off values; set reported state |
| `value.html`  | iot-value  | unit; push a number/string (read-only widget) |
| `gauge.html`  | iot-gauge  | min/max; push a number (read-only widget) |
| `percent.html`| iot-percent| min/max/decimals/unit + colour thresholds (JSON); push a number to watch the ring recolour |
| `push.html`   | iot-push   | payload value, label; press to fire |

`iot-chart` / `iot-map` are intentionally omitted — they pull in apexcharts/leaflet and
need live series / map tiles, which don't fit a dependency-free offline page.

## Run

The widgets are TypeScript, so build the bundle once, then open any page:

```sh
cd internal/test-clients/widget-lab
bun run build        # writes widget-bundle.js (defines every element)
open index.html
```

While iterating on a widget, keep a rebuild running and refresh the page:

```sh
bun run dev          # rebuilds widget-bundle.js on change
```

> Note: [entry.ts](entry.ts) imports widget source from the parent monorepo's
> `shared/` package (`../../../shared/...`), so build from a full checkout, not a
> standalone clone of this submodule.

`widget-bundle.js` is generated — it's gitignored.

## Files & how to add a widget page

- `lab.css` — shared styles + theme tokens (mirrors `web/src/style.css`)
- `lab.js` — shared helpers: `$`, `startLog(preEl)`, `parsePush(raw)`
- `entry.ts` — imports + defines the widget classes into the bundle
- `*.html` — one page per widget

To add a widget: import + define its class in [entry.ts](entry.ts), copy an existing
page (e.g. [value.html](value.html)) and swap in the element tag + its config fields,
then link it from [index.html](index.html). Classes are imported individually (not the
full registry) to keep the bundle lean and avoid pulling in chart/map dependencies.
