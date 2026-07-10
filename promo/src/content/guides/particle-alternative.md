---
title: "A Particle alternative you own — open-source, on your Cloudflare account"
description: "Particle was acquired by Digi International in January 2026 and is being folded into an OEM business. For Wi-Fi makers weighing their options, nodrix is an open-source alternative you deploy to your own Cloudflare account — no subscription, no vendor cloud, plain HTTPS/WebSocket."
category: comparison
datePublished: 2026-07-10
dateUpdated: 2026-07-10
faqs:
  - q: "What happened to Particle?"
    a: "Digi International acquired Particle in January 2026 for $50 million and is integrating it into its OEM Solutions business. Particle's platform continues to operate — this is a change of ownership and direction, not a shutdown — but the center of gravity is now enterprise and OEM device programs rather than the maker community Particle grew up with."
  - q: "Is there an open-source alternative to Particle?"
    a: "For the Wi-Fi side of what Particle does — telemetry, remote control, dashboards, webhooks-style automations — yes: nodrix is open source (MIT) and deploys to your own Cloudflare account, so there's no vendor cloud in the loop at all. There is no like-for-like open-source replacement for Particle's managed cellular connectivity; that part of Particle is genuinely hard to substitute."
  - q: "Can I keep using my Particle hardware with nodrix?"
    a: "Particle boards are engineered around Device OS and the Particle cloud, and that pairing is most of their value. The practical migration is to move the project, not the board: standard ESP32-class hardware costs a few dollars, and the firmware shape carries over — Particle.publish becomes Nodrix.send, and a Particle.function becomes a NODRIX_WRITE handler."
  - q: "Does nodrix do over-the-air firmware updates like Particle?"
    a: "Not today — OTA updates are on the roadmap. Particle's OTA and fleet tooling are first class, and if you're updating firmware across a deployed fleet regularly, that's a real reason to stay. nodrix's design reduces the pressure somewhat: dashboards, automations, thresholds, and alert channels all live in the cloud and change without reflashing, so the firmware itself can stay a thin, stable contract."
  - q: "What does nodrix cost compared to a Particle plan?"
    a: "nodrix has no license or subscription — you deploy it to your own Cloudflare account and pay Cloudflare for usage, which for hobby and small-fleet Wi-Fi workloads typically sits within the free plan. Particle is a commercial subscription platform; you're paying for managed connectivity, OTA, and fleet tooling. Which is 'cheaper' depends entirely on whether you need those managed services."
related:
  - href: "/guides/blynk-alternative"
    label: "Blynk alternative"
    desc: "The same ownership argument against another maker platform."
  - href: "/guides/arduino-cloud-alternative"
    label: "Arduino Cloud alternative"
    desc: "If you're also weighing the Arduino ecosystem."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The device code to point standard hardware at nodrix."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The one-click setup, end to end."
---

In January 2026, Digi International acquired Particle for $50 million and began folding it into its
OEM Solutions business. The platform keeps running, but the direction is now set by enterprise
device programs, not the community Particle itself puts at a quarter-million developers — the
people who grew up on Spark Cores, Photons, and
Argons. If you're one of them and reassessing, the honest first question isn't "what replaces
Particle" — it's which Particle you were using.

nodrix replaces one of them well: the Wi-Fi one. It's open source (MIT), you **deploy it to your
own Cloudflare account** in one click, and devices talk plain HTTPS/WebSocket — telemetry up,
control writes down, dashboards, automations, and a read API, all in your tenancy with no vendor
cloud to be acquired out from under you.

## The two Particles

Particle is really two products under one SDK:

- **A managed cellular fleet platform** — SIMs and carrier relationships across hundreds of
  networks, Device OS, OTA updates, fleet health. This is what Digi bought, it's genuinely good,
  and there is no drop-in open-source substitute. If your devices live on cellular in the field,
  nodrix is not your answer, and this page won't pretend otherwise.
- **A friendly Wi-Fi prototyping cloud** — `Particle.publish` from a Photon or Argon on your bench,
  a console to watch events, functions you call remotely, webhooks into the rest of the internet.
  This is how most makers actually used Particle, and it's the part that maps cleanly onto nodrix.

## Particle vs nodrix, honestly

| | Particle | nodrix |
|---|---|---|
| Model | Commercial platform, subscription | Open-source (MIT); you deploy it to your own Cloudflare |
| Owned by | Digi International (since Jan 2026) | You — it runs in your account |
| Where data lives | Particle's cloud | Your Cloudflare account (single-tenant) |
| Connectivity | Cellular (managed SIMs) + Wi-Fi | Any board that speaks HTTPS/WebSocket |
| Hardware | Particle boards + Device OS | Bring your own — ESP32, ESP8266, Pico W, anything |
| Uplink | `Particle.publish` events | `Nodrix.send` telemetry (auto-creates variables) |
| Downlink | `Particle.function`, variables | `NODRIX_WRITE` handlers over WebSocket or polling |
| OTA updates | First-class, fleet-wide | On the roadmap; cloud-side logic changes need no reflash |
| Dashboards | Console; build your own UI | Drag-and-drop web dashboards, embeddable widgets |
| Automations | Webhooks, integrations | Visual trigger → condition → action, run at the edge |
| Pricing | Subscription tiers | No license; Cloudflare usage (hobby scale: free plan) |

## When Particle is still the better choice

- Your devices are on **cellular**. Managed SIMs, carrier fallback, and fleet connectivity are the
  hard part of that world, and Particle does it properly.
- You depend on **fleet OTA** — staged firmware rollouts across hundreds of field units.
- You're an **OEM building a product line** and the Digi direction is a feature for you, not a
  concern: enterprise support contracts and a hardware-to-cloud vendor relationship.

## When nodrix fits better

- Your boards are on **Wi-Fi** — the bench, the house, the workshop, the campus — and the cellular
  machinery was never the part you used.
- You want **out of the acquisition business entirely**: the stack is MIT-licensed and runs in your
  own Cloudflare account, so there is no platform owner whose strategy can change your project.
- You want **costs that track usage, not seats or devices** — no subscription, no per-device fee.
- You'd rather have **dashboards and automations included** than build a UI against a console.

## Moving a project across

The firmware shape survives the move — Particle's model of events up, functions down maps directly:

```cpp
#include <Nodrix.h>

NODRIX_WRITE("led") {                        // was: Particle.function("led", ...)
  digitalWrite(LED_PIN, value.asBool());
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();

  static unsigned long last = 0;
  if (millis() - last >= 30000) {
    last = millis();
    Nodrix.send("temperature", readTemp());  // was: Particle.publish("temperature", ...)
  }
}
```

The hardware usually moves too: Particle boards are built around Device OS and the Particle cloud,
so the pragmatic path is a standard ESP32-class board — a few dollars, the same Arduino toolchain,
and no platform assumptions baked into the silicon. The full firmware walkthrough, TLS pinning
included, is in [Connect an ESP32 over HTTPS](/guides/esp32-https-cloud). Webhook-style glue —
"when this event, call that service" — recreates as trigger-condition-action automations with
Slack, Discord, Telegram, email, or plain HTTP actions.

## The bottom line

If Particle's cellular fleet machinery is your product's backbone, stay and watch how the Digi
integration lands. If Particle was your friendly Wi-Fi cloud, the acquisition is a good moment to
own the stack instead: deploy nodrix to your Cloudflare account, point one ESP32 at it, and the
part of Particle you actually used is yours now, in your own account.
