---
title: "Cloudflare limits and what they cost you"
description: "What a nodrix deployment actually consumes on Cloudflare's free tier, which ceiling you hit first, and when the $5/month plan becomes necessary."
datePublished: 2026-09-18
faqs:
  - q: "Can nodrix run entirely on Cloudflare's free tier?"
    a: "For a typical hobby deployment, yes. The ceiling you meet first is the Workers request limit of 100,000 per day, which is roughly eleven devices each posting every ten seconds, or fifty devices each posting every minute. Below that, a free account is genuinely sufficient — there is no trial period and no device cap in nodrix itself."
  - q: "Does telemetry get written to D1?"
    a: "No. Telemetry points go to the project's Durable Object, which holds current state and a recent ring buffer, and cold history is flushed to R2 as NDJSON. D1 holds metadata only: users, projects, variable definitions, dashboards, tokens, automations, integrations, and the audit log. No telemetry point is ever written to D1."
  - q: "What actually consumes my D1 row writes then?"
    a: "Mostly the last_seen refresh on each variable, which is throttled to at most once per minute per variable. That makes D1 write load a function of how many variables you have, not how often your devices report. Around seventy continuously active variables approaches the free tier's 100,000 daily row writes."
  - q: "What happens when I exceed a free tier limit?"
    a: "Since 1 September 2026, Cloudflare enforces D1's free tier limits by failing the query rather than degrading quietly. Workers requests behave the same way once the daily limit is reached. Both reset at midnight UTC. Upgrading to Workers Paid at five dollars a month raises every ceiling well beyond what a hobby deployment reaches."
  - q: "How much does a real deployment cost per month?"
    a: "Below the free tier limits, nothing. Above them, Workers Paid starts at five dollars a month and includes ten million requests, thirty million CPU-milliseconds, twenty-five billion D1 rows read, and fifty million D1 rows written. A deployment of a few dozen devices reporting every few seconds sits comfortably inside those included amounts, so the practical answer for most people is five dollars a month flat."
related:
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "Getting the deployment up in the first place."
  - href: "/docs"
    label: "Device protocol & read API"
    desc: "The endpoints these limits apply to."
---

nodrix runs in your own Cloudflare account, so the bill is Cloudflare's rather than a per-device
licence. That is the point of the architecture, but it does mean the platform's limits become yours.
This page is the arithmetic: what a deployment consumes, which ceiling arrives first, and when the
five-dollar plan stops being optional.

## Where your data actually goes

The limits only make sense alongside the storage split, because the obvious guess — that every
reading becomes a database row — is wrong.

| Store | Holds | Grows with |
|---|---|---|
| Project Durable Object (SQLite) | Current variable state, recent ring buffer, pending control writes | Variables, not message rate |
| R2 | Cold telemetry history, NDJSON partitioned by project and hour | Total readings over time |
| D1 | Users, projects, variable definitions, dashboards, tokens, automations, integrations, audit log | Configuration, not telemetry |
| KV | Cached state responses and JWKS | Read traffic |

**No telemetry point is ever written to D1.** A reading lands in the project's Durable Object and is
flushed to R2 as history. D1 sees only metadata.

## The three ceilings

### 1. Workers requests — this is the one you hit first

The free plan allows [**100,000 requests per day**](https://developers.cloudflare.com/workers/platform/limits/),
resetting at midnight UTC. Every telemetry POST, every control poll, every dashboard load, and every
read-API call is one request.

| Devices | Posting every | Requests/day | Free tier |
|---|---|---|---|
| 1 | 10s | 8,640 | fine |
| 5 | 10s | 43,200 | fine |
| 11 | 10s | 95,040 | at the edge |
| 10 | 60s | 14,400 | fine |
| 50 | 60s | 72,000 | fine |
| 70 | 60s | 100,800 | over |

A WebSocket connection is cheaper than polling here: the connection is one request, and messages on
it are not billed as additional requests. A device that polls for control writes every few seconds
spends far more of this budget than one that holds a control socket open.

### 2. D1 rows written — driven by variable count, not message rate

The free plan allows [**100,000 row writes per day**](https://developers.cloudflare.com/d1/platform/limits/).
Because telemetry does not touch D1, what consumes this is mainly the `last_seen` refresh on each
variable, and that is throttled to **at most once per minute per variable**.

So the rough shape is `variables × 1440` writes per day:

| Active variables | D1 writes/day | Free tier |
|---|---|---|
| 10 | 14,400 | fine |
| 30 | 43,200 | fine |
| 69 | 99,360 | at the edge |
| 100 | 144,000 | over |

A project is capped at 250 variables, so a single busy project can exceed the free D1 write
allowance on its own. Two caveats keep this an estimate rather than a guarantee: the throttle is
held per isolate, so a deployment spread across several isolates can write more often than once per
minute per variable; and dashboard edits, automation runs, and audit entries all add writes on top.

Row **reads** are unlikely to bind — the free allowance is 5,000,000 per day, and the hot read path
is served from the Durable Object and the KV cache rather than D1.

### 3. Storage

| | Free | Paid |
|---|---|---|
| D1 database size | 500 MB | 10 GB |
| D1 storage per account | 5 GB | 1 TB |
| D1 databases per account | 10 | 50,000 |
| D1 queries per Worker invocation | 50 | 1,000 |
| Time Travel recovery window | 7 days | 30 days |

Because D1 holds metadata only, 500 MB is a great deal of configuration — this is not the limit that
ends a hobby deployment. Telemetry history accumulates in R2 instead, which is billed on stored
volume rather than capped: [10 GB-month free, then $0.015 per GB-month](https://developers.cloudflare.com/r2/pricing/).

## What happens when you cross a line

Since [**1 September 2026**](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)
Cloudflare enforces D1's free tier limits rather than tolerating overshoot. Past the daily row limit,
queries fail outright — on both the Workers binding and the REST API:

```
Your account has exceeded D1's free tier daily row write limit.
Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.
```

Workers requests behave the same way once the daily allowance is gone. Both reset at midnight UTC,
so the failure mode is a deployment that works each morning and stops later in the day — which is
worth recognising quickly, because it looks like a bug in your firmware.

## When to move to Workers Paid

[Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/) is **$5/month** and
includes far more than a hobby deployment consumes:

| | Free | Paid (included) |
|---|---|---|
| Requests | 100,000/day | 10,000,000/month, then $0.30/million |
| CPU time | 10 ms/invocation | 30,000,000 CPU-ms/month, then $0.02/million |
| D1 rows read | 5,000,000/day | 25,000,000,000/month, then $0.001/million |
| D1 rows written | 100,000/day | 50,000,000/month, then $1.00/million |

Ten devices posting every ten seconds is about 2.6 million requests a month — a quarter of the
included allowance on the paid plan, and comfortably inside the included D1 writes. For most people
the honest answer is that the deployment costs nothing until it outgrows the free tier, then five
dollars a month flat for a long time after that.

## Reducing what you use

- **Hold a control socket instead of polling.** Polling every five seconds costs 17,280 requests per
  device per day; a WebSocket costs one.
- **Post less often.** Most sensors do not change meaningfully every ten seconds. Moving from 10s to
  60s cuts request usage sixfold.
- **Batch metrics into one request.** A single POST carries many metrics, and it counts once.
- **Prune variables you no longer read.** They keep refreshing `last_seen` and keep consuming D1
  writes.
- **Sleep the device.** Deep sleep between readings saves battery and quota together.
