---
title: "How to deploy nodrix to Cloudflare: a free-tier setup guide"
description: "Deploy nodrix into your own Cloudflare account in a few minutes. Create a free account, run the one-click deploy, and understand the one step that trips people up — why Cloudflare asks for a card even though nodrix runs entirely on the free plan."
category: concept
difficulty: beginner
datePublished: 2026-06-11
dateUpdated: 2026-06-11
faqs:
  - q: "Do I need a paid Cloudflare account to run nodrix?"
    a: "No. Everything nodrix provisions — the Worker, Durable Objects, D1, KV, Workflows, and R2 — runs on the Workers Free plan. There is no nodrix license fee either; it's open source. You only ever pay Cloudflare if your own usage grows past the free tiers, which for a maker or small-team deployment it won't."
  - q: "Why does Cloudflare ask for a credit card during deploy?"
    a: "Because nodrix stores telemetry history in R2, Cloudflare's object storage, and R2 is the one product that wants a payment method on file before it switches on — even on its free tier. Adding the card is account verification, not a charge and not a plan upgrade. You won't be billed for staying inside the free allowance."
  - q: "Will I actually be charged anything?"
    a: "For a typical maker or small-team workload, no. A handful of devices posting readings every few seconds sits comfortably inside Cloudflare's free tiers across every service nodrix uses. You'd only start to pay if you stored a very large volume of telemetry history in R2, and you control that with retention."
  - q: "I don't have a Cloudflare account — is it hard to set one up?"
    a: "No. Sign up at dash.cloudflare.com with an email and password, confirm the verification email, and you're in — about two minutes, and no card is asked for at signup. The card prompt only appears later, during the deploy, when R2 is enabled."
  - q: "Can I deploy nodrix without putting a card on file at all?"
    a: "Not for the full stack. R2 stores telemetry history and needs a payment method (card or PayPal) on file before it activates, so a working deployment requires one. It stays a verification step, not a bill — nodrix is built to run inside the free tiers."
  - q: "Is my data or billing shared with the nodrix project?"
    a: "No. nodrix is single-tenant and deploys into your Cloudflare account. The resources, the data, and the billing relationship are all yours; the project never sees your telemetry or your Cloudflare account."
related:
  - href: "/go/deploy"
    label: "Deploy to Cloudflare"
    desc: "One click into your own account."
  - href: "/docs"
    label: "Device protocol & API"
    desc: "Send telemetry and read it back after deploy."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "Point your first device at the new deployment."
  - href: "/guides/thingsboard-alternative"
    label: "Why run it on your own Cloudflare"
    desc: "The ownership trade behind the one-click deploy."
---

nodrix deploys with **one click into your own Cloudflare account** — Workers, Durable Objects, D1,
R2, and KV, provisioned and built for you, with no server to host. Most people are up and running in
a few minutes. Two things trip up first-timers, though, and both are easy to clear up: you need a
Cloudflare account, and partway through the deploy **Cloudflare asks for a credit card**.

Neither one costs you anything for a normal setup. This guide walks the whole thing start to finish
and explains exactly why that card prompt appears — because it's the step that gets people worried
they're signing up for a bill, and they're not.

## What you're actually deploying

The deploy drops a real, self-contained nodrix instance into **your** Cloudflare tenancy. It's
single-tenant: the resources, the data, and the billing are all yours. The project never touches
your account. Here's what gets created:

| Cloudflare service | What nodrix uses it for |
|---|---|
| Workers | The app itself — API, dashboard, and static assets |
| Durable Objects | Live variable state, dashboard sockets, the scheduler |
| D1 | Metadata — users, projects, dashboards, tokens (never telemetry) |
| R2 | Telemetry history (the cold store) |
| KV | Read cache and JWKS |
| Workflows | One-time provisioning on first boot |

Every one of these runs on Cloudflare's **free plan**. Keep that in mind when the card prompt shows
up — none of this requires a paid plan to work.

## Step 1 — Create a free Cloudflare account

If you already have one, skip ahead. If not:

1. Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. Enter an email and a password.
3. Confirm the verification email Cloudflare sends.

That's it — about two minutes, and **no card is requested at signup**. You now have a Cloudflare
account on the free plan, which is all nodrix needs.

## Step 2 — Run the one-click deploy

Hit **[Deploy to Cloudflare](/go/deploy)**. Cloudflare takes over from there and walks you through a
short flow:

1. **Connect a Git account** (GitHub or GitLab). Cloudflare creates a small repository in your
   account to hold the deployment config — this is how you'll get updates later.
2. **Provision the resources.** Cloudflare creates the D1 database, the R2 bucket, the KV namespace,
   and the Durable Objects automatically. You don't fill anything in.
3. **Build and deploy.** The build pulls the latest nodrix release and ships it to your Worker.

When it finishes, you get a `*.workers.dev` URL — that's your live nodrix instance.

## Step 3 — Why it asks for a card (and why it's not a bill)

This is the screen that worries people. Somewhere in the flow, Cloudflare asks you to **add a
payment method**, and it can look like you're being pushed onto a paid plan. You're not.

The reason is **R2**, Cloudflare's object storage, where nodrix keeps your telemetry history. R2 is
the one Cloudflare product that wants a payment method **on file before it will switch on** — even
though its free tier covers far more than a maker deployment will ever use. Adding the card is
**account verification**, not a charge:

- It is **not** a plan upgrade. Your account stays on the free plan.
- It is **not** a charge. Nothing is billed for staying inside the free allowance.
- It **is** required — R2 won't activate without it, and nodrix needs R2 to store history.

Add the card (or PayPal), continue, and the deploy completes. You won't see a charge appear.

## What runs on the free plan, and how much room you get

Every service nodrix touches has a free tier, and they're generous. Approximate free-plan limits at
the time of writing — see [Cloudflare's pricing](https://developers.cloudflare.com/workers/platform/pricing/)
for the current numbers:

| Service | Free allowance (roughly) |
|---|---|
| Workers | 100,000 requests/day |
| D1 | 5 GB storage; millions of row reads/day |
| KV | 1 GB storage; 100,000 reads/day |
| Durable Objects | Included on the free plan; free-plan accounts aren't charged for SQLite storage |
| Workflows | Included on the free plan |
| R2 | 10 GB-month storage; 1M writes + 10M reads/month; **zero egress fees** |

For context: a handful of devices each posting a reading every few seconds is a tiny fraction of
those limits. The free tiers exist precisely for deployments this size.

## Will I ever be charged?

Honestly: for a maker or small-team setup, **no**. The single thing that could eventually cost money
is **R2 storage** — if you accumulated a very large volume of telemetry history, you could cross the
10 GB-month free mark. That's a lot of data points, and it's under your control through retention.

A couple of reassurances on the things people specifically worry about:

- **Durable Objects.** Cloudflare began billing for Durable Object SQLite storage in January 2026,
  but that applies only to **Workers Paid** accounts. Free-plan accounts are not charged for it.
- **Egress.** R2 has **no egress fees**, so reading your own telemetry back out never costs bandwidth
  the way S3 would.

If you want a hard guarantee, Cloudflare lets you set a [billing
notification](https://developers.cloudflare.com/notifications/) so you're alerted long before
anything approaches a charge.

## Step 4 — First boot

With the deployment live, open your `*.workers.dev` URL:

1. The first visit shows a **Create owner account** page. The first signup becomes the `owner`;
   after that, registration is closed and the owner invites everyone else.
2. Create a **project** and mint a **project token** from the dashboard.
3. Point a device at it — variables auto-create the moment data arrives:

```bash
curl -X POST https://<your-worker>.workers.dev/v1/telemetry \
  -H "Authorization: Bearer $NODRIX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"metrics":{"temperature":23.4,"humidity":61}}'
```

A reading lands, a widget appears, and you've got a working IoT backend on infrastructure you own.
For the device side in full — including getting commands back to the hardware — see
[Connect an ESP32 over HTTPS](/guides/esp32-https-cloud).

## Staying up to date

Because the deploy created a repo in your Git account, updating is a one-click **Retry build** from
the Cloudflare dashboard (Workers → your `nodrix` service), which pulls the latest release. nodrix
also flags new versions for you under **Settings → Version & updates** and links you straight there.

## The short version

- A Cloudflare account is **free** and takes two minutes; no card at signup.
- The deploy provisions everything for you and runs on the **free plan**.
- The card prompt is **R2 verification, not a bill** — add it and continue.
- A normal deployment lives **well inside the free tiers**, and you own all of it.
