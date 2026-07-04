---
title: "Announcing the Nodrix Arduino library for ESP32 and ESP8266"
description: "The new Nodrix Arduino library, explained in full — why hardware was the one place that still felt like boilerplate, what the library is, and every feature: NODRIX_WRITE control handlers, one-call telemetry, WebSocket and HTTP transports, at-least-once reliability, multi-network failover, and TLS pinning."
type: engineering
author:
  name: Arjun Krishna
  role: Maintainer
  url: https://github.com/decoded-cipher
datePublished: 2026-07-04
tags:
  - arduino
  - esp32
  - esp8266
  - library
faqs:
  - q: "Do I have to use the library to connect hardware to nodrix?"
    a: "No. nodrix has no required SDK — the device protocol is plain HTTPS and WebSocket with JSON, and anything that can make a request (a Raspberry Pi, a server script, an Arduino with a WiFi library) can talk to it directly. The library is optional, and it only exists for the one place the plumbing genuinely hurts: hand-written embedded C++ on an ESP32 or ESP8266."
  - q: "Which boards does it support?"
    a: "Every ESP32 — the original plus the S2, S3, C3, C6, and H2 variants — and ESP8266. That covers the common DevKits, XIAO ESP32-C3/S3, Arduino Nano ESP32, Seeed ESP32 boards, NodeMCU, and Wemos D1 mini. Boards that reach WiFi through a coprocessor (Pico W, UNO R4 WiFi, WiFiNINA) and cellular modules aren't supported yet."
  - q: "Is there a Python or Node SDK too?"
    a: "No, and there isn't planned to be one. Off a microcontroller, connecting to nodrix is already just an HTTP request or a WebSocket — a Python or Node wrapper would save almost nothing. The boilerplate only ever piled up in embedded C++, where you hand-roll WiFi, TLS, JSON, and reconnects, so that's the only place a library earns its keep."
  - q: "How does it handle reconnects and commands sent while the device was offline?"
    a: "Control delivery is at-least-once. The cloud holds a write until the device acks it and re-sends anything outstanding on the next connect or poll, so a command sent while the board was asleep or offline still lands. The library acks every write it delivers to your handler and reconnects on its own — you just keep handlers idempotent, which setting a pin naturally is."
  - q: "Does it validate TLS certificates?"
    a: "By default it connects encrypted but unverified — the fastest path to a first working device. When you're ready to pin, call setCACert() with your host's root CA on ESP32 (WebSocket and HTTP), or setFingerprint() on ESP8266 in HTTP mode. The README includes the openssl command to fetch the certificate."
related:
  - href: "https://github.com/decoded-cipher/nodrix-sdk"
    label: "nodrix-sdk on GitHub"
    desc: "The library source, examples, and installation."
  - href: "/guides/esp32-receive-commands"
    label: "Receive commands on an ESP32"
    desc: "The downlink the library runs for you, explained in depth."
  - href: "/guides/esp32-smart-home-automation"
    label: "Build a DIY smart home"
    desc: "A complete build on top of the library."
  - href: "/docs#protocol"
    label: "Device protocol"
    desc: "The plain HTTPS/WebSocket contract underneath."
---

nodrix has always been deliberately SDK-free. A device authenticates with a token and speaks plain
HTTPS or WebSocket, so a Raspberry Pi, a server script, or anything that can make a request talks to
it with no broker and nothing to install. That's a feature nearly everywhere — except on a
microcontroller, where "just make an HTTPS request" quietly expands into WiFi management, a TLS
socket, JSON parsing, protocol framing, acks, and reconnect handling. The real device logic ends up
a few lines buried in a hundred lines of plumbing.

The new **Nodrix Arduino library** fixes exactly that, and only that. It's an open-source
(`nodrix-sdk`) C++ library for **ESP32 and ESP8266** that hides the transport, TLS, JSON, and the
nodrix control/telemetry protocol behind a small API, so a sketch is mostly the device's own logic
again. This post covers why it exists, what it is, and every feature in detail.

## Why: the sketch was mostly plumbing

Here's the shape of the problem. To handle a single "turn the LED on" command from the cloud, a
hand-written sketch has to open a TLS WebSocket, parse every inbound frame, detect the control
message, pull out the variable and value, act on it, and then build and send an acknowledgement so
the cloud stops re-sending — all before you've written a line of actual device behavior:

```cpp
void onWsEvent(WStype_t type, uint8_t* payload, size_t len) {
  if (type != WStype_TEXT) return;
  JsonDocument doc;
  deserializeJson(doc, payload, len);
  if (strcmp(doc["type"] | "", "control") != 0) return;

  if (strcmp(doc["variable"] | "", "led") == 0) {
    const char* v = doc["value"] | "";                 // but value can be a bool or number too
    digitalWrite(LED_PIN, (strcmp(v, "on") == 0 || strcmp(v, "1") == 0) ? HIGH : LOW);
  }

  JsonDocument ack;                                    // now hand-build the ack frame
  ack["type"] = "ack";
  ack["ids"].to<JsonArray>().add(doc["id"]);
  String out; serializeJson(ack, out);
  ws.sendTXT(out);
}
```

That's before the WiFi connect loop, the `beginSSL` call to `/v1/control/ws?token=…`, the reconnect
interval, and the `ws.loop()` pump in `loop()`. And the string comparison on `value` is subtly
wrong: control values arrive **typed**, so a toggle can send the JSON boolean `true` rather than the
string `"on"`, and the hand-rolled check silently misses it. Every device re-implements this, and
every device gets a corner of it wrong.

With the library, that entire handler is the logic and nothing else:

```cpp
NODRIX_WRITE("led") {
  digitalWrite(LED_PIN, value.asBool() ? HIGH : LOW);
  Nodrix.send("led", value.asBool());
}
```

The socket, the parse, the type coercion, and the ack are gone — handled underneath.

## What it is

The library ships as its own repository, [`nodrix-sdk`](https://github.com/decoded-cipher/nodrix-sdk),
under the MIT license. Despite the "sdk" name it's a single C++/hardware library — there's no
Python or Node client, by design, because off a microcontroller connecting to nodrix is already
trivial. The Arduino name is `Nodrix`, so regardless of the repo you write:

```cpp
#include <Nodrix.h>
```

It depends on two well-known libraries — **ArduinoJson** (v7) and **WebSockets** (Links2004) — and
targets **every ESP32 variant** (S2, S3, C3, C6, H2) and **ESP8266**. Here's a complete, flashable
sketch that controls the on-board LED from a dashboard toggle:

```cpp
#include <Nodrix.h>
#include "secret.h"

const int LED_PIN = 2;

NODRIX_WRITE("led") {
  digitalWrite(LED_PIN, value.asBool() ? HIGH : LOW);
  Nodrix.send("led", value.asBool());
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();
}
```

That's the whole program. Everything below is what it does for you.

## Control handlers with NODRIX_WRITE

`NODRIX_WRITE("var") { ... }` registers a handler for a variable. When a dashboard widget, an
automation, or the API writes that variable, the block runs with a `value` in scope — no dispatch
table to maintain and no call to wire up in `setup()`. Registration happens before `setup()` runs, so
adding a handler is a single self-contained block anywhere in the sketch.

The `value` is a `NodrixValue` that coerces the wire type for you, which is what kills the buggy
string-sniffing from the "before" example:

- `value.asBool()` — `true` for the boolean `true`, any non-zero number, or `"on"`/`"1"`/`"true"`/`"yes"`.
- `value.asInt()` / `asLong()` — integers, parsing numeric strings.
- `value.asFloat()` / `asDouble()` — numbers.
- `value.asString()` — the raw string.
- `value.isNull()` — no value.

A slider that sends `42` and a toggle that sends `"on"` both just work, because the handler asks for
the type it wants rather than guessing at the type it got.

## Telemetry in one call

Sending readings is a single call per metric, with overloads for every common type:

```cpp
Nodrix.send("temperature", 22.5);
Nodrix.send("online", true);
Nodrix.send("status", "ok");
```

Calls **stage** a metric rather than transmitting immediately; the library coalesces them into one
frame on the next `run()` (WebSocket) or `flush()`/`poll()` (HTTP), so ten `send()` calls become one
efficient payload. The buffer also enforces the wire limits before sending — batching within the
per-frame metric cap, dropping over-long keys, clamping oversized strings — so a bug in one reading
can't get the whole batch rejected.

## Two transports, same handlers

A microcontroller lives one of two ways, and the library matches both without changing your logic:

- **WebSocket — `Nodrix.begin(...)`.** An always-on socket. Control writes arrive instantly and
  telemetry streams up the same connection. Call `Nodrix.run()` every `loop()`. This is the right
  mode for lights, relays, and anything cloud-driven.
- **HTTP — `Nodrix.beginHTTP(...)`.** For battery and deep-sleep nodes. The device wakes, `send()`s
  its readings and `flush()`es them, calls `poll()` to fetch and apply any pending control, and goes
  back to sleep. No connection is held open between wakes.

The same `NODRIX_WRITE` handlers fire in both modes, so you can prototype on a wall-powered board over
WebSocket and move to a battery build on HTTP without rewriting anything on the device or the cloud.

## Reliability, handled underneath

The protocol's sharp edges are the real reason to use the library rather than hand-roll it, and they
all live below the API:

- **At-least-once delivery.** A control write stays queued until it's acknowledged and is re-sent on
  the next connect or poll, so a command issued while the board was asleep or offline still lands.
- **Automatic acks.** The library acknowledges every write it delivers to your handler, so the cloud
  stops re-sending it. Because delivery is at-least-once you may see a command twice across a
  reconnect, so handlers should be idempotent — setting a pin to a definite state naturally is.
- **Reconnect and catch-up.** On the WebSocket it reconnects on its own and flushes anything that
  queued while it was gone; liveness rides on WebSocket-level heartbeats.
- **Control-variable seeding.** The cloud only queues writes to a variable it has already seen. The
  library seeds registered control variables on connect and re-echoes their last known state, so a
  reconnect restores the device's real state rather than clobbering it — and your dashboard hydrates
  correctly the first time.

## Multiple WiFi networks with failover

A device that moves between a home and a workshop, or wants a hotspot as a backup, can register
several networks. The strongest reachable one is used, and the device fails over between them mid-run
if a network drops:

```cpp
Nodrix.addAP("home-ssid", "home-pass");
Nodrix.addAP("workshop-ssid", "workshop-pass");
Nodrix.begin(HOST, TOKEN);   // no ssid/pass — connects using the list above
```

`begin()` and `beginHTTP()` each take either the four-argument form with inline credentials or the
two-argument form that draws on the `addAP()` list.

## TLS you can turn on when you're ready

By default the library connects encrypted but unverified — the shortest path to a first working
device. When you want to pin, call one setter before `begin()`:

- `Nodrix.setCACert(pem)` — pin the root CA on ESP32, for both WebSocket and HTTP.
- `Nodrix.setFingerprint(fp)` — pin a SHA-1 fingerprint on ESP8266 in HTTP mode.

The README carries the `openssl s_client` one-liner to fetch your host's certificate. One honest
limitation: on ESP8266 the WebSocket transport is always unvalidated, so for a pinned socket use an
ESP32, or ESP8266 in HTTP mode with a fingerprint.

## Events and debugging

Beyond telemetry and control, a device can fire a named **event** to trigger a server-side
automation — `Nodrix.event("door_opened")` — over the same connection. And building with
`-DNODRIX_DEBUG` prints connection and protocol activity to Serial while you're bringing a board up.

## Getting it

Install from the **Arduino Library Manager** (search for Nodrix) or add it to **PlatformIO**:

```ini
lib_deps =
  bblanchon/ArduinoJson@^7
  links2004/WebSockets@^2.6
  https://github.com/decoded-cipher/nodrix-sdk.git
```

The repository ships five worked examples — a single LED, two-light home control, multi-network
failover, cert-pinned sensor telemetry, and an HTTP deep-sleep node — so most people go from install
to a controllable device in a few minutes. Two guides go deeper on the ideas the library runs for
you: [receiving commands on an ESP32](/guides/esp32-receive-commands) for the downlink, and
[building a DIY smart home](/guides/esp32-smart-home-automation) for a complete project on top of it.

## What's next

The library is at 0.1.0 and focused on doing one job well. More boards — the coprocessor-WiFi and
cellular families — and a richer set of examples are the near-term additions, and it will track the
device protocol as nodrix grows. It stays what it is: a thin, open, no-lock-in convenience over a
protocol you could always have spoken by hand.

If you build with ESP32 or ESP8266, the fastest way to see it is to
[grab it from the repo](https://github.com/decoded-cipher/nodrix-sdk), flash the LED example, and
bind a toggle to `led`. The plumbing is finally somebody else's problem.
