---
title: "Build an ESP32 GPS tracker with a live map — no proprietary cloud"
description: "A complete ESP32 GPS tracker: read a NEO-6M over serial, stream position over one WebSocket, and watch the marker move on a map dashboard you own — no vendor tracking cloud, no per-device fee, on your own Cloudflare account."
category: project
board: ESP32
difficulty: beginner
datePublished: 2026-07-10
dateUpdated: 2026-07-10
faqs:
  - q: "Does this track a car anywhere, like a commercial tracker?"
    a: "Only where it has an uplink. GPS gives the board its position anywhere on earth; getting that position off the board needs Wi-Fi, so live tracking works wherever the tracker can reach a network — a phone hotspot in the vehicle, campus or depot Wi-Fi, or your home network for arrive/leave visibility. Commercial trackers solve this with a cellular modem and a SIM subscription; that's the honest difference, not the GPS part."
  - q: "Why does my NEO-6M take so long to get a fix?"
    a: "A cold start legitimately takes one to five minutes with a clear sky view — the module is downloading satellite orbit data. Indoors it may never lock. Give the antenna sky view, keep the module powered so it can hot-start in seconds next time, and watch the module's fix LED: blinking means locked."
  - q: "Why send latitude and longitude as two variables instead of one?"
    a: "Because that's what the map widget binds to: a marker follows a lat variable and a lng variable as a pair. Two plain numeric variables also stay useful individually — both are charted, queryable through the read API, and usable in automations without unpacking anything."
  - q: "Is float precision enough for GPS coordinates?"
    a: "The firmware sends doubles, so this isn't a worry here — TinyGPS++ hands out double-precision coordinates and Nodrix.send has a double overload. Truncating to 32-bit floats would cost you real accuracy (a float only holds about seven significant digits, which is meters at longitude scale), which is why the sketch never casts."
  - q: "What happens to the track while the tracker is out of coverage?"
    a: "The library keeps reconnecting, and positions sent while offline are skipped rather than queued, so the map shows an honest gap and then the marker jumps to the current fix on reconnect. Backfilling the gap would need timestamps attached to old fixes, which telemetry sends don't carry — buffered breadcrumb history is on the roadmap; today the tracker is live-position-first."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The Wi-Fi and TLS foundation this build stands on."
  - href: "/guides/esp32-deep-sleep-battery"
    label: "ESP32 battery life"
    desc: "The wake-report-sleep pattern for a battery asset tag."
  - href: "/widgets"
    label: "Dashboard widgets"
    desc: "The map, chart, and value widgets used here."
  - href: "/guides/esp32-receive-commands"
    label: "Receive commands on an ESP32"
    desc: "Add a remote locate-now or immobilizer downlink."
---

Most ESP32 GPS tracker tutorials end the same way: your coordinates flow into somebody else's
tracking portal, on their account system, at their pleasure. This build keeps the whole path yours.
A NEO-6M reads position, the ESP32 streams it over one WebSocket, and the marker moves across a map
dashboard served from **your own Cloudflare account** — open source end to end, no tracking vendor,
no per-device fee, and a read API if you ever want the raw trail.

It's also honest about the one thing GPS tutorials tend to gloss over: GPS tells the board where
it is anywhere; reporting it needs an uplink. With Wi-Fi that means a phone hotspot in the vehicle,
depot or campus networks for fleet-yard visibility, or your home network for arrive/leave tracking.

## What you'll build

- A **live map** with a marker that follows the tracker, updating in place over a WebSocket.
- A **speed readout** on the marker and a 24-hour **speed chart**.
- A **Telegram alert** when the tracker moves faster than it should.

## What you'll need

- An **ESP32** dev board (any common DevKit variant).
- A **NEO-6M GPS module** with its ceramic antenna — the ubiquitous blue breakout.
- A **power source** where the tracker lives: vehicle USB, a power bank, or a 5V supply.
- The **Arduino IDE** with the ESP32 board package, the **Nodrix** library, and the
  **TinyGPSPlus** library, both from the Library Manager.
- A **nodrix instance** with a project and a project token.

## How the GPS side works

The NEO-6M speaks NMEA sentences over plain serial at 9600 baud — a stream of text lines carrying
position, speed, altitude, and satellite health. TinyGPS++ parses the stream; your sketch just
feeds it bytes and asks for numbers. Two field realities to plan around:

- **Cold starts are slow.** First fix after power-up takes one to five minutes under open sky while
  the module downloads orbit data; indoors it may never lock. Once it has run, a warm module
  re-fixes in seconds. The onboard LED blinks when locked.
- **The antenna wants sky.** On a dashboard shelf or rear window, fine; sealed in a metal box,
  never. Position the ceramic antenna face-up with a view of the sky.

## Wiring

Four wires. The NEO-6M runs on 3.3V logic, so it connects to the ESP32 directly:

| From | To | Wire |
|------|----|------|
| NEO-6M <span class="pin">VCC</span> | ESP32 <span class="pin">3V3</span> | Power |
| NEO-6M <span class="pin">GND</span> | ESP32 <span class="pin">GND</span> | Ground |
| NEO-6M <span class="pin">TX</span> | ESP32 <span class="pin">GPIO16 (RX2)</span> | Serial |
| NEO-6M <span class="pin">RX</span> | ESP32 <span class="pin">GPIO17 (TX2)</span> | Serial |

Some NEO-6M breakouts prefer 5V on VCC (they regulate down); check yours. The TX/RX logic level is
3.3V either way.

## The firmware

The sketch has one job per direction: feed NMEA bytes to the parser, and send a position whenever
the tracker has actually moved. The [nodrix Arduino library](https://github.com/decoded-cipher/nodrix-sdk)
owns the socket and the reconnects.

```cpp
#include <Nodrix.h>
#include <TinyGPSPlus.h>

const char* WIFI_SSID = "your-ssid";        // or the phone hotspot in the vehicle
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

TinyGPSPlus gps;

double lastLat = 0, lastLng = 0;

void setup() {
  Serial2.begin(9600, SERIAL_8N1, 16, 17);
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();

  while (Serial2.available()) gps.encode(Serial2.read());
  if (!gps.location.isValid()) return;

  static unsigned long lastSend = 0;
  bool moved = TinyGPSPlus::distanceBetween(
      gps.location.lat(), gps.location.lng(), lastLat, lastLng) > 15;
  unsigned long interval = moved ? 5000 : 60000;

  if (millis() - lastSend >= interval) {
    lastSend = millis();
    lastLat = gps.location.lat();
    lastLng = gps.location.lng();
    Nodrix.send("lat", gps.location.lat());
    Nodrix.send("lng", gps.location.lng());
    Nodrix.send("speed_kmh", gps.speed.kmph());
  }
}
```

Worth understanding rather than copying:

- **The send rate follows movement.** Moving, it reports every 5 seconds; parked, once a minute as
  a heartbeat. The 15-meter threshold is roughly GPS jitter — without it, a parked tracker "drifts"
  a random walk around the true spot and floods the chart with noise.
- **Coordinates stay double-precision.** TinyGPS++ returns doubles and `Nodrix.send` takes them
  as-is. A 32-bit float holds only about seven significant digits — meters of error at longitude
  scale — so the sketch never casts.
- **No fix, no send.** Until `gps.location.isValid()`, nothing is reported. A map with an honest
  gap beats a marker confidently parked at 0°N 0°E off the coast of Africa.
- **Pin TLS before you ship.** `Nodrix.begin()` connects encrypted but unverified on first run; add
  `Nodrix.setCACert()` for production, covered in
  [Connect an ESP32 over HTTPS](/guides/esp32-https-cloud).

## Build the dashboard

Add a **Map** widget. In its marker settings, add one marker with **source: Lat/Lng variables**,
bind `lat` and `lng`, and set the optional value variable to `speed_kmh` so a tap on the marker
shows how fast the tracker is moving. Pick a color, choose a basemap, and the marker starts
following the board — updates arrive live over the same hibernating WebSocket the dashboards
always use.

Two more widgets round it out:

| Widget | Bind to | Shows |
|---|---|---|
| Value | `speed_kmh` | current speed |
| Chart | `speed_kmh` | the day's movement pattern |

The speed chart doubles as a trip log — flat at zero is parked, and each lobe is a drive, wired to
nothing but data you already send.

## Add the alert

One automation: trigger on a new `speed_kmh` reading, condition **above 90** (pick your number),
action: Telegram — "Tracker doing {{value}} km/h." Whether that's a teen driver, a delivery van, or
an e-bike that shouldn't be on a highway, the alert channel and threshold are edited in the
dashboard, never in firmware. Swap Telegram for Slack, Discord, or SMS without touching the
condition.

## Where this design honestly lands

- **In-vehicle with a phone hotspot** — full live tracking while you drive. This is the everyday
  mode, and a hotspot the phone already provides beats a SIM subscription for a personal vehicle.
- **Depot, campus, worksite** — assets report whenever they're on site Wi-Fi: live position in the
  yard, last-known-position the moment they leave. For "which corner of the site is the trailer
  in," that's the whole job.
- **Arrive/leave at home** — on home Wi-Fi the tracker reports approach and departure; the gap in
  between is the trip.
- **Continuous anywhere-tracking** — that's a cellular modem and a monthly SIM, in any product. If
  the project outgrows Wi-Fi, the dashboard side here doesn't change; only the uplink does.

## Going further

- **Battery asset tag.** Swap the always-open socket for wake-fix-report-sleep over HTTP
  (`Nodrix.beginHTTP()` + `Nodrix.poll()`) and a small cell runs for weeks — the pattern is in
  [ESP32 battery life](/guides/esp32-deep-sleep-battery). Budget for the GPS fix time: keeping the
  NEO-6M's backup power pin alive makes each wake a hot start.
- **A remote "locate now" button.** Add a `NODRIX_WRITE("locate")` handler that forces an immediate
  send — a dashboard push button gives you on-demand position while parked.
- **More trackers, one map.** Each device sends `lat_2`/`lng_2` (or its own token and variables) and
  gets its own marker on the same map — fleet view is just more markers.
- **Pull the trail.** The full position history sits behind the read API — one token gets you the
  series for any mapping, geofencing, or trip-report post-processing you want to build.

## Notes

- **No tracking vendor in the loop.** Position data goes from your board to your Cloudflare
  account; the map is served from your instance and the history is queryable through your API.
- **The moving parts are all replaceable.** NMEA serial in, HTTPS/WebSocket out — swap the GPS
  module, the board, or even the firmware framework and the dashboard neither knows nor cares.
- **Costs track usage.** A tracker at 5-second cadence is well within normal Workers usage on your
  own account — there's no per-device fee to multiply across a fleet.
