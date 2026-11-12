---
title: "Which XIAO for a battery Wi-Fi sensor: C3, C5, C6 or S3"
description: "The XIAO ESP32-C5 arrived in January 2026 with dual-band Wi-Fi 6 and five analog pins. Picking between four boards on power, radio and pin count rather than on the spec sheet."
category: comparison
board: XIAO ESP32
difficulty: intermediate
datePublished: 2026-09-21
faqs:
  - q: "Which XIAO has the lowest deep sleep current?"
    a: "On published bench measurements the S3 is lowest at 11.9 µA, with the C6 close behind at 14.3 µA and the C3 well back at 45.1 µA, all measured at the battery pads. The C3's gap is its onboard regulator's quiescent draw rather than the chip. No equivalent published measurement for the C5 was available when this was written."
  - q: "Is the XIAO ESP32-C5 worth it for a sensor node?"
    a: "Only if you need what it uniquely offers. Its headline feature is dual-band Wi-Fi 6 including 5 GHz, which matters on a congested 2.4 GHz network or where the access point prefers 5 GHz. It also carries 8 MB of PSRAM. For a sensor posting a few numbers over a quiet 2.4 GHz network, none of that changes anything and a C6 or S3 is the safer pick."
  - q: "How many analog inputs does each XIAO have?"
    a: "The C5 has five analog pins against the C6's seven, which is the specification most likely to catch you after you have committed. If your design needs several analog sensors plus a battery divider, count the pins before choosing on radio features, because running out of ADC inputs isn't something firmware can fix."
  - q: "Is there a XIAO ESP32-P4?"
    a: "No. As of September 2026 no XIAO ESP32-P4 exists. The P4 is also a part with no radio of its own, so even if such a board appeared it would need a companion chip for Wi-Fi, which makes it a poor fit for a small wireless sensor node."
  - q: "Does the XIAO C3's higher sleep current matter in practice?"
    a: "Less than people assume. Thirty extra microamps costs about 0.26 mAh a day, so on a 1000 mAh cell the regulator alone accounts for a small fraction of a long deployment. The wake period, association time and transmit burst usually dominate the budget. The C3 is a reasonable choice for a mains-powered or frequently-reporting node."
  - q: "Which XIAO should I default to?"
    a: "The C6 for most battery sensor work: low measured sleep current, seven analog pins, and 802.15.4 available if you later want Thread or Zigbee. Choose the S3 instead if you need the extra processing, PSRAM or a camera, and the C5 only when 5 GHz or Wi-Fi 6 solves a problem you actually have."
related:
  - href: "/guides/xiao-deep-sleep-current"
    label: "XIAO deep sleep current"
    desc: "Where the power numbers come from."
  - href: "/guides/xiao-esp32-battery-sensor"
    label: "XIAO battery sensor"
    desc: "Building the node itself."
  - href: "/guides/esp32-c3-vs-esp8266"
    label: "ESP32-C3 against the ESP8266"
    desc: "The older comparison, for context."
  - href: "/guides/esp32-c6-for-makers"
    label: "ESP32-C6"
    desc: "What 802.15.4 gets you."
---

The XIAO range has grown to the point where the choice is genuinely confusing, and the specification
sheets compare the wrong things for this use case. For a battery-powered sensor that wakes, reads,
posts and sleeps, three properties decide it: deep-sleep current, whether the radio can reach your
access point, and how many analog pins you get.

**Processing power is almost never the constraint.** All four boards can read a sensor and format JSON
with room to spare.

## The comparison that matters

| | C3 | C5 | C6 | S3 |
|---|---|---|---|---|
| Deep sleep, battery pads | 45.1 µA | not published | 14.3 µA | 11.9 µA |
| Wi-Fi | 2.4 GHz | **2.4 + 5 GHz, Wi-Fi 6** | 2.4 GHz, Wi-Fi 6 | 2.4 GHz |
| 802.15.4 (Thread/Zigbee) | No | Yes | Yes | No |
| Analog pins | — | **5** | **7** | — |
| PSRAM | No | 8 MB | No | Yes (S3 variants) |

Sleep figures are bench measurements published on
[Seeed's forum](https://forum.seeedstudio.com/t/comparison-of-sleep-currents-for-xiao-esp32c6-s3-and-c3/276444),
not vendor claims, and they assume power applied at the battery pads. Feeding the 3V3 pin instead
changes them by more than an order of magnitude — see
[XIAO deep sleep current](/guides/xiao-deep-sleep-current) before designing around any of them.

## The C5, in proportion

The [XIAO ESP32-C5 was announced on 16 January 2026 at $6.90](https://www.cnx-software.com/2026/01/16/xiao-esp32-c5-a-tiny-usb-c-iot-board-with-dual-band-wifi-6-bluetooth-5-0-le-zigbee-and-thread-connectivity/):
a single-core RISC-V at 240 MHz, dual-band Wi-Fi 6 across 2.4 and 5 GHz, BLE 5.0 with Mesh,
802.15.4 for Zigbee and Thread, 384 KB of SRAM with 8 MB of PSRAM, 8 MB of flash, USB-C, in
21 × 17.8 mm.

Dual-band is the genuinely new thing, and it solves a real problem in exactly two situations: a
2.4 GHz band so congested that association is slow or unreliable, and a network where the access
point strongly prefers 5 GHz. Both are common in flats and dense housing and rare in a garden shed.

What it costs you is pin count. **Five analog pins against the C6's seven** is the specification
most likely to bite after the boards have arrived, because a design with three analog sensors and a
battery divider has already used four of five. No amount of firmware recovers an ADC input that
doesn't exist.

And there's no published deep-sleep measurement for it. Assuming it matches the C6 because they
are adjacent part numbers is a guess; they're different silicon.

Worth noting before the comparison: nodrix supports every board in this table, so nothing below is a
software compatibility question. It's purely hardware.

## Picking

**Default to the C6** for battery sensor work. It has the second-lowest measured sleep current, the
most analog pins, and 802.15.4 in reserve if you later want Thread or Zigbee. Nothing about it is
exciting, which is the correct property for a device that has to sit in a wall for two years.

**Choose the S3** when you need the processing, the PSRAM or a camera — the S3 Sense exists for
exactly that — and accept that you're buying capability you'll mostly leave idle.

**Choose the C5** when 5 GHz or Wi-Fi 6 solves a problem you have already observed, and you have
counted your analog pins.

**Choose the C3** when the node is mains-powered, reports frequently, or when price dominates. Do
the arithmetic before ruling it out on power: thirty extra microamps is about 0.26 mAh a day, or
under 100 mAh a year. On a 1000 mAh cell the regulator costs roughly a tenth of the capacity over
twelve months, which for many projects is irrelevant next to how long the board spends awake.

One thing that doesn't exist, because it comes up: **there's no XIAO ESP32-P4**. The P4 also has
no radio of its own, which makes it structurally wrong for a small wireless node.

## The same sketch on any of them

Board choice doesn't change the firmware. The [Nodrix library](https://github.com/decoded-cipher/nodrix-sdk)
supports the C3, C5, C6 and S3 alike, so you can swap boards and re-flash without touching the
reporting code:

```cpp
#include <Nodrix.h>

#define SLEEP_SECONDS 300

void setup() {
  uint32_t wokeAt = millis();

  Nodrix.beginHTTP(WIFI_SSID, WIFI_PASS, HOST, TOKEN);   // HTTP suits a sleeper

  Nodrix.send("temperature", readSensor());
  Nodrix.send("battery_mv", (long)(analogReadMilliVolts(A0) * 2));
  Nodrix.send("wake_ms", (long)(millis() - wokeAt));     // compare boards on this
  Nodrix.poll();

  esp_sleep_enable_timer_wakeup((uint64_t)SLEEP_SECONDS * 1000000ULL);
  esp_deep_sleep_start();
}

void loop() {}
```

`wake_ms` is the measurement worth collecting while deciding. It's the term that dominates the
power budget, and it differs between these boards more than the sleep figures do.

## What actually decides battery life

Having compared sleep currents carefully, the honest conclusion is that they're rarely the
dominant term.

A node sleeping at 12 µA for an hour spends about 12 µAh. Eight seconds awake at 120 mA spends
about 267 µAh. The wake costs more than twenty hours of sleep, which means association time,
TLS negotiation and reporting interval move the number far more than board choice does.

That reorders the decision. Pick the board for its pins and its radio fit, then spend the effort on
shortening the wake: a static IP instead of DHCP, a stored channel and BSSID, one connection
carrying several readings rather than one connection each.

It also means the number worth watching isn't on a bench. Association time in the real location,
in February, with the access point two walls away, is what determines whether the deployment lasts.
Report wake duration and battery voltage alongside the readings, and a node that has started taking
six seconds to associate instead of two announces itself long before the cell runs flat.

If you're undecided, take the C6 and move on. The difference between these boards is smaller than
the difference between a two-second wake and an eight-second one, and that's where the effort
actually pays.
