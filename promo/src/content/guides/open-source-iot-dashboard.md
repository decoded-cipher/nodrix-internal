---
title: "Open-source IoT dashboards in 2026: what actually works for makers"
description: "Most 'best open-source IoT platform' lists are written for factories, not makers. Here's the maker's-eye view: what an IoT dashboard actually needs to do, which open-source options genuinely deliver it, what each one costs to operate, and when a serverless deploy beats them all."
category: concept
datePublished: 2026-07-10
dateUpdated: 2026-07-10
faqs:
  - q: "What's the best open-source IoT dashboard for an ESP32 project?"
    a: "For a maker project, the shortlist is honest: nodrix if you want dashboards, device protocol, and automations in one deploy with nothing to operate; ThingsBoard CE if you have a server and want the industrial feature set; Grafana with InfluxDB if visualization is the whole requirement and you don't need to control devices. The rest of the tools on typical 'best of' lists are either industrial middleware or business-metrics dashboards that never met a microcontroller."
  - q: "Is Grafana an IoT dashboard?"
    a: "Grafana is a superb visualization layer, but it only displays: it charts what lands in a database, and it has no device protocol, no way to send a command back to a board, and no concept of a device at all. An IoT dashboard needs an ingest path and a downlink. Grafana can be the display half of a DIY stack — it just can't be the whole thing."
  - q: "Can I self-host an IoT platform for free?"
    a: "The software is free; the operating isn't. A self-hosted stack costs a VPS or home server, plus the recurring patching, backups, and TLS renewals that keep it healthy. The serverless variant moves that cost to effectively zero for hobby scale: deploy once to your own Cloudflare account and there's no machine to maintain."
  - q: "Whatever happened to Freeboard?"
    a: "Freeboard still gets recommended by older 'open-source dashboard' roundups, but the project has been effectively unmaintained for years — the repo is dormant and the hosted service is gone. It's the clearest sign a list you're reading wasn't written by anyone who tried the tools: check the commit history before adopting anything in this space."
related:
  - href: "/guides/thingsboard-alternative"
    label: "ThingsBoard alternative"
    desc: "The self-host heavyweight, weighed properly."
  - href: "/guides/home-assistant-vs-nodrix"
    label: "Home Assistant vs nodrix"
    desc: "Local smart-home hub or cloud IoT backend — different jobs."
  - href: "/guides/best-free-iot-platforms"
    label: "Best free IoT platforms"
    desc: "The hosted free tiers, ranked honestly."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The zero-servers deploy, step by step."
---

Search for "open-source IoT dashboard" and the results are written for someone else. The typical
list compares industrial middleware — rule engines, OPC-UA gateways, Kubernetes charts — and never
mentions a microcontroller. Some still recommend tools that have been dormant for years. If what
you actually have is an ESP32 and a sensor, you're left translating factory-floor comparisons into
maker terms.

This page is that translation. It lays out what an IoT dashboard genuinely has to do, then walks
through the open-source options a maker would actually shortlist — including where each one is the
wrong answer.

## What an IoT dashboard actually has to do

"Dashboard" undersells the job. Four capabilities separate a real IoT platform from a chart on a
web page:

- **Ingest** — an open protocol a $5 board can speak directly (HTTP, WebSocket, or MQTT), with
  authentication that isn't a cloud SDK.
- **Live display** — gauges, charts, maps that update as data arrives, not on refresh.
- **Downlink** — a way to send state back: a toggle on the dashboard that flips a relay. This is
  the one most "dashboard" tools silently lack.
- **Logic** — thresholds, schedules, alerts routed to where you actually look (Telegram, Slack,
  Discord, email), editable without redeploying anything.

Hold every candidate against those four and the crowded field thins fast.

## The DIY stack: Grafana + InfluxDB (+ broker + glue)

The forum-default answer. Grafana is a world-class visualization layer and InfluxDB a fine
time-series store — and together they cover exactly half the job. There's no device protocol
(you'll add an MQTT broker and a bridge, or write an ingest service), and no downlink at all:
Grafana is read-only by design, so the day you want a toggle, you're building a control plane from
scratch. Even Grafana's own ecosystem concedes the setup-and-maintenance burden is the tax.

**Right when:** visualization is the entire requirement, data already lands in a database, and
you enjoy running the stack. **Wrong when:** you want to control anything, or when four services
to patch is four more than the project deserves. This stack gets
[its own full weighing](/guides/nodrix-vs-grafana-influxdb).

## The self-host heavyweight: ThingsBoard CE

The most complete open-source IoT platform, full stop — device management, a rule engine,
dashboards, multi-tenancy. The cost is operational: it's a Java application with PostgreSQL and a
message broker underneath, which means a real server, real RAM, and someone (you) patching it. Note
that its hosted cloud has no free tier, so "free ThingsBoard" specifically means self-hosting.

**Right when:** you have a home server and industrial-grade requirements. **Wrong when:** the
platform would be the heaviest thing in the project — [the full comparison](/guides/thingsboard-alternative)
is the honest version of this trade.

## The flow-wiring toolkit: Node-RED

Node-RED is a joy for wiring logic — but it's a component, not a platform. Out of the box there's
no data store, no device registry, and the dashboard is an add-on; the usual deployment pairs it
with a broker, a database, and Grafana, at which point you're operating the DIY stack with a nicer
editor. It shines as glue around a platform rather than as the platform.

## The different animal: Home Assistant

Home Assistant is magnificent — at its actual job, which is being a local hub for off-the-shelf
smart-home gear. It's not built to be a cloud telemetry backend for custom hardware: remote access
means a subscription or reverse-proxy work, and its data model orbits home automation, not fleets
of sensors. [Home Assistant vs nodrix](/guides/home-assistant-vs-nodrix) draws the line properly —
plenty of people correctly run both.

## The zombie recommendations

A surprising share of "best open-source dashboard" content still lists projects that stopped moving
years ago — Freeboard is the recurring example: dormant repo, hosted service gone, still ranked in
roundups. The tell for this whole category: check the commit history and the issue tracker before
you check the feature list. An unmaintained dashboard is a security liability with widgets.

## The serverless option: nodrix

nodrix is our entry in this field, and its position is specific: all four capabilities in one
deploy, with **no server to operate**. It's open source (MIT) and deploys in one click to your own
Cloudflare account — Workers, Durable Objects, D1 — so there's no VPS, no Docker Compose, no
patching schedule. Devices speak plain HTTPS/WebSocket (an Arduino library covers ESP32/ESP8266;
anything else can use raw HTTP), dashboards are drag-and-drop with live widgets including toggles
and sliders that write back to the board, and automations route alerts to Telegram, Slack, Discord,
email, SMS, or any webhook. Data stays in your tenancy behind a read API.

The honest trade: it's serverless-shaped. If you need MQTT specifically, an on-LAN-only system, or
industrial protocol gateways, the heavyweights above earn their weight. For the actual maker case —
custom boards, live dashboards, control, alerts, zero ops — the serverless shape is the point.

## The decision, compressed

| You want | Pick |
|---|---|
| Charts over an existing database, read-only | Grafana (+ InfluxDB) |
| Industrial feature set, own server, ops appetite | ThingsBoard CE |
| Visual glue logic around another platform | Node-RED |
| A local hub for store-bought smart-home devices | Home Assistant |
| Device-to-dashboard-to-device, zero servers | [nodrix](/guides/deploy-nodrix-cloudflare) |

One rule outranks the table: prefer the tool whose whole stack you're willing to operate. Every
open-source IoT dashboard is free software; the difference between them is how much infrastructure
each one quietly asks you to own. Picking the platform is really picking your ops burden — choose
the one whose answer is a number you'll still accept in a year.
