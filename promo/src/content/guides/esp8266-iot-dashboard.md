---
title: "ESP8266 to the cloud over HTTPS — a live dashboard with no broker"
description: "Push ESP8266 sensor data to a cloud dashboard with the nodrix Arduino library — BearSSL under the hood on the 8266's tight RAM, no MQTT broker, control writes back to the board, and the deep-sleep wiring that makes a battery sensor last."
category: hardware
board: ESP8266
difficulty: intermediate
datePublished: 2026-06-08
dateUpdated: 2026-07-04
faqs:
  - q: "Can an ESP8266 do HTTPS to the cloud?"
    a: "Yes — the nodrix library uses BearSSL (built into the ESP8266 Arduino core). The chip has far less RAM than an ESP32, so use the default (insecure) for a first run, then pin a fingerprint for production. A periodic HTTPS POST to one endpoint is well within its budget."
  - q: "Do I need MQTT for an ESP8266 dashboard?"
    a: "No. Underneath it's an HTTPS POST to a single endpoint to send a reading and a GET to fetch queued commands — no broker to run. MQTT is worth it only when you need persistent, sub-second, high-frequency messaging."
  - q: "How is the ESP8266 different from the ESP32 here?"
    a: "Same library and the same calls, three practical differences: it uses BearSSL under the hood; it has much less heap, so keep payloads small; and deep sleep needs a physical wire from GPIO16 to RST to wake the board. TLS pinning on the 8266 is a fingerprint (setFingerprint) rather than a CA."
  - q: "Will HTTPS drain an ESP8266 battery?"
    a: "Not with deep sleep. Wake, send, poll, sleep. The TLS handshake costs a second or two, which is irrelevant against a 15-minute sleep. Wire GPIO16 to RST and a single cell can carry the sensor for a long time."
  - q: "Why is my ESP8266 connection returning -1?"
    a: "Almost always TLS or memory. Try the insecure default to isolate certificate problems, and watch the heap — running out of RAM during the handshake also surfaces as a failed connection. Keep JSON payloads small."
related:
  - href: "/guides/esp32-https-cloud"
    label: "The ESP32 version of this guide"
    desc: "Same loop on the ESP32, with a pinned root CA."
  - href: "/guides/raspberry-pi-pico-w-iot-dashboard"
    label: "Raspberry Pi Pico W to the cloud"
    desc: "The same idea in MicroPython on the Pico W."
  - href: "/widgets"
    label: "Dashboard widgets"
    desc: "Bind your new variables to value, gauge, chart, and map widgets."
  - href: "/docs"
    label: "Device protocol & read API"
    desc: "Telemetry, control, automations, and the read API in full."
---

An **ESP8266** is more than capable of putting live sensor data on a cloud dashboard over HTTPS — no
MQTT broker, no message queue to babysit. The
[nodrix Arduino library](https://github.com/decoded-cipher/nodrix-sdk) supports the 8266 directly;
it uses **BearSSL** (bundled in the [ESP8266 Arduino core](https://github.com/esp8266/Arduino)) under
the hood, which matters because the chip's RAM is tight, so keep payloads small. This guide builds the whole loop on a real backend (nodrix, which deploys to your own
Cloudflare account): a reading up, a command back down, and a deep-sleep build that lasts. Variables
show up on your dashboard the first time they're seen — no schema to declare.

## The mental model

Forget topics and payloads for a second. The board is just a bag of **variables**:

- **Telemetry (up):** `Nodrix.send("temperature", 23.4)`; each key becomes a variable.
- **Control (down):** a dashboard toggle or an automation queues a write — "set `relay` to `on`".
  Your `NODRIX_WRITE("relay")` handler runs; the library acks it.

One token, both directions. That's the whole protocol surface.

## Step 1 — Connect

`Nodrix.begin()` brings up Wi-Fi and opens the connection over BearSSL. Start on the default
(encrypted but unverified) to get a green light, then pin a fingerprint for production:

```cpp
#include <Nodrix.h>
#include <DHT.h>

const char* HOST  = "nodrix.you.workers.dev";   // bare host, no https://
const char* TOKEN = "tok_your_project_token";

DHT dht(D2, DHT11);

void setup() {
  Serial.begin(115200);
  dht.begin();
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}
```

## Step 2 — Send readings

`Nodrix.send()` stages a metric; they coalesce into one small request on the next `run()`. Keep the
set of keys per call modest on this chip:

```cpp
void loop() {
  Nodrix.run();

  static uint32_t last = 0;
  if (millis() - last > 10000) {
    last = millis();
    Nodrix.send("temperature", dht.readTemperature());
    Nodrix.send("humidity", dht.readHumidity());
  }
}
```

Open your dashboard and `temperature` and `humidity` are already there. Drop a **value** or
**gauge** widget on them and you're watching live data; the **chart** widget plots a time window.

## Step 3 — Receive commands back

"HTTP can't do downlink" is a myth. Register a handler for the variable — the library delivers each
write, runs your code, and acks it so it isn't resent:

```cpp
NODRIX_WRITE("relay") {
  digitalWrite(RELAY_PIN, value.asBool());
}
```

With `Nodrix.begin()`, writes arrive the moment a widget moves. For a sleepy device, switch to
`Nodrix.beginHTTP()` and call `Nodrix.poll()` once per wake.

## Step 4 — Deep sleep, the ESP8266 way

A battery ESP8266 must **deep sleep** between readings, and there's one piece of hardware to get
right: **wire GPIO16 to RST**. That jumper is how the chip wakes itself from a timed sleep — without
it, `ESP.deepSleep()` puts the board to sleep and it never comes back.

```cpp
#define SLEEP_MINUTES 15

void setup() {
  Serial.begin(115200);
  dht.begin();
  Nodrix.beginHTTP(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
  Nodrix.send("temperature", dht.readTemperature());
  Nodrix.send("humidity", dht.readHumidity());
  Nodrix.flush();   // POST the batch
  Nodrix.poll();    // grab queued commands while awake
  ESP.deepSleep((uint64_t)SLEEP_MINUTES * 60ULL * 1000000ULL);  // wakes via GPIO16 -> RST
}

void loop() {}   // intentionally empty for a deep-sleep design
```

Deep sleep wipes RAM and re-runs `setup()` from the top, so the whole sketch lives in `setup()` and
`loop()` stays empty. Keep the awake window short — connect, send, poll, sleep.

## Production checklist

- **Pin a fingerprint.** Call `Nodrix.setFingerprint(fp)` before `begin()` to verify the server on
  the 8266 — the default skips verification, and a full CA store is too heavy for this chip.
- **Watch the heap.** Print `ESP.getFreeHeap()` during bring-up; TLS plus a large JSON buffer is the
  usual cause of a failed request. Keep the number of metrics per send modest.
- **Keep the token secret.** The project token is a credential; load it from config, don't commit it.

With a short wake every 15 minutes, an ESP8266 sensor reporting to a dashboard you own is a tidy,
broker-free build — and the read API behind it means you can pull the same data into Grafana or your
own app whenever you want.
