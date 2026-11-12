---
title: "IoT platform free tiers: what the limits actually mean"
description: "ThingSpeak's 3 million messages, Blynk's one week of compressed history, EzData's 500 entries. The published numbers, dated, and the arithmetic that tells you when you outgrow them."
category: comparison
difficulty: beginner
datePublished: 2026-09-21
faqs:
  - q: "Which IoT platform has the best free tier?"
    a: "They aren't shaped the same way, so there's no single answer. ThingSpeak gives a generous message allowance but only four channels and a fifteen-second floor. Blynk gives five devices but compresses history down to a week. EzData is unmetered on messages but keeps only 500 entries per field. The right question is which limit your project hits first, and that depends on your sampling rate and device count rather than on which number looks biggest."
  - q: "How many messages a year is 3 million, really?"
    a: "ThingSpeak's own figure works out to roughly 8,000 a day. One device reporting every fifteen seconds uses about 5,760 of those, so a single sensor at the platform's own minimum interval consumes most of the annual allowance. Two devices at that rate exceed it. The allowance is generous for slow reporting and tight for anything continuous."
  - q: "Can I use a free IoT platform for a commercial project?"
    a: "Often not, and this is the limit people notice last. ThingSpeak's free tier is explicitly for small non-commercial projects, and its paid home licence is described as not for government, commercial, academic-institutional or other organizational use. That's a licensing restriction rather than a technical one, so nothing stops you technically and everything stops you legally."
  - q: "What happens to my data when I hit a retention limit?"
    a: "It's discarded oldest-first, usually silently. Blynk's free plan documents one week of compressed history, and M5Stack's EzData keeps 500 entries per field and clears a queue entirely after six months of inactivity. In neither case do you get a warning; the chart simply doesn't go back as far as you expected, and by then the data is gone."
  - q: "Is a self-hosted platform actually cheaper?"
    a: "It depends what you're counting. A self-hosted platform on a free cloud tier has no subscription, but you own updates, backups and uptime. The honest comparison is between a monthly fee and your own time, and the answer changes with how many devices you run and how much you enjoy maintaining infrastructure."
  - q: "How current are these numbers?"
    a: "Every figure on this page was checked on 21 September 2026 against the vendor's own pricing or documentation, and each is linked. Free tiers change without announcement, so treat anything more than a few months old as needing a re-check before you make a decision on it."
related:
  - href: "/guides/thingspeak-alternative"
    label: "ThingSpeak alternatives"
    desc: "When the channel limit or the licence is the problem."
  - href: "/guides/blynk-alternative"
    label: "Blynk alternatives"
    desc: "When five devices or one week isn't enough."
  - href: "/guides/m5stack-ezdata-history"
    label: "M5Stack EzData"
    desc: "The 500-entry cap in detail."
  - href: "/guides/best-free-iot-platforms"
    label: "Free IoT platforms"
    desc: "The wider comparison."
---

**Free tiers aren't generous or stingy in general.** They are generous along one axis and tight along
another, and which one matters is decided by your project rather than by the vendor.

This page collects the published numbers with links to where each one comes from. **All figures
checked 21 September 2026.** Free tiers change quietly, so re-check before deciding anything
important on them.

## The published limits

| Platform | Free allowance | The limit you hit first |
|---|---|---|
| [ThingSpeak](https://thingspeak.mathworks.com/prices/thingspeak_home) | 3 million messages/year (~8,000/day), 4 channels, 15 s minimum interval | Channels, or the non-commercial licence |
| [Blynk](https://blynk.io/pricing) | 5 devices, 1 user, 100,000 messages/month, 1 webhook, 10 templates | 1 week of compressed history |
| [M5Stack EzData](https://docs.m5stack.com/en/guide/ezdata/ezdata_v2) | Unmetered messages | 500 entries per field |
| [HiveMQ Serverless](https://www.hivemq.com/pricing/) † | 100 connections, 10 GB/month | It stores nothing at all |

† HiveMQ is listed for contrast, not comparison. It's a **broker, not a platform** — it routes
messages and keeps no history, so putting its allowance beside ThingSpeak's is apples against
oranges. It's here because people reach for one as a free alternative and then discover it forwards
messages rather than keeping them. That's covered separately in
[free MQTT brokers compared](/guides/free-mqtt-brokers-compared).

## The arithmetic that actually decides it

**Message allowances sound enormous until you divide by a year.**

ThingSpeak's three million a year is about 8,000 a day by its own reckoning. A single device
reporting at the platform's own fifteen-second minimum produces 5,760 readings a day. So one sensor
at full rate consumes roughly three quarters of the allowance, and a second device puts you over.

The same arithmetic on retention:

| Your interval | EzData's 500 entries | Blynk's 1 week |
|---|---|---|
| Every 15 seconds | 2 hours 5 minutes | 7 days, compressed |
| Every minute | 8 hours 20 minutes | 7 days, compressed |
| Every 5 minutes | 1 day 17 hours | 7 days, compressed |
| Every hour | 20 days | 7 days, compressed |

Note what that table shows: below roughly a five-minute interval, a 500-entry cap keeps *less*
history than a one-week window. Above it, more. **Neither is better in the abstract.**

"Compressed" is doing quiet work in Blynk's row, too. A week of compressed history isn't a week of
your readings; it is a week of something smaller, and the detail inside an hour isn't what comes
back out.

nodrix is the fourth shape, and worth naming for contrast: it deploys into your own Cloudflare
account, so there's no per-device tier and no retention window set by a vendor. The limits that
apply are Cloudflare's, and you can read them before you commit rather than discovering them when a
chart stops going back far enough.

## The limits that aren't numbers

Three constraints catch people harder than any quota.

**Licensing.** ThingSpeak's free tier is described as being for small non-commercial projects, and
its paid home licence states it isn't for government, commercial, academic-institutional or other
organizational use. If a project might ever become a product, or is being done for a company or an
institution, that's decided before the first reading is stored.

**Device count.** Blynk's free plan allows five devices and one user. Five is comfortable for a
house and immediately restrictive for anything that grows, and the jump is to
[$29 a month](https://blynk.io/pricing) for ten.

**Inactivity.** EzData clears a token's data queue after six months without operations. A seasonal
project returns to an empty history exactly when last year's comparison would have been useful.

## When a free tier is the right answer

Genuinely often, and it is worth saying plainly.

If you have one or two devices, report every few minutes, only ever look at the last day or two,
and it is a hobby project, a free tier is less work than anything else and you should use one.
Every platform above is easier to start with than running your own.

The case for moving is specific: more devices than the plan allows, history that needs to go back
further than the retention window, a commercial or institutional context that the licence excludes,
or wanting the data in a form you can query and export rather than view.

## The other way to count

The comparison people usually make is free tier against paid tier. The one worth making is
**per-device subscription against your own infrastructure**.

Paid tiers are priced per device, so cost grows with the fleet. Self-hosting has a fixed
operational cost — updates, backups, uptime — that doesn't grow the same way, but it is real and
it is paid in attention rather than money.

Running on a cloud provider's own free tier changes that shape again. nodrix deploys to your own
Cloudflare account, so there's no per-device fee and no retention ceiling set by someone else: the
history lasts as long as you choose to keep it, and the limits that apply are Cloudflare's rather
than a vendor's, documented in
[what Cloudflare's free tier actually covers](/guides/cloudflare-free-tier-limits).

That isn't a claim that it is free of cost. It's a claim that the cost is a different shape — and
for a fleet that's growing, or a project where history is the point, the shape matters more than
the sticker.
