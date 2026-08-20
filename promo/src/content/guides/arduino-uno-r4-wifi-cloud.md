---
title: "Arduino UNO R4 WiFi to the cloud — a live dashboard with no broker"
description: "Push Arduino UNO R4 WiFi sensor data to a cloud dashboard over HTTPS with WiFiSSLClient — no MQTT broker, no SDK. How the board's dual-processor design makes TLS possible on 32 KB of RAM, and the firmware gotcha that breaks SSL."
category: hardware
board: Arduino UNO R4 WiFi
difficulty: beginner
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "How does a board with 32 KB of RAM manage HTTPS?"
    a: "It doesn't, strictly — the other processor does. The UNO R4 WiFi carries a Renesas RA4M1 running your sketch and an ESP32-S3 handling all connectivity, and the TLS session lives on the ESP32-S3 side. That division is what makes the numbers work: a TLS record buffer alone would consume most of the RA4M1's 32 KB, but your sketch never has to hold one."
  - q: "Do I need to manage certificates?"
    a: "No, and that's a genuine convenience. Because TLS terminates on the ESP32-S3, the trust store lives in that module's firmware rather than in your sketch — there's no `setCACert` call and no PEM blob to paste in. The trade is that your TLS behaviour is determined by a firmware version you update separately from your code."
  - q: "My HTTPS connection suddenly stopped working. What changed?"
    a: "Check the Wi-Fi module's firmware version before you debug your sketch. Because the network stack lives in the ESP32-S3, its firmware updates can change SSL behaviour independently of anything you wrote — there's a well-documented case of an update breaking SSL connections that a downgrade resolved. It's an unusual failure mode and the first thing to rule out when working code stops working."
  - q: "Is the UNO R4 WiFi better than an ESP32 for IoT?"
    a: "It's better at some things and behind at others. It wins on 5V logic, so classic Arduino shields and 5V sensors work without level shifting, and on the UNO form factor and its ecosystem. The ESP32 wins on RAM by a wide margin, on deep-sleep power, and on the depth of cloud-connected example code. For a first connected project on hardware you already own, the R4 is genuinely fine."
  - q: "Does the nodrix Arduino library work on this board?"
    a: "Not yet — it's built for ESP32 and ESP8266. It matters less than you'd expect, because the device protocol is deliberately plain HTTPS: a JSON POST with a bearer token, which is about fifteen lines against WiFiSSLClient. Renesas support is on the roadmap; until then this guide shows the direct approach."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The same build with the library doing the work."
  - href: "/guides/raspberry-pi-pico-w-iot-dashboard"
    label: "Pico W with MicroPython"
    desc: "Another non-Espressif board on the same protocol."
  - href: "/guides/esp32-notifications"
    label: "Sending alerts from a build"
    desc: "Turning a reading into a message."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The dashboard this reports to."
---

The UNO R4 WiFi is the first Arduino UNO you can put on the internet without a shield, and it arrives
with the thing that made the UNO worth using in the first place: 5V logic, the classic footprint, and
a decade of sensors and shields that just work.

This guide connects one to a cloud dashboard over plain HTTPS — telemetry up, commands back down,
no MQTT broker anywhere.

## The board is two computers

This is worth understanding before anything else, because it explains most of the board's behaviour.

The UNO R4 WiFi carries **two processors**. Your sketch runs on a **Renesas RA4M1** — an Arm
Cortex-M4 at 48 MHz with 32 KB of SRAM and 256 KB of flash. Connectivity is handled entirely by a
separate **ESP32-S3**, which does Wi-Fi and Bluetooth LE and nothing of yours.

That division is the reason this board can do HTTPS at all. A TLS session wants a substantial record
buffer, and 32 KB of SRAM is not much to give it — on a chip that also has to hold your program's
variables, it's a genuine squeeze. But the RA4M1 never holds a TLS buffer. The handshake, the
ciphers, and the record buffers all live on the ESP32-S3, and your sketch talks to it through a
socket-like API.

There's an amusing symmetry here that's easy to miss: the Wi-Fi module on your Arduino is the same
chip family this site writes about everywhere else.

## What that means in practice

Two consequences, one pleasant and one to keep in mind.

**You don't manage certificates.** The trust store lives in the ESP32-S3's firmware, so there's no
`setCACert`, no PEM blob pasted into your sketch, and no certificate expiry to handle in code. HTTPS
to a public host just works.

**Your TLS behaviour is tied to a firmware version you update separately.** Because the network stack
isn't part of your sketch, updating the Wi-Fi module's firmware can change how SSL behaves without
you changing a line — and there is a documented case of an update breaking SSL connections that a
downgrade fixed. If working code stops connecting, check the module firmware version before you
suspect your own.

## What you'll need

- An **Arduino UNO R4 WiFi**.
- Any 5V or 3.3V sensor you like — the board's 5V logic means classic Arduino parts need no level
  shifting.
- The **WiFiS3** library, which ships with the UNO R4 board package.
- **ArduinoJson**, for parsing the downlink. Sending doesn't need it; receiving does.
- A **nodrix instance** with a project and a project token.

## The firmware

There's no device library for this board yet, so the sketch speaks the protocol directly. That turns
out to be less code than it sounds, because the protocol is a JSON POST with a bearer token and a
matching GET for anything queued in the other direction — the same endpoints
[the library wraps on an ESP32](/guides/esp32-https-cloud).

```cpp
#include <WiFiS3.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

const int LED_PIN = LED_BUILTIN;

WiFiSSLClient client;

void connectWiFi() {
  while (WiFi.begin(WIFI_SSID, WIFI_PASS) != WL_CONNECTED) {
    delay(3000);
  }
  Serial.print("wifi up: ");
  Serial.println(WiFi.localIP());
}

String request(const char* method, const char* path, const String& body, int& status) {
  status = -1;
  if (!client.connect(HOST, 443)) return "";

  client.print(method); client.print(' '); client.print(path);
  client.println(" HTTP/1.1");
  client.print("Host: ");                 client.println(HOST);
  client.print("Authorization: Bearer "); client.println(TOKEN);
  client.println("Connection: close");
  if (body.length()) {
    client.println("Content-Type: application/json");
    client.print("Content-Length: ");     client.println(body.length());
  }
  client.println();
  if (body.length()) client.print(body);

  unsigned long t0 = millis();
  while (!client.available() && millis() - t0 < 5000) delay(10);

  String out;
  if (client.available()) {
    client.readStringUntil(' ');                 // "HTTP/1.1"
    status = client.readStringUntil(' ').toInt();
    client.find("\r\n\r\n");                     // skip the rest of the headers
    out = client.readString();
  }
  client.stop();
  return out;
}

void applyWrite(const char* variable, JsonVariantConst value) {
  if (strcmp(variable, "led") == 0) {
    digitalWrite(LED_PIN, value.as<bool>() ? HIGH : LOW);
  }
}

void pollControl() {
  int status;
  String body = request("GET", "/v1/control", "", status);
  if (status != 200) return;

  JsonDocument doc;
  if (deserializeJson(doc, body)) return;

  String ids;
  for (JsonObjectConst w : doc["control"].as<JsonArrayConst>()) {
    applyWrite(w["variable"].as<const char*>(), w["value"]);
    if (ids.length()) ids += ',';
    ids += '"'; ids += w["id"].as<const char*>(); ids += '"';
  }
  if (!ids.length()) return;

  request("POST", "/v1/control/ack", "{\"ids\":[" + ids + "]}", status);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();

  float temperature = analogRead(A0) * (5.0 / 1023.0) * 100.0;  // swap for a real sensor

  int status;
  request("POST", "/v1/telemetry",
          String("{\"metrics\":{\"temperature\":") + temperature + "}}", status);
  Serial.print("POST /v1/telemetry -> ");
  Serial.println(status);                        // 204 = accepted

  pollControl();
  delay(30000);
}
```

`client.stop()` on every path is the line that matters most on this board. The ESP32-S3 holds a small
number of sockets, and a sketch that leaks them stops sending after a while with no error to explain
it — the classic symptom being a build that works for an hour and then silently goes quiet.

Note the asymmetry in how JSON is handled. The telemetry body is assembled by hand with `String`
concatenation, because a few sensor values don't justify a parser on a 32 KB board. The control
response *is* parsed with ArduinoJson, because you're reading a structure someone else produced and
hand-scanning it for quotes is how you get a board that misbehaves on an unexpected value.

## Receive commands

The downlink is a poll rather than a push: no broker holding a subscription open, no socket to keep
alive. The board asks `/v1/control` whether anything is waiting, applies what it finds, and
acknowledges each write by id.

That acknowledgement is the step worth not skipping. Unacked writes are offered again on the next
poll, so a board that applies a command without acking reapplies it forever — which presents as a
relay that refuses to stay switched.

To try it, add a **toggle** widget bound to a variable named `led`. Flipping it queues a write the
sketch collects on its next pass and applies to the onboard LED, which is the fastest way to prove
both directions work before you wire anything up.

The trade is latency. This sketch polls once per `loop()`, so a command waits up to thirty seconds.
That's the usual starting point, and the
[downlink pattern in general](/guides/esp32-receive-commands) covers when it's worth tightening.

## Build the dashboard

Open your project and `temperature` is already listed — variables are created the first time they're
seen. Drop a **value** or **gauge** widget on it, or a **chart** to watch it move. Send several keys
in one POST and each becomes its own variable.

From there a **variable** trigger turns any reading into a message — the
[notifications guide](/guides/esp32-notifications) covers Telegram, Discord, Slack, and SMS from the
same automation.

## Use the LED matrix

The R4 WiFi has a 12×8 LED matrix on board, which is genuinely useful here rather than decorative:
it gives the board a way to tell you what it's doing without a serial cable attached.

With the `Arduino_LED_Matrix` library, showing connection state or the last HTTP status is a few
lines — `matrix.loadFrame()` with a pattern for connected, another for a failed POST. For a device
sitting on a shelf, glanceable status beats a serial monitor you aren't watching.

## Notes

The `analogRead` in the example uses the board's default 10-bit resolution for compatibility with
UNO-era code. The RA4M1's ADC does better — `analogReadResolution(14)` unlocks it, and it's one of
the quiet upgrades over the R3 worth knowing about.

Deep sleep on this board is not comparable to an ESP32's. If your project needs to run for months on
a battery, that's a genuine reason to choose different hardware; the R4 WiFi is at its best on mains
power or a large pack.

The board also has a real DAC and CAN bus, neither of which the R3 had. Neither is needed here, but
they're the reason this board shows up in projects an UNO couldn't previously do.

Both processors can be updated independently. Keeping the Wi-Fi module's firmware current is
generally right, but note the version you're on when things work — it's the one dependency of this
board that isn't visible in your sketch.
