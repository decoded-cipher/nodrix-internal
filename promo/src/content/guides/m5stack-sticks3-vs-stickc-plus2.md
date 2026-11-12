---
title: "M5Stack StickS3 vs StickC Plus2: should you buy the EOL one"
description: "M5Stack retired the StickC Plus2 in favour of the StickS3 in January 2026. The real differences are the audio path and the GPIO header, and clearance stock makes this a live decision."
category: comparison
board: M5Stack
difficulty: beginner
datePublished: 2026-09-21
faqs:
  - q: "Is the M5StickC Plus2 discontinued?"
    a: "Yes. M5Stack's own store marks it End of Life and directs buyers to the StickS3 instead. It still works, is still documented, and existing projects are unaffected, but it won't be restocked. That makes remaining stock a clearance decision rather than a product choice."
  - q: "What is the real difference between the StickS3 and the StickC Plus2?"
    a: "Three things that matter. The StickS3 moves from an ESP32-PICO-V3-02 to an ESP32-S3-PICO-1-N8R8. It replaces the buzzer with a proper speaker driven by an ES8311 audio codec, alongside a microphone, which turns it from a device that can beep into one that can play and capture audio. And it adds a 16-pin GPIO header where the older board exposed only the four-pin Grove connector."
  - q: "Is the StickS3 worth the extra money?"
    a: "At list prices the gap is about a dollar and a half, which makes the question almost academic if both are available. The StickS3 is the better board on every axis that changed and is the one that will keep receiving accessories. Buy the older one only if clearance pricing is steep and you need neither audio nor the extra pins."
  - q: "Does the StickS3 have a bigger battery?"
    a: "Slightly. It carries 250 mAh against the StickC Plus2's 200 mAh. That's a modest improvement and neither is a device for long battery deployments — the display and the always-on design dominate the power budget. For anything running unattended for weeks, a bare module without a screen is the right tool."
  - q: "Will my StickC Plus2 code run on the StickS3?"
    a: "Not unchanged. The move from an Xtensa ESP32 to an ESP32-S3 means rebuilding for a different target, and the audio hardware is entirely different, so any buzzer code needs rewriting for the codec. Library support through M5Unified smooths much of it, but treat it as a port rather than a recompile."
  - q: "Should I use either as a permanent sensor node?"
    a: "They are better as handheld and interactive devices than as fixed sensors. You're paying for a display, a battery and a case that a permanent installation doesn't need, and the display is the largest ongoing power draw. For a node that sits in a cupboard reporting a number, a bare board costs less and lasts longer."
related:
  - href: "/guides/m5stack-ezdata-history"
    label: "M5Stack EzData limits"
    desc: "Where the readings go, and the 500-entry ceiling."
  - href: "/guides/esp32-s3-edge-ai"
    label: "ESP32-S3"
    desc: "What the newer silicon is good at."
  - href: "/guides/open-source-iot-dashboard"
    label: "Open-source dashboards"
    desc: "Options for telemetry you control."
  - href: "/guides/esp32-deep-sleep-battery"
    label: "Battery life"
    desc: "Why a screen changes the power budget."
---

**M5Stack created this comparison itself.** On 23 January 2026 it launched the StickS3, and its own
store now marks the
[M5StickC PLUS2 as End of Life](https://shop.m5stack.com/products/m5stickc-plus2-esp32-mini-iot-development-kit)
with the note "Please order the new version: M5StickS3 ESP32S3 Mini IoT Dev Kit".

That makes this a live buying decision rather than an academic one, and a temporary one: it lasts
as long as clearance stock does.

## What actually changed

| | StickC Plus2 (EOL) | StickS3 |
|---|---|---|
| MCU | ESP32-PICO-V3-02, dual-core to 240 MHz | ESP32-S3-PICO-1-N8R8 |
| Memory | 8 MB flash, 2 MB PSRAM | 8 MB flash, 8 MB PSRAM |
| Display | 1.14" TFT, 135 × 240, ST7789v2 | 1.14" colour |
| Audio out | Buzzer | **Speaker via ES8311 codec** |
| Audio in | SPM1423 microphone | Microphone |
| Battery | 200 mAh | 250 mAh |
| Expansion | HY2.0-4P Grove (I2C, I/O, UART) | 4-pin Grove + **16-pin GPIO header** |
| USB | USB-C | USB-C OTG |
| List price | $19.95 | $21.50 |

Sources: M5Stack's
[StickC PLUS2 product page](https://shop.m5stack.com/products/m5stickc-plus2-esp32-mini-iot-development-kit)
and [CNX Software's StickS3 coverage](https://www.cnx-software.com/2026/01/23/m5stack-sticks3-esp32-s3-mini-iot-dev-kit-features-1-14-inch-color-display-speaker-and-mic-for-voice-interaction/),
checked 21 September 2026.

## The two differences that decide it

**Audio.** This is the upgrade that changes what the device is for. A buzzer makes a noise; a
speaker driven by a dedicated codec, with a microphone alongside, makes voice interaction possible.
If you had any intention of building something that talks or listens, the older board was never
going to do it and the newer one is built around the idea.

**The 16-pin GPIO header.** The StickC Plus2 exposed its expansion through the four-pin Grove
connector, which is I2C, I/O and UART and perfectly adequate until you need a handful of plain
pins. The header on the StickS3 removes a class of "I need one more pin" problems that previously
meant abandoning the form factor entirely.

**Everything else is incremental.** A 25% battery increase on a device with an always-on display isn't
transformative. The display is nominally the same size and resolution. The PSRAM increase matters
for audio buffers and graphics, and for little else at this scale.

## Should you buy the EOL board

There's a real case for it, and it depends almost entirely on the discount.

At list prices the gap is $1.55, so if both are in stock the question doesn't arise — take the
newer one. Clearance changes that. If a StickC Plus2 turns up substantially reduced and you need
neither audio nor the extra pins, it remains a capable device with mature library support and
years of worked examples behind it.

What you're accepting:

- No restocks, so a second unit later may not be available at any price.
- Accessories will follow the new board. M5Stack shipped a Display module specifically for the
  StickS3 in September 2026, and that pattern will continue.
- Community examples will gradually shift to the S3 target.

None of that affects a device already working on your desk. It affects a design you intend to build
more than one of.

Both boards run the [nodrix library](https://github.com/decoded-cipher/nodrix-sdk) unchanged, so the
choice between them doesn't lock you into either one's software story.

## Neither is a sensor node

Worth saying, because both get bought for that job and both are slightly wrong for it.

You're paying for a display, a battery, a case and a button. A permanent installation reporting a
temperature uses none of those, and the display is the single largest continuous draw. A bare
module without a screen costs less, runs longer and fits in a smaller enclosure.

Where the Stick form factor genuinely wins is anything a person picks up and interacts with: a
handheld reader, a portable diagnostic tool, a desk device that shows a number and takes a button
press, and now with the StickS3 anything involving speech. Those are real jobs and the hardware is
well suited to them.

## The same code runs on both

Both are ESP32 boards, so the [Nodrix library](https://github.com/decoded-cipher/nodrix-sdk) runs on
either and the port between them is a rebuild rather than a rewrite:

```cpp
#include <Nodrix.h>
#include <M5Unified.h>

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();
  M5.update();

  static unsigned long last = 0;
  if (millis() - last < 60000) return;
  last = millis();

  Nodrix.send("battery_pct", M5.Power.getBatteryLevel());
  Nodrix.send("uptime_s", (long)(millis() / 1000));

  M5.Display.setCursor(0, 0);
  M5.Display.print(Nodrix.connected() ? "online " : "offline");
}
```

## Getting readings off it

Whichever you buy, the built-in route to storing data is EzData, and it has a specific ceiling worth
knowing before you rely on it: 500 entries per field, which is under nine hours at one-minute
sampling, plus a six-month inactivity clear. The detail is in
[M5Stack EzData stores 500 readings](/guides/m5stack-ezdata-history).

For anything you intend to look back at, posting to a deployment you control is a smaller change
than it sounds — the device already speaks HTTP, and the retention question stops being someone
else's decision. Worth settling before you buy either board, because M5Stack will keep rotating the
hardware underneath you either way.
