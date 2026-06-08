---
title: "ESP8266 to the cloud over HTTPS — a live dashboard with no broker"
description: "Push ESP8266 sensor data to a cloud dashboard over HTTPS — no MQTT broker. Full Arduino code with BearSSL on the ESP8266's tight RAM, control writes back to the board, and the deep-sleep wiring that makes a battery sensor last."
category: hardware
board: ESP8266
difficulty: intermediate
datePublished: 2026-06-08
faqs:
  - q: "Can an ESP8266 do HTTPS to the cloud?"
    a: "Yes, with BearSSL (built into the ESP8266 Arduino core). The chip has far less RAM than an ESP32, so you avoid loading a full CA bundle — use setInsecure() for a first run, then a single pinned trust anchor or fingerprint for production. A periodic HTTPS POST to one endpoint is well within its budget."
  - q: "Do I need MQTT for an ESP8266 dashboard?"
    a: "No. For periodic telemetry an HTTPS POST to a single endpoint sends a reading, and a GET fetches queued commands — no broker to run. MQTT is worth it only when you need persistent, sub-second, high-frequency messaging."
  - q: "How is the ESP8266 different from the ESP32 here?"
    a: "Same pattern, three practical differences: it uses the ESP8266WiFi / ESP8266HTTPClient libraries and BearSSL instead of WiFiClientSecure; it has much less heap, so keep JSON small and don't load a big CA store; and deep sleep needs a physical wire from GPIO16 to RST to wake the board."
  - q: "Will HTTPS drain an ESP8266 battery?"
    a: "Not with deep sleep. Wake, connect, POST, poll, sleep. The TLS handshake costs a second or two, which is irrelevant against a 15-minute sleep. Wire GPIO16 to RST and a single cell can carry the sensor for a long time."
  - q: "Why is my ESP8266 POST returning -1?"
    a: "Almost always TLS or memory. Confirm you used https:// and a BearSSL client; try setInsecure() to isolate certificate problems; and watch the heap — running out of RAM during the handshake also surfaces as a failed connection."
related:
  - href: "/guides/esp32-https-cloud/"
    label: "The ESP32 version of this guide"
    desc: "Same loop on the ESP32, with WiFiClientSecure and the CA bundle."
  - href: "/guides/raspberry-pi-pico-w-iot-dashboard/"
    label: "Raspberry Pi Pico W to the cloud"
    desc: "The same idea in MicroPython on the Pico W."
  - href: "/widgets"
    label: "Dashboard widgets"
    desc: "Bind your new variables to value, gauge, chart, and map widgets."
  - href: "/docs"
    label: "Device protocol & read API"
    desc: "Telemetry, control, automations, and the read API in full."
---

An **ESP8266** is more than capable of putting live sensor data on a cloud dashboard over HTTPS —
no MQTT broker, no SDK, no message queue to babysit. The catch versus an ESP32 is RAM: the 8266 has
far less of it, so the TLS setup has to be lean. This guide builds the whole loop on a real backend
(nodrix, which deploys to your own Cloudflare account): a reading up, a command back down, and a
deep-sleep build that lasts. Variables show up on your dashboard the first time they're seen — no
schema to declare.

## The mental model

Forget topics and payloads for a second. The board is just a bag of **variables**:

- **Telemetry (up):** you POST `{"metrics": {"temperature": 23.4}}`; each key becomes a variable.
- **Control (down):** a dashboard toggle or an automation queues a write — "set `relay` to `on`".
  The board fetches pending writes, applies them, and acks.

Two endpoints, one token. That's the whole protocol surface.

## Step 1 — Wi-Fi and a lean TLS client

The ESP8266 uses its own Wi-Fi and HTTP libraries, and **BearSSL** for TLS. Don't reach for a full
CA bundle the way you might on an ESP32 — it won't fit comfortably in heap. Start insecure to get a
green light, then pin a single trust anchor for production.

```cpp
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST  = "https://nodrix.you.workers.dev";
const char* TOKEN = "tok_your_project_token";

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(250); Serial.print('.'); }
  Serial.printf("\nWi-Fi up: %s\n", WiFi.localIP().toString().c_str());
}
```

## Step 2 — POST your first reading

Build the JSON with ArduinoJson rather than string-concatenation — it escapes values and keeps the
buffer small, which matters on this chip.

```cpp
bool sendTelemetry(float tempC, float humidity) {
  std::unique_ptr<BearSSL::WiFiClientSecure> client(new BearSSL::WiFiClientSecure);
  client->setInsecure();                 // dev only — pin a trust anchor for production

  HTTPClient https;
  if (!https.begin(*client, String(HOST) + "/v1/telemetry")) return false;
  https.addHeader("Content-Type", "application/json");
  https.addHeader("Authorization", String("Bearer ") + TOKEN);

  JsonDocument doc;
  JsonObject m = doc["metrics"].to<JsonObject>();
  m["temperature"] = tempC;
  m["humidity"]    = humidity;

  String body;
  serializeJson(doc, body);

  int code = https.POST(body);
  Serial.printf("POST /v1/telemetry -> %d\n", code);   // 204 = success
  https.end();
  return code == 204;
}
```

Open your dashboard and `temperature` and `humidity` are already there. Drop a **value** or
**gauge** widget on them and you're watching live data; the **chart** widget plots a time window.

## Step 3 — Receive commands back

"HTTP can't do downlink" is a myth — the board just *asks* for pending commands on a short interval
and acknowledges what it applied.

```cpp
void pollControl() {
  std::unique_ptr<BearSSL::WiFiClientSecure> client(new BearSSL::WiFiClientSecure);
  client->setInsecure();

  HTTPClient https;
  https.begin(*client, String(HOST) + "/v1/control");
  https.addHeader("Authorization", String("Bearer ") + TOKEN);

  if (https.GET() == 200) {
    JsonDocument doc;
    deserializeJson(doc, https.getString());
    // { "control": [ { "id": "ctl_x", "variable": "relay", "value": "on" } ] }
    for (JsonObject w : doc["control"].as<JsonArray>()) {
      if (strcmp(w["variable"], "relay") == 0)
        digitalWrite(RELAY_PIN, strcmp(w["value"], "on") == 0 ? HIGH : LOW);
      // collect w["id"] and POST it to /v1/control/ack so it isn't resent
    }
  }
  https.end();
}
```

Poll every few seconds for near-real-time control, or once per wake for a sleepy device. (For
instant control on an always-on board, hold the control WebSocket open instead — the
[ESP32 downlink guide](/guides/esp32-receive-commands/) shows the socket path; it's the same on the
8266.)

## Step 4 — Deep sleep, the ESP8266 way

A battery ESP8266 must **deep sleep** between readings, and there's one piece of hardware to get
right: **wire GPIO16 to RST**. That jumper is how the chip wakes itself from a timed sleep — without
it, `ESP.deepSleep()` puts the board to sleep and it never comes back.

```cpp
#define SLEEP_MINUTES 15

void setup() {
  Serial.begin(115200);
  connectWiFi();
  if (WiFi.status() == WL_CONNECTED) {
    sendTelemetry(readTemp(), readHumidity());   // your sensor
    pollControl();                               // grab queued commands while awake
  }
  ESP.deepSleep((uint64_t)SLEEP_MINUTES * 60ULL * 1000000ULL);  // wakes via GPIO16 -> RST
}

void loop() {}   // intentionally empty for a deep-sleep design
```

On the 8266, deep sleep wipes RAM and re-runs `setup()` from the top, so the whole sketch lives in
`setup()` and `loop()` stays empty. Keep the awake window short — connect, send, poll, sleep.

## Production checklist

- **Pin a trust anchor.** Swap `setInsecure()` for a single root certificate (BearSSL trust anchor)
  or a fingerprint before you ship — the full CA bundle is too heavy for this chip.
- **Watch the heap.** Print `ESP.getFreeHeap()` during bring-up; TLS plus a large JSON buffer is the
  usual cause of a failed POST. Keep payloads small.
- **Retry with backoff.** A POST can fail on a flaky network — retry a couple of times, and for
  sleepy devices stamp the reading with `ts` and send it next wake.
- **Keep the token secret.** The project token is a credential; load it from config, don't commit it.

With a short wake every 15 minutes, an ESP8266 sensor reporting to a dashboard you own is a tidy,
broker-free build — and the read API behind it means you can pull the same data into Grafana or your
own app whenever you want.
