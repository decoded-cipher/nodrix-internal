---
title: "Announcing Nodrix 1.0: your own IoT cloud on Cloudflare"
description: "The first stable release of nodrix, explained in full — telemetry over HTTPS and WebSocket, realtime dashboards, two-way control, a visual automation builder, integrations, a clean read API, team access, and an MCP server, all deployed into your own Cloudflare account."
type: release
version: "1.0.0"
author:
  name: Arjun Krishna
  role: Maintainer
  url: https://github.com/decoded-cipher
datePublished: 2026-06-09
faqs:
  - q: "Do I need an MQTT broker or an SDK to use nodrix?"
    a: "No. Hardware talks to nodrix over plain HTTPS or a WebSocket. Anything that can make an HTTPS request — an ESP32, a Raspberry Pi, a server-side script — can send telemetry. There is no broker to run and no SDK to install; variables are created automatically the first time they appear in a payload."
  - q: "Does my telemetry ever leave my own account?"
    a: "No. nodrix is single-tenant: every deployment runs in your own Cloudflare account, on your own Workers, Durable Objects, D1, R2, and KV. The nodrix project never sees your data, your devices, or your Cloudflare billing."
  - q: "Is nodrix really free?"
    a: "nodrix itself is open source under the MIT license, with no license fee. It runs inside Cloudflare's free tiers for a typical maker or small-team workload. You only pay Cloudflare if your own usage grows past those free allowances."
  - q: "Can an AI assistant control my deployment through MCP?"
    a: "Only if you turn it on. The MCP server is off by default and owner-gated. Read tools become available when you enable it; management tools need a second deployment-wide toggle and an explicit mcp:manage grant at consent time, and no delete operations are ever exposed. Every MCP-driven write is recorded in the audit log."
related:
  - href: "https://blog.inovuslabs.org/nodrix-a-dream-that-refused-to-leave/"
    label: "The story behind nodrix"
    desc: "How a dorm-room question became a 1.0 release."
  - href: "/changelog"
    label: "Full changelog"
    desc: "The version-by-version list of what shipped."
  - href: "/go/deploy"
    label: "Deploy to Cloudflare"
    desc: "One click into your own account."
  - href: "/guides"
    label: "Guides"
    desc: "Connect a device and build your first dashboard."
---

Nodrix 1.0 is here, and it's the version we were comfortable calling stable. The short version: you
deploy nodrix into **your own Cloudflare account**, point a device at it, and you have a working IoT
backend — ingestion, storage, realtime dashboards, two-way control, automations, integrations, and a
read API — with no server to run and nothing shared with us.

This post walks through every major feature in 1.0 and how it actually works. If you'd rather have the
human story — how nodrix went from a question between college students to a stable release — I wrote
that up separately: [Nodrix: a dream that refused to leave](https://blog.inovuslabs.org/nodrix-a-dream-that-refused-to-leave/).
For the tight, version-by-version list, the [changelog](/changelog) has it.

## The idea behind nodrix

Most IoT platforms make you choose between two bad options: a hosted SaaS that owns your data and
meters your devices, or a self-hosted stack you babysit on a VPS. Nodrix takes a third path. It runs
entirely on Cloudflare's own primitives — Workers, Durable Objects, D1, KV, R2 — provisioned into
your account by a one-click deploy. It's single-tenant by construction: the resources, the data, and
the billing relationship are all yours, and the nodrix project never sees any of it.

Everything below follows from that one decision.

## Telemetry over HTTPS or WebSocket

Getting data in is the first thing you do, and nodrix keeps it boring on purpose. A device authenticates
with a project token and sends readings to a single endpoint. There is no broker to stand up, no schema
to declare, and no SDK to install — anything that can make an HTTPS request can talk to nodrix.

Send one metric or a batch; the keys become **variables**, created automatically the first time nodrix
sees them.

```
POST /v1/telemetry   Authorization: Bearer <project_token>
{ "metrics": { "temperature": 23.4, "humidity": 61 } }
→ 204 No Content      # "temperature" and "humidity" now exist as variables
```

If your hardware would rather hold one connection open, the same operations run over a WebSocket —
telemetry up, control writes down, events, and acks all on one socket:

```
WSS /v1/control/ws?token=<project_token>
↑ { "type": "telemetry", "metrics": { "temperature": 23.4 } }
↑ { "type": "event", "event": "door_opened" }
↓ { "type": "control", "id": "ctl_x", "variable": "relay", "value": "on" }
↑ { "type": "ack", "ids": ["ctl_x"] }
```

Use whichever fits the device. A deep-sleeping battery sensor POSTs and goes back to sleep; an
always-on controller keeps the socket open. Both are first-class.

## Realtime dashboards

Once data is flowing, you build a dashboard in a full-page, drag-and-drop editor: drop widgets onto a
grid and bind each one to a variable. Readings stream in live over a **hibernating WebSocket** — a
Durable Object that costs nothing while it sits idle and wakes the moment a value changes, so a
dashboard left open all day doesn't burn resources.

Dashboards are two-way. A toggle or slider doesn't just display state; it writes back to your hardware
(more on that next). And when you want to show someone, you can publish any dashboard read-only at a
**secret share link** — viewers need no account, live values arrive by polling, and nothing outside
that dashboard's own widgets is ever exposed.

## The widget library

Seven framework-agnostic Web Components ship in the box, and because they're standard custom elements
you can embed them anywhere — your own page, a docs site, a kiosk — not just inside nodrix.

**Display widgets** turn a variable into something readable:

- `iot-value` — the latest reading, large and legible.
- `iot-gauge` — an arc gauge with configurable min/max bounds.
- `iot-percent` — a percentage ring with optional color thresholds.
- `iot-chart` — a multi-series time-series chart (line, area, bar, or stepline).
- `iot-map` — geographic markers from static or live lat/lng variables.

**Control widgets** write a value back:

- `iot-toggle` — an on/off switch that reflects the last reported state.
- `iot-slider` — a numeric write that commits on release, so the wire never floods while you drag.
- `iot-push` — a momentary button for one-shot commands.
- `iot-color` — a color wheel that commits hex/hsv/rgb on release.

The catalog keeps growing, and a deeper widget set is on the roadmap.

## Two-way control

Reading data is half of IoT; acting on it is the other half. When a control widget writes a value,
nodrix queues a **control write** for the device. Hardware on the WebSocket receives it on the down
channel; hardware on HTTP fetches it on its next poll, applies it, and acks so nodrix stops resending:

```
GET  /v1/control
→ { "control": [ { "id": "ctl_x", "variable": "relay", "value": "on" } ] }

POST /v1/control/ack
{ "ids": ["ctl_x"] }
→ { "acked": 1 }
```

The ack is what keeps control reliable: a command isn't considered delivered until the device confirms
it, so a missed poll or a brief disconnect doesn't drop the write.

## Automations without a server

Automations let your deployment act on its own, and you build them in a visual flow editor — no extra
code path for your hardware. Each automation is a graph: one or more **triggers** flow through optional
**conditions** into **actions**, all evaluated at the edge.

- **Triggers** — a variable condition (threshold, equality, or change), a schedule, sunrise/sunset, a
  custom event, or a manual run.
- **Conditions** — an if-variable comparison that branches yes/no, or a time window (within hours, by
  weekday).
- **Actions** — set a variable, call an integration, or emit an event.

A freezer guard, for example: trigger when `temperature > -15 °C`, gate it on a time window, and act by
setting `buzzer = on` and emailing whoever's on call. No cron job, no server, no glue code.

## Integrations

Actions reach the outside world through integrations, so an event in your deployment becomes a message
or a call where it's useful:

- **HTTP** — call any service, with optional **HMAC request signing** so the receiving end can verify
  the payload genuinely came from your instance.
- **Email** — send a notification to whoever needs it.
- **Chat** — post to Slack, Telegram, Discord, and more.

## A clean read API

For everything outside nodrix — Grafana, a React app, a Raspberry Pi screen — there's a read-only API
behind a single **user token**. It's edge-cached and deliberately small:

```
GET /v1/projects/:proj/variables              # every variable in a project
GET /v1/projects/:proj/state                  # latest value of each (edge-cached)
GET /v1/projects/:proj/variables/:key/series?window=1h   # recent time-series
```

The `window` parameter takes values like `30s`, `15m`, or `6h` and reads from the recent ring buffer.
Two token types keep the surfaces apart: **project tokens** are for hardware (telemetry, control,
events), **user tokens** are for apps (read-only). Both are shown once on creation.

## Teams and access

A deployment isn't always a solo project, so 1.0 is multi-user from the start. There are three roles —
**owner**, **admin**, and **member** — plus invites, so you can bring people in without handing over
the keys. Sign-in is email and password out of the box, with optional **Google or GitHub** OAuth once
you add credentials. And an **audit log** records who changed what, which matters the moment more than
one person can touch the system.

## An MCP server for AI clients

Nodrix ships a native **Model Context Protocol server**, so an AI assistant — Claude, Claude Code, a
claude.ai connector — can work with your deployment. It's built to be safe by default:

- **Off until you turn it on.** The owner enables it from Settings → MCP server.
- **Two transports** on the same Worker: `/v1/mcp` (bearer token, for CLI and IDE clients) and
  `/v1/mcp/oauth` (OAuth 2.1, for browser-based clients, with a consent screen).
- **Read by default, manage by opt-in.** Read tools — browse projects, variables, dashboards; read
  state and time-series; view automations and integrations with secrets redacted — are available when
  the server is on. Management tools (create/update projects, variables, dashboards, automations, and
  integrations; run automations; send values to hardware) require a second deployment-wide toggle *and*
  an explicit `mcp:manage` grant at consent time. **No delete operations are ever exposed.**
- **Audit-logged.** Every MCP-driven write is recorded and tagged as MCP-sourced, so AI-initiated
  changes are distinguishable from web or API ones.

## Deploying it

All of the above installs with **one click to Cloudflare**. The button provisions D1, R2, KV, and the
Worker straight into your account; there's nothing else to host and nothing to maintain. The
[deploy guide](/guides/deploy-nodrix-cloudflare) walks through the one step that trips people up —
Cloudflare asks for a card to enable R2, even on its free tier — but most people are running in a few
minutes, comfortably inside the free allowances.

## What's next

1.0 is a foundation, not a finish line. Native mobile apps, over-the-air firmware updates, deeper
automation logic, more boards and integrations, native MQTT, and AI-assisted insights are all on the
[roadmap](/roadmap). This blog will cover the bigger releases as they land; the [changelog](/changelog)
tracks every version in between.

If you want to try it, [deploy it to your own Cloudflare account](/go/deploy) and point a device at it.
It's free, open source, and entirely yours.
