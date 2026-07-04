---
title: "Home Assistant vs nodrix: local smart-home hub or your own cloud IoT backend?"
description: "Home Assistant vs nodrix — they solve different problems. HA is a local home-automation hub for off-the-shelf devices; nodrix is an open-source cloud IoT backend you deploy to your own Cloudflare for custom hardware, remote dashboards, and a read API. Here's how to choose, and how they pair."
category: comparison
datePublished: 2026-06-08
dateUpdated: 2026-07-04
faqs:
  - q: "Is nodrix a replacement for Home Assistant?"
    a: "Not really — they solve different problems. Home Assistant is a local hub for off-the-shelf smart-home devices (Zigbee, Z-Wave, Wi-Fi gear) with local control and a huge integration library. nodrix is a cloud backend for custom hardware: your ESP32/Pico sensors POST over HTTPS to a stack you deploy on your own Cloudflare account, and you get remote dashboards and a read API. Many people run both."
  - q: "Can I use Home Assistant and nodrix together?"
    a: "Yes, that's a natural setup. Custom field sensors report to nodrix in the cloud (reachable from anywhere without exposing your home box), and you pull that data into Home Assistant via its REST/RESTful sensor integration using nodrix's read API. HA handles the local smart home; nodrix handles owned cloud telemetry."
  - q: "Does nodrix need an always-on machine at home like Home Assistant?"
    a: "No. Home Assistant typically runs on a Raspberry Pi, NUC, or VM you keep online. nodrix is serverless — it deploys to Cloudflare (Workers, Durable Objects, D1, R2), so there's no home box to power, patch, or expose to the internet."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "Point custom hardware at nodrix in the cloud."
  - href: "/guides/blynk-alternative"
    label: "Blynk alternative"
    desc: "If you're comparing hosted IoT clouds too."
  - href: "/guides/thingsboard-alternative"
    label: "ThingsBoard alternative"
    desc: "The open-source IoT-platform heavyweight, compared."
  - href: "/docs"
    label: "Device protocol & read API"
    desc: "Telemetry, control, automations, and the read API in full."
---

**Home Assistant vs nodrix** isn't really a head-to-head — they're built for different jobs, and
the honest answer for a lot of people is "both." Home Assistant is a **local home-automation hub**:
you run it on a box at home and it ties together off-the-shelf smart devices with local control and
an enormous integration library. nodrix is an **open-source cloud IoT backend**: you deploy it to
your own Cloudflare account, and custom hardware POSTs telemetry over HTTPS to dashboards, automations,
and a read API you own. This guide is about choosing the right one — and how they pair.

## What Home Assistant is for

Home Assistant is the gold standard for the **local smart home**. If you've got Zigbee bulbs,
Z-Wave locks, smart plugs, cameras, and Wi-Fi gear, HA speaks to thousands of them, runs automations
locally (no cloud round-trip), keeps your data in your house, and has a polished mobile app and a
massive community. For tying together *consumer devices* in one home, nothing else comes close.

Its center of gravity, though, is **local and home-shaped**: it expects an always-on machine on your
LAN, and reaching it from outside usually means a tunnel, a VPN, or the Nabu Casa cloud subscription.
That's perfect for a house, and less aimed at custom hardware fleets reporting from the field.

## What nodrix is for

nodrix is for **custom hardware and owned cloud telemetry**. An ESP32 soil sensor, a remote energy
monitor, a parking-spot counter, a fleet of devices spread across sites — they POST plain JSON to a
backend you deployed on Cloudflare, and you get realtime dashboards reachable from anywhere, edge
automations, and a **read API** to pull data into Grafana or your own app. There's no home server to
keep online or expose, because it runs at the edge.

## Home Assistant vs nodrix, honestly

| | Home Assistant | nodrix |
|---|---|---|
| Category | Local home-automation hub | Cloud IoT backend for custom hardware |
| Runs on | A box at home (Pi / NUC / VM), always on | Cloudflare (Workers, Durable Objects, D1, R2) |
| Best for | Off-the-shelf smart-home devices | Custom devices, telemetry, fleets, remote dashboards |
| Integrations | Thousands of device integrations | Plain HTTPS/WebSocket — any device; optional ESP library |
| Remote access | Tunnel / VPN / Nabu Casa cloud | Public by default (it's already in the cloud) |
| Data location | Your home machine | Your Cloudflare account (single-tenant) |
| Automations | Local, very deep | Visual trigger → condition → action at the edge |
| Read API | Via REST/templates | First-class: latest state + time-series, one token |
| Open source | Yes | Yes (MIT) |

## When Home Assistant is the better choice

- Your project is the **local smart home** — off-the-shelf Zigbee/Z-Wave/Wi-Fi devices.
- You want **local control** with no cloud dependency and a huge integration catalog.
- You're happy running and maintaining an **always-on home server**.

## When nodrix fits better

- Your hardware is **custom** (ESP32/Pico/LoRaWAN) and you want it reporting to a cloud **you own**.
- You need **dashboards reachable from anywhere** without exposing a home box.
- You want a **clean read API** for telemetry and a stack with **no machine to keep patched at home**.

## Better together

You don't have to pick. A common setup: custom field sensors report to **nodrix in the cloud**, and
**Home Assistant pulls that data in** via its RESTful sensor integration against the nodrix read API:

```yaml
# Home Assistant configuration.yaml — read a nodrix variable as a sensor
rest:
  - resource: "https://nodrix.you.workers.dev/v1/projects/<project_id>/state"
    headers:
      Authorization: "Bearer <user_token>"
    scan_interval: 60
    sensor:
      - name: "Field soil moisture"
        value_template: "{{ value_json.state.soil.value }}"
```

HA owns the local smart home; nodrix owns the cloud telemetry for your custom hardware — each doing
the half it's best at.

## The bottom line

If you're automating a house full of off-the-shelf devices, run Home Assistant. If you're building
custom hardware that needs cloud dashboards, automations, and a read API you own — without standing
up and exposing a home server — deploy nodrix to your Cloudflare account. And if you're doing both,
let them do what each is good at and bridge them through the read API.
