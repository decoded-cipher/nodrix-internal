---
title: "Arduino-ESP32 3.x removed functions: the lookup table"
description: "Every function removed or renamed between Arduino-ESP32 2.x and 3.x, alphabetically, with its replacement. Paste your compiler error, find the line to change."
category: concept
board: ESP32
difficulty: intermediate
datePublished: 2026-09-21
faqs:
  - q: "What does 'wasn't declared in this scope' mean on an ESP32 sketch that used to work?"
    a: "It almost always means the function was removed in the 3.x core rather than that something is wrong with your includes. Arduino-ESP32 3.x rebuilt the peripheral APIs on top of a newer ESP-IDF and deleted the old entry points instead of keeping compatibility shims. Look the name up in the table below and change the call."
  - q: "Why did the LEDC, RMT and SigmaDelta APIs all change at once?"
    a: "They share one design change: the peripherals are now addressed by pin rather than by channel. Previously you allocated a channel, bound a pin to it and then wrote to the channel. Now you pass the pin and the core manages channel allocation, which is why the channel argument disappears from every function in all three APIs simultaneously."
  - q: "Was hallRead removed permanently?"
    a: "Yes. The hall sensor is no longer supported and there's no replacement function. Code depending on it needs an external sensor. This is the only entry in the migration with no forward path at all."
  - q: "Do I need to change anything if my sketch still compiles?"
    a: "Possibly. Two changes are silent. The default UART pins moved on ESP32 and ESP32-S2, so a Serial1 or Serial2 that relied on defaults now talks to different pins with no warning. And the BLE API moved from std::string to Arduino String, which can change behaviour rather than fail outright. Both compile cleanly and misbehave at runtime."
  - q: "Can I keep using the 2.x core instead?"
    a: "Yes, by pinning the version in the Arduino IDE boards manager or in platformio.ini, and that's the sensible choice mid-project. It's a deferral rather than a solution: the newer chips including ESP32-C6 and ESP32-C5 are only supported on 3.x, so anything involving new silicon forces the migration."
  - q: "Where is the authoritative list?"
    a: "Espressif publishes the migration guide for the Arduino core, and it is the source this page is built from. This table reorganises it by the symbol you're likely to have pasted into a search box, which is a different access pattern from reading the guide top to bottom."
related:
  - href: "/guides/esp32-wont-compile-2026"
    label: "ESP32 sketch won't compile in 2026"
    desc: "Which migration you have hit, and a worked example."
  - href: "/guides/esp32-c6-for-makers"
    label: "ESP32-C6"
    desc: "The silicon that requires the 3.x core."
  - href: "/guides/esp32-ota-updates"
    label: "OTA updates"
    desc: "Rolling migrated firmware out to deployed boards."
  - href: "/guides/esp32-keeps-restarting"
    label: "Reading the reset reason"
    desc: "When the migrated build compiles but doesn't run."
---

**This is a lookup page.** If a build failed on a name, find the name.

Everything here comes from Espressif's own
[migration guide for Arduino-ESP32 2.x to 3.x](https://docs.espressif.com/projects/arduino-esp32/en/latest/migration_guides/2.x_to_3.0.html),
reorganised by symbol rather than by chapter. For working out *which* migration you have hit in the
first place, and for a before-and-after example, see
[ESP32 sketch won't compile in 2026](/guides/esp32-wont-compile-2026).

## The one idea behind most of it

LEDC, RMT and SigmaDelta all changed the same way: **hardware is addressed by pin, not by channel**.

In 2.x you allocated a channel, attached a pin to it, and wrote to the channel number. In 3.x you
pass the pin and the core handles channel allocation internally. That single decision accounts for
most of the renamed functions and for every signature that lost a `channel` argument.

**If you remember only that, most of the table below is predictable.**

## LEDC

| Removed or renamed | Replacement |
|---|---|
| `ledcSetup(channel, freq, resolution)` | `ledcAttach(pin, freq, resolution)` |
| `ledcAttachPin(pin, channel)` | merged into `ledcAttach` |
| `ledcDetachPin(pin)` | `ledcDetach(pin)` |
| `ledcWrite(channel, duty)` | `ledcWrite(pin, duty)` |

New in 3.x with no 2.x equivalent: `ledcOutputInvert`, `ledcFade`, `ledcFadeWithInterrupt`,
`ledcFadeWithInterruptArg`. The full [LEDC API reference](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/ledc.html)
carries the current signatures.

## Timer

| Removed | Replacement |
|---|---|
| `timerBegin(num, divider, countUp)` | `timerBegin(frequency)` — one argument |
| `timerAttachInterrupt(timer, fn, edge)` | `timerAttachInterrupt(timer, fn)` — no edge |
| `timerAlarmWrite(timer, count, autoreload)` | `timerAlarm(timer, count, autoreload, reloadCount)` |
| `timerAlarmEnable`, `timerAlarmDisable` | folded into `timerAlarm` |
| `timerAlarmEnabled`, `timerAlarmRead` | removed |
| `timerAlarmReadMicros`, `timerAlarmReadSeconds` | removed |
| `timerSetDivider`, `timerGetDivider` | removed — set frequency in `timerBegin` |
| `timerSetConfig`, `timerGetConfig` | removed |
| `timerSetCountUp`, `timerGetCountUp` | removed |
| `timerSetAutoReload`, `timerGetAutoReload` | removed |
| `timerAttachInterruptFlag` | removed |

New in 3.x: `timerGetFrequency`, `timerAttachInterruptArg`.

## RMT

| Removed or renamed | Replacement |
|---|---|
| `rmtSetTick` | set frequency via `rmtInit(pin, direction, memsize, frequency_Hz)` |
| `rmtWriteBlocking` | `rmtWrite` is now blocking and takes a timeout |
| `rmtLoop` | `rmtWriteLooping` |
| `rmtSetRxThreshold` | `rmtSetRxMaxThreshold` |
| `rmtBeginReceive`, `rmtReadData` | removed |
| `rmtEnd`, `_rmtDumpStatus` | removed |

Signature changes worth noting: `rmtInit` now returns `bool`, takes an `rmt_ch_dir_t` direction
where it used to take `bool tx_not_rx`, and gained a `frequency_Hz` parameter. Parameters that were
`rmt_obj_t*` became `int pin`. `rmtSetCarrier` changed from `(low, high)` counts to
`(frequency_Hz, duty_percent)`.

New in 3.x: `rmtSetEOT`, `rmtWriteAsync`, `rmtTransmitCompleted`, `rmtSetRxMinThreshold`.

## SigmaDelta

| Removed or renamed | Replacement |
|---|---|
| `sigmaDeltaSetup(channel, freq)` | `sigmaDeltaAttach(pin, freq)` |
| `sigmaDeltaRead` | removed |
| `sigmaDeltaDetachPin` | `sigmaDeltaDetach` |

## ADC

| Removed | Replacement |
|---|---|
| `analogSetClockDiv` | removed |
| `adcAttachPin` | removed |
| `analogSetVRefPin` | removed |

If you're here because readings are wrong rather than because the build failed, the cause is
usually not the API change — see
[why your ESP32 analog readings are wrong](/guides/esp32-adc-accuracy).

## Hall sensor

| Removed | Replacement |
|---|---|
| `hallRead()` | none — the hall sensor is no longer supported |

This is the only entry with no forward path. Code that used it needs external hardware.

## I2S

Not a table. The I2S API was redesigned wholesale for the new ESP-IDF driver rather than adjusted
function by function, so existing I2S code needs rewriting against the
[current I2S documentation](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/i2s.html)
rather than symbol substitution.

## Wi-Fi and networking

| Changed | Detail |
|---|---|
| `WiFiServer::available()` | deprecated in favour of `accept()` |
| `WiFiServer` write functions | removed |
| `WiFiServer::stopAll()` | removed |
| `flush()` | no longer clears the receive buffer; use the new `clear()` |

The `flush()` change is the dangerous one, because it compiles and silently does something
different from what it did before.

One migration note that isn't in Espressif's guide: if you report `ESP.getSdkVersion()` as a
variable, a rebuild becomes observable across a fleet. The [nodrix library](https://github.com/decoded-cipher/nodrix-sdk)
exposes `setFirmwareVersion()` for naming the build and `Nodrix.send()` for the version string
itself, which is how you tell a board that took the update from one that quietly didn't.

## The changes that compile and then misbehave

Two things in this migration produce no compiler error at all.

**UART pin defaults moved.** On the ESP32, UART1 now defaults to GPIO26 and GPIO27, and UART2 to
GPIO4 and GPIO25. On the ESP32-S2, UART1 defaults to GPIO4 and GPIO5. If you called
`Serial1.begin()` without `setPins()` and relied on the old defaults, the build succeeds and the
peripheral talks to the wrong pins. There's a compensating improvement: `setPins()` may now be
called before `begin()`, passing `-1` for any pin you don't want to change, and `begin(baud)`
preserves pins you set earlier.

**BLE types changed.** Parameters and return values moved from `std::string` to Arduino `String`,
UUIDs became a `BLEUUID` class rather than a `uint16_t`, and `BLEScan::start()` and
`BLEScan::getResults()` now return `BLEScanResults*` rather than `BLEScanResults`. Depending on how
your code assigns between those types, this either fails to compile or converts differently from
before.

Also type-tightened, and easy to miss: `setHwFlowCtrlMode` now takes a `SerialHwFlowCtrl` rather
than a `uint8_t`, and `setMode` takes a `SerialMode`.

## After migrating

The build passing is the easy half. A migration that touches timer frequencies, PWM resolution and
UART pins changes runtime behaviour, and boards already deployed are the ones where that's
expensive to discover.

Report the core version from `ESP.getSdkVersion()`, the reset reason and uptime alongside your
normal readings, and a rollout becomes observable: version strings change, uptimes climb. A board
that took the update and then started resetting every few minutes is a different problem from one
that never took it, and it is worth being able to tell those apart without a serial cable.

The two silent changes above are the ones to check first if a migrated board compiles and then
misbehaves. Neither produces an error, and both look like a hardware fault until you remember the
defaults moved.
