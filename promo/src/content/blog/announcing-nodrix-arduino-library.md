---
title: "Why we built the Nodrix Arduino library"
description: "Nodrix is deliberately SDK-free — and that's a feature everywhere except on a microcontroller. The story behind the optional Arduino library for ESP32 and ESP8266: the boilerplate it kills, the bug it fixes, and why it's C++ only."
type: engineering
author:
  name: Arjun Krishna
  role: Maintainer
  url: https://github.com/decoded-cipher
datePublished: 2026-07-04
tags:
  - arduino
  - esp32
  - engineering
faqs:
  - q: "Is nodrix still SDK-free?"
    a: "Yes. The device protocol is still plain HTTPS and WebSocket with JSON, and any board or language can talk to nodrix directly with no library at all. The Arduino library is optional and sits on top of that open protocol — it removes boilerplate, it doesn't replace the protocol or lock you in."
  - q: "Why is the library only for ESP32 and ESP8266?"
    a: "Because that's the only place the boilerplate actually hurts. Off a microcontroller — a Raspberry Pi, a server script, a phone — connecting to nodrix is already just an HTTPS request, so a Python or Node wrapper would save almost nothing. In embedded C++ you hand-roll WiFi, TLS, JSON, acks, and reconnects every time, so that's where a library earns its keep."
  - q: "Do I have to use the library?"
    a: "No. It's optional. Anything that can make an HTTPS request or open a WebSocket can send telemetry and receive control directly — the library just does it in a few lines instead of a hundred on ESP32/ESP8266."
  - q: "What was wrong with hand-writing the device code?"
    a: "It's easy to get subtly wrong. A naive sketch string-matches the JSON, which misses control values that arrive as a boolean or number rather than a string, and it often forgets to acknowledge the command — so the cloud re-delivers it forever. Even a careful hand-written version is ~90 lines where the real logic is three. The library handles the acking, reconnects, control-variable seeding, and typed-value coercion for you."
related:
  - href: "/docs/arduino-library"
    label: "Arduino library reference"
    desc: "Install, API, transports, TLS — the full docs."
  - href: "/guides/esp32-receive-commands"
    label: "Receive commands on an ESP32"
    desc: "The downlink, explained in depth."
  - href: "/docs#protocol"
    label: "Device protocol"
    desc: "The open HTTPS/WebSocket contract underneath."
---

Nodrix has always been deliberately SDK-free. A device authenticates with a token and speaks plain
HTTPS or WebSocket, so a Raspberry Pi, a server script, or anything that can make a request talks to
it with no broker and nothing to install. That's a feature nearly everywhere — except on a
microcontroller, where "just make an HTTPS request" quietly expands into WiFi management, a TLS
socket, JSON parsing, protocol framing, acknowledgements, and reconnect handling.

This is the story of the one place nodrix still felt like boilerplate, and the small Arduino library
we wrote to fix it. If you just want the reference — install, API, transports, TLS — that lives in
the [Arduino library docs](/docs/arduino-library). This post is the why.

## The sketch that looks fine and isn't

Here's the first thing most people write to drive an LED from the cloud. It connects, opens the
socket, and reacts to the incoming message:

```cpp
#include <WiFi.h>
#include <WebSocketsClient.h>
#include "secret.h"

WebSocketsClient ws;

void webSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  if (type == WStype_TEXT) {
    String msg = String((char*)payload);
    if (msg.indexOf("\"value\":\"on\"")  != -1 || msg.indexOf("\"value\":\"1\"") != -1)
      digitalWrite(LED_BUILTIN, HIGH);
    if (msg.indexOf("\"value\":\"off\"") != -1 || msg.indexOf("\"value\":\"0\"") != -1)
      digitalWrite(LED_BUILTIN, LOW);
  }
}

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  ws.beginSSL(HOST, 443, ("/v1/control/ws?token=" + String(TOKEN)).c_str());
  ws.onEvent(webSocketEvent);
}

void loop() { ws.loop(); }
```

It works on the bench, and it's quietly broken in two ways.

**It never acknowledges the command.** Nodrix delivers control *at-least-once* — the cloud holds a
write until the device confirms it, and re-sends anything outstanding on every reconnect. This sketch
never acks, so the write is never "done"; it comes back every time the socket blips.

**It string-matches the JSON.** It only catches the *string* `"on"` or `"1"`. But control values
arrive **typed** — a dashboard toggle can send the JSON boolean `true` or the number `1`, and
`"\"value\":\"1\""` matches neither. The LED silently ignores real writes. (There's a third, quieter
issue: the cloud won't even queue a write to `led` until that variable has been seen once — so on a
fresh project this handler may never fire at all.)

## The sketch that's correct — and 90 lines

Fix all of that properly and you get the version that actually belongs in production: parse the JSON,
pull out the fields, drive the pin, and — the part everyone forgets — build and send the ack so the
cloud stops re-delivering.

```cpp
case WStype_TEXT: {
  JsonDocument doc;
  if (deserializeJson(doc, payload)) return;

  if (String(doc["type"] | "") == "control") {
    String id       = doc["id"] | "";
    String variable = doc["variable"] | "";
    String value    = doc["value"] | "";

    if (variable == "led")
      digitalWrite(LED_BUILTIN, (value == "on" || value == "1") ? HIGH : LOW);

    JsonDocument ack;                      // hand-build the ack frame
    ack["type"] = "ack";
    ack["ids"].to<JsonArray>().add(id);
    String out; serializeJson(ack, out);
    ws.sendTXT(out);
  }
  break;
}
```

That's just the message handler. Around it you still need the connect loop, `beginSSL`, a reconnect
interval, the CONNECTED/DISCONNECTED cases, and logging — the real sketch is about ninety lines. And
it *still* carries the typed-value bug: `doc["value"] | ""` coerces to a string, so a boolean `true`
becomes `""` and the LED never turns on. The one line that is actually your project — *"if `led`,
drive the pin"* — is buried in plumbing that every device re-implements and every device gets a
corner of wrong.

## The rule: your sketch should only hold your logic

That's the line we drew. Everything that isn't specific to *your* project — the transport, the JSON,
the acks, the reconnects, the seeding, the type coercion — belongs to the library. Everything that is
— which pin, which threshold, what to do when a value arrives — stays in your sketch. Held to that
rule, the whole thing above becomes:

```cpp
NODRIX_WRITE("led") {
  digitalWrite(LED_PIN, value.asBool() ? HIGH : LOW);
  Nodrix.send("led", value.asBool());
}
```

The socket, the parse, the ack, and the reconnect are gone — handled underneath. You call
`Nodrix.begin(...)` once and `Nodrix.run()` in the loop, and that's the only "boilerplate" left — the
same shape as `Blynk.run()`. And that `value.asBool()` is quietly fixing the bug both hand-written
versions share: it coerces a JSON boolean, a number, *and* the string forms, so a toggle works no
matter which the dashboard sends.

## And that's one variable

Everything above is a single on/off LED. Real projects aren't. A smart-home board switches four
relays; a plant watcher reads a sensor and drives a pump; a fleet is a dozen of each. In the
hand-written world every variable is another branch to parse, another id to ack, another value to
seed and echo — the ninety lines don't stay ninety, they grow with the project. With the library each
variable is still just one block:

```cpp
NODRIX_WRITE("light_living")  { digitalWrite(LIVING,  value.asBool()); }
NODRIX_WRITE("light_bedroom") { digitalWrite(BEDROOM, value.asBool()); }
NODRIX_WRITE("fan")           { digitalWrite(FAN,     value.asBool()); }
```

It gets sharper the moment a project needs **both transports**. Some devices are mains-powered and
hold a socket open for instant control; others run on a battery — wake, report, sleep. Hand-rolled,
those are two different programs: a WebSocket event loop *and* an HTTP poll-fetch-ack cycle, each with
its own parse, ack, and reconnect. With the library it's the same handlers and a one-line switch —
`Nodrix.begin(...)` for the always-on board, `Nodrix.beginHTTP(...)` for the sleeper. You write the
project once; the transport is a detail. That's the number to picture: not ninety lines saved once,
but ninety-plus lines you *don't* write in every sketch, for every variable, on every device.

## Why each piece is in the library

We didn't hide things to be clever — each one prevents a specific failure you'd rather never meet:

- **Typed-value coercion.** Control values arrive typed: a toggle sends a boolean, a slider a number,
  a select a string. Hand-rolled string-matching silently misses two of the three — it's the bug in
  both sketches above.
- **Automatic acks.** Delivery is at-least-once, so an un-acked write isn't done, it's *pending*, and
  it comes back on every reconnect. Forgetting the ack is the most common way a device misbehaves.
- **Control-variable seeding.** The cloud won't queue a write to a variable it has never seen, so an
  un-seeded handler simply never fires on a fresh project — an evening lost wondering why.
- **Reconnect and heartbeat.** Sockets drop, and a dead one can look alive for a long time. The
  library reconnects itself and rides protocol heartbeats so a silent link gets noticed.
- **Multiple WiFi networks, with failover.** This one is essential, not a nicety. A device that lives
  on a network *will* lose it — a router reboots, the signal dips, a board roams between the house and
  the workshop AP. A single hardcoded `WiFi.begin(SSID, PASS)` with no failover just goes dark and
  stays dark. `addAP()` takes several networks and the library fails over between them mid-session, so
  months of uptime survive a flaky connection.
- **Telemetry batching.** Ten `send()` calls shouldn't be ten frames, and one over-long value
  shouldn't get the whole batch rejected. The library coalesces and clamps before it sends.

None of these are exotic. They're the corners you only find after the device has run for a week —
which is exactly why they belong in the library, written once, instead of in every sketch. The
[reference docs](/docs/arduino-library) show how each is used.

## Why it's C++ only, and stays optional

Two decisions people ask about.

**Why no Python or Node SDK?** Because the boilerplate only ever piled up in one place. Off a
microcontroller, talking to nodrix is already a single HTTPS request or one WebSocket — a wrapper
would save almost nothing and add a dependency to maintain. The pain was specific to embedded C++,
so the fix is too. There is deliberately no plan for other-language SDKs.

**Why keep it optional?** Because the platform's whole point is that you own it, with no lock-in, and
a mandatory SDK quietly walks that back. The device protocol stays plain, open HTTPS and WebSocket —
the naive sketch at the top of this post still works, warts and all. The library is a convenience
over a protocol you could always speak by hand, not a gate in front of it. That's the same reason it
never became the headline: the hero is *your own IoT cloud on Cloudflare*; the library is just the
shortest path onto it from an ESP32.

## Get it

The library is at `0.1.0` and focused on doing one job well. If you build with ESP32 or ESP8266, the
fastest way to feel the difference is to flash the
[`LedControl`](https://github.com/decoded-cipher/nodrix-sdk/tree/master/examples/LedControl) example
and bind a toggle to `led`.

- **Reference:** [the Arduino library docs](/docs/arduino-library) — install, API, transports, TLS.
- **Source & examples:** [github.com/decoded-cipher/nodrix-sdk](https://github.com/decoded-cipher/nodrix-sdk).

The plumbing is finally somebody else's problem.
