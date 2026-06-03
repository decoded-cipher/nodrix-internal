---
title: "ESP32 battery life: deep sleep + cloud telemetry that lasts months"
description: "Make a battery-powered ESP32 sensor run for months while still reporting to the cloud. Deep sleep structure, RTC-memory Wi-Fi caching, and a real power budget."
category: hardware
board: ESP32
difficulty: intermediate
readingTime: "10 min read"
datePublished: 2026-06-03
draft: true
faqs:
  - q: "How long can an ESP32 run on a battery while sending data?"
    a: "With deep sleep between readings, a single 18650 cell can last months — a roughly 3-second wake every 15 minutes spends almost all its time drawing microamps, not the ~150 mA of an active Wi-Fi radio."
related:
  - href: "/guides/esp32-https-cloud/"
    label: "Connect an ESP32 over HTTPS"
    desc: "The telemetry and control loop this build sleeps between."
  - href: "/docs"
    label: "Device protocol"
    desc: "The telemetry endpoint your sensor wakes to call."
---

> **Draft — fuller guide coming soon.** Here's the short version while we finish it.

Battery life on the ESP32 is mostly a Wi-Fi problem. The radio dominates the power budget, so
the whole game is: stay asleep, wake briefly, connect *fast*, send, and sleep again. Because
deep sleep wipes RAM and re-runs `setup()` on each wake, anything that must survive goes in RTC
memory with `RTC_DATA_ATTR`.

The highest-leverage trick is caching the Wi-Fi BSSID and channel so reconnects skip the scan:

```cpp
RTC_DATA_ATTR bool rtcValid = false;
RTC_DATA_ATTR uint8_t rtcBssid[6];
RTC_DATA_ATTR int32_t rtcChannel;

if (rtcValid) WiFi.begin(WIFI_SSID, WIFI_PASS, rtcChannel, rtcBssid, true);
else          WiFi.begin(WIFI_SSID, WIFI_PASS);
// ...on success: save WiFi.BSSID() + WiFi.channel() into RTC, then deep sleep on a timer.
```

The full guide will work through a real power budget (active vs sleep current, cycle math), a
complete sketch, static IP to shave another second off association, sensor warm-up timing, and
the GPIO strapping-pin traps that quietly break deep-sleep boards.
