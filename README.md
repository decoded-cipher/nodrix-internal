# nodrix-internal

The companion repo to [**nodrix**](https://github.com/decoded-cipher/nodrix) — marketing site, telemetry collector, dev tooling, and maintainer docs. None of this is needed to run the platform; it's kept out of the main repo so a Deploy-to-Cloudflare clone stays lean.

## Contents

- **`promo/`** — Astro marketing site for [nodrix.live](https://nodrix.live). Self-contained (own `wrangler.toml` and D1 wishlist DB); deploys to Cloudflare Pages.
- **`collector/`** — `@nodrix/collector`, the central anonymous usage-stats collector (`telemetry.nodrix.live`). Central infrastructure — never shipped into a user's instance.
- **`test-clients/`** — dev clients for exercising a running deployment:
  - `iot-sim/` — IoT device simulator (sensors / controllers / GPS publishing telemetry over HTTP + WS)
  - `mcp-inspector/` — wrapper around `@modelcontextprotocol/inspector` for poking an MCP endpoint
- **`ph-gallery/`** — launch gallery image frames (Product Hunt).
- **`RELEASING.md`** — release process notes.

## Promo site

```bash
cd promo
bun install
bun run dev      # astro dev — local preview
bun run build    # astro build → dist/
bun run deploy   # deploy to Cloudflare Pages
```

Dependencies are pinned (`astro`, `@tailwindcss/vite`, and `tailwindcss` at exact versions) and `bun.lock` is committed, so the Cloudflare Pages build is reproducible (Pages detects `bun.lock` and installs with bun). `@tailwindcss/vite` is held at `4.2.0` on purpose: `4.2.4`+ pulls in vite 8 (rolldown), which is incompatible with the vite 7 that Astro 6 runs and breaks the build.

## License

[MIT](LICENSE) © Arjun Krishna
