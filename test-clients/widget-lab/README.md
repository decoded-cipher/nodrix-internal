# Widget Lab

A tiny standalone page for testing dashboard widgets locally — no worker, no auth,
no server required. Renders `<iot-color>` with `<iot-slider>` and `<iot-toggle>`
alongside it for side-by-side comparison, in both light and dark themes.

It exercises both directions of the widget contract:

- **Out:** every `iot-command` a widget dispatches is logged with its payload, so
  you can see exactly what would be written to the variable (for `iot-color`, in
  each output format).
- **In:** push a "reported value" (hex string or JSON `{h,s,v}` / `{r,g,b}`) to
  simulate device state arriving over the wire and watch the widget reflect it.

You can also toggle every `iot-color` config option (format, brightness, hex
input, presets) live.

## Run

The widgets are TypeScript, so build the bundle once, then open the page:

```sh
cd internal/test-clients/widget-lab
bun run build        # writes widget-bundle.js
open index.html      # or just double-click it
```

While iterating on a widget, keep a rebuild running and refresh the page:

```sh
bun run dev          # rebuilds widget-bundle.js on change
```

> Note: [entry.ts](entry.ts) imports widget source from the parent monorepo's
> `shared/` package (`../../../shared/...`), so build from a full checkout, not a
> standalone clone of this submodule.

`widget-bundle.js` is generated — it's gitignored.

## Adding more widgets

Import and define the element in [entry.ts](entry.ts), then add a host element to
[index.html](index.html). Importing classes individually (rather than the full
registry) keeps the bundle lean and avoids pulling in chart/map dependencies.
