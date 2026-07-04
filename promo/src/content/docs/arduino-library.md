---
title: "Nodrix Arduino library for ESP32 & ESP8266"
description: "Reference for the Nodrix Arduino library: install, the NODRIX_WRITE control API and value coercion, one-call telemetry, WebSocket and HTTP transports, at-least-once reliability, multi-WiFi failover, and TLS pinning — for ESP32 and ESP8266."
datePublished: 2026-07-04
dateUpdated: 2026-07-04
faqs:
  - q: "Which boards does the Nodrix Arduino library support?"
    a: "Every ESP32 — the original plus the S2, S3, C3, C6, and H2 variants — and ESP8266. That covers common DevKits, the XIAO ESP32-C3/S3, Arduino Nano ESP32, Seeed ESP32 boards, NodeMCU, and Wemos D1 mini. Boards that reach WiFi through a coprocessor (Raspberry Pi Pico W, Arduino UNO R4 WiFi, WiFiNINA) and cellular modules aren't supported yet — those talk to nodrix over plain HTTPS instead."
  - q: "How do I install the Nodrix Arduino library?"
    a: "In the Arduino IDE, install ArduinoJson (v7) and WebSockets (by Markus Sattler) from the Library Manager, then add the Nodrix library. In PlatformIO, add bblanchon/ArduinoJson, links2004/WebSockets, and the nodrix-sdk repository to lib_deps. Then include it with #include <Nodrix.h>."
  - q: "Do I have to use the library to connect an ESP32 to nodrix?"
    a: "No. The device protocol is plain HTTPS and WebSocket with JSON, so any board or language can talk to nodrix directly. The library is optional — it exists to remove the WiFi, TLS, JSON, ack, and reconnect boilerplate on ESP32/ESP8266, where hand-writing it is the most painful."
  - q: "Should I use the WebSocket or HTTP transport?"
    a: "Use the always-on WebSocket (Nodrix.begin) for mains-powered controllers that need instant control — the socket hibernates on Cloudflare, so an idle connection costs almost nothing. Use HTTP polling (Nodrix.beginHTTP, then Nodrix.poll() each wake) for battery devices that wake, report, and deep-sleep. The same NODRIX_WRITE handlers work in both modes."
  - q: "What happens to a command sent while the device is offline or asleep?"
    a: "It waits. Control delivery is at-least-once: the cloud holds a write until the device acknowledges it and re-delivers anything outstanding on the next connect or poll. The library acks every write it delivers, reconnects on its own, and seeds control variables so the cloud will queue writes to them — so a command sent during a nap still lands."
  - q: "How do I turn on TLS certificate validation?"
    a: "By default the library connects encrypted but unverified — the fastest path to a first working device. To pin, call Nodrix.setCACert(pem) before begin() on ESP32 (WebSocket and HTTP), or Nodrix.setFingerprint(fp) on ESP8266 in HTTP mode. The repo README includes the openssl command to fetch your host's root CA."
related:
  - href: "/blog/announcing-nodrix-arduino-library"
    label: "Why we built the library"
    desc: "The story and the thinking behind it."
  - href: "/guides/esp32-receive-commands"
    label: "Receive commands on an ESP32"
    desc: "The downlink the library runs for you, in depth."
  - href: "/guides/esp32-smart-home-automation"
    label: "Build a DIY smart home"
    desc: "A complete project on top of the library."
  - href: "/docs#protocol"
    label: "Device protocol"
    desc: "The plain HTTPS/WebSocket contract underneath."
---

The **Nodrix Arduino library** connects ESP32 and ESP8266 hardware to
[Nodrix](https://nodrix.live) in a few lines. It hides WiFi, TLS, the WebSocket/HTTP transport,
JSON, and the nodrix control/telemetry protocol behind a small API, so a sketch is mostly the
device's own logic. The source, examples, and issue tracker live at
[github.com/decoded-cipher/nodrix-sdk](https://github.com/decoded-cipher/nodrix-sdk).

It's optional: the device protocol is plain HTTPS and WebSocket, so any board or language can talk
to nodrix directly. The library exists for the one place that plumbing hurts — hand-written embedded
C++.

## Installation

The library depends on two well-known libraries: **ArduinoJson** (v7) and **WebSockets** by Markus
Sattler.

**Arduino IDE** — install both dependencies from the Library Manager, then add the Nodrix library
(Library Manager, or drop the folder into `Arduino/libraries/`).

**PlatformIO** — add to `platformio.ini`:

```ini
lib_deps =
  bblanchon/ArduinoJson@^7
  links2004/WebSockets@^2.6
  https://github.com/decoded-cipher/nodrix-sdk.git
```

Whichever you use, include it with a single header:

```cpp
#include <Nodrix.h>
```

## Quickstart

A complete sketch that controls the on-board LED from a dashboard toggle bound to the variable
`led`:

```cpp
#include <Nodrix.h>
#include "secret.h"

const int LED_PIN = 2;

NODRIX_WRITE("led") {                          // cloud writes "led" -> this runs
  digitalWrite(LED_PIN, value.asBool() ? HIGH : LOW);
  Nodrix.send("led", value.asBool());          // report real state back
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();
}
```

That's the whole program. Everything below is what the library does underneath.

## Configuration

Put your WiFi and Nodrix credentials at the top of the sketch, or in a `secret.h` you
`#include`:

```cpp
#define WIFI_SSID "your-wifi"
#define WIFI_PASS "your-password"
#define HOST      "yourproject.workers.dev"   // Nodrix host, no https://
#define TOKEN     "your-project-token"         // Settings -> Tokens
```

`HOST` is the bare hostname of your deployment. `TOKEN` is a project token — treat it as a secret
and load it from config for anything permanent.

### Multiple WiFi networks

Register fallbacks with `addAP()` before `begin()`. The strongest reachable network is used, and the
device fails over between them if one drops mid-session:

```cpp
Nodrix.addAP("home-ssid", "home-pass");
Nodrix.addAP("workshop-ssid", "workshop-pass");
Nodrix.begin(HOST, TOKEN);   // no ssid/pass — uses the list above
```

`begin()` and `beginHTTP()` each take either the four-argument form with inline credentials or the
two-argument form that draws on the `addAP()` list.

## Receiving control

`NODRIX_WRITE("var") { ... }` registers a handler for a variable. When a dashboard widget, an
automation, or the API writes that variable, the block runs with a `value` in scope. Registration
happens before `setup()`, so a handler is a single self-contained block anywhere in the sketch — no
dispatch table, no wiring in `setup()`.

The `value` is a `NodrixValue` that coerces the wire type for you, so a toggle that sends the boolean
`true`, a slider that sends `42`, and a select that sends `"on"` all just work:

| Method | Returns |
| --- | --- |
| `value.asBool()` | `true` for `true`, any non-zero number, or `"on"`/`"1"`/`"true"`/`"yes"` |
| `value.asInt()` / `asLong()` | integer (parses numeric strings) |
| `value.asFloat()` / `asDouble()` | number |
| `value.asString()` | the raw string |
| `value.isNull()` | no value |

Acknowledgements are automatic — the library acks every write it delivers to your handler, so the
cloud stops re-sending it. Because delivery is at-least-once, a handler can run more than once for
the same command across a reconnect, so keep it idempotent. Setting a pin to a definite state is
naturally safe.

## Sending telemetry

`send()` reports a reading. Overloads cover every common type:

```cpp
Nodrix.send("temperature", 22.5);
Nodrix.send("online", true);
Nodrix.send("status", "ok");
```

Calls **stage** a metric rather than transmitting immediately; the library coalesces them into a
single frame on the next `run()` (WebSocket) or `flush()`/`poll()` (HTTP), so ten `send()` calls
become one payload. The buffer also enforces the wire limits before sending — it batches within the
per-frame metric cap, drops over-long keys, and clamps oversized string values — so one bad reading
can't get the whole batch rejected. Call `flush()` to force-transmit staged metrics immediately.

## Transports

A device lives one of two ways, and the library matches both without changing your handlers:

| | `begin()` — WebSocket | `beginHTTP()` — HTTP polling |
| --- | --- | --- |
| Latency | instant | your poll interval |
| Connection | one socket held open | none held; one request per check |
| Best for | always-on controllers | battery / deep-sleep nodes |
| Loop call | `Nodrix.run()` every `loop()` | `Nodrix.poll()` on each wake |
| Cost when idle | ~zero (Cloudflare hibernates it) | one request per interval |

- **WebSocket — `Nodrix.begin(...)`.** Control arrives the instant a widget moves, and telemetry
  streams up the same connection. Call `Nodrix.run()` every `loop()`.
- **HTTP — `Nodrix.beginHTTP(...)`.** For battery nodes. On each wake: `send()` your readings,
  `flush()` to POST them, `poll()` to fetch and apply any queued control, then deep-sleep.

```cpp
void setup() {
  Nodrix.beginHTTP(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
  Nodrix.send("soil", readSoil());
  Nodrix.flush();   // POST telemetry
  Nodrix.poll();    // fetch + apply queued control, then ack
  // ... then esp_deep_sleep_start()
}
```

## Reliability

The protocol's sharp edges are the reason to use the library rather than hand-roll it, and they all
live below the API:

- **At-least-once delivery.** A control write stays queued until it's acknowledged and re-delivers on
  the next connect or poll, so nothing is lost across a nap or a WiFi blip.
- **Automatic acks.** The library acknowledges every write it hands your code, so the cloud stops
  re-sending it. Keep handlers idempotent — you can see the same command twice.
- **Control-variable seeding.** The cloud only queues writes to a variable it has already seen. The
  library seeds each registered `NODRIX_WRITE` variable on connect, so control works the first time,
  and re-echoes the last known state on reconnect rather than clobbering it.
- **Reconnect and heartbeat.** On the WebSocket it reconnects on its own and rides WebSocket-level
  heartbeats for liveness; `run()` and `poll()` also re-run WiFi failover if the connection drops.

## TLS

By default the library connects encrypted but unverified — the shortest path to a first working
device. To pin a certificate, call one setter before `begin()`:

- `Nodrix.setCACert(pem)` — pin the root CA on ESP32, for both WebSocket and HTTP.
- `Nodrix.setFingerprint(fp)` — pin a SHA-1 fingerprint on ESP8266 in HTTP mode.

Pin the **root CA**, not the server (leaf) certificate — the leaf rotates every ~90 days, the root
does not. Your host already serves its root as the last block of the TLS chain; pull that block
straight into `secret.h`:

```sh
openssl s_client -showcerts -servername yourproject.workers.dev \
  -connect yourproject.workers.dev:443 </dev/null 2>/dev/null \
| awk '/BEGIN CERTIFICATE/{c++; b=""} {b=b $0 ORS} /END CERTIFICATE/{last=b} END{printf "\n%s", last}'
```

For Cloudflare `*.workers.dev` that returns GTS Root R4 — the one shipped in the `SensorTelemetry`
example. A custom domain returns its own root; the command is the same.

One limitation to know: on ESP8266 the WebSocket transport is always unvalidated. For a pinned
socket, use an ESP32, or ESP8266 in HTTP mode with a fingerprint — but a fingerprint pins the leaf,
so it must be refreshed on each rotation; prefer a root CA where you can.

## Events

Fire a named event to trigger a server-side automation, over the same connection:

```cpp
Nodrix.event("door_opened");
```

## Debug logging

Build with `-DNODRIX_DEBUG` to print connection and protocol activity to Serial while bringing a
board up. The library never calls `Serial.begin()` itself — that stays yours.

## API reference

| | |
| --- | --- |
| `addAP(ssid, pass)` | Register a WiFi network before `begin()` |
| `begin(ssid, pass, host, token[, port])` | Connect over WebSocket |
| `begin(host, token[, port])` | WebSocket, using the `addAP()` networks |
| `beginHTTP(ssid, pass, host, token[, port])` | HTTP mode |
| `beginHTTP(host, token[, port])` | HTTP mode, using the `addAP()` networks |
| `run()` | WebSocket: pump the socket and flush telemetry; call every `loop()` |
| `poll()` | HTTP: send readings, fetch and apply control; call on wake |
| `send(var, value)` | Stage a metric (`bool`/`int`/`long`/`float`/`double`/`const char*`/`String`) |
| `flush()` | Transmit staged metrics now |
| `event(name)` / `event(name, payload)` | Fire a server-side event |
| `connected()` | Whether the link is up |
| `onConnect(cb)` / `onDisconnect(cb)` | Connection callbacks |
| `setInsecure()` | Skip certificate validation (default) |
| `setCACert(pem)` | Pin a root CA (ESP32) |
| `setFingerprint(fp)` | Pin a SHA-1 fingerprint (ESP8266 HTTP) |
| `NODRIX_WRITE("var") { ... }` | Handle a cloud write; `value` is in scope |

## Supported boards

Any **ESP32** — the original plus the **S2, S3, C3, C6, and H2** variants — or **ESP8266**. Examples:
XIAO ESP32-C3/S3, Arduino Nano ESP32, Seeed ESP32 boards, NodeMCU, Wemos D1 mini.

Boards that reach WiFi through a coprocessor (Raspberry Pi Pico W, Arduino UNO R4 WiFi, WiFiNINA) and
cellular modules (A9G, SIM7000) aren't supported yet — point those at nodrix over plain HTTPS
instead.

## Examples

The repository ships five worked examples:

- **LedControl** — toggle the on-board LED from a dashboard.
- **HomeLights** — two independently controlled lights or relays.
- **MultiWiFi** — connect through several networks with failover.
- **SensorTelemetry** — periodic readings over a cert-pinned socket.
- **DeepSleepSensor** — HTTP mode: wake, report, apply control, deep sleep.

Grab them from [github.com/decoded-cipher/nodrix-sdk](https://github.com/decoded-cipher/nodrix-sdk),
flash `LedControl`, and bind a toggle to `led` to see it end to end.
