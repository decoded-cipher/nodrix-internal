---
title: "Receive commands on an ESP32 from the cloud (the downlink, in depth)"
description: "How to get data back to an ESP32 over HTTP: poll for control writes and ack them, or hold a control WebSocket open for instant updates. The downlink most IoT tutorials skip."
category: hardware
board: ESP32
difficulty: intermediate
datePublished: 2026-06-08
dateUpdated: 2026-06-08
faqs:
  - q: "Can you push data to an ESP32 over plain HTTP?"
    a: "Not push, exactly — the device pulls. It polls a control endpoint on an interval and applies any queued writes, which gives near-real-time control without a broker. For instant updates while the board is awake, hold a WebSocket open and the cloud pushes down it."
  - q: "How responsive is HTTP polling?"
    a: "As responsive as your interval. Poll every 2-5 seconds and a dashboard toggle reaches the board in seconds; poll once per wake and a sleepy sensor picks up commands when it next reports. The trade is request volume and battery, not capability."
  - q: "Do I need a separate request to fetch commands?"
    a: "No. Every telemetry response already carries any queued writes — read them straight off it, so a reporting device never polls. You still ack the ones you applied with POST /v1/control/ack, but that only fires when a command actually came down, not every cycle. The standalone GET /v1/control endpoint is there for devices that don't post telemetry."
  - q: "What happens to a command sent while my device is offline or asleep?"
    a: "It waits. Control writes are queued and delivered at-least-once: the cloud holds a write until the device acknowledges it, and re-delivers anything outstanding the moment the device reconnects or next polls. Nothing is lost across a nap or a Wi-Fi blip."
  - q: "Why do I have to acknowledge commands?"
    a: "Acking is how the cloud knows a write landed so it can stop re-sending it. Without an ack the same command keeps coming back. Because delivery is at-least-once, ack every delivery — even a duplicate — and dedupe on the device by command id."
  - q: "Should I poll or use the WebSocket?"
    a: "Poll for periodic or battery devices that wake, report, and sleep — there's no session to keep alive. Use the control WebSocket for always-on controllers that need zero-latency writes; on Cloudflare the socket hibernates, so an idle always-open connection costs almost nothing."
related:
  - href: "/guides/esp32-https-cloud/"
    label: "Connect an ESP32 over HTTPS"
    desc: "The full uplink-and-downlink guide this one expands on."
  - href: "/guides/esp32-automatic-plant-watering/"
    label: "ESP32 plant watering"
    desc: "A complete build where the downlink drives a pump."
  - href: "/guides/esp32-deep-sleep-battery/"
    label: "ESP32 battery life with deep sleep"
    desc: "Polling for control once per wake on a sleepy device."
  - href: "/docs"
    label: "Device protocol"
    desc: "The control and ack endpoints in the reference."
---

Sending a reading **up** is the easy half. The half that trips people up is getting a command
back **down**: HTTP is request/response, so how does the cloud tell a device behind home Wi-Fi to
flip a relay or change a setpoint? It doesn't, directly. The device asks. On each cycle it fetches
any pending **control writes**, applies them, and acknowledges the ones it handled so they aren't
sent again. That single idea — a pull, not a push — is the whole downlink, and it works without a
broker, a static IP, or any inbound connection to the device.

This guide covers both ways to do it: HTTP **polling** (right for periodic and battery devices)
and a **control WebSocket** (right for always-on controllers that need instant writes), plus the
parts most tutorials skip — at-least-once delivery, idempotency, and acking.

## Poll or socket: pick by how the device lives

| | HTTP polling | Control WebSocket |
|---|---|---|
| Latency | your poll interval (seconds) | instant |
| Connection | none held; one request per check | one socket held open |
| Best for | sleepy / periodic devices | always-on controllers |
| Battery | excellent (sleep between polls) | poor unless mains-powered |
| Cost when idle | one request per interval | ~zero (Cloudflare hibernates it) |

Both ride the same model and the same auth, so you can start with polling and switch to the socket
later without changing the cloud side.

## The mental model: a queue of control writes

A "command" is a **control write** — a pending instruction to set a variable: *set `relay` to
`on`*. When a dashboard toggle moves or an automation fires, the cloud appends a write to a
per-device queue. Each write has an `id`, a `variable`, and a `value`. The device drains the queue,
acts on each write, and acks the ids it handled. Delivery is **at-least-once**: a write stays in
the queue until it's acked, and is re-delivered if the device never confirmed it. That guarantee is
what makes the downlink reliable over flaky Wi-Fi — and it's also why the device must be ready to
see the *same* command twice.

## Option A — poll for control writes (HTTP)

Two endpoints: `GET /v1/control` returns the pending writes; `POST /v1/control/ack` clears the ones
you handled.

```cpp
const char* HOST  = "https://nodrix.you.workers.dev";
const char* TOKEN = "tok_your_project_token";

String lastAppliedId;   // dedupe re-delivered writes (idempotency)

void pollControl() {
  WiFiClientSecure client;
  client.setInsecure();                          // dev only — pin a CA in production

  HTTPClient https;
  https.begin(client, String(HOST) + "/v1/control");
  https.addHeader("Authorization", String("Bearer ") + TOKEN);

  if (https.GET() != 200) { https.end(); return; }

  JsonDocument doc;
  deserializeJson(doc, https.getString());
  // { "control": [ { "id": "ctl_x", "variable": "relay", "value": "on" } ] }
  https.end();

  String ids = "[";
  bool first = true;
  for (JsonObject w : doc["control"].as<JsonArray>()) {
    const char* id  = w["id"];
    const char* var = w["variable"];
    const char* val = w["value"];

    if (String(id) != lastAppliedId && strcmp(var, "relay") == 0) {
      digitalWrite(RELAY_PIN, strcmp(val, "on") == 0 ? HIGH : LOW);
      lastAppliedId = id;                         // remember what we ran
    }
    if (!first) ids += ',';
    ids += '"'; ids += id; ids += '"';            // ack every delivery, even a dup
    first = false;
  }
  ids += "]";

  if (ids != "[]") {
    HTTPClient ack;
    ack.begin(client, String(HOST) + "/v1/control/ack");
    ack.addHeader("Content-Type", "application/json");
    ack.addHeader("Authorization", String("Bearer ") + TOKEN);
    ack.POST("{\"ids\":" + ids + "}");            // -> { "acked": 1 }
    ack.end();
  }
}
```

Two things to notice. First, the device **acks every id it received**, but only **acts** on writes
it hasn't already applied — that split is what makes a re-delivered command safe. Second, acking is
not optional: skip it and the cloud assumes the write never landed and keeps returning it on every
poll.

### Skip the poll: control rides the telemetry response

A device that's already POSTing telemetry doesn't need the separate `GET /v1/control` — the same
queue comes back on the telemetry response. Apply the writes and ack the ids you handled with
`POST /v1/control/ack`, exactly as above. One fewer request every cycle, and the ack only fires when
there's actually something to ack.

```cpp
void report(float tempC) {
  WiFiClientSecure client;
  client.setInsecure();                          // dev only — pin a CA in production

  HTTPClient https;
  https.begin(client, String(HOST) + "/v1/telemetry");
  https.addHeader("Content-Type", "application/json");
  https.addHeader("Authorization", String("Bearer ") + TOKEN);
  if (https.POST("{\"metrics\":{\"temperature\":" + String(tempC) + "}}") != 200) { https.end(); return; }

  JsonDocument doc;
  deserializeJson(doc, https.getString());   // { "control": [ { "id", "variable", "value" } ] }
  https.end();

  String ids = "[";
  bool first = true;
  for (JsonObject w : doc["control"].as<JsonArray>()) {
    if (strcmp(w["variable"], "relay") == 0)
      digitalWrite(RELAY_PIN, strcmp(w["value"], "on") == 0 ? HIGH : LOW);
    if (!first) ids += ',';
    ids += '"'; ids += (const char*)w["id"]; ids += '"';
    first = false;
  }
  ids += "]";

  if (ids != "[]") {                             // ack only when something came down
    HTTPClient ack;
    ack.begin(client, String(HOST) + "/v1/control/ack");
    ack.addHeader("Content-Type", "application/json");
    ack.addHeader("Authorization", String("Bearer ") + TOKEN);
    ack.POST("{\"ids\":" + ids + "}");
    ack.end();
  }
}
```

This is the right shape for periodic and battery devices: the board is already connected to send its
reading, so the downlink rides back on the response — no extra poll.

### Choosing a poll interval

The interval is a straight latency-versus-cost dial:

- **Always awake, want it snappy:** poll every 2-5 seconds. A toggle reaches the board in seconds.
- **Battery / deep sleep:** don't poll separately — every telemetry response already carries any
  queued control (above). You only spend an extra request to ack when a command actually comes down;
  commands apply on the next wake.
- **In between:** back off when idle. Poll fast for a minute after activity, then slow down.

## Option B — the control WebSocket (instant)

When the board stays awake and you want a write to land the moment a widget moves, open the control
socket instead of polling. The cloud pushes each write down it as it happens, and flushes anything
still pending the instant you connect — so a command queued while you were briefly disconnected
arrives on reconnect.

```cpp
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

WebSocketsClient ws;
String lastAppliedId;

// Server frame: { "type":"control", "id", "variable", "value" }. At-least-once,
// so skip one we've already run — then ack every delivery so it stops resending.
void onMessage(uint8_t* payload, size_t len) {
  JsonDocument cmd;
  if (deserializeJson(cmd, payload, len) || cmd["type"] != "control") return;

  String id = cmd["id"].as<String>();
  if (id != lastAppliedId && cmd["variable"] == "relay") {
    digitalWrite(RELAY_PIN, cmd["value"] == "on" ? HIGH : LOW);
    lastAppliedId = id;
  }
  ws.sendTXT("{\"type\":\"ack\",\"ids\":[\"" + id + "\"]}");
}

void setup() {
  // ... Wi-Fi up first ...
  // Token goes in the query string — a WS upgrade can't set Authorization headers.
  ws.beginSSL("nodrix.you.workers.dev", 443, "/v1/control/ws?token=tok_your_project_token");
  ws.onEvent([](WStype_t type, uint8_t* payload, size_t len) {
    if (type == WStype_TEXT) onMessage(payload, len);
  });
  ws.setReconnectInterval(5000);   // auto-reconnect; pending writes flush on connect
}

void loop() {
  ws.loop();                       // service pushes + reconnect; nothing to poll
}
```

The socket is bidirectional, so the same connection also carries telemetry and events up if you
want it to — send `{"type":"telemetry","metrics":{...}}` or `{"type":"event","event":"..."}`. And
because Cloudflare hibernates the connection, holding it open all day costs almost nothing while
idle; you're not paying for an always-on server.

## Make it robust

The happy path is short; these are the details that separate a demo from a controller you'd leave
running:

- **Be idempotent.** At-least-once means duplicates. Dedupe by `id` (or by desired end-state) so a
  re-delivered "open valve" doesn't double-actuate. Always ack, even the duplicate.
- **Reconnect with backoff.** On the socket, `setReconnectInterval` handles the basics; for polling,
  retry a failed `GET` a couple of times with a growing delay rather than hammering.
- **Parse defensively.** Treat the payload as untrusted: check the message `type`, the `variable`,
  and the `value` before acting. Ignore anything you don't recognize.
- **Bound every wait.** Never block forever on a request or a socket — cap it so a bad network
  doesn't hang the board (and, on battery, doesn't drain the cell).
- **Cap the action.** For anything physical, prefer a self-limiting action (a timed pulse) over a
  latch, so a missed "off" can't leave a pump or heater running.

## Notes

- **No broker, no inbound connection.** The device only makes outbound HTTPS/WSS requests, so it
  works behind home routers, captive portals, and cellular NAT — port 443 is open everywhere.
- **One token, one project.** The same project token authorizes telemetry, control, and the socket;
  treat it as a secret and load it from NVS or config for anything real.
- **It runs on your account.** The control queue and dashboard live in a nodrix instance on your
  own Cloudflare account — single-tenant, nothing leaving your tenancy.
