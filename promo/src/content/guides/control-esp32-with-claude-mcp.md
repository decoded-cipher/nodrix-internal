---
title: "Control your ESP32 with Claude: an MCP server for your own hardware"
description: "Point Claude at your own IoT backend and let it read your sensors and flip your relays in plain language — no cloud middleman, no vendor skill. nodrix ships a native MCP server, owner-gated and off by default, that turns your ESP32 fleet into tools an AI agent can call."
category: project
board: ESP32
difficulty: intermediate
datePublished: 2026-07-18
dateUpdated: 2026-07-18
faqs:
  - q: "What is an MCP server, and why would my IoT platform have one?"
    a: "MCP (Model Context Protocol) is the open standard AI assistants like Claude use to call external tools. An MCP server exposes a set of tools an agent can invoke — and when your IoT backend is the server, those tools are your devices: read this sensor, set that variable, create an automation. It's the difference between pasting sensor readings into a chat and letting the assistant query and control the hardware directly."
  - q: "Is it safe to let an AI control my hardware?"
    a: "nodrix is built so the answer stays yes. The MCP server is off by default and only the instance owner can enable it. Even then it comes up read-only: the management tools that can write a variable or create an automation are behind a second switch, so an assistant can look at your data without any ability to command hardware until you explicitly turn writes on. There are no delete tools at all. You're granting capabilities deliberately, one gate at a time."
  - q: "How is this different from the Home Assistant MCP server?"
    a: "Home Assistant's MCP server is built for Home Assistant's world — off-the-shelf smart-home devices on your local network, exposed through its Assist API. nodrix's is built for the other world: your own custom hardware — an ESP32 you flashed — reporting to your own cloud over plain HTTPS. If your project is a store-bought bulb, use Home Assistant. If it's a board you wrote the firmware for, this is the path that doesn't require running a local hub."
  - q: "Which AI assistants can connect?"
    a: "Anything that speaks MCP. Claude (Desktop, Code, and the web connector) is the reference client, and the server also works with other MCP-capable tools. nodrix exposes both a bearer-token endpoint for programmatic clients and an OAuth endpoint for the ones that authenticate interactively, so you connect whichever way your client expects."
  - q: "Does Claude need my hardware to be online to answer questions?"
    a: "For live state, yes — reading a sensor's current value asks your instance, which holds what the device last reported. But the history lives in your instance regardless, so Claude can analyze a week of temperature data whether or not the board is awake right now. A deep-sleeping battery sensor's last reading is always queryable."
related:
  - href: "/guides/esp32-notifications"
    label: "ESP32 notifications"
    desc: "Cloud-side alert logic, the non-AI version of the same idea."
  - href: "/guides/esp32-smart-home-automation"
    label: "ESP32 smart home"
    desc: "The relays and dashboards Claude would be controlling."
  - href: "/docs"
    label: "Docs"
    desc: "The MCP endpoints, tools, and auth in full."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "Getting the hardware reporting in the first place."
---

Ask Claude "is the greenhouse too warm?" and have it actually check — not because you pasted a
number into the chat, but because it queried the sensor. Then ask it to turn on the fan, and hear
the relay click. That's what an MCP server on your IoT backend makes possible, and nodrix ships one
natively.

This is a different pitch from the AI features bolted onto consumer smart-home apps. There's no
vendor cloud in the middle, no pre-baked "skill," and no assistant that only works with devices
someone else manufactured. Your ESP32, your firmware, your Cloudflare account — and an AI agent that
can read and command all of it through an open protocol, exactly as far as you allow and no further.

## What MCP actually is, in one paragraph

The [Model Context Protocol](https://modelcontextprotocol.io) is the open standard AI assistants use
to call tools outside their own context. An MCP server publishes a list of tools; the assistant decides when to call them and acts
on what comes back. Most MCP servers wrap a SaaS API or a database. When your IoT platform is the
server, the tools are your hardware: list the projects, read a variable's live state, pull a
time-series, set a control variable, create an automation. Claude stops being a place you describe
your system and becomes something that can inspect and operate it.

## The niche this fills

It's worth being precise, because the smart-home-plus-AI space is not empty. Home Assistant has
shipped an [official MCP server](https://www.home-assistant.io/integrations/mcp_server/) since early
2025, and there are large, active community MCP projects for it. If your setup is off-the-shelf devices on a local hub, that ecosystem is mature and you
should use it.

What has essentially no coverage is the other half of the maker world: **custom hardware you built,
reporting to a cloud you own.** An ESP32 you flashed doesn't live in Home Assistant's device
registry, and it doesn't want a local hub to reach it from anywhere. That project — a board on
plain HTTPS, a dashboard on your Cloudflare account, and now an AI agent that can drive it — is the
gap. nodrix fills it as a first-party feature rather than a bridge you assemble.

## What the server exposes

Two tiers of tools, gated separately on purpose.

**Read tools** (available whenever the server is on):

- `list_projects`, `list_variables` — discover what exists.
- `get_state` — the current value of a variable, as last reported by the device.
- `get_series` — the time-series history, for "what did CO2 do overnight."
- `list_dashboards`, `list_widgets`, `list_automations`, `list_integrations` — the shape of your setup.

**Management tools** (behind a second switch):

- `set_variable` — write a control variable. This is the one that flips a relay: set the variable
  your device's `NODRIX_WRITE` handler watches, and the board acts.
- `create_automation`, `update_automation`, `run_automation` — build and fire the trigger →
  condition → action logic.
- `create_dashboard`, `update_widget`, `create_variable`, `create_integration`, and the matching
  `update_*` tools — construct the rest of the setup in language.

There are deliberately **no delete tools**. An agent can build, read, and command; it cannot destroy.

## Turning it on safely

The safety model is the reason this is a feature rather than a footgun. Everything is off until you
decide otherwise:

1. **The server is off by default.** Until the owner enables it, the MCP endpoint returns 404 — it
   doesn't exist as far as the internet is concerned.
2. **Only the owner can enable it.** It lives in **Settings → More**, behind the owner role. No
   member or admin can expose your hardware to an assistant.
3. **Writes are a separate switch.** Turn the server on and it comes up **read-only** — an assistant
   can see your data but cannot touch a single variable. The management tools stay dark until you
   flip the write flag too, so "let Claude look at my sensors" and "let Claude control my house" are
   two distinct, deliberate decisions.

The practical result: an LLM can never command your hardware by default. You grant reading, then —
if and when you want it — writing, as two separate acts.

## Connecting Claude

The server speaks standard MCP over two endpoints on your instance: an **OAuth** endpoint at
`/v1/mcp/oauth` for interactive clients like the Claude apps, and a **bearer-token** endpoint at
`/v1/mcp` for token-configured clients like Claude Code and IDE plugins.

For the Claude apps, connect it as a custom connector — the whole path is five steps:

1. **Enable the server in nodrix first.** In your instance, go to **Settings → More** and turn the
   MCP server on; until you do, the endpoint returns 404 and nothing can connect. Turn on the write
   flag here too if you want Claude to control hardware and not just read it.
2. **Open Claude's connector settings.** In the browser, click your profile icon → **Settings**; on
   desktop, press `⌘⇧,` (macOS) or `Ctrl+,`. Then click **Connectors** in the sidebar.
3. **Add a custom connector.** Click **Add** (top-right) → **Add custom connector**, paste your
   instance's OAuth URL — `https://your-instance.workers.dev/v1/mcp/oauth` — and click **Add**.
4. **Approve on your own instance.** Claude redirects you to your nodrix instance to sign in as the
   owner and approve the connection. That consent screen is where you see exactly what you're
   granting before anything is shared.
5. **Use the tools.** Back in Claude, your instance appears under the **+** ("Add files, connectors,
   and more") menu in the message box. From the connector's settings you can enable or disable
   individual tools — a second place the read-only boundary is yours to draw.

For **Claude Code or an IDE plugin**, point it at the bearer endpoint `/v1/mcp` instead, with an
`Authorization: Bearer <token>` header carrying a token from your instance. If a menu has moved,
Anthropic's [custom-connectors guide](https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)
has the canonical version of these steps.

From there it's conversation:

- "What's the current soil moisture in the greenhouse project?" → `get_state`.
- "Plot CO2 for the last 24 hours and tell me if it ever crossed 1000 ppm." → `get_series`, then
  analysis.
- "Turn on the exhaust fan." → `set_variable`, and the ESP32's handler fires. (Only if you enabled
  writes.)
- "Make an automation that alerts me on Telegram when the freezer goes above -10." →
  `create_automation`, wired to the integration you already set up.

The last two are the ones that feel like the future: you described an outcome, and the agent
assembled the platform primitives to make it real — no dashboard clicks, no YAML.

## Why this beats the bolt-on approach

You could get some of this by giving Claude a generic HTTP tool and your API docs. The native server
is better in the ways that matter:

- **It's typed and discoverable.** The assistant sees named tools with schemas, not a REST surface
  it has to reverse-engineer, so it calls them correctly the first time.
- **It's scoped.** Read-only really means read-only; the boundary is enforced server-side, not
  requested politely in a prompt.
- **It's yours.** The whole path is your instance on your Cloudflare account. No third-party AI-IoT
  service is brokering access to your devices, and nothing about it can be discontinued on you.

## Where it's going

The interesting frontier isn't voice-controlling one bulb — Home Assistant does that well. It's an
agent with read access to a fleet of your own sensors and the judgment to reason across them:
correlate the energy monitor's spike with the temperature log, notice the greenhouse trend before it
becomes a problem, draft the automation and let you approve it. The tools to do that ship in the box
today; the assistant supplies the reasoning. Turn the server on read-only, connect Claude, and ask
it what it notices about your data — it's the fastest way to see why this is more than a novelty.

## Notes

- **Off by default, owner-gated, writes separate.** Three deliberate gates before an AI touches
  hardware; no delete tools ever.
- **Your own endpoint.** MCP served from your Cloudflare account — no AI-IoT vendor in the path.
- **Open protocol.** Standard MCP; Claude is the reference client, but any MCP-capable assistant
  connects the same way.
