---
title: "ESP32 battery life: deep sleep + cloud telemetry that lasts months"
description: "Make a battery-powered ESP32 sensor run for months while still reporting to the cloud. Deep sleep structure, RTC-memory Wi-Fi caching, a real power budget, and the dev-board traps that quietly kill battery life."
category: hardware
board: ESP32
difficulty: intermediate
datePublished: 2026-06-08
dateUpdated: 2026-06-08
faqs:
  - q: "How long can an ESP32 run on a battery while sending data?"
    a: "With deep sleep between readings, a single 18650 cell can last months. A ~3-second wake every 15 minutes spends almost all its time drawing microamps in sleep, not the ~120-160 mA of an active Wi-Fi radio — so the radio's brief bursts, not the idle time, set the lifetime."
  - q: "What actually drains the battery?"
    a: "The Wi-Fi radio, by a wide margin. Associating and transmitting pulls ~120-160 mA (with brief peaks higher); deep sleep is microamps. Battery life is almost entirely about how briefly and how rarely the radio is on, which is why connecting fast matters more than anything else."
  - q: "Why does my dev board drain fast even in deep sleep?"
    a: "Usually the board, not the chip. Many dev boards keep a USB-serial chip, an always-on LDO regulator, or a power LED alive in sleep, turning the ESP32's ~10 µA into hundreds of microamps or more. For real battery builds pick a board designed for low sleep current, or power the bare module directly."
  - q: "Can a sleeping device still receive commands?"
    a: "Yes, on its schedule. A deep-sleep device can't be pushed to instantly, but it polls the control endpoint right after it sends telemetry each wake and applies anything queued. Commands wait in the cloud and land on the next wake — seconds to minutes later, not never."
  - q: "Does deep sleep drop the Wi-Fi connection every time?"
    a: "Yes — deep sleep powers down the radio and wipes RAM, so each wake reconnects from scratch. The fix is to cache the BSSID and channel (and optionally a static IP) in RTC memory so reconnect skips the scan and DHCP, cutting association from 3-4 seconds to under one."
related:
  - href: "/guides/esp32-https-cloud/"
    label: "Connect an ESP32 over HTTPS"
    desc: "The telemetry and control loop this build sleeps between."
  - href: "/guides/esp32-receive-commands/"
    label: "Receive commands on an ESP32"
    desc: "Polling for control once per wake on a sleepy device."
  - href: "/guides/esp32-automatic-plant-watering/"
    label: "ESP32 plant watering"
    desc: "A sensor build you can convert to a battery node."
  - href: "/docs"
    label: "Device protocol"
    desc: "The telemetry endpoint your sensor wakes to call."
---

A battery-powered ESP32 that reports to the cloud can run for **months** on a single 18650 cell —
but only if it sleeps correctly. Battery life on the ESP32 is almost entirely a Wi-Fi problem: the
radio dominates the power budget, so the whole game is to stay asleep, wake briefly, connect fast,
send, and sleep again. Get the wake short and rare and the idle current low, and the math works
out to a season or more between charges. Get any of those wrong and the same hardware dies in days.

This guide is about the power side specifically: where the energy goes, the deep-sleep structure
that makes it possible, connecting fast enough to matter, a real worked budget, and the dev-board
traps that quietly wreck battery life. For the telemetry and control code itself, see
[Connect an ESP32 over HTTPS](/guides/esp32-https-cloud/).

## Where the power goes

Three states matter, and they're orders of magnitude apart:

| State | Current (typical) | When |
|---|---|---|
| Deep sleep | ~10 µA (bare module) | between readings — almost all the time |
| Active + Wi-Fi | ~120-160 mA | the few seconds it's connecting and sending |
| Peak TX burst | up to ~500 mA | brief spikes during transmit |

The lesson reads straight off the table: a few seconds at 150 mA costs roughly the same as **hours**
of deep sleep. Lifetime is set by how short and how infrequent the active bursts are — not by the
sleep time. That's why "connect fast" is the highest-leverage optimization there is, and why a
chatty board that stays awake "just in case" is the classic battery killer.

## The deep-sleep shape

Deep sleep changes how you write the entire sketch. On wake the ESP32 powers the radio back up,
**wipes RAM, and re-runs `setup()` from the top** — `loop()` effectively never runs. Anything that
must survive a nap lives in **RTC memory**, declared with `RTC_DATA_ATTR`. So the structure is:
everything happens in `setup()`, ending with a call to sleep; `loop()` stays empty.

```cpp
void setup() {
  // wake → connect → read → send → poll → sleep
}
void loop() {}   // intentionally empty for a deep-sleep design
```

## Connect fast: cache the association

The single biggest win is skipping the Wi-Fi channel scan. On the first connect, cache the BSSID
and channel in RTC memory; on every wake after, hand them back to `WiFi.begin()` so it reconnects
directly. A static IP skips DHCP for another saved second. Both shave seconds off the radio-on
time, which — per the table above — is where the battery actually goes.

```cpp
RTC_DATA_ATTR bool    rtcValid = false;
RTC_DATA_ATTR uint8_t rtcBssid[6];
RTC_DATA_ATTR int32_t rtcChannel;

void fastConnect() {
  WiFi.mode(WIFI_STA);
  // Optional: a static IP skips DHCP entirely.
  // WiFi.config(ip, gateway, subnet, dns);

  if (rtcValid) WiFi.begin(WIFI_SSID, WIFI_PASS, rtcChannel, rtcBssid, true); // cached path
  else          WiFi.begin(WIFI_SSID, WIFI_PASS);                            // first boot

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 8000) delay(50); // bounded wait

  if (WiFi.status() == WL_CONNECTED) {
    memcpy(rtcBssid, WiFi.BSSID(), 6);
    rtcChannel = WiFi.channel();
    rtcValid = true;
  } else {
    rtcValid = false;   // bad cache → force a full scan next time
  }
}
```

The bounded wait matters as much as the cache: never block forever on `WiFi.status()`. A bad night
where the AP is unreachable should cost one capped attempt, not a flat battery.

## The full sketch

Wake, connect, read the sensor, POST one reading, grab any queued command while the radio is up,
and sleep on a timer. That's the entire life of a battery node.

```cpp
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

#define SLEEP_MINUTES 15
const char* HOST  = "https://nodrix.you.workers.dev";
const char* TOKEN = "tok_your_project_token";

void setup() {
  fastConnect();
  if (WiFi.status() == WL_CONNECTED) {
    float t = readTemp();                         // your sensor

    WiFiClientSecure client;
    client.setInsecure();                         // dev only — pin a CA in production
    HTTPClient https;
    https.begin(client, String(HOST) + "/v1/telemetry");
    https.addHeader("Content-Type", "application/json");
    https.addHeader("Authorization", String("Bearer ") + TOKEN);
    https.POST("{\"metrics\":{\"temperature\":" + String(t, 1) + "}}");  // -> 204
    https.end();

    pollControl();                                // apply queued commands while we're up
  }
  esp_sleep_enable_timer_wakeup((uint64_t)SLEEP_MINUTES * 60ULL * 1000000ULL);
  esp_deep_sleep_start();                         // execution ends here; wakes into setup()
}

void loop() {}
```

`pollControl()` is the downlink — fetch `GET /v1/control`, apply, ack. It's worth doing every wake
since the radio is already on; the full version is in
[Receive commands on an ESP32](/guides/esp32-receive-commands/). A sleepy device can't be pushed to
instantly, but commands queued in the cloud land on the next wake.

## Do the math

Plug your numbers in; here's a 15-minute cycle on a 2500 mAh cell:

- **Per wake:** ~120 mA × 3 s = 0.1 mAh.
- **Wakes/day:** 96 (every 15 min) → ~9.6 mAh/day from active time.
- **Sleep/day:** a bare module at 10 µA adds ~0.24 mAh/day; a typical dev board at 0.2-0.3 mA adds
  ~5-7 mAh/day.
- **Total:** ~10 mAh/day (bare) to ~16 mAh/day (dev board).
- **Lifetime:** 2500 mAh ÷ 10-16 ≈ **160-250 days** — call it 5-8 months.

The spread is almost entirely sleep current, which is why the board you choose matters more than
shaving another reading. Stretch the interval to 30-60 minutes and you cross a year; drop to one
minute and you're back to weeks.

## Squeeze more

- **Pick the right board.** The biggest variable is idle current. A board with a USB-serial chip, a
  power LED, and a thirsty regulator can sit at hundreds of µA in "deep sleep." For real battery
  builds use a low-sleep board or power the bare module.
- **Give the sensor its warm-up.** Many sensors need tens to hundreds of ms after power-up before a
  valid reading — budget it rather than reading `nan`.
- **Buffer offline.** If a send fails, stamp the reading with your own `ts` (NTP-synced) and send it
  next wake, so a dropped network doesn't lose data.
- **Mind the strapping pins.** Avoid GPIO 12 on the classic ESP32 (a strapping pin that can stop the
  board booting); safe wake/IO pins on the base chip include 4, 13, 14, 25, 26, and 27.
- **Wake on more than a timer.** `esp_sleep_enable_ext0/ext1_wakeup` lets a reed switch, PIR, or
  button wake the board on an event instead of polling on a clock.

## Notes

- **It's a Wi-Fi budget, not a sleep budget.** Optimize the radio-on time first; everything else is
  rounding error.
- **HTTPS fits deep sleep perfectly.** There's no session to keep alive — wake, POST, poll, sleep.
  No broker, no persistent socket.
- **Runs on your account.** Readings land in a nodrix instance on your own Cloudflare account, ready
  to chart, alert on, or read back through the API.
