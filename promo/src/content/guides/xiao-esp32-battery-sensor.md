---
title: "Seeed XIAO ESP32 to the cloud: a thumbnail-sized battery sensor"
description: "Build a battery-powered wireless sensor on a Seeed XIAO ESP32C3 that reports to your own cloud dashboard — with the antenna trap that stops most first attempts and the regulator detail that decides whether it runs for weeks or months."
category: hardware
board: XIAO ESP32C3
difficulty: intermediate
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "My XIAO ESP32C3 won't connect to Wi-Fi at all. What's wrong?"
    a: "Almost certainly the antenna. Unlike most ESP32 boards, the XIAO ESP32C3 has no onboard ceramic antenna — the space went to making the board 21 mm long — so it ships with a small external antenna that plugs into a u.FL connector next to the USB port. Without it attached, the radio is effectively deaf. It's the single most common first-hour problem with this board, and it looks exactly like a credentials bug."
  - q: "Why is my deep sleep current so much higher than the ESP32 datasheet says?"
    a: "Because you're measuring the board, not the chip. The XIAO C3's 3.3V regulator alone has a quiescent draw around 35 µA, which dominates the sleep budget and has nothing to do with the ESP32-C3. Powering the board through its 3V3 pin instead of the battery pads bypasses that regulator and drops sleep current dramatically — reported figures fall from a couple of hundred microamps to around ten."
  - q: "Which XIAO should I use for a battery sensor?"
    a: "The C3 or the C6 for a plain sensor; not the S3 unless you need its compute. Sleep current differs substantially across the family — the C6 has been measured around 15 µA on a basic sleep example, while the S3 is markedly thirstier. The S3 earns its power budget when you're running a camera or inference, and wastes it when you're reading a temperature."
  - q: "How do I charge a battery on a XIAO?"
    a: "Solder a LiPo cell to the BAT pads on the underside and the onboard charger handles it whenever USB is connected. That integration is the main reason to choose a XIAO over a DevKit for portable work — a DevKit needs an external charging module, and the XIAO doesn't."
  - q: "Can I use a XIAO in a finished product?"
    a: "That's what the castellated edges are for. The board can be reflowed onto a carrier PCB like a surface-mount module rather than sitting in headers, which makes the same part you prototyped with the part you ship. It's an unusually production-friendly design for something aimed at makers."
related:
  - href: "/guides/esp32-deep-sleep-battery"
    label: "ESP32 battery life"
    desc: "The power budget behind this build, in depth."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The protocol foundation this uses."
  - href: "/guides/esp32-s3-edge-ai"
    label: "ESP32-S3 edge AI"
    desc: "When the S3's power budget is worth spending."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The dashboard this reports to."
---

A standard ESP32 DevKit is a fine thing on a bench and an awkward thing in an enclosure. It's long,
it wants a separate charging module for battery work, and it sits in headers rather than on a board.

The Seeed XIAO family solves the physical problem. A XIAO ESP32C3 is **21 × 17.5 mm** — smaller than
a postage stamp — with LiPo charging built in and castellated edges so the prototype and the
production part can be the same component. This guide builds a battery sensor on one, and covers the
two things about these boards that aren't in the marketing.

## First: the antenna trap

Start here, because it stops more first attempts than anything else.

**The XIAO ESP32C3 has no onboard antenna.** Most ESP32 boards have a ceramic chip antenna or a PCB
trace antenna; the C3 XIAO gave up that space to be 21 mm long. Instead it ships with a small
external antenna that clips onto a **u.FL connector** beside the USB port.

Without that antenna attached, the board powers up, runs your sketch, and never connects to anything.
The symptom is indistinguishable from a wrong password, so people spend an hour checking credentials
before noticing the tiny connector.

Attach it, and the trade turns out to be a good one — an external antenna genuinely outperforms an
onboard trace, with usable range well beyond what a DevKit manages.

Not every XIAO is the same here. The C6, for instance, has both an onboard antenna and an external
connector with a switch between them, so check your specific board rather than assuming.

## Second: the sleep current is the board's, not the chip's

This is the detail that decides whether your sensor runs for weeks or months, and it's absent from
almost every XIAO tutorial.

You'll read that an ESP32-C3 sleeps at a handful of microamps. That's the *chip*. The *board* has a
3.3V regulator, and on the XIAO C3 that part has a quiescent current of roughly **35 µA** all by
itself — an order of magnitude more than the sleeping processor, drawn continuously whether your
firmware is clever or not.

The consequence is a real design decision:

- **Powered through the battery pads**, current flows through the regulator, and measured sleep
  figures land in the hundreds of microamps.
- **Powered directly through the 3V3 pin**, the regulator is bypassed, and reported sleep current
  drops to around **11 µA**.

For a sensor that spends 99.9% of its life asleep, that difference is most of your battery life. If
you're running from a regulated source anyway, feed 3V3 directly. If you want the onboard charger's
convenience, accept the regulator's draw and size the cell for it.

Choice of chip matters too. The C6 has been measured around 15 µA sleeping on a basic example, while
the S3 is considerably thirstier — worth its power budget when running a camera or a model, wasteful
when reading a thermometer.

## What you'll need

- A **Seeed XIAO ESP32C3** and its **u.FL antenna** (do not lose it).
- A **LiPo cell** for the BAT pads on the underside.
- Any I2C sensor — a [BME280](/guides/esp32-weather-station) is a good default.
- The **Nodrix** Arduino library.
- A **nodrix instance** with a project and a project token.

## The firmware

A battery sensor shouldn't hold a socket open. The library's HTTP mode exists for exactly this: wake,
connect, send, check for pending commands once, and sleep — with no persistent connection to
maintain, unlike [the always-on WebSocket build](/guides/esp32-https-cloud) a mains-powered board
would use.

```cpp
#include <Nodrix.h>
#include <Wire.h>
#include <Adafruit_BME280.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

const uint64_t SLEEP_US = 15ULL * 60 * 1000000;   // 15 minutes

Adafruit_BME280 bme;

RTC_DATA_ATTR int bootCount = 0;                  // survives deep sleep

void setup() {
  bootCount++;

  Wire.begin();
  bme.begin(0x76);

  // HTTP mode: no persistent socket, built for wake-report-sleep.
  Nodrix.beginHTTP(WIFI_SSID, WIFI_PASS, HOST, TOKEN);

  Nodrix.send("temperature", bme.readTemperature());
  Nodrix.send("humidity",    bme.readHumidity());
  Nodrix.send("pressure",    bme.readPressure() / 100.0F);
  Nodrix.send("boot_count",  bootCount);
  Nodrix.flush();                                 // push before sleeping

  Nodrix.poll();                                  // one downlink check

  esp_deep_sleep(SLEEP_US);
}

void loop() { }
```

`Nodrix.flush()` before sleeping is the line people forget. Sends are queued, and `esp_deep_sleep`
cuts power to the radio without warning — skip the flush and your readings die in a buffer rather
than reaching the dashboard.

`boot_count` is worth sending on any sleeping device. It costs nothing and it's the fastest way to
spot a board that's rebooting more often than it should, which is what a brownout on a tired battery
looks like from the outside.

## Build the dashboard

The three sensor variables appear on first sight — drop **chart** widgets on temperature and
humidity, and a **value** widget on pressure.

Put `boot_count` on a **chart** rather than a value widget. As a rising line its slope is your wake
rate, and a slope that suddenly steepens means the board is resetting rather than sleeping through
its interval. That's a fault you'd otherwise never notice.

## Going further

The castellated edges mean this board can be reflowed straight onto a carrier PCB, so the thing you
prototyped is the thing you produce. For a sensor you want several of, designing a small carrier with
the XIAO as a module beats building the ESP32 circuit yourself.

To report battery level, add a divider from the cell to an analog pin and send the voltage as another
variable. Check your specific XIAO's wiki first — the family differs on whether a divider is already
fitted and which pin it lands on, and assuming the wrong one gives you a confidently wrong reading.

For a sensor somewhere cold or distant, the [deep sleep guide](/guides/esp32-deep-sleep-battery)
covers the power budget properly, including the wake-time costs that dominate once sleep current is
handled.

## Notes

`RTC_DATA_ATTR` is what lets `bootCount` survive. Deep sleep is a genuine reboot, so ordinary globals
reset every cycle and only RTC memory persists.

Wake time matters more than sleep current once the regulator question is settled. Every wake spends
several seconds with the radio on at tens of milliamps, which dwarfs microamps of sleep — halving
your reporting frequency saves far more than any firmware tweak.

The XIAO's small size means fewer GPIOs: eleven on the C3, against thirty-plus on a DevKit. For a
sensor on an I2C bus that's ample; for a project driving many pins, it's the constraint that sends
you back to a larger board.
