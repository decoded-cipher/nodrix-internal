---
title: "Receive commands on an ESP32 from the cloud (the downlink, in depth)"
description: "How to get data back to an ESP32: handle control writes with the nodrix Arduino library over an always-on WebSocket, or poll on each wake for battery devices. The downlink most IoT tutorials skip."
category: hardware
board: ESP32
difficulty: intermediate
datePublished: 2026-06-08
dateUpdated: 2026-07-04
faqs:
  - q: "Can you push data to an ESP32 over plain HTTP?"
    a: "Not push, exactly — the device pulls. It polls a control endpoint on an interval and applies any queued writes, which gives near-real-time control without a broker. For instant updates while the board is awake, hold a WebSocket open and the cloud pushes down it. The library does either for you."
  - q: "How responsive is HTTP polling?"
    a: "As responsive as your interval. Poll every 2-5 seconds and a dashboard toggle reaches the board in seconds; poll once per wake and a sleepy sensor picks up commands when it next reports. The trade is request volume and battery, not capability."
  - q: "What happens to a command sent while my device is offline or asleep?"
    a: "It waits. Control writes are queued and delivered at-least-once: the cloud holds a write until the device acknowledges it, and re-delivers anything outstanding the moment the device reconnects or next polls. Nothing is lost across a nap or a Wi-Fi blip."
  - q: "Why do I have to acknowledge commands?"
    a: "You don't, by hand — the library acks each write it delivers to your handler. Acking is how the cloud knows a write landed so it can stop re-sending it; without it the same command keeps coming back. Because delivery is at-least-once, every delivery is acked (even a duplicate), so keep your handler idempotent."
  - q: "Should I poll or use the WebSocket?"
    a: "Use the always-on WebSocket (Nodrix.begin) for controllers that need zero-latency writes — on Cloudflare the socket hibernates, so an idle connection costs almost nothing. Use HTTP polling (Nodrix.beginHTTP, then poll each wake) for battery devices that wake, report, and sleep — there's no session to keep alive."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The full uplink-and-downlink guide this one expands on."
  - href: "/guides/esp32-automatic-plant-watering"
    label: "ESP32 plant watering"
    desc: "A complete build where the downlink drives a pump."
  - href: "/guides/esp32-deep-sleep-battery"
    label: "ESP32 battery life with deep sleep"
    desc: "Polling for control once per wake on a sleepy device."
  - href: "/docs"
    label: "Device protocol"
    desc: "The control and ack endpoints in the reference."
---

Sending a reading **up** is the easy half. The half that trips people up is getting a command
back **down**: HTTP is request/response, so how does the cloud tell a device behind home Wi-Fi to
flip a relay or change a setpoint? It doesn't, directly. The device asks. It fetches any pending
**control writes**, applies them, and acknowledges the ones it handled so they aren't sent again — a
pull, not a push, with no broker, static IP, or inbound connection.

On an ESP32 or ESP8266 the [nodrix Arduino library](https://github.com/decoded-cipher/nodrix-sdk)
runs that whole loop for you: fetch, apply, ack, reconnect. You write a handler per variable and the
library calls it whenever the cloud writes that variable. This guide shows that, then explains what
it does underneath — at-least-once delivery, idempotency, and acking.

## Two modes, matched to how the device lives

The library connects one of two ways. Both share the same handlers and the same token, so you can
start with one and switch later without touching the cloud side.

| | `begin()` — WebSocket | `beginHTTP()` — poll |
|---|---|---|
| Latency | instant | your poll interval (seconds) |
| Connection | one socket held open | none held; one request per check |
| Best for | always-on controllers | sleepy / periodic devices |
| Battery | poor unless mains-powered | excellent (sleep between polls) |
| Cost when idle | ~zero (Cloudflare hibernates it) | one request per interval |

## Handle a control write

A "command" is a **control write** — a pending instruction to set a variable: *`relay` to `on`*.
Register a handler for the variable and the library runs it on every write, whether it came from a
dashboard toggle, an automation, or the API:

```cpp
#include <Nodrix.h>

NODRIX_WRITE("relay") {
  digitalWrite(RELAY_PIN, value.asBool());
}

void setup() {
  pinMode(RELAY_PIN, OUTPUT);
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);   // always-on WebSocket
}

void loop() {
  Nodrix.run();   // control in, telemetry out, acks, reconnect
}
```

`value` coerces the wire value for you — `asBool()`, `asInt()`, `asFloat()`, `asString()` — so a
toggle that sends `"on"` and a slider that sends `42` both just work.

## Battery / deep sleep: poll on each wake

A sleepy device doesn't hold a socket. Switch to HTTP mode and drain the queue once per wake, right
after you report — the board is already connected, so the extra request is nearly free:

```cpp
#include <esp_sleep.h>   // deep-sleep API

void setup() {
  Nodrix.beginHTTP(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
  Nodrix.send("soil", readSoil());
  Nodrix.flush();   // POST telemetry
  Nodrix.poll();    // fetch + apply queued writes, then ack

  esp_sleep_enable_timer_wakeup(15ULL * 60 * 1000000);
  esp_deep_sleep_start();
}
```

Same handlers, same acks — a command simply applies on the next wake instead of instantly.

## What the library handles for you

The downlink has a few sharp edges, and they're the reason to use the library rather than hand-roll
it:

- **At-least-once delivery.** A control write stays queued until it's acked and re-delivers on the
  next connect or poll, so nothing is lost across a nap or a Wi-Fi blip. The library acks every write
  it hands your code.
- **Reconnect and catch-up.** On the socket it reconnects on its own and flushes anything queued
  while you were gone.
- **One connection, both directions.** Telemetry, events, and acks share the socket with control —
  `Nodrix.send()` and `Nodrix.event()` go up the same pipe.

## Still your job

- **Keep handlers idempotent.** At-least-once means you can see the same command twice. Setting a pin
  is naturally safe; for anything that isn't, act on the desired end-state rather than a toggle.
- **Cap physical actions.** Prefer a self-limiting action — a timed pulse over a latch — so a missed
  "off" can't leave a pump or heater running.

## Notes

- **No broker, no inbound connection.** The device only makes outbound HTTPS/WSS requests, so it
  works behind home routers, captive portals, and cellular NAT — port 443 is open everywhere.
- **One token, one project.** The same project token authorizes telemetry, control, and the socket;
  treat it as a secret and load it from config for anything real.
- **Install it.** Arduino Library Manager or PlatformIO; source and the
  [`LedControl` example](https://github.com/decoded-cipher/nodrix-sdk/tree/master/examples/LedControl)
  at [github.com/decoded-cipher/nodrix-sdk](https://github.com/decoded-cipher/nodrix-sdk).
- **It runs on your account.** The control queue and dashboard live in a nodrix instance on your own
  Cloudflare account — single-tenant, nothing leaving your tenancy.
