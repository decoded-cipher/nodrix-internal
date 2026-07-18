---
title: "Build an ESP32 weather station with a live cloud dashboard"
description: "A complete ESP32 weather station on the BME280: temperature, humidity, and barometric pressure streamed to a live dashboard you open from anywhere — with a falling-pressure storm alert — no MQTT broker, no legacy IoT cloud, on your own Cloudflare account."
category: project
board: ESP32
difficulty: beginner
datePublished: 2026-07-18
dateUpdated: 2026-07-18
faqs:
  - q: "Why a BME280 and not a DHT22?"
    a: "The DHT22 gives temperature and humidity and stops there. The BME280 adds barometric pressure over the same tiny I2C part — and pressure is what makes it a weather station rather than a thermometer, because a falling barometer is the classic leading indicator of an incoming storm. The BME280 is also more accurate and doesn't have the DHT22's slow, occasionally-flaky one-wire protocol. For a few cents more it's the obvious pick."
  - q: "Do I need an internet weather API for this?"
    a: "No — this measures your actual location, which is the point. An API tells you the regional forecast; your BME280 tells you the pressure on your balcony, the humidity in your greenhouse, the temperature in the shade of your garden. The two are complementary, but the sensor is the one that knows your microclimate, and it keeps working when the API rate-limits you."
  - q: "How do I measure rain and wind too?"
    a: "Add them as more variables. A tipping-bucket rain gauge is a reed switch you count with an interrupt; anemometer and wind vane kits output pulses and a voltage you read the same way. Each becomes another Nodrix.send call and another widget — the reporting loop and dashboard don't change shape, they just gain series. This guide covers the temperature/humidity/pressure core that every station shares."
  - q: "Why does my BME280 read a few degrees high?"
    a: "Self-heating. The ESP32 and the sensor's own draw warm the board, and a BME280 mounted right against it reads the board's heat, not the air's. Mount the sensor away from the ESP32 on a short lead, give it airflow, keep it out of direct sun, and if you deep-sleep the board between readings the self-heating largely disappears — another reason a battery weather station reads more accurately than a always-on one."
  - q: "Can this run outdoors on a battery?"
    a: "Yes, and it's the natural form. Deep sleep between readings takes an ESP32 weather node to months on a single cell, and weather changes slowly enough that a reading every 5-15 minutes is plenty. Put the electronics in a vented enclosure (a Stevenson-screen-style shield keeps sun and rain off the sensor), and report on each wake over HTTP — the pattern is in the battery guide linked below."
related:
  - href: "/guides/esp32-deep-sleep-battery"
    label: "ESP32 battery life"
    desc: "Take the outdoor station to months on a battery."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The Wi-Fi and TLS firmware this build stands on."
  - href: "/guides/esp32-notifications"
    label: "ESP32 notifications"
    desc: "Route the storm-warning alert to your phone."
  - href: "/widgets"
    label: "Dashboard widgets"
    desc: "The gauge, chart, and value widgets used here."
---

A weather station is the project that makes a maker check a dashboard every morning. This one
measures the weather where you actually are — temperature, humidity, and the barometric pressure
that warns of an incoming storm — with a single BME280, and streams it to a live dashboard you open
from your phone anywhere. No regional-forecast API guessing at your microclimate; the pressure on
your own balcony, charted.

Most ESP32 weather-station tutorials stop one step short: they read the sensor and print it to the
Serial Monitor or a tiny OLED, then wave at "connect it to the cloud" as a next step. This one is
the cloud step, done properly — over plain HTTPS to your own Cloudflare account, no MQTT broker and
no legacy freemium platform holding your history.

## Why the BME280

The default two-in-one sensor, the DHT22, measures temperature and humidity and nothing else. The
BME280 measures those plus **barometric pressure**, from the same small I2C part — and pressure is
what earns the name "weather station." A steadily falling barometer is the oldest reliable storm
signal there is, hours ahead of the clouds. The BME280 is also more accurate than a DHT22 and speaks
clean I2C instead of the DHT's slow, occasionally-flaky one-wire timing. For a few cents more, it's
the sensor every serious build uses.

(One caution when buying: the BMP280 is the cheaper sibling with no humidity. For a weather station
you want the BME — the E has humidity.)

## What you'll need

- An **ESP32** dev board (any common DevKit variant).
- A **BME280** breakout (I2C version — most are).
- Four jumper wires.
- The **Arduino IDE** with the ESP32 board package, the **Nodrix** library, and Adafruit's
  [**BME280** library](https://github.com/adafruit/Adafruit_BME280_Library) (it pulls in the
  Adafruit Unified Sensor library), from the Library Manager.
- A **nodrix instance** with a project and a project token.

## Wiring

I2C, four wires, no analog:

| From | To | Wire |
|------|----|------|
| BME280 <span class="pin">VCC</span> | ESP32 <span class="pin">3V3</span> | Power |
| BME280 <span class="pin">GND</span> | ESP32 <span class="pin">GND</span> | Ground |
| BME280 <span class="pin">SDA</span> | ESP32 <span class="pin">GPIO21</span> | I2C data |
| BME280 <span class="pin">SCL</span> | ESP32 <span class="pin">GPIO22</span> | I2C clock |

Mount the BME280 away from the ESP32 on a short lead. The board's own heat will bias the temperature
reading if the sensor sits right against it — a couple of centimetres and some airflow fixes it.

## The firmware

Read three values, send three variables, on a gentle cadence — weather moves slowly. The
[nodrix Arduino library](https://github.com/decoded-cipher/nodrix-sdk) handles the connection.

```cpp
#include <Nodrix.h>
#include <Adafruit_BME280.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

Adafruit_BME280 bme;

void setup() {
  bme.begin(0x76);          // some breakouts are at 0x77
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();

  static unsigned long lastReading = 0;
  if (millis() - lastReading >= 60000) {
    lastReading = millis();
    Nodrix.send("temperature", bme.readTemperature());
    Nodrix.send("humidity", bme.readHumidity());
    Nodrix.send("pressure", bme.readPressure() / 100.0F);   // Pa → hPa
  }
}
```

Worth understanding rather than copying:

- **Pressure in hPa.** The BME280 reports pascals; dividing by 100 gives hectopascals (millibars),
  the unit weather reports use — sea-level pressure sits around 1013 hPa, so your readings should
  land near there once you account for altitude.
- **A minute between readings is generous.** Weather doesn't change in seconds. On mains power a
  minute is fine; on a battery you'd stretch it to 5–15 minutes and deep-sleep between.
- **Check the I2C address.** BME280 breakouts are at 0x76 or 0x77 depending on the board — if
  `begin()` fails, try the other.
- **Pin TLS before you ship.** `Nodrix.begin()` connects encrypted but unverified on first run; add
  `Nodrix.setCACert()` for production, covered in
  [Connect an ESP32 over HTTPS](/guides/esp32-https-cloud).

## Build the dashboard

| Widget | Bind to | Shows |
|---|---|---|
| Value | `temperature` | current temperature |
| Value | `humidity` | relative humidity |
| Gauge | `pressure` | barometric pressure, ~980–1040 hPa |
| Chart | `pressure` | the pressure trend — the storm-teller |
| Chart | `temperature` | the day's temperature curve |

The pressure chart is the one to watch. Absolute pressure matters less than its slope: a slow rise
means settling, fair weather; a steady fall over a few hours is the classic sign of an approaching
low and likely rain. Once you've watched it for a week against what the sky actually did, you'll
read an incoming front off that line before any app tells you.

## Add the storm alert

Weather stations reward one good automation. A rapid pressure drop is the signal worth a
notification: trigger on a new `pressure` reading, and alert when it falls meaningfully below where
it sat a few hours ago (a threshold around 1000 hPa is a reasonable absolute floor for "weather
coming" in many regions; tune it to yours). Action: Telegram — "Pressure dropping, {{value}} hPa —
weather likely turning." Swap the channel for Discord or SMS without touching the logic, per
[ESP32 notifications](/guides/esp32-notifications).

## Going further

- **Take it outside on a battery.** Deep sleep makes an outdoor node last months; house it in a
  vented radiation shield to keep sun and rain off the sensor — see
  [ESP32 battery life](/guides/esp32-deep-sleep-battery).
- **Add rain and wind.** A tipping-bucket gauge (a counted reed switch), an anemometer, and a wind
  vane each add a variable and a widget without changing the loop's shape.
- **Compare to the forecast.** Pull your own history through the read API and chart it against a
  weather service's numbers — your microclimate almost never matches the regional forecast exactly,
  and the gap is the interesting part.
- **Run several stations.** Sun and shade, indoors and out, ground and roof — each node reports its
  own variables to one dashboard.

## Notes

- **Your microclimate, not a regional guess.** The sensor measures your location; the API can't.
- **No broker, no legacy cloud.** HTTPS to your own Cloudflare account — no MQTT, no ThingSpeak or
  Blynk caps, history that stays yours behind the read API.
- **Battery-friendly by design.** Slow weather plus deep sleep equals months on a cell.
