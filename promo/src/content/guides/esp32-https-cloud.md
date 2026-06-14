---
title: "Connect an ESP32 to the cloud over HTTPS — a complete guide (no MQTT broker)"
description: "Push ESP32 sensor data to the cloud over HTTPS and receive commands back — no MQTT broker. Full Arduino code for telemetry, control writes, and months of battery life with deep sleep."
category: hardware
board: ESP32
difficulty: intermediate
datePublished: 2026-06-08
faqs:
  - q: "Can an ESP32 really talk to the cloud without MQTT?"
    a: "Yes. An HTTPS POST to a single endpoint sends a reading, and a GET fetches queued commands. No broker is required for periodic telemetry."
  - q: "How do I get data back to the ESP32 over HTTP?"
    a: "Poll a control endpoint on an interval and acknowledge what you apply, or hold a control WebSocket open for instant writes while the board is awake."
  - q: "Is HTTPS too heavy for a microcontroller?"
    a: "The first TLS handshake costs 1 to 3 seconds. After that it is quick, and for periodic telemetry the cost is irrelevant. Using the bundled CA store keeps it maintainable."
  - q: "Will HTTPS telemetry drain my battery?"
    a: "Not with deep sleep. Wake, send, poll, sleep. Cache the Wi-Fi BSSID and channel in RTC memory and a single 18650 cell can last months."
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

**Short version:** an ESP32 can push sensor readings to the cloud with nothing more than a
Wi-Fi connection and an HTTPS POST — no MQTT broker, no SDK, no message queue to babysit. You
send JSON to one endpoint, and you poll a second endpoint to receive commands back. This guide
builds the whole loop: readings up, commands down, and a battery build that runs for months.
Every example targets a real backend (nodrix, which deploys to your own Cloudflare account),
but the technique works against any HTTPS API.

Here is the entire uplink, minus the boilerplate:

```cpp
WiFiClientSecure client;
client.setInsecure();              // dev only — we fix this properly below

HTTPClient https;
https.begin(client, "https://nodrix.you.workers.dev/v1/telemetry");
https.addHeader("Content-Type", "application/json");
https.addHeader("Authorization", "Bearer tok_your_project_token");
int code = https.POST("{\"metrics\":{\"temperature\":23.4,\"humidity\":61}}");
// → 204 No Content. The variable shows up on your dashboard instantly.
https.end();
```

That is the part most tutorials stop at. The interesting half — getting a command *back* to
the board to flip a relay or change a setpoint — is further down.

## Should you even use HTTPS? (an honest take)

MQTT is the default answer for IoT, and for good reason: on a persistent connection it is
lighter per message and naturally bidirectional. But it also means running (or renting) a
broker, keeping a socket alive, and handling reconnects. For a huge class of projects that is
overkill.

Use **HTTPS** when:

- Readings are periodic — every few seconds to every few hours, not 50 times a second.
- You want zero infrastructure to operate: no broker process, no queue.
- The device lives behind awkward networks — corporate Wi-Fi, captive portals, cellular. Port
  443 is allowed essentially everywhere; MQTT's 1883/8883 often is not.
- You sleep the device between readings (battery sensors) — there is no persistent session to
  maintain anyway.

Stick with **MQTT** when you need sub-second, high-frequency, or many-messages-per-second
streams, true server-push with minimal latency, or you are fanning out to thousands of devices
where the per-message savings dominate.

For a temperature logger, a soil sensor, an energy monitor, or a parking-spot counter, HTTPS is
not a compromise — it is the simpler correct choice.

## What you'll need

- An **ESP32** dev board. This works on the classic ESP32, ESP32-S3, and ESP32-C3 (and on the
  ESP8266 with the noted library swap).
- A sensor. The examples use a BME280 (temperature, humidity, pressure) over I2C, but any
  reading works.
- The **Arduino IDE** (or PlatformIO) with the ESP32 board package and the **ArduinoJson** and
  **HTTPClient** libraries.
- A cloud endpoint to POST to. We use a nodrix instance: deploy once to your Cloudflare
  account, create a project, and mint a **project token** — that token is the device's key.

## The mental model: two variables, two directions

Forget topics and payload formats for a second. nodrix (like most simple HTTP backends) models
a device as a bag of **variables**:

- **Telemetry (up):** you POST `{"metrics": {"temperature": 23.4}}`. `temperature` becomes a
  variable, created automatically the first time it is seen. No schema to declare.
- **Control (down):** a dashboard toggle, or one of your automations, queues a **control
  write** — "set `relay` to `on`". Your device fetches pending writes, applies them, and acks.

Two endpoints, one token. That is the whole protocol surface you need.

## Step 1 — Connect Wi-Fi and a secure client

```cpp
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(250); Serial.print('.'); }
  Serial.printf("\nWi-Fi up: %s\n", WiFi.localIP().toString().c_str());
}
```

`WiFiClientSecure` gives you TLS. You have three ways to handle the certificate:

1. **`client.setInsecure()`** — skips certificate verification. The traffic is still
   *encrypted*, but you are not checking *who* you are talking to. Fine for a first run on your
   own network; **never ship it.**
2. **Pin a root CA** — paste the server's root certificate into the sketch with
   `client.setCACert(rootCA)`. Most secure, but you must update it when the CA rotates.
3. **Use the bundled Mozilla CA store** — `client.setCACertBundle(...)` trusts the same
   authorities your browser does. This is the best default for a Cloudflare-fronted endpoint:
   it just works and survives certificate rotation.

If you want to pin a root CA (option 2), pull it like this:

```bash
openssl s_client -showcerts -connect nodrix.you.workers.dev:443 </dev/null
# copy the LAST certificate in the chain (the root CA) into a PROGMEM string
```

We will start with `setInsecure()` to get a green light fast, then switch to the CA bundle in
the production checklist.

## Step 2 — POST your first reading

Build the JSON with ArduinoJson rather than string concatenation — it escapes values and scales
to more metrics cleanly.

```cpp
#include <ArduinoJson.h>

const char* HOST  = "https://nodrix.you.workers.dev";
const char* TOKEN = "tok_your_project_token";

bool sendTelemetry(float tempC, float humidity) {
  WiFiClientSecure client;
  client.setInsecure();                       // dev only

  HTTPClient https;
  if (!https.begin(client, String(HOST) + "/v1/telemetry")) return false;
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

Send a batch by adding more keys to `metrics`. Add `doc["ts"] = epochSeconds;` if you want to
timestamp the reading yourself (handy when buffering offline) — otherwise the server stamps the
arrival time.

Open your dashboard and the `temperature` and `humidity` variables are already there. Drop a
**value** or **gauge** widget on them and you are watching live data. Want a trend line? The
**chart** widget plots a time window; the **map** widget takes lat/lng if you are tracking
something that moves.

## Step 3 — Receive commands back (the half everyone skips)

This is where "HTTP can't do downlink" turns out to be a myth. The device just *asks* for
pending commands on a short interval and acknowledges what it applied.

```cpp
void pollControl() {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  https.begin(client, String(HOST) + "/v1/control");
  https.addHeader("Authorization", String("Bearer ") + TOKEN);

  if (https.GET() == 200) {
    JsonDocument doc;
    deserializeJson(doc, https.getString());
    // { "control": [ { "id": "ctl_x", "variable": "relay", "value": "on" } ] }

    JsonArray writes = doc["control"].as<JsonArray>();
    String acked = "{\"ids\":[";
    bool first = true;
    for (JsonObject w : writes) {
      const char* var = w["variable"];
      const char* val = w["value"];
      if (strcmp(var, "relay") == 0)
        digitalWrite(RELAY_PIN, strcmp(val, "on") == 0 ? HIGH : LOW);
      if (!first) acked += ',';
      acked += '"'; acked += (const char*)w["id"]; acked += '"';
      first = false;
    }
    acked += "]}";
    https.end();

    // Ack so the platform stops resending these writes.
    HTTPClient ack;
    ack.begin(client, String(HOST) + "/v1/control/ack");
    ack.addHeader("Content-Type", "application/json");
    ack.addHeader("Authorization", String("Bearer ") + TOKEN);
    ack.POST(acked);   // → { "acked": 1 }
    ack.end();
  } else {
    https.end();
  }
}
```

Poll every few seconds for near-real-time control, or once per wake cycle for a sleepy device.
If you need *instant* control and the board stays awake, open the control WebSocket instead and
receive writes the moment a widget moves:

```text
WSS /v1/control/ws?token=tok_your_project_token
// incoming: { "type": "control", "id": "ctl_x", "variable": "relay", "value": "on" }
// reply:    { "type": "ack", "ids": ["ctl_x"] }
```

Use polling for battery and periodic devices, the socket for always-on controllers.

## Step 4 — Make it sip power: deep sleep done right

A mains-powered board can just `delay()` between readings. A battery board must **deep sleep** —
and deep sleep changes how you write the whole sketch, because the ESP32 wipes RAM on wake and
re-runs `setup()` from the top. `loop()` effectively never runs. Anything that must survive a nap
goes in **RTC memory** with `RTC_DATA_ATTR`.

The single biggest power drain is Wi-Fi association. Cache the BSSID and channel on the first
connect and reuse them — this skips the channel scan and cuts reconnect from 3 to 4 seconds down
to under a second, which on a battery is enormous.

```cpp
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
  fastConnect();
  if (WiFi.status() == WL_CONNECTED) {
    float t = readTemp(), h = readHumidity();   // your sensor
    sendTelemetry(t, h);
    pollControl();                              // grab any queued commands while we're up
  }
  esp_sleep_enable_timer_wakeup((uint64_t)SLEEP_MINUTES * 60ULL * 1000000ULL);
  esp_deep_sleep_start();   // execution ends here; wakes back into setup()
}

void loop() {}   // intentionally empty for a deep-sleep design
```

With a roughly 3-second wake every 15 minutes, a single 18650 cell can carry a sensor for
months. A few extra wins: prefer a board without a power-hungry USB-serial chip on battery, give
the sensor its warm-up time before reading, and avoid GPIO 12 on the classic ESP32 (it is a
strapping pin that can stop the board booting). Safe wake and IO pins on the base chip include 4,
13, 14, 25, 26, and 27.

## Production checklist

- **Verify the certificate.** Swap `setInsecure()` for the CA bundle (`setCACertBundle`) or a
  pinned root CA before you deploy anything that matters.
- **Retry with backoff.** A POST can fail on a flaky network. Retry a couple of times with a
  growing delay; for sleepy devices, buffer the reading with a `ts` and send it next wake.
- **Set the clock.** If you stamp your own `ts`, sync time over NTP after Wi-Fi connects.
- **Bound every wait.** Never block forever on `WiFi.status()` or a socket — always cap the
  wait (as above) so a bad night does not drain the battery.
- **Keep the token secret.** The project token is a credential. Do not commit it; load it from
  config or NVS, and rotate it if it leaks.
- **Reuse the TLS connection** when awake and chatty — Keep-Alive avoids paying the 1 to 3
  second handshake on every request.

## Troubleshooting

- **`POST` returns -1 or connection refused:** usually TLS. On first bring-up use
  `setInsecure()` to isolate whether it is the certificate; check the host has no trailing-slash
  mismatch and that you used `https://`.
- **Handshake fails after it worked:** the server's CA rotated and you pinned a single root —
  switch to the CA bundle.
- **Resets or `Brownout detected`:** Wi-Fi transmit current spikes; power the board from a
  supply that can deliver about 500 mA, not a marginal USB port.
- **Reading is `nan`:** the sensor was not given warm-up time after power-up, or the I2C wiring
  is off.
