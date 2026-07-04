---
title: "A Datacake alternative without per-device pricing — open-source, on your Cloudflare"
description: "Want a Datacake alternative that drops per-device pricing and keeps your data in your own tenancy? nodrix is open-source IoT you deploy to your own Cloudflare account — low-effort dashboards, automations, and a read API, billed as Cloudflare usage."
category: comparison
datePublished: 2026-06-08
dateUpdated: 2026-07-04
faqs:
  - q: "Is there an open-source alternative to Datacake?"
    a: "Yes. nodrix is open-source (MIT) and you deploy it to your own Cloudflare account instead of paying per device on a hosted plan. Datacake is a low-code SaaS billed by device; nodrix has no per-device license and your data stays in your own tenancy."
  - q: "Does nodrix support LoRaWAN like Datacake?"
    a: "Datacake's tight LoRaWAN / The Things Network integration is one of its real strengths. nodrix is HTTPS/WebSocket-first; a LoRaWAN device reaches it through a gateway or network-server webhook that forwards the decoded payload to /v1/telemetry. If turnkey LoRaWAN is central to your project, weigh that."
  - q: "How do I migrate from Datacake to nodrix?"
    a: "Point your device's HTTP integration (or your LoRaWAN network-server webhook) at nodrix's /v1/telemetry instead of Datacake's HTTP endpoint — each metric becomes a variable automatically. Then rebuild dashboards and recreate Datacake rules as trigger-condition-action automations."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The firmware to point your hardware at nodrix."
  - href: "/guides/ubidots-alternative"
    label: "Ubidots alternative"
    desc: "Another hosted commercial platform, compared."
  - href: "/guides/blynk-alternative"
    label: "Blynk alternative"
    desc: "The popular hosted IoT cloud, compared honestly."
  - href: "/docs"
    label: "Device protocol & read API"
    desc: "Telemetry, control, automations, and the read API in full."
---

People searching for a **Datacake alternative** are usually weighing one thing against its
strengths: **per-device pricing** as a fleet grows. Datacake is a slick low-code platform, but the
bill scales with devices and your data lives on its cloud. nodrix is the opposite trade — it's
open-source (MIT) and you **deploy it to your own Cloudflare account** in one click, with no
per-device license and every reading in your own tenancy.

This is an honest comparison, including where Datacake is the better pick.

## What Datacake gets right

Datacake nails low-code. The dashboard builder is fast, device templates make onboarding hardware
easy, and the **LoRaWAN / The Things Network integration** is genuinely turnkey — for LPWAN sensor
fleets that's a big head start. It also offers white-labeling and a rule engine, so for a
reseller or a client deployment it's a capable, polished product you don't have to assemble.

What sends people looking is the **cost model and ownership**: billing scales by device, and your
telemetry sits on Datacake's infrastructure rather than your own.

## Datacake vs nodrix, honestly

| | Datacake | nodrix |
|---|---|---|
| Model | Low-code hosted SaaS | Open-source; you deploy it to your own Cloudflare |
| Where data lives | Datacake's cloud | Your Cloudflare account (single-tenant) |
| Pricing | Per device | No license cost; you pay Cloudflare for usage |
| Open source | No | MIT, full stack |
| LoRaWAN / TTN | Turnkey integration | Via gateway/network-server webhook to /v1/telemetry |
| Dashboards | Low-code builder | Drag-and-drop, embeddable Web Components |
| Rules / automation | Rule engine | Visual trigger → condition → action at the edge |
| Device connection | HTTP / MQTT / LoRaWAN | Plain HTTPS/WebSocket + optional open library |
| Data access | API | Read API: latest state + time-series behind one token |

## When Datacake is the better choice

- Your project is **LoRaWAN-first** and you want turnkey TTN integration and device templates.
- You need **white-labeling** and a low-code builder for client or reseller deployments.
- Per-device pricing is **fine for your fleet size** and you'd rather not own the stack.

If that's you, Datacake is a strong, purpose-built answer.

## When nodrix fits better

- You want to **drop per-device pricing** for costs that track actual Cloudflare usage.
- You want **open source and ownership** — your telemetry in your account, not a third-party cloud.
- Your devices speak **plain HTTPS/WebSocket** (or forward LoRaWAN payloads via webhook), and you
  want a device library without the lock-in — or none at all.
- You want a **read API** for Grafana or your own app, plus **edge automations** you fully control.

## Moving a device across

If your hardware already POSTs to Datacake's HTTP endpoint, repoint it at nodrix — each metric
becomes a variable automatically:

```cpp
// HTTPS POST https://nodrix.you.workers.dev/v1/telemetry
// Authorization: Bearer tok_your_project_token
// { "metrics": { "temperature": 23.4, "soil": 38 } }   -> 204
```

For LoRaWAN, set your network server's HTTP integration (the webhook that fires on uplink) to send
the decoded payload to the same `/v1/telemetry` endpoint. Commands flow back via `GET /v1/control`
or the control WebSocket — the full firmware is in
[Connect an ESP32 over HTTPS](/guides/esp32-https-cloud).

## The bottom line

If LoRaWAN and low-code white-labeling are the job, Datacake is a fine tool. But if per-device
pricing is the friction — or you want open source, ownership, and a usage-based cost model — deploy
nodrix to a Cloudflare account, point a device (or a network-server webhook) at it, and own the
stack end to end.
