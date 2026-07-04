---
title: "Connect an ESP32 to the cloud over HTTPS — a complete guide (no MQTT broker)"
description: "Push ESP32 sensor data to the cloud and receive commands back with the nodrix Arduino library — plain HTTPS underneath, no MQTT broker. Telemetry, control writes, and months of battery life with deep sleep."
category: hardware
board: ESP32
difficulty: intermediate
datePublished: 2026-06-08
dateUpdated: 2026-07-04
faqs:
  - q: "Can an ESP32 really talk to the cloud without MQTT?"
    a: "Yes. Underneath it's an HTTPS POST to one endpoint to send a reading and a GET to fetch queued commands — the library just wraps that. No broker is required for periodic telemetry."
  - q: "How do I get data back to the ESP32 over HTTP?"
    a: "Register a handler for the variable with NODRIX_WRITE. The library polls a control endpoint (or holds a WebSocket open while awake), applies each write, and acks it for you."
  - q: "Is HTTPS too heavy for a microcontroller?"
    a: "The first TLS handshake costs 1 to 3 seconds. After that it is quick, and for periodic telemetry the cost is irrelevant. Pinning a root CA keeps it both secure and maintainable."
  - q: "Will HTTPS telemetry drain my battery?"
    a: "Not with deep sleep. Wake, send, poll, sleep. Cache the Wi-Fi BSSID and channel in RTC memory, hand the live connection to the library, and a single 18650 cell can last months."
  - q: "Does this lock me into one provider?"
    a: "No. The pattern is plain HTTPS plus JSON. Here it targets a nodrix instance running in your own Cloudflare account, but any HTTPS API works the same way."
related:
  - href: "/guides/esp32-receive-commands"
    label: "Receive commands on an ESP32"
    desc: "The downlink in depth: control writes, acking, and the WebSocket path."
  - href: "/guides/esp32-deep-sleep-battery"
    label: "ESP32 battery life with deep sleep"
    desc: "Power budgeting and the patterns that stretch a cell to months."
  - href: "/docs"
    label: "Device protocol"
    desc: "The exact telemetry, control, and event endpoints, end to end."
  - href: "/widgets"
    label: "Dashboard widgets"
    desc: "Bind your new variables to value, gauge, chart, and map widgets."
---

**Short version:** an ESP32 can push sensor readings to the cloud with nothing more than a Wi-Fi
connection — no MQTT broker, no message queue to babysit. The
[nodrix Arduino library](https://github.com/decoded-cipher/nodrix-sdk) wraps the whole thing:
readings go up with `Nodrix.send()`, commands come down into a `NODRIX_WRITE` handler, and it's
plain HTTPS underneath. This guide builds the full loop and a battery build that runs for months.
It targets a nodrix instance on your own Cloudflare account, but the underlying technique works
against any HTTPS API.

Here is the entire uplink:

```cpp
#include <Nodrix.h>

Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
Nodrix.send("temperature", 23.4);
Nodrix.send("humidity", 61);
// The variables show up on your dashboard instantly.
```

That is the part most tutorials stop at. The interesting half — getting a command *back* to the
board to flip a relay or change a setpoint — is further down, and it's just as short.

## Should you even use HTTPS? (an honest take)

MQTT is the default answer for IoT, and for good reason: on a persistent connection it is lighter
per message and naturally bidirectional. But it also means running (or renting) a broker, keeping a
socket alive, and handling reconnects. For a huge class of projects that is overkill.

Use **HTTPS** when:

- Readings are periodic — every few seconds to every few hours, not 50 times a second.
- You want zero infrastructure to operate: no broker process, no queue.
- The device lives behind awkward networks — corporate Wi-Fi, captive portals, cellular. Port 443
  is allowed essentially everywhere; MQTT's 1883/8883 often is not.
- You sleep the device between readings (battery sensors) — there is no persistent session to
  maintain anyway.

Stick with **MQTT** when you need sub-second, high-frequency, or many-messages-per-second streams,
true server-push with minimal latency, or you are fanning out to thousands of devices where the
per-message savings dominate.

For a temperature logger, a soil sensor, an energy monitor, or a parking-spot counter, HTTPS is not
a compromise — it is the simpler correct choice.

## What you'll need

- An **ESP32** dev board. This works on the classic ESP32, ESP32-S3, and ESP32-C3 (and on the
  ESP8266, which the library also supports).
- A sensor. The examples use a BME280 (temperature, humidity, pressure) over I2C, but any reading
  works.
- The **Arduino IDE** (or PlatformIO) with the ESP32 board package and these libraries from the
  Library Manager: **Nodrix**, **ArduinoJson**, and — for the BME280 — **Adafruit BME280** plus
  **Adafruit Unified Sensor**.
- A cloud endpoint. We use a nodrix instance: deploy once to your Cloudflare account, create a
  project, and mint a **project token** — that token is the device's key.

## The mental model: two variables, two directions

Forget topics and payload formats for a second. nodrix models a device as a bag of **variables**:

- **Telemetry (up):** `Nodrix.send("temperature", 23.4)`. `temperature` becomes a variable, created
  automatically the first time it is seen. No schema to declare.
- **Control (down):** a dashboard toggle, or one of your automations, queues a **control write** —
  "set `relay` to `on`". Your `NODRIX_WRITE("relay")` handler runs; the library acks it.

One token, both directions. That is the whole protocol surface you need.

## Step 1 — Connect and secure the link

`Nodrix.begin()` brings up Wi-Fi and opens the connection. TLS is the one decision to make up front:

1. **Default (insecure)** — traffic is *encrypted*, but you are not verifying *who* you are talking
   to. Fine for a first run on your own network; **never ship it.**
2. **Pin a root CA** — `Nodrix.setCACert(rootCA)` before `begin()`. Secure and maintainable; you
   update it only when the CA rotates.

Pull the root CA like this and paste the last certificate into a `PROGMEM` string:

```bash
openssl s_client -showcerts -connect nodrix.you.workers.dev:443 </dev/null
# copy the LAST certificate in the chain (the root CA)
```

```cpp
#include <Nodrix.h>
#include <Adafruit_BME280.h>

const char* HOST  = "nodrix.you.workers.dev";   // bare host, no https://
const char* TOKEN = "tok_your_project_token";

Adafruit_BME280 bme;

void setup() {
  Serial.begin(115200);
  bme.begin(0x76);                               // 0x76 or 0x77, per your board
  Nodrix.setCACert(ROOT_CA);                     // omit for the insecure default
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}
```

## Step 2 — Send readings

`Nodrix.send()` stages a metric; they coalesce into one request on the next `run()`. Send as many
as you like — each key becomes its own variable:

```cpp
void loop() {
  Nodrix.run();

  static uint32_t last = 0;
  if (millis() - last > 10000) {
    last = millis();
    Nodrix.send("temperature", bme.readTemperature());
    Nodrix.send("humidity", bme.readHumidity());
  }
}
```

Open your dashboard and the `temperature` and `humidity` variables are already there. Drop a
**value** or **gauge** widget on them and you are watching live data. Want a trend line? The
**chart** widget plots a time window; the **map** widget takes lat/lng if you are tracking something
that moves.

## Step 3 — Receive commands back (the half everyone skips)

This is where "HTTP can't do downlink" turns out to be a myth. Register a handler for the variable;
the library delivers each write, applies it through your code, and acks it so it isn't resent:

```cpp
NODRIX_WRITE("relay") {
  digitalWrite(RELAY_PIN, value.asBool());
}
```

With `Nodrix.begin()` (the always-on WebSocket), writes arrive the instant a widget moves. For a
sleepy device use `Nodrix.beginHTTP()` and call `Nodrix.poll()` once per wake to drain the queue.
Either way the handler is the same — the library handles at-least-once delivery, acking, and
reconnects underneath.

## Step 4 — Make it sip power: deep sleep done right

A mains-powered board can just report on a timer. A battery board must **deep sleep** — and deep
sleep changes how you write the whole sketch, because the ESP32 wipes RAM on wake and re-runs
`setup()` from the top. `loop()` effectively never runs. Anything that must survive a nap goes in
**RTC memory** with `RTC_DATA_ATTR`.

The single biggest power drain is Wi-Fi association. Cache the BSSID and channel on the first
connect and reuse them — this skips the channel scan and cuts reconnect from 3 to 4 seconds down to
under a second. Bring Wi-Fi up yourself, then hand the live connection to the library: `beginHTTP`
sees you're already connected and skips its own connect.

```cpp
#include <esp_sleep.h>   // deep-sleep API

RTC_DATA_ATTR bool    rtcValid = false;
RTC_DATA_ATTR uint8_t rtcBssid[6];
RTC_DATA_ATTR int32_t rtcChannel;

#define SLEEP_MINUTES 15

void fastConnect() {
  WiFi.mode(WIFI_STA);
  if (rtcValid)
    WiFi.begin(WIFI_SSID, WIFI_PASS, rtcChannel, rtcBssid, true); // cached path
  else
    WiFi.begin(WIFI_SSID, WIFI_PASS);                              // first boot

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 8000) delay(50);

  if (WiFi.status() == WL_CONNECTED) {
    memcpy(rtcBssid, WiFi.BSSID(), 6);
    rtcChannel = WiFi.channel();
    rtcValid = true;
  } else {
    rtcValid = false;   // force a full scan next time
  }
}

void setup() {
  Serial.begin(115200);
  bme.begin(0x76);
  fastConnect();
  if (WiFi.status() == WL_CONNECTED) {
    Nodrix.beginHTTP(HOST, TOKEN);              // reuses the live connection
    Nodrix.send("temperature", bme.readTemperature());
    Nodrix.send("humidity", bme.readHumidity());
    Nodrix.flush();                             // POST the batch
    Nodrix.poll();                              // grab any queued commands while we're up
  }
  esp_sleep_enable_timer_wakeup((uint64_t)SLEEP_MINUTES * 60ULL * 1000000ULL);
  esp_deep_sleep_start();   // execution ends here; wakes back into setup()
}

void loop() {}   // intentionally empty for a deep-sleep design
```

With a roughly 3-second wake every 15 minutes, a single 18650 cell can carry a sensor for months. A
few extra wins: prefer a board without a power-hungry USB-serial chip on battery, give the sensor
its warm-up time before reading, and avoid GPIO 12 on the classic ESP32 (it is a strapping pin that
can stop the board booting). Safe wake and IO pins on the base chip include 4, 13, 14, 25, 26, 27.

## Production checklist

- **Verify the certificate.** Set a pinned root CA with `Nodrix.setCACert()` before you deploy
  anything that matters — the default skips verification.
- **Retry on a flaky network.** The library reconnects and re-flushes staged telemetry on its own;
  for deep-sleep devices, just report again on the next wake.
- **Keep the token secret.** The project token is a credential. Do not commit it; load it from
  config or NVS, and rotate it if it leaks.
- **Bound your own waits.** The one blocking spot you own is Wi-Fi association in a battery build —
  cap it (as above) so a bad night does not drain the cell.

## Troubleshooting

- **Connection fails on first bring-up:** usually TLS. Drop `setCACert()` to fall back to the
  insecure default and confirm the rest works, then re-pin; check the host is the bare name with no
  `https://` and no trailing slash.
- **Handshake fails after it worked:** the server's CA rotated and your pinned root is stale —
  re-pull it with the `openssl` command above.
- **Resets or `Brownout detected`:** Wi-Fi transmit current spikes; power the board from a supply
  that can deliver about 500 mA, not a marginal USB port.
- **Reading is `nan`:** the sensor was not given warm-up time after power-up, or the I2C wiring is
  off.
