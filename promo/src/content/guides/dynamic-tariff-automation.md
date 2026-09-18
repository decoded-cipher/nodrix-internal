---
title: "Automate your home against dynamic electricity prices"
description: "Wholesale-linked tariffs publish a price per interval, sometimes negative. How to pull them in and trigger real actions, in any market that has them."
category: project
difficulty: intermediate
datePublished: 2026-09-18
faqs:
  - q: "Can I automate my home against Octopus Agile prices?"
    a: "Yes, and the price data is the easy part. Octopus publishes half-hourly unit rates through a REST endpoint that needs no authentication at all, so any script or device can read tomorrow's prices as soon as they are released. The work is turning those prices into a trigger something can act on."
  - q: "Do I need Home Assistant for this?"
    a: "No. Home Assistant has good integrations for it and if you already run one, use it. What the pattern actually requires is something that fetches prices on a schedule, a value your automations can compare against, and something that can switch a load. None of that is specific to any one platform."
  - q: "What is the Matter tariff device type?"
    a: "Matter 1.5, published in November 2025, added a device type for sharing real-time and forecast electricity pricing, alongside earlier support for solar, batteries, heat pumps and EV charging. It means price-reactive automation is becoming a standard smart-home primitive rather than something each vendor invents. Certified products in these categories have been slower to arrive than the specification itself."
  - q: "What can I actually control on price?"
    a: "Anything where timing is flexible and the load is meaningful: immersion heaters, EV charging, storage batteries, dehumidifiers, pool pumps, and to a lesser extent dishwashers and washing machines. The test is whether the job cares when it happens. Heating a tank of water at 03:00 is identical to heating it at 18:00, except for the price."
  - q: "Are negative prices real?"
    a: "They happen, usually overnight or on windy weekends when generation exceeds demand. During those periods you are paid to consume. That is the headline case, but it is not where most of the value is: the routine gap between the cheapest and most expensive half hours on an ordinary day is the thing that adds up."
related:
  - href: "/guides/esp32-energy-meter"
    label: "ESP32 energy meter"
    desc: "Measuring what you actually use."
  - href: "/guides/esp32-solar-battery-monitor"
    label: "Solar and battery monitoring"
    desc: "The generation side of the same problem."
  - href: "/guides/esp32-smart-home-automation"
    label: "ESP32 smart home automation"
    desc: "Switching real loads safely."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "Where the price variable and automations live."
---

On an Agile-style tariff the electricity price changes every half hour and is published a day ahead.
Some periods are several times the price of others. A few are negative, meaning you are paid to use
power.

Most write-ups about this are affiliate comparisons of tariffs. The technical question — how do you
make your house actually respond to the number — has surprisingly little written about it, and the
canonical maker post on the subject is years old.

## Where you can do this

Dynamic pricing is not available everywhere, and the supplier decides both the interval and how you
get the data. The worked example below is **UK Octopus Agile**, because its API is public and needs
no key — which makes it the clearest thing to demonstrate. The pattern is identical elsewhere; only
the fetch changes.

| Region | Supplier / source | Interval | API |
|---|---|---|---|
| UK | [Octopus Agile](https://docs.octopus.energy/rest/guides/endpoints) | 30 min | REST, no auth |
| Nordics, Germany, Netherlands | [Tibber](https://developer.tibber.com/) | 15 min since Oct 2025 | GraphQL, token |
| Australia | [Amber Electric](https://app.amber.com.au/developers) | 30 min | REST, token |
| Germany, Austria | aWATTar | 60 min | REST |
| Nordics, Baltics | Nord Pool day-ahead | 60 min | Licensed |
| Central Europe | EPEX SPOT day-ahead | 60 min | Licensed |
| US (varies by utility) | e.g. ComEd hourly pricing | 60 min | REST, varies |

Two things differ by market and are worth checking before you build: **the interval** — Tibber moved
from hourly to quarter-hourly on 1 October 2025, and several markets are hourly rather than
half-hourly — and **whether prices are wholesale-linked at all**, since a fixed or time-of-use
tariff has nothing to react to.

If your market is not listed, the question to ask your supplier is whether they publish forward
prices in a machine-readable form. Plenty do not, and no amount of automation helps if the number
is only ever on a bill.

## The data is the easy part

Octopus publishes half-hourly unit rates through a [REST endpoint](https://docs.octopus.energy/rest/guides/endpoints) that requires **no authentication**:

```
https://api.octopus.energy/v1/products/<PRODUCT>/electricity-tariffs/<TARIFF>/standard-unit-rates/
```

Each record carries `value_inc_vat` in pence per kWh, with `valid_from` and `valid_to` marking the
half-hour window. The tariff code includes a region letter, so yours differs from the examples you
will find online. Results are paginated at 100 records.

Tomorrow's prices typically appear in the afternoon, which means a fetch every few hours is plenty —
there is no reason to poll aggressively for data that changes once a day.

> **The direction of travel**
>
> [Matter 1.5](https://csa-iot.org/newsroom/matter-1-5-introduces-cameras-closures-and-enhanced-energy-management-capabilities/),
> published 20 November 2025, added an electrical energy tariff device type so that "real-time and
> forecasted pricing, tariff, and carbon data" can be shared with devices in a standard format.
> Price-reactive automation is becoming a smart-home primitive rather than a per-supplier
> integration — though certified products in these categories have been slower to arrive than the
> specification.

## The pattern

Three pieces, and the middle one is what most DIY attempts get wrong:

1. **Fetch** prices on a schedule.
2. **Publish the current price as a variable**, so it is a first-class value that automations can
   compare against — rather than logic buried inside the fetch script.
3. **Trigger** actions when it crosses a threshold.

Keeping the price as a variable is what makes this maintainable. The script's only job becomes "what
is the price now", and every decision about what to do with that lives where you can see and change
it without editing code.

## Fetching and publishing

A small script, run every few hours from cron or systemd, posts the current and next-period prices
plus a rank for the day:

```python
from datetime import datetime, timedelta, timezone
import requests

PRODUCT = "AGILE-FLEX-22-11-25"
TARIFF  = "E-1R-AGILE-FLEX-22-11-25-C"      # region letter differs — check yours
RATES   = (f"https://api.octopus.energy/v1/products/{PRODUCT}"
           f"/electricity-tariffs/{TARIFF}/standard-unit-rates/")

NODRIX  = "https://nodrix.you.workers.dev/v1/telemetry"
TOKEN   = "tok_your_project_token"

now = datetime.now(timezone.utc)
window = {
    "period_from": now.isoformat().replace("+00:00", "Z"),
    "period_to": (now + timedelta(hours=24)).isoformat().replace("+00:00", "Z"),
}

results = requests.get(RATES, params=window, timeout=15).json()["results"]
periods = sorted(results, key=lambda r: r["valid_from"])
if not periods:
    raise SystemExit("no prices published for this window")

current = periods[0]
prices = [p["value_inc_vat"] for p in periods]

# Rank 0 means this is the cheapest half hour in the next 24.
rank = sorted(prices).index(current["value_inc_vat"])

requests.post(
    NODRIX,
    headers={"Authorization": f"Bearer {TOKEN}"},
    json={"metrics": {
        "price_now":      current["value_inc_vat"],
        "price_next":     periods[1]["value_inc_vat"] if len(periods) > 1 else None,
        "price_rank":     rank,
        "price_min_24h":  min(prices),
        "price_max_24h":  max(prices),
    }},
    timeout=10,
)
```

`price_rank` is the variable that makes this genuinely useful. An absolute threshold like "below 10p"
needs revisiting whenever the market moves. "This is one of the four cheapest half hours in the next
twenty-four" keeps meaning the same thing regardless of where prices sit, which matters because you
will otherwise be editing thresholds every few months.

## Turning price into action

With the price arriving as a variable, the decisions live in automations on your deployment rather
than in the script:

- **Immersion heater when `price_rank` is in the lowest four.** Heating water at 03:00 is identical
  to heating it at 18:00 except for the cost, which makes it the ideal load to shift.
- **EV charging when `price_now` is below your own average.** The car does not care when it charges,
  only that it is full by morning.
- **A notification when `price_now` goes negative**, so you can run the dryer while being paid to.
- **Storage battery charge on the cheapest periods**, discharge on the most expensive, if you have
  one.
- **Stop discretionary loads when `price_now` exceeds `price_max_24h` minus a margin** — the peak
  periods where the cost of running something flexible is worst.

Each is a trigger, a condition and an action, and the action can be a control write to a relay, a
webhook, or a message through a chat integration. The switching side is the same as any other load
control; the [smart home automation guide](/guides/esp32-smart-home-automation) covers doing it
safely, and mains switching deserves that care.

On the dashboard, charting `price_now` against `price_min_24h` and `price_max_24h` shows the shape
of the day at a glance, and it is the quickest way to sanity-check that a rule is firing at the
times you intended rather than at 4 a.m. for reasons you have not noticed yet.

## What is worth automating

The honest ranking, by how much the shift is worth against how much effort it takes:

| Load | Shiftable | Worth it |
|---|---|---|
| Immersion heater | Completely | Yes — large load, timing irrelevant |
| EV charging | Completely | Yes — largest single load in most homes |
| Storage battery | Completely | Yes, if you have one |
| Dehumidifier, pool pump | Mostly | Reasonable |
| Dishwasher, washing machine | Partly | Marginal — small loads, needs a smart appliance |
| Fridge, freezer | No | No — and do not try |

The pattern rewards big flexible loads. Automating a dishwasher to save a few pence is a fun
afternoon and not much else; shifting an immersion heater or a car charger is where the numbers stop
being rounding errors.
