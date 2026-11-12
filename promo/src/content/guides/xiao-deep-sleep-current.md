---
title: "Why your XIAO draws more than the datasheet in deep sleep"
description: "The same XIAO ESP32-S3 measures 11.9 µA at the battery pads and 298 µA through the 3V3 pin. How you power the board changes deep-sleep current by more than an order of magnitude."
category: hardware
board: XIAO ESP32
difficulty: intermediate
datePublished: 2026-09-21
faqs:
  - q: "Why is my XIAO deep sleep current so much higher than advertised?"
    a: "Most often because of where you're feeding power in. Bench measurements posted on Seeed's own forum show the same ESP32-S3 board drawing about 12 µA when 4.1 V is applied directly to the battery pads, 63 µA through the 5V pin, and 298 µA through the 3V3 pin. The quoted figures assume the battery-pad path, and the product page doesn't say so."
  - q: "Why does the XIAO ESP32-C3 draw more than the S3 in deep sleep?"
    a: "The C3's onboard XC6210 regulator has a quiescent current of roughly 35 µA, which it draws continuously regardless of what the chip is doing. Forum measurements put the C3 at 45.1 µA against 11.9 µA for the S3 under the same conditions. One user who desoldered the regulator and charger measured about 11 µA, which confirms where the difference comes from."
  - q: "What is the lowest deep sleep current I can realistically get?"
    a: "Around 12 to 15 µA on an S3 or C6 powered at the battery pads, based on published bench measurements. Below that you're fighting the onboard regulator and charger, which is a hardware modification rather than a firmware setting. If your power budget requires single-digit microamps, the XIAO form factor is probably the wrong starting point."
  - q: "Does an ordinary multimeter measure deep sleep current?"
    a: "Usually not well. Many handheld meters have a microamp range that tops out below what the board draws during a Wi-Fi transmit burst, and the burden voltage on that range can be high enough to brown the board out, which looks like a fault. The published figures here were taken with a Power Profiler Kit II, and a meter that can't resolve tens of microamps without disturbing the circuit will mislead you."
  - q: "Do these numbers apply to the XIAO ESP32-C5?"
    a: "No published bench measurement of C5 deep-sleep current was available when this was written. The C5 is a different part on a different process, so assuming it matches the C6 would be a guess. If deep-sleep current decides your design, measure the specific board rather than inferring from a sibling."
  - q: "Why does my battery die faster than the sleep current predicts?"
    a: "Sleep current is only one term. The wake period, the Wi-Fi association time and the transmit burst usually dominate, because a few seconds at over a hundred milliamps outweighs hours at microamps. A board that takes eight seconds to associate instead of two has roughly tripled its real consumption regardless of what it draws asleep."
related:
  - href: "/guides/xiao-esp32-battery-sensor"
    label: "XIAO battery sensor"
    desc: "Building the node these numbers apply to."
  - href: "/guides/esp32-deep-sleep-battery"
    label: "ESP32 deep sleep and battery life"
    desc: "The general power picture."
  - href: "/guides/esp32-adc-accuracy"
    label: "Reading battery voltage accurately"
    desc: "Why the cell voltage you measure may be wrong."
  - href: "/guides/esp32-c3-vs-esp8266"
    label: "ESP32-C3 compared"
    desc: "Where the C3 sits against older silicon."
---

A XIAO advertised at tens of microamps in deep sleep, measured on your bench at a few hundred, is
not usually a faulty board or a firmware mistake. **It's the power path.**

The numbers below are **not our measurements**. They come from bench work posted on Seeed's own
forum by users with proper instrumentation, and they're linked so you can read the originals and
their conditions.

## The measurements

Forum member `msfujino` measured three boards with a Power Profiler Kit II, applying 3.8 V directly
to the battery pads and calling `esp_deep_sleep_start()`
([thread 276444](https://forum.seeedstudio.com/t/comparison-of-sleep-currents-for-xiao-esp32c6-s3-and-c3/276444),
posted April 2024, with a C3 correction in May):

| Board | Deep sleep current, battery pads |
|---|---|
| XIAO ESP32-C3 | 45.1 µA |
| XIAO ESP32-C6 | 14.3 µA |
| XIAO ESP32-S3 | 11.9 µA |

A separate thread measured **the same S3 through different power inputs**
([thread 276916](https://forum.seeedstudio.com/t/xiao-esp32s3-deep-sleep-current-higher-than-expected/276916),
May 2024):

| Power path | Deep sleep current |
|---|---|
| Battery pads, 4.1 V | about 12 µA |
| 5V pin | 63 µA |
| 3V3 pin | **298 µA** |

That's a twenty-five-fold difference on one board, decided entirely by which pin you connect.

## Why the pin matters

Feeding the 3V3 pin doesn't bypass the board's power circuitry in the way people expect. You end
up supplying rails that remain active in sleep, and the quiescent draw of those parts is added to
the chip's own.

On the C3 the regulator is the whole story. Its **XC6210 has a quiescent current of roughly 35 µA**,
drawn continuously whatever the processor is doing. Add that to a sleeping chip and you land at the
measured 45 µA. Users have reported
[115 µA and around 230 µA](https://forum.seeedstudio.com/t/xiao-esp32c3-high-power-consumption-and-weird-led-behavior/274859)
against a wiki figure of 43–44 µA, and one who
[desoldered the regulator and charger ICs measured about 11 µA](https://forum.seeedstudio.com/t/xiao-esp32-c3-and-esp32-s3-deep-sleep-current-high/284207)
— which confirms the diagnosis and isn't a practical fix for most people.

**The published figure and the bench figure describe different setups**, and that's the actionable
part. Seeed's [product page](https://www.seeed.cc/product/seeed-studio-xiao-esp32-series) quotes
roughly 15 µA for the C6, 44 µA for the C3 and 14 µA for the S3 Sense; the forum measurements show
those apply when power goes in at the battery pads. Both are accurate for the setup they describe,
so check which one your wiring matches before designing around a number.

## What to do

**Power from the battery pads** if low sleep current matters. This is the single change that moves
the number, and it is why the pads exist.

**Choose the S3 or C6 over the C3** for a sleeping sensor. The C3 is a fine board that's simply
carrying a regulator with meaningful quiescent draw, and no firmware change will fix that.

**Measure with something that can.** Many handheld meters can't resolve tens of microamps without
a burden voltage high enough to brown the board out, which presents as a dead board rather than a
measurement problem. If you don't have a profiler, treat the published figures as your estimate
rather than buying a meter that will mislead you.

**Check what is still attached.** Sensors on the I2C bus, an SD card, a pull-up on an LED — each
adds its own quiescent draw, and none of it appears in a board-level figure.

The sketch above uses `Nodrix.beginHTTP()` rather than the WebSocket path deliberately. Holding a
socket open costs a sleeping node far more than a short HTTP exchange on wake, so nodrix offers
both and `poll()` is the one that suits a device measured in microamps.

## Sleep current is rarely the thing that kills the battery

Worth doing the arithmetic before optimising the wrong term.

A node sleeping at 12 µA for an hour uses about 12 µAh. The same node awake for eight seconds at
120 mA — associating with Wi-Fi, resolving DNS, negotiating TLS, posting, closing — uses roughly
267 µAh. The wake period costs more than twenty times the entire hour of sleep.

The consequences are ordered differently from how people usually optimise:

- **Association time dominates.** A static IP, a stored channel and BSSID, and skipping DHCP can
  turn an eight-second wake into two. That's worth more than any sleep-current change.
- **TLS handshakes are expensive.** Session reuse, or batching several readings into one
  connection, saves more than the regulator ever will.
- **Reporting interval is the biggest lever of all**, and the one people are most reluctant to touch.

Sleep current only becomes the dominant term when the device sleeps for a very long time between
short wakes. For a sensor reporting every few minutes, the radio is the budget.

## Reporting the power picture

A sleeping node should use the HTTP path rather than holding a socket open: `beginHTTP` then
`poll()` on wake, then straight back to sleep.

```cpp
#include <Nodrix.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

#define SLEEP_SECONDS 300
#define BATT_PIN      A0        // external divider: C3 and S3 have no sense pin

void setup() {
  uint32_t wokeAt = millis();

  Nodrix.beginHTTP(WIFI_SSID, WIFI_PASS, HOST, TOKEN);

  Nodrix.send("temperature", readSensor());
  Nodrix.send("battery_mv", (long)(analogReadMilliVolts(BATT_PIN) * 2));  // divider
  Nodrix.send("wake_ms", (long)(millis() - wokeAt));   // the real battery cost
  Nodrix.send("rssi", (int)WiFi.RSSI());               // rises before wake_ms does
  Nodrix.poll();

  esp_sleep_enable_timer_wakeup((uint64_t)SLEEP_SECONDS * 1000000ULL);
  esp_deep_sleep_start();       // power at the battery pads, or this is moot
}

void loop() {}                  // never reached
```

## Measuring it in place

The uncomfortable part of power work is that the bench number and the deployed number diverge.
Signal is worse in the real location, so association takes longer. Cold mornings change both cell
capacity and regulator behaviour. A sensor that worked fine in July starts missing reports in
January, and by then the cause is weeks in the past.

Reporting battery voltage and wake duration alongside your readings turns that into something you
can see. A slow decline in cell voltage across weeks, next to a wake duration that grows as the
signal degrades, tells you which term actually changed — and whether the fix is a bigger battery, a
better aerial or a longer interval.

The short version: power at the battery pads, prefer the S3 or C6 if the node sleeps, and don't
spend a weekend chasing microamps before you've measured how long the board stays awake.
