---
title: "Build an ESP32 automatic plant watering system"
description: "A self-watering plant monitor: read soil moisture with a capacitive sensor on an ESP32, run a pump automatically when it dries out, and get a Telegram alert — a complete closed-loop build, with the IoT cloud on your own Cloudflare account."
category: project
board: ESP32
difficulty: beginner
datePublished: 2026-06-03
faqs:
  - q: "How do I calibrate the dry and wet readings?"
    a: "Read the raw analog value with the sensor in open air, then with it submerged in water (or in fully saturated soil), and put those two numbers in DRY and WET. They shift with soil type and pot size, so calibrate in the setup you'll actually run."
  - q: "Can the ESP32 switch the pump directly from a GPIO pin?"
    a: "No. A GPIO can't supply pump current. Drive the pump through a relay or a MOSFET powered from a separate supply, and add a flyback diode across the motor. Wiring a pump straight to a pin will brown out or damage the board."
  - q: "What happens if Wi-Fi or the cloud is unreachable?"
    a: "The watering logic lives in nodrix, so while the board is offline no readings are sent and no pump commands arrive — it retries and resumes when the link returns. If watering must survive outages, add a local fallback that runs the pump on a low reading even without the cloud."
  - q: "How does it avoid over-watering?"
    a: "Three safeguards: the on and off thresholds are separated (on below 30%, off above 60%) so it can't rapidly toggle, the pump only runs in short capped bursts, and a scheduled automation warns you when the soil stays dry — usually an empty reservoir rather than a reason to keep pumping."
  - q: "Is the project token safe baked into the firmware?"
    a: "Treat it as a secret. It scopes only to this one project and all traffic is HTTPS, but don't commit it to a public repo — load it from NVS or a config file for anything real, and rotate it if it leaks."
related:
  - href: "/guides/esp32-https-cloud/"
    label: "Connect an ESP32 over HTTPS"
    desc: "The full Wi-Fi and TLS firmware this build links out to."
  - href: "/guides/esp32-receive-commands/"
    label: "Receive commands on an ESP32"
    desc: "The control-write downlink that drives the pump."
  - href: "/widgets"
    label: "Dashboard widgets"
    desc: "The gauge, chart, toggle, and value widgets used here."
  - href: "/docs#automations"
    label: "Automations"
    desc: "The trigger and action model behind the watering logic."
---

A soil-moisture sensor and a small pump are enough to keep a plant watered without you having to
remember. This build reads moisture on an ESP32 and sends it to the cloud; the cloud decides when
to run the pump and notifies you each time it does.

The device stays simple: it reports a number and acts on a flag. The dashboard, the watering
logic, and the alerts all live in nodrix, which runs on your own Cloudflare account, so there is
**no broker or server to operate**.

## What you'll build

- A live **soil-moisture gauge** and a **24-hour chart**.
- **Automatic watering**: the pump runs when the soil is dry and stops when it recovers.
- A **pump toggle** for watering on demand.
- A **Telegram alert** each time the plant is watered.

## What you'll need

- An ESP32 dev board.
- A capacitive soil-moisture sensor (avoid resistive ones; they corrode).
- A 5V pump with a relay or MOSFET, tubing, and a small water reservoir.
- The Arduino IDE with the ESP32 board package and the ArduinoJson library.
- A nodrix instance with a project and a project token.

## Wiring

The sensor's analog output goes to **GPIO34** (an input-only ADC pin that doesn't clash with
Wi-Fi). The pump draws far more current than a GPIO can supply, so the ESP32 only switches a
relay or MOSFET on **GPIO26**, and the pump runs from its **own 5V supply** — never off a board
pin.

| From | To | Wire |
|------|----|------|
| Soil sensor <span class="pin">AOUT</span> | ESP32 <span class="pin">GPIO34</span> | Signal |
| Soil sensor <span class="pin">VCC</span> | ESP32 <span class="pin">3V3</span> | Power |
| Soil sensor <span class="pin">GND</span> | ESP32 <span class="pin">GND</span> | Ground |
| ESP32 <span class="pin">GPIO26</span> | Relay <span class="pin">IN</span> | Signal |
| Relay <span class="pin">VCC</span> | ESP32 <span class="pin">5V (VIN)</span> | Power |
| Relay <span class="pin">GND</span> | ESP32 <span class="pin">GND</span> | Ground |
| 5V supply <span class="pin">+</span> | Relay <span class="pin">COM</span> | Power (pump) |
| Relay <span class="pin">NO</span> | Pump <span class="pin">+</span> | Power (switched) |
| Pump <span class="pin">−</span> | 5V supply <span class="pin">−</span> | Ground |

Add a flyback diode across the pump's terminals (cathode to **+**) to absorb the motor's
switch-off spike. The sensor and relay share the ESP32's ground; the pump's separate supply
only feeds the relay's load side.

## How the loop works

1. The ESP32 reads moisture and sends `soil_moisture` to nodrix every few minutes.
2. When it drops **below 30%**, an automation sets `pump` to `on` and sends a Telegram message.
3. The ESP32 sees `pump = on` and runs the pump in a **short, capped burst**.
4. When moisture climbs back **above 60%**, a second automation sets `pump` to `off`.

The watering logic lives in the cloud, not the firmware. The device only reports a number and
reacts to a flag.

## The firmware

The complete sketch is below. Every five minutes it averages a few sensor samples (raw soil
readings are noisy), sends the reading, then applies any queued pump command — running a short
burst, emitting a `watered` event, and acknowledging the command so it isn't delivered again.
Calibrate `DRY` and `WET` once for your sensor (read it in air, then submerged).

```cpp
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "https://nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

const int SENSOR_PIN = 34;
const int PUMP_PIN   = 26;
const int DRY = 3200;   // raw reading in dry air
const int WET = 1300;   // raw reading submerged

int readMoisture() {
  long sum = 0;
  for (int i = 0; i < 8; i++) { sum += analogRead(SENSOR_PIN); delay(20); }
  return constrain(map(sum / 8, DRY, WET, 0, 100), 0, 100);  // averaged, 0-100%
}

void post(const char* path, const String& body) {
  WiFiClientSecure client;
  client.setInsecure();                       // dev only; pin a CA in production
  HTTPClient http;
  http.begin(client, String(HOST) + path);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + TOKEN);
  http.POST(body);
  http.end();
}

// Apply queued control writes: run the pump on a pump=on command, then ack every
// write so the cloud doesn't deliver it again.
void applyControl() {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, String(HOST) + "/v1/control");
  http.addHeader("Authorization", String("Bearer ") + TOKEN);
  if (http.GET() != 200) { http.end(); return; }

  JsonDocument doc;
  deserializeJson(doc, http.getString());     // { "control": [ { id, variable, value } ] }
  http.end();

  String ids;
  bool runPump = false;
  for (JsonObject w : doc["control"].as<JsonArray>()) {
    const char* id = w["id"].as<const char*>();
    ids += ids.length() ? "," : "";
    ids += "\""; ids += id; ids += "\"";
    if (w["variable"] == "pump" && w["value"] == "on") runPump = true;
  }

  if (runPump) {
    digitalWrite(PUMP_PIN, HIGH);
    delay(5000);                              // short, capped burst
    digitalWrite(PUMP_PIN, LOW);
    post("/v1/events", "{\"event\":\"watered\"}");
  }
  if (ids.length()) post("/v1/control/ack", "{\"ids\":[" + ids + "]}");
}

void setup() {
  pinMode(PUMP_PIN, OUTPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(250);
}

void loop() {
  post("/v1/telemetry", "{\"metrics\":{\"soil_moisture\":" + String(readMoisture()) + "}}");
  applyControl();
  delay(5UL * 60 * 1000);                      // every 5 minutes
}
```

It uses `setInsecure()` to skip certificate checks for a quick first run. For production TLS
(pinning a CA) and a battery build with deep-sleep, see
[Connect an ESP32 over HTTPS](/guides/esp32-https-cloud/) and
[Receive commands on an ESP32](/guides/esp32-receive-commands/).

> **Why poll instead of a WebSocket?**
>
> Checking once per loop is plenty for soil moisture, and it lets the board sleep between reads —
> there's no always-on connection to keep alive. nodrix also exposes a control WebSocket
> (`/v1/control/ws`) for instant, pushed commands; reach for it when the board stays powered and
> you need sub-second response (a relay you flip by hand, say). For a slow, low-power sensor,
> polling is the simpler, cheaper fit.

## Build the dashboard

Add four widgets in the dashboard editor, each bound to a variable:

| Widget | Bind to | Shows |
|---|---|---|
| Gauge | `soil_moisture` | current moisture, 0–100% |
| Chart | `soil_moisture` | the 24-hour watering rhythm |
| Toggle | `pump` | manual water-now switch |
| Value | `pump` | current pump state |

The gauge and chart update live over a WebSocket. The toggle writes the same `pump` flag the
automations use, so manual and automatic watering share one path.

## Add the automations

Create three automations in the Automations editor.

**Water when dry** — trigger: `soil_moisture` below 30. Actions: set `pump` to `on`, and send a
Telegram message such as "Soil at {{value}}% — watering now."

**Stop when recovered** — trigger: `soil_moisture` above 60. Action: set `pump` to `off`.

**Check the reservoir** — trigger: a schedule every 30 minutes, with the condition that
`soil_moisture` is still below 30. Action: send a Telegram warning. If the soil stays dry despite
watering, the reservoir is usually empty or the tubing has slipped.

nodrix evaluates the triggers at the edge and runs the pump commands and messages itself. To use
Slack, Discord, or SMS instead, swap the action.

## Going further

- **Run it on a battery.** Deep-sleep between readings instead of looping, and a single cell
  lasts months — see [ESP32 battery life](/guides/esp32-deep-sleep-battery/).
- **React to the `watered` event.** Each watering emits a custom event, so you can hang more
  automations off it — keep a log, or post a daily "watered N times" summary.
- **Watch the cycles.** The chart on `soil_moisture` settles into a regular sawtooth once tuned;
  a flattening curve is an early warning that something is off.

## Notes

- **No broker or server to run.** The device uses plain HTTPS and nodrix runs on your Cloudflare
  account.
- **Configurable without reflashing.** Thresholds, messages, and channels are all set in the
  dashboard.
- **Single-tenant data.** Every reading stays in your own account.
- **Scales by repeating.** To add plants, send `soil_moisture_2` and so on. Each becomes its own
  variable; add a gauge and duplicate the automation per plant.
