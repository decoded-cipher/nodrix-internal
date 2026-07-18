---
title: "Build an ESP32 air quality monitor with a live CO2 dashboard"
description: "A complete ESP32 CO2 and air-quality build on the Sensirion SCD41: true NDIR-grade CO2, temperature and humidity over one sensor, streamed to a live dashboard with colour-banded alerts — no MQTT broker, no Home Assistant server, on your own Cloudflare account."
category: project
board: ESP32
difficulty: beginner
datePublished: 2026-07-18
dateUpdated: 2026-07-18
faqs:
  - q: "Why the SCD41 instead of an MQ-135 or MH-Z19?"
    a: "Because it measures CO2 honestly. The MQ-135 is a cheap MOX gas sensor that doesn't report CO2 in real ppm — it drifts, needs constant recalibration, and conflates gases. The MH-Z19 is a genuine NDIR CO2 sensor and a reasonable older choice, but the Sensirion SCD41 is a current photoacoustic CO2 sensor that also gives you temperature and humidity from one I2C part, with ±(40 ppm + 5%) accuracy. For a monitor you'll trust enough to act on, the SCD41 is the right sensor in 2026."
  - q: "Do I need Home Assistant or a local server for this?"
    a: "No — and that's the point. Most ranking SCD41 tutorials assume you already run Home Assistant with the ESPHome add-on, which means a local server humming 24/7 just to see a number. Here the ESP32 posts readings straight to your own cloud dashboard over HTTPS. Nothing local to run, and the dashboard opens from anywhere."
  - q: "What CO2 levels should I actually worry about?"
    a: "Outdoor air is around 420 ppm. Below 800 ppm indoors is comfortable and well-ventilated; 800-1200 ppm is where drowsiness and reduced concentration start; above 1200 ppm the room needs air, and sustained levels over 1500-2000 ppm are worth fixing. The guide bands the dashboard on those thresholds so a glance tells you whether to open a window."
  - q: "Why does the SCD41 need a couple of minutes to read correctly?"
    a: "It self-calibrates and the photoacoustic measurement settles after power-up — early readings can be off until it warms in. Give it a few minutes on first boot, and leave its automatic self-calibration enabled so it re-references to fresh air over days. If you run it somewhere that never sees outdoor-level CO2, disable ASC and calibrate manually instead."
  - q: "Can one board watch several rooms?"
    a: "Not one board, but one dashboard. Put an SCD41 on an ESP32 in each room, have each report co2, temperature, and humidity under its own variable names, and add a widget per room. The automations and alerting are shared — the pattern scales by repeating the node, not by rewiring anything."
related:
  - href: "/guides/esp32-notifications"
    label: "ESP32 notifications"
    desc: "Route the high-CO2 alert to Telegram, Discord, or SMS."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The Wi-Fi and TLS firmware this build stands on."
  - href: "/guides/esp32-deep-sleep-battery"
    label: "ESP32 battery life"
    desc: "Make it a battery-powered portable monitor."
  - href: "/widgets"
    label: "Dashboard widgets"
    desc: "The gauge, chart, and value widgets used here."
---

A CO2 monitor is the rare sensor project that changes your behaviour: watch the number climb through
a closed meeting room and you will open a window before anyone gets a headache. This build measures
CO2 properly with a Sensirion SCD41, reads temperature and humidity from the same part, and streams
all three to a live dashboard with colour-banded thresholds — so a glance tells you whether the air
is fine or stale.

What it doesn't need is the thing most SCD41 tutorials quietly assume: a Home Assistant server
running the ESPHome add-on on your network. The ESP32 here posts straight to your own cloud
dashboard over plain HTTPS. Nothing local to keep alive, and the readings open from anywhere.

## Why the SCD41

Air-quality projects live or die on the sensor, and the cheap default is a trap. An MQ-135 costs
two dollars and reports something, but not CO2 in real ppm — it's a metal-oxide sensor that drifts,
needs constant recalibration, and can't separate CO2 from other gases. The older MH-Z19 is a real
NDIR CO2 sensor and a fine choice a few years ago.

The Sensirion SCD41 is the current answer: a photoacoustic CO2 sensor accurate to about ±(40 ppm +
5% of reading), that also hands you temperature and humidity over the same I2C bus — three
variables, one part, no analog guesswork. It's low-power enough for battery builds, and its
automatic self-calibration keeps it honest over time. It costs more than an MQ-135, and it's worth
every cent the first time the number tells you something true.

## What you'll need

- An **ESP32** dev board (any common DevKit variant).
- A **Sensirion SCD41** breakout (SCD40 works too — slightly lower accuracy, same code).
- Four jumper wires; the SCD41 is I2C, so it's just power and two data lines.
- The **Arduino IDE** with the ESP32 board package, the **Nodrix** library, and Sensirion's
  [**I2C SCD4x** library](https://github.com/Sensirion/arduino-i2c-scd4x), both from the Library
  Manager.
- A **nodrix instance** with a project and a project token.

## Wiring

Pure I2C — four wires, no analog pins, no level shifting (the SCD41 breakout is 3.3V-friendly):

| From | To | Wire |
|------|----|------|
| SCD41 <span class="pin">VDD</span> | ESP32 <span class="pin">3V3</span> | Power |
| SCD41 <span class="pin">GND</span> | ESP32 <span class="pin">GND</span> | Ground |
| SCD41 <span class="pin">SDA</span> | ESP32 <span class="pin">GPIO21</span> | I2C data |
| SCD41 <span class="pin">SCL</span> | ESP32 <span class="pin">GPIO22</span> | I2C clock |

GPIO21/22 are the ESP32's default I2C pins. The SCD41 draws a brief high current during each
measurement, so power it from a stable 3.3V rail rather than a long, thin lead.

## The firmware

The SCD41 measures on its own cadence — one reading every five seconds in periodic mode — so the
sketch starts it, then reports whatever it has each cycle. The
[nodrix Arduino library](https://github.com/decoded-cipher/nodrix-sdk) owns the socket and reconnects.

```cpp
#include <Nodrix.h>
#include <SensirionI2cScd4x.h>
#include <Wire.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

SensirionI2cScd4x scd4x;

void setup() {
  Wire.begin();
  scd4x.begin(Wire, 0x62);
  scd4x.stopPeriodicMeasurement();   // clean state after a reset
  scd4x.startPeriodicMeasurement();
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();

  static unsigned long lastReading = 0;
  if (millis() - lastReading >= 30000) {
    lastReading = millis();

    uint16_t co2 = 0;
    float temperature = 0, humidity = 0;
    if (scd4x.readMeasurement(co2, temperature, humidity) == 0 && co2 > 0) {
      Nodrix.send("co2", (int)co2);
      Nodrix.send("temperature", temperature);
      Nodrix.send("humidity", humidity);
    }
  }
}
```

Worth understanding rather than copying:

- **The `co2 > 0` guard matters.** The SCD41 returns 0 ppm when a measurement isn't ready yet;
  sending it would draw a false floor on the chart. Skipping keeps the history honest.
- **Give it warm-up time.** The first readings after power-up settle as the sensor references
  itself — expect a couple of minutes before the number is trustworthy, and leave automatic
  self-calibration on so it stays that way.
- **Thirty seconds is plenty.** CO2 in a room moves over minutes, not seconds. Reporting twice a
  minute catches every meaningful change and keeps the traffic trivial.
- **Pin TLS before you ship.** `Nodrix.begin()` connects encrypted but unverified on first run; add
  `Nodrix.setCACert()` for production, covered in
  [Connect an ESP32 over HTTPS](/guides/esp32-https-cloud).

## Build the dashboard

Four widgets, each bound to a variable the firmware sends:

| Widget | Bind to | Shows |
|---|---|---|
| Gauge | `co2` | live CO2 in ppm, with colour bands |
| Chart | `co2` | the day's air-quality rhythm |
| Value | `temperature` | room temperature |
| Value | `humidity` | relative humidity |

Set the CO2 gauge's bands to the levels that mean something: green below 800 ppm, amber 800–1200,
red above 1200. Now the dashboard reads at a glance — you don't interpret a number, you see a
colour. The chart is the quietly useful part: a room's CO2 has a shape, climbing while it's occupied
and closed, dropping when it's ventilated or empty. Once you know your baseline, the anomalies —
the meeting that ran long, the bedroom that never airs out — jump out.

## Add the alert

One automation: trigger on a new `co2` reading, condition **above 1200**, action: Telegram —
"CO2 at {{value}} ppm — open a window." Add hysteresis so a room hovering at the line doesn't ping
you repeatedly: alarm above 1200, and only rearm once it drops back below 900. Both are edited in
the dashboard, not the firmware, and the channel swaps to Discord, Slack, or SMS without touching
the condition — the full pattern is in [ESP32 notifications](/guides/esp32-notifications).

## Going further

- **Make it portable.** On a battery with deep sleep, it's a monitor you carry room to room — swap
  the socket for wake-report-sleep over HTTP per [ESP32 battery life](/guides/esp32-deep-sleep-battery),
  and budget for the SCD41's warm-up on each wake or use its single-shot low-power mode.
- **Add particulates.** A PMS5003 alongside the SCD41 adds PM2.5/PM10 — more variables, more widgets,
  same reporting loop, for a fuller indoor-air picture.
- **Watch several rooms.** One SCD41-on-ESP32 per room, each reporting `co2_bedroom`, `co2_office`,
  and so on; a widget per room and one shared automation.
- **Automate the fix.** If a room has a fan or HRV you can switch, add a relay and a `NODRIX_WRITE`
  handler and let high CO2 turn ventilation on — closed-loop, the pattern from the
  [smart-home build](/guides/esp32-smart-home-automation).

## Notes

- **No broker, no local server.** The board speaks HTTPS; the dashboard is on your Cloudflare
  account. No Home Assistant, no MQTT, nothing on your LAN to keep alive.
- **A sensor you can trust.** Real photoacoustic CO2 plus temperature and humidity from one part —
  no MOX drift, no analog calibration ritual.
- **Scales by repeating.** One sketch runs a room or a building; add nodes, not complexity.
