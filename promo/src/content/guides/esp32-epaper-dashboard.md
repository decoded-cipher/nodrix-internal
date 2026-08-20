---
title: "Build an ESP32 e-paper dashboard that runs for months on a battery"
description: "A complete ESP32 e-ink dashboard: pull live sensor values from your own cloud read API, render them on a Waveshare panel, and deep sleep between updates — with the refresh discipline that keeps an e-paper display from ghosting itself into a permanent mess."
category: project
board: ESP32
difficulty: intermediate
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "Why does my e-paper display look faded or show old text?"
    a: "That's ghosting, and it accumulates when you only ever do partial refreshes. Partial updates are fast and don't flash, but they leave residue from the previous image, and manufacturers are clear that letting it build up can eventually damage the panel rather than just look bad. The fix is discipline: a full refresh every five to ten partial ones clears it, and this build tracks that count across deep sleep."
  - q: "How long does a battery actually last?"
    a: "Months, because e-paper holds its image with no power at all — the display only draws current during the second or two it's changing. With an ESP32 in deep sleep between updates, a 2000 mAh cell runs roughly three to five months at fifteen-minute updates, and past a year at hourly ones. The refresh rate is the dominant variable, not the panel size."
  - q: "Do I need to put the panel to sleep too?"
    a: "Yes, and this is the one that permanently kills displays. An e-paper panel left powered without refreshing sits in a high-voltage state, and manufacturers warn that leaving it there damages the film irreparably. Call the library's hibernate function after every update, before the ESP32 sleeps. It is one line and it is not optional."
  - q: "Why does this use an API token instead of a project token?"
    a: "Because it's reading, not writing. Project tokens are for hardware pushing telemetry up and receiving control writes back; the read API that serves current values to a consumer is authenticated with a user or API token instead. This display is a client of your data rather than a source of it, so it uses the client credential."
  - q: "How often can I refresh an e-paper display?"
    a: "Less often than you'd like. Waveshare suggests a minimum interval of around 180 seconds, and that's guidance about panel longevity rather than a technical limit. It suits this application anyway — a dashboard of temperatures and levels that updates every fifteen minutes reads as live, and refreshing every few seconds would burn a battery and the panel for no benefit."
related:
  - href: "/guides/esp32-deep-sleep-battery"
    label: "ESP32 battery life"
    desc: "The power budget behind the months-long runtime."
  - href: "/guides/esp32-weather-station"
    label: "ESP32 weather station"
    desc: "A good source of the values this panel displays."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The Wi-Fi and TLS foundation this build stands on."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The instance this panel reads from."
---

Every other build on this site pushes data up. This one pulls it back down: a small e-ink panel on a
shelf showing the readings your sensors are already collecting —
[tank level](/guides/esp32-water-tank-monitor), [freezer temperature](/guides/esp32-freezer-alarm),
[battery state of charge](/guides/esp32-solar-battery-monitor) — updated quietly, with no glow, no
fan, and no cable.

E-paper is the right technology for it for one specific reason: it draws power only while the image
is changing. A panel showing yesterday's numbers on a dead battery looks exactly like a panel showing
today's, which is both its superpower and, as you'll see, something to design around.

## What you'll build

An ESP32 that wakes every fifteen minutes, fetches your project's current state from the read API,
draws it, puts both the panel and itself back to sleep, and runs for months on a single cell.

## The two ways to ruin an e-paper panel

Worth covering before the wiring, because both are permanent and both are easy to walk into.

**Ghosting from partial refreshes.** E-paper supports two update modes. A full refresh flashes the
panel black and white a few times and leaves a perfectly clean image; a partial refresh updates
quietly and quickly but leaves faint residue of what was there before. Partial updates are what make
e-paper feel usable — and if you only ever do partial updates, that residue accumulates. Manufacturer
guidance is a **full refresh every five to ten partial ones**, and the warning attached is stronger
than cosmetic: left unchecked, ghosting can degrade the panel rather than merely look bad.

**Leaving the panel powered and idle.** When an e-paper display isn't refreshing, it must be put into
sleep mode or powered down. Left powered and static, the panel sits in a high-voltage state that
damages the film, and that damage is not recoverable. Waveshare also advises against holding the same
static image for very long periods.

Both have the same one-line answers, and the sketch below applies them: count your partial refreshes
and periodically do a full one, and call `hibernate()` before you sleep.

## What you'll need

- An **ESP32** dev board — any common DevKit variant.
- A **Waveshare or Good Display e-paper panel** — a 2.9" black-and-white module is a good starting
  size, and supports partial refresh.
- A **LiPo or 18650 cell** and a way to charge it, if you want it cable-free.
- The **GxEPD2**, **ArduinoJson**, and **WiFiClientSecure** Arduino libraries.
- A **nodrix instance**, and an **API token** — not a project token, since this build reads.

## Wiring

E-paper modules are SPI with three extra control lines:

| From | To | Wire |
|------|----|------|
| Panel <span class="pin">VCC</span> | ESP32 <span class="pin">3V3</span> | Power |
| Panel <span class="pin">GND</span> | ESP32 <span class="pin">GND</span> | Ground |
| Panel <span class="pin">DIN</span> | ESP32 <span class="pin">GPIO23</span> | SPI MOSI |
| Panel <span class="pin">CLK</span> | ESP32 <span class="pin">GPIO18</span> | SPI clock |
| Panel <span class="pin">CS</span> | ESP32 <span class="pin">GPIO5</span> | Chip select |
| Panel <span class="pin">DC</span> | ESP32 <span class="pin">GPIO17</span> | Data/command |
| Panel <span class="pin">RST</span> | ESP32 <span class="pin">GPIO16</span> | Reset |
| Panel <span class="pin">BUSY</span> | ESP32 <span class="pin">GPIO4</span> | Busy (input) |

`RST` matters more than it looks on a sleeping build: the library wakes a hibernated panel by
toggling reset, so that line has to be a real GPIO rather than tied high.

## The firmware

The flow is linear because the board is awake for only a few seconds: connect, fetch, draw, hibernate
the panel, deep sleep. There is no `loop()` worth speaking of.

Two details make it work across sleep cycles. The refresh counter lives in `RTC_DATA_ATTR` memory,
which survives deep sleep while normal variables don't — that's how a board that reboots every
fifteen minutes still knows it has done nine partial refreshes. And the state fetch uses the read
API, which returns every variable's latest value in one request.

```cpp
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <GxEPD2_BW.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "https://nodrix.you.workers.dev";
const char* PROJECT   = "proj_your_project_id";
const char* API_TOKEN = "tok_your_api_token";   // user/API token, not a project token

const uint64_t SLEEP_US   = 15ULL * 60 * 1000000;
const int      FULL_EVERY = 10;                 // full refresh every N updates

// Match this class to your exact panel.
GxEPD2_BW<GxEPD2_290_T94, GxEPD2_290_T94::HEIGHT> display(
  GxEPD2_290_T94(/*CS*/ 5, /*DC*/ 17, /*RST*/ 16, /*BUSY*/ 4));

RTC_DATA_ATTR int refreshCount = 0;             // survives deep sleep

bool fetchState(JsonDocument& doc) {
  WiFiClientSecure client;
  client.setInsecure();                          // pin a CA for production
  HTTPClient http;

  String url = String(HOST) + "/v1/projects/" + PROJECT + "/state";
  http.begin(client, url);
  http.addHeader("Authorization", String("Bearer ") + API_TOKEN);

  int code = http.GET();
  bool ok = (code == 200) && (deserializeJson(doc, http.getStream()) == DeserializationError::Ok);
  http.end();
  return ok;
}

void drawRow(int y, const char* label, JsonVariant v, const char* unit) {
  display.setCursor(4, y);
  display.print(label);
  display.setCursor(150, y);
  if (v.isNull()) display.print("--");
  else            display.print(v.as<float>(), 1);
  display.print(unit);
}

void setup() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(250);

  JsonDocument doc;
  bool ok = (WiFi.status() == WL_CONNECTED) && fetchState(doc);
  JsonObject state = doc["state"];

  display.init();
  bool full = (refreshCount % FULL_EVERY == 0);
  display.setPartialWindow(0, 0, display.width(), display.height());
  display.setRotation(1);
  display.setTextColor(GxEPD_BLACK);
  display.setTextSize(2);

  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    if (!ok) {
      display.setCursor(4, 20);
      display.print("offline");
    } else {
      drawRow(20, "Tank",    state["tank_level"]["value"],      "%");
      drawRow(50, "Freezer", state["freezer_temp"]["value"],    "C");
      drawRow(80, "Battery", state["battery_voltage"]["value"], "V");
    }
  } while (display.nextPage());

  if (full) display.clearScreen();               // periodic ghost clear
  refreshCount++;

  display.hibernate();                           // never skip this
  esp_deep_sleep(SLEEP_US);
}

void loop() { }
```

The `offline` branch is deliberate. A dashboard that fails to fetch and redraws the previous numbers
is actively misleading, because e-paper's persistence means stale data looks exactly as authoritative
as fresh data. Better to say plainly that the reading is unavailable.

`setInsecure()` keeps the example short. For anything that lives outside your own network, pin the
CA certificate instead — the [HTTPS guide](/guides/esp32-https-cloud) covers how.

## Choosing what to display

E-paper rewards restraint. A 2.9" panel holds maybe four values at a size readable across a room, and
a dashboard of four numbers you actually check beats twelve you skim past.

The values worth a permanent display are the ones with a slow, meaningful state: tank percentage,
freezer temperature, battery voltage, today's generated amp-hours. Things that change second to
second belong on a phone, not on a panel that shouldn't refresh more than every few minutes anyway.

## Going further

Add a sparkline by calling the series endpoint —
`/v1/projects/:proj/variables/:key/series?window=24h` returns recent points, and a handful of
`drawLine` calls turns them into a trend. A number plus its last day of history is a
disproportionately better dashboard than the number alone.

For genuinely minimal power, cut the panel's supply entirely with a MOSFET on a GPIO. Even hibernated,
an e-paper module draws a small residual current from its VCC line, which matters over months even
though it's negligible over hours.

A three-colour panel adds red or yellow, which is tempting for alarm states. Note the trade before
committing: three-colour panels have no partial refresh and take considerably longer to update, so
every refresh is a full, flashing one.

## Notes

`RTC_DATA_ATTR` is what makes the refresh counter work. Ordinary globals are reinitialised on wake
from deep sleep, because the chip genuinely reboots — only RTC memory survives.

The `GxEPD2_290_T94` class in the example matches one specific 2.9" panel. GxEPD2 supports dozens of
panels and picking the wrong class typically produces a blank or garbled display rather than an
error, so check the library's examples against the exact module you bought.

Waveshare recommends a minimum refresh interval of around 180 seconds. At fifteen-minute updates
this build sits comfortably inside that, but it's worth knowing before you decide a one-minute clock
would be nicer.

E-paper refreshes poorly at low temperatures and the effect starts well above freezing. A panel in an
unheated garage in winter may update slowly or unevenly, which is a property of the film rather than
anything wrong with the build.
