---
title: "Build a self-watering plant monitor with an ESP32"
description: "Read soil moisture, run a pump automatically when it gets dry, and get a Telegram alert each time — a complete closed-loop ESP32 build, with the IoT cloud running in your own Cloudflare account."
category: project
board: ESP32
difficulty: beginner
readingTime: "8 min read"
datePublished: 2026-06-03
faqs:
  - q: "Do I need to run a server or an MQTT broker?"
    a: "No. The ESP32 talks to your nodrix instance over plain HTTPS, and nodrix runs entirely on your own Cloudflare account. There is no broker, VM, or backend to maintain."
  - q: "How does it decide when to water?"
    a: "Two automations with a low and high threshold. One turns the pump on when moisture drops below 30%, the other turns it off once it climbs back above 60%. The gap between the two stops it from over-watering, and you choose the numbers."
  - q: "Won't it flood the plant if the sensor lags?"
    a: "The pump runs in short bursts, the high-threshold automation shuts it off, and the firmware caps how long the pump can run at once. Soil moisture changes slowly, so a short pulse followed by a re-check is the safe pattern."
  - q: "Can I water on demand?"
    a: "Yes. A toggle widget on the dashboard writes the pump variable directly, so you can run the pump from your phone at any time."
  - q: "Can I monitor more than one plant?"
    a: "Yes. Send soil_moisture_2, soil_moisture_3, and so on. Each becomes its own variable automatically; add a gauge per plant and duplicate the automation."
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
- A nodrix instance with a project and a project token.

## How the loop works

1. The ESP32 reads moisture and sends `soil_moisture` to nodrix every few minutes.
2. When it drops **below 30%**, an automation sets `pump` to `on` and sends a Telegram message.
3. The ESP32 sees `pump = on` and runs the pump in a **short, capped burst**.
4. When moisture climbs back **above 60%**, a second automation sets `pump` to `off`.

The watering logic lives in the cloud, not the firmware. The device only reports a number and
reacts to a flag.

## The firmware

The complete sketch is below. It connects to Wi-Fi, then every five minutes reads the sensor,
sends the reading, and runs the pump if the cloud has queued an `on` command. Calibrate `DRY` and
`WET` once for your sensor (read it in air, then submerged).

```cpp
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "https://nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

const int SENSOR_PIN = 34;
const int PUMP_PIN   = 26;
const int DRY = 3200;   // raw reading in dry air
const int WET = 1300;   // raw reading submerged

int readMoisture() {
  int raw = analogRead(SENSOR_PIN);
  return constrain(map(raw, DRY, WET, 0, 100), 0, 100);
}

void setup() {
  pinMode(PUMP_PIN, OUTPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(250);
}

void loop() {
  WiFiClientSecure client;
  client.setInsecure();                       // dev only; pin a CA in production

  // Send the reading. soil_moisture is created as a variable on first sight.
  HTTPClient up;
  up.begin(client, String(HOST) + "/v1/telemetry");
  up.addHeader("Content-Type", "application/json");
  up.addHeader("Authorization", String("Bearer ") + TOKEN);
  up.POST("{\"metrics\":{\"soil_moisture\":" + String(readMoisture()) + "}}");
  up.end();

  // Apply any pump command the cloud has queued.
  HTTPClient down;
  down.begin(client, String(HOST) + "/v1/control");
  down.addHeader("Authorization", String("Bearer ") + TOKEN);
  if (down.GET() == 200) {
    String pending = down.getString();
    if (pending.indexOf("\"pump\"") >= 0 && pending.indexOf("\"on\"") >= 0) {
      digitalWrite(PUMP_PIN, HIGH);
      delay(5000);                            // short, capped burst
      digitalWrite(PUMP_PIN, LOW);
    }
  }
  down.end();

  delay(5UL * 60 * 1000);                      // check every 5 minutes
}
```

This keeps things short with `setInsecure()` and a simple substring check. For production TLS,
proper JSON parsing, acking control writes, and battery deep-sleep, see
[Connect an ESP32 over HTTPS](/guides/esp32-https-cloud/) and
[Receive commands on an ESP32](/guides/esp32-receive-commands/).

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

Create two automations in the Automations editor.

**Water when dry** — trigger: `soil_moisture` below 30. Actions: set `pump` to `on`, and send a
Telegram message such as "Soil at {{value}}% — watering now."

**Stop when recovered** — trigger: `soil_moisture` above 60. Action: set `pump` to `off`.

nodrix evaluates the triggers at the edge and runs both the pump command and the message itself.
To use Slack, Discord, or SMS instead, swap the action.

## Notes

- **No broker or server to run.** The device uses plain HTTPS and nodrix runs on your Cloudflare
  account.
- **Configurable without reflashing.** Thresholds, messages, and channels are all set in the
  dashboard.
- **Single-tenant data.** Every reading stays in your own account.
- **Scales by repeating.** To add plants, send `soil_moisture_2` and so on. Each becomes its own
  variable; add a gauge and duplicate the automation per plant.
