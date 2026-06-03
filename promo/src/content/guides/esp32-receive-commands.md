---
title: "Receive commands on an ESP32 from the cloud (the downlink, in depth)"
description: "How to get data back to an ESP32 over HTTP: poll for control writes and ack them, or hold a control WebSocket open for instant updates. The downlink most IoT tutorials skip."
category: hardware
board: ESP32
difficulty: intermediate
readingTime: "9 min read"
datePublished: 2026-06-03
draft: true
faqs:
  - q: "Can you push data to an ESP32 over plain HTTP?"
    a: "Not push, exactly — the device pulls. It polls a control endpoint on an interval and applies any queued writes, which gives near-real-time control without a broker. For instant updates while awake, hold a WebSocket open."
related:
  - href: "/guides/esp32-https-cloud/"
    label: "Connect an ESP32 over HTTPS"
    desc: "The full uplink-and-downlink guide this one expands on."
  - href: "/docs"
    label: "Device protocol"
    desc: "The control and ack endpoints in the reference."
---

> **Draft — fuller guide coming soon.** Here's the short version while we finish it.

The return path is the half that trips people up: "HTTP is request/response, so how does the
*server* tell my device to do something?" The answer is that the device asks. On each cycle it
fetches pending **control writes**, applies them, and acknowledges the ones it handled so they
are not resent.

```cpp
// GET /v1/control  ->  { "control": [ { "id": "ctl_x", "variable": "relay", "value": "on" } ] }
if (https.GET() == 200) {
  JsonDocument doc;
  deserializeJson(doc, https.getString());
  for (JsonObject w : doc["control"].as<JsonArray>()) {
    if (strcmp(w["variable"], "relay") == 0)
      digitalWrite(RELAY_PIN, strcmp(w["value"], "on") == 0 ? HIGH : LOW);
  }
  // then POST /v1/control/ack { "ids": ["ctl_x"] }
}
```

Poll every few seconds for responsive control, or once per wake for a battery device. When the
board stays awake and you want zero-latency writes, open the control WebSocket
(`/v1/control/ws`) instead and react the instant a dashboard widget moves.

The full guide will cover idempotent application, retry and ack semantics, choosing a poll
interval, and the WebSocket path end to end.
