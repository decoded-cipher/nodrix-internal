---
title: "SmartThings API goes paid in October 2026: your options"
description: "Samsung is ending free SmartThings API access in October 2026. What actually changes, who it affects, and how to own the telemetry layer you were using it for."
category: comparison
datePublished: 2026-09-18
faqs:
  - q: "Is the SmartThings API really no longer free?"
    a: "Samsung announced on 23 June 2026 that free API access ends, with paid tiers launching in October 2026. Individual non-commercial developers move to a $4.99 a month personal plan; commercial tiers were announced separately. Free access was stated to remain available through Q3 2026, and Samsung said it would not begin applying the new usage limits until October."
  - q: "Does this break my Home Assistant SmartThings integration?"
    a: "If that integration talks to the SmartThings cloud API, and it does, then it is subject to the same change. Samsung has not published the numeric rate limits that will apply, which is the part most people are waiting on. Local protocols are unaffected: Zigbee and Z-Wave devices paired directly to a local controller never touch the API."
  - q: "Can nodrix replace my SmartThings hub?"
    a: "No, and it is worth being plain about that. SmartThings is a hub that speaks Zigbee and Z-Wave to commercial appliances and handles their pairing and lifecycle. nodrix is a backend for hardware you build or control yourself, over HTTPS and WebSocket. If your setup is mostly off-the-shelf smart plugs and bulbs, you need a hub, and Home Assistant with a Zigbee or Z-Wave stick is the usual answer."
  - q: "So what part can I actually move?"
    a: "The telemetry and dashboard layer. If you were calling the SmartThings API to log readings, graph history, drive alerts, or feed another app, that is the part you can own outright rather than rent. Your own sensors report to your own deployment, and the data and the dashboards live in your Cloudflare account with no per-device pricing and no API subscription."
  - q: "How long do I have?"
    a: "Paid tiers launch in October 2026, so the practical deadline is the end of September. The usage limits that will apply have not been published, which makes planning harder than it should be. If you depend on the API for anything you care about, the sensible move is to know now which parts are genuinely hub-dependent and which parts are just data you could be holding yourself."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "Point your own hardware at your own deployment."
  - href: "/guides/home-assistant-vs-nodrix"
    label: "Home Assistant vs nodrix"
    desc: "Where each one fits, and why people run both."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The deployment your devices report to."
  - href: "/guides/cloudflare-free-tier-limits"
    label: "What it costs to run"
    desc: "The arithmetic behind the free tier."
---

On [23 June 2026 Samsung announced](https://blog.smartthings.com/smartthings-updates/a-new-enhanced-smartthings-api-experience/) that free SmartThings API access is ending. Individual
non-commercial developers move to a **$4.99 USD a month personal plan**; commercial tiers were announced
alongside it. Free access remains through Q3 2026, and Samsung said it will not begin applying the
new usage limits until **October 2026**.

The numbers that would let you plan — the actual rate limits — have not been published. That is the
part people are stuck on, and it is why "wait and see" is a worse strategy here than usual.

## What actually changes

The change is to the **cloud API**, not to your devices. That distinction decides whether you care.

| If you… | Affected? |
|---|---|
| Use the SmartThings app to control devices | No |
| Have Zigbee or Z-Wave devices paired to a local controller | No — local protocols never touch the API |
| Run the Home Assistant SmartThings integration | Yes — it talks to the cloud API |
| Poll the API to log or graph readings | Yes |
| Drive automations or alerts from API data | Yes |
| Feed SmartThings data into your own app or dashboard | Yes |

The last four are the ones worth thinking about now, because they are also the ones where the
dependency is avoidable.

## The honest boundary

nodrix does not replace a SmartThings hub, and pretending otherwise would waste your time.

A hub speaks Zigbee and Z-Wave, handles pairing, and knows the lifecycle of commercial appliances.
That is a real job and nodrix does not do it. If your setup is mostly off-the-shelf plugs, bulbs and
sensors, you want a hub — Home Assistant with a Zigbee or Z-Wave stick is the usual answer, and it
is a good one.

What nodrix does is the layer above: the telemetry, the dashboards, the automations, and the API you
read it all back through. If you were calling the SmartThings API because you wanted your readings
somewhere you could query, that layer does not have to be rented from anyone.

> **The useful question**
>
> Not "how do I replace SmartThings", but "which parts of this genuinely need a hub, and which parts
> are just my own data passing through someone else's cloud on the way to my own dashboard?"

## Your options

| Option | What it costs | Good for |
|---|---|---|
| Pay the $4.99 personal plan | $4.99 USD/month, limits unpublished | Staying exactly as you are |
| Move appliances to local control | A Zigbee or Z-Wave stick, one-off | Getting off the cloud API entirely |
| Own the telemetry layer | Cloudflare usage, typically nothing | Data you collect yourself |
| Some of each | — | Most real setups |

The last row is the honest answer for most people. Commercial appliances stay on a hub; the sensors
you built, and the data you actually want to keep, stop depending on a subscription.

## Owning the telemetry layer

nodrix deploys to your own Cloudflare account. Your hardware reports to it directly over HTTPS or a
WebSocket, variables appear the first time they are sent, and the dashboards and automations are
yours. There is no per-device pricing and no API plan.

A sensor reporting into your own deployment is a few lines. The firmware is deliberately the small
part:

```cpp
#include <Nodrix.h>
#include <WiFi.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

const int PUMP_PIN = 2;           // LED_BUILTIN on most dev boards, so this runs unwired

void setup() {
  Serial.begin(115200);
  pinMode(PUMP_PIN, OUTPUT);

  Nodrix.setFirmwareVersion("1.0.0");   // reported back, so updates can be tracked
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);

  Nodrix.onDisconnect([] { Serial.println("link lost"); });
}

// A dashboard toggle writing back to the device.
NODRIX_WRITE(pump) {
  digitalWrite(PUMP_PIN, value.asBool());
}

void loop() {
  Nodrix.run();                          // WebSocket: call every loop

  static unsigned long last = 0;
  if (millis() - last >= 30000) {
    last = millis();
    Nodrix.send("uptime_s", (long)(millis() / 1000));
    Nodrix.send("rssi", WiFi.RSSI());
  }
}
```

This runs on a bare board — `uptime_s` and `rssi` need no sensor, and `PUMP_PIN` is the built-in LED
so the dashboard toggle is visible straight away. Add your own sensor once the link is proven, and
pin TLS with `Nodrix.setCACert()` before you ship: the connection is encrypted but unverified until
you do.

That is the whole device side. Everything that makes it useful happens on the deployment:

- **Dashboards** — drag widgets onto a grid; they stream over a WebSocket, and any dashboard can be
  shared read-only by link.
- **Automations** — variable, schedule, and sunrise/sunset triggers running conditions and actions,
  including webhooks and chat integrations.
- **Read API** — latest state and time-series behind one token, so Grafana or your own app can read
  it without going through anyone's cloud.

## What to do before October

1. **List what actually calls the API.** Usually fewer things than expected, and usually the data
   parts rather than the control parts.
2. **Separate hub-dependent from data-only.** Anything Zigbee or Z-Wave paired to a hub stays. Data
   you generate yourself does not have to.
3. **Move the data-only parts first.** Those are the ones where a subscription buys you nothing you
   could not hold yourself.
4. **Then decide on the personal plan.** For genuinely hub-dependent setups, $4.99 a month may be
   the right answer, and there is no shame in paying it.

The deadline is worth respecting mostly because the limits are unpublished. Migrating on your own
schedule is considerably more pleasant than migrating the week something starts returning errors.
