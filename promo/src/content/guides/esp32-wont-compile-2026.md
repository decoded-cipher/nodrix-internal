---
title: "ESP32 sketch won't compile in 2026: the migration guide"
description: "ledcSetup, timerAlarmWrite and hallRead were removed in Arduino-ESP32 3.x, and ESP-IDF 6.0 moved Wi-Fi provisioning out of the framework. Find your error, find the replacement."
category: concept
board: ESP32
difficulty: intermediate
datePublished: 2026-09-21
faqs:
  - q: "Why did my ESP32 sketch suddenly stop compiling?"
    a: "Two separate migrations landed under most people's feet. Arduino-ESP32 3.x rebuilt its peripheral APIs on top of ESP-IDF 5.x and removed a long list of 2.x functions outright, so sketches that worked for years now fail with 'wasn't declared in this scope'. Separately, ESP-IDF 6.0 removed legacy drivers and turned compiler warnings into errors. Nothing is wrong with your code; the function you called no longer exists."
  - q: "What replaced ledcSetup in Arduino-ESP32 3.x?"
    a: "ledcSetup and ledcAttachPin were merged into a single ledcAttach call that takes the pin, frequency and resolution together. The whole LEDC API now addresses hardware by pin rather than by channel number, so the channel argument disappears from every call. ledcDetachPin was renamed to ledcDetach, and ledcWrite now takes the pin as its first argument."
  - q: "What replaced timerAlarmWrite and timerAlarmEnable?"
    a: "Both were removed along with most of the timer configuration API. timerBegin now takes a single frequency argument instead of a divider, timerAttachInterrupt dropped its edge parameter, and timerAlarmWrite plus timerAlarmEnable collapsed into one timerAlarm call that sets the count, the auto-reload flag and the reload count together."
  - q: "Why can't PlatformIO find Arduino-ESP32 3.x?"
    a: "The official espressif32 platform in PlatformIO has not tracked the 3.x releases, so a stock platformio.ini still resolves to the 2.0.x core. The community pioarduino fork packages the newer cores, and pointing the platform line at that fork is the usual route. This also matters for newer silicon, because the chips that only gained support in 3.x can't be targeted from the older core at all."
  - q: "Do I have to migrate, or can I pin the old version?"
    a: "Pinning works and is the right call mid-project. In the Arduino IDE the boards manager lets you install a specific 2.0.x core, and in PlatformIO you pin the platform version. It's a pause rather than a fix: new chips are only supported on the newer core, and security and toolchain fixes land there too, so the migration is deferred rather than avoided."
  - q: "What happened to wifi_provisioning in ESP-IDF 6.0?"
    a: "It was moved out of the framework and renamed. The functionality now lives in an external component called network_provisioning, installed through the component manager rather than being present by default. Code that included the old headers stops resolving, and the include paths and function prefixes both change."
related:
  - href: "/guides/esp32-wifi-provisioning"
    label: "Wi-Fi provisioning on ESP32"
    desc: "Getting credentials onto a board without hardcoding them."
  - href: "/guides/esp32-ota-updates"
    label: "OTA updates"
    desc: "Shipping the migrated firmware to boards already in the field."
  - href: "/guides/esp32-keeps-restarting"
    label: "ESP32 keeps restarting"
    desc: "When it compiles but doesn't survive a boot."
  - href: "/guides/esp32-c6-for-makers"
    label: "ESP32-C6"
    desc: "The silicon that needs the newer core."
---

If an ESP32 sketch that compiled last year now fails on a name it has always used, **nothing has rotted in your code**. Two unrelated migrations landed close together, and between them they removed
a large number of functions that tutorials, forum answers and older libraries still call. Both are
documented by Espressif: the [Arduino-ESP32 2.x to 3.x migration guide](https://docs.espressif.com/projects/arduino-esp32/en/latest/migration_guides/2.x_to_3.0.html)
and the [ESP-IDF v6.0 release announcement](https://developer.espressif.com/blog/2026/03/idf-v6-0-release/).

Work out which one you have hit, then use the tables below as a lookup.

## Which migration is this

| What you see | Which migration | Where to look |
|---|---|---|
| `error: 'ledcSetup' wasn't declared in this scope` | Arduino-ESP32 2.x → 3.x | The symbol tables below |
| `error: 'timerAlarmWrite' wasn't declared in this scope` | Arduino-ESP32 2.x → 3.x | The timer table |
| `error: 'hallRead' wasn't declared in this scope` | Arduino-ESP32 2.x → 3.x | Removed outright, no replacement |
| A library fails but your own code compiles | Library not yet ported | Update the library, or pin the core |
| `fatal error: wifi_provisioning/manager.h: No such file` | ESP-IDF 5.x → 6.0 | Provisioning moved out of the tree |
| Warnings now stop the build | ESP-IDF 5.x → 6.0 | Warnings are errors by default |
| Board not listed in PlatformIO | Platform frozen on the old core | The PlatformIO section |

**The Arduino side is the one most people hit**, because the Arduino IDE offers the core update as a
routine upgrade and gives no indication that it is a breaking one.

## The Arduino-ESP32 3.x symbol changes

The organising idea behind the [3.x peripheral APIs](https://docs.espressif.com/projects/arduino-esp32/en/latest/migration_guides/2.x_to_3.0.html)
is that hardware is addressed **by pin, not by channel**. LEDC, RMT and SigmaDelta all used to make you allocate a channel and bind a pin to it.
Now you pass the pin, and the core manages the channel. That single change is why so many
signatures moved at once.

### LEDC

| Removed in 3.x | Use instead |
|---|---|
| `ledcSetup(channel, freq, resolution)` | `ledcAttach(pin, freq, resolution)` |
| `ledcAttachPin(pin, channel)` | merged into `ledcAttach` |
| `ledcDetachPin(pin)` | `ledcDetach(pin)` |
| `ledcWrite(channel, duty)` | `ledcWrite(pin, duty)` |

`ledcFade`, `ledcOutputInvert` and the interrupt-driven fade calls are new in 3.x and have no 2.x
equivalent.

### Timer

| Removed in 3.x | Use instead |
|---|---|
| `timerBegin(num, divider, countUp)` | `timerBegin(frequency)` |
| `timerAttachInterrupt(timer, fn, edge)` | `timerAttachInterrupt(timer, fn)` |
| `timerAlarmWrite(timer, count, autoreload)` | `timerAlarm(timer, count, autoreload, reloadCount)` |
| `timerAlarmEnable` / `timerAlarmDisable` | folded into `timerAlarm` |
| `timerSetDivider`, `timerGetConfig`, `timerSetConfig` | removed, configure via `timerBegin` |

### RMT and SigmaDelta

| Removed in 3.x | Use instead |
|---|---|
| `rmtSetTick` | `rmtInit(pin, direction, memsize, frequency_Hz)` |
| `rmtWriteBlocking` | `rmtWrite` is now blocking, with a timeout argument |
| `rmtLoop` | `rmtWriteLooping` |
| `rmtSetRxThreshold` | `rmtSetRxMaxThreshold` |
| `sigmaDeltaSetup(channel, freq)` | `sigmaDeltaAttach(pin, freq)` |
| `sigmaDeltaDetachPin` | `sigmaDeltaDetach` |

`rmtInit` also changed its return type to `bool` and takes a direction enum where it used to take a
`bool tx_not_rx`.

### Removed with no replacement

`hallRead` is gone; the hall sensor is no longer supported. On the ADC side,
`analogSetClockDiv`, `adcAttachPin` and `analogSetVRefPin` were all removed. The I2S API was
redesigned wholesale rather than adjusted.

### The changes that compile fine and then misbehave

Two are worth knowing because the compiler won't warn you.

The default UART pins moved. On the ESP32, UART1 now defaults to GPIO26 and GPIO27, and UART2 to
GPIO4 and GPIO25. If you relied on the old defaults rather than calling `setPins`, the build
succeeds and the peripheral talks to the wrong pins.

On the BLE side, parameters and return values changed from `std::string` to Arduino `String`, and
UUIDs became a `BLEUUID` class rather than a `uint16_t`. Code that assigned between those types now
either fails to compile or silently converts differently than you expect.

## A worked migration

The three most common breakages in one place — a PWM output, a hardware timer and a serial port
with explicit pins:

```cpp
// The three most common breakages, migrated — and the version reporting
// that tells you the new build actually reached the boards.
//
// 2.x                                      3.x
// ledcSetup(0, 5000, 8);                   ledcAttach(LED_PIN, 5000, 8);
// ledcAttachPin(LED_PIN, 0);
// ledcWrite(0, 128);                       ledcWrite(LED_PIN, 128);
// timer = timerBegin(0, 80, true);         timer = timerBegin(1000000);
// timerAttachInterrupt(timer, &isr, true); timerAttachInterrupt(timer, &isr);
// timerAlarmWrite(timer, 1000000, true);   timerAlarm(timer, 1000000, true, 0);
// timerAlarmEnable(timer);
// Serial1.begin(9600);  // GPIO9/10       Serial1.setPins(RX_PIN, TX_PIN);

#include <Nodrix.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

#define LED_PIN 2
#define RX_PIN  16
#define TX_PIN  17

hw_timer_t *timer = nullptr;

void IRAM_ATTR isr() {
  // keep this short, or the task watchdog fires
}

void setup() {
  ledcAttach(LED_PIN, 5000, 8);        // pin, frequency, resolution bits
  ledcWrite(LED_PIN, 128);             // pin, not channel

  timer = timerBegin(1000000);         // 1 MHz tick
  timerAttachInterrupt(timer, &isr);
  timerAlarm(timer, 1000000, true, 0); // count, autoreload, reload count

  Serial1.setPins(RX_PIN, TX_PIN);     // defaults moved in 3.x
  Serial1.begin(9600);

  Nodrix.setFirmwareVersion("2.0.0-idf6");   // names this build
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();

  static unsigned long last = 0;
  if (millis() - last < 60000) return;
  last = millis();

  // The migration check: which core is running, and did it stay up.
  Nodrix.send("sdk_version", ESP.getSdkVersion());
  Nodrix.send("reset_reason", (int)esp_reset_reason());
  Nodrix.send("uptime_s", (long)(millis() / 1000));
}
```

The `getSdkVersion` and reset-reason line at the end isn't decoration. When a migration goes out to
boards you can't reach, the version string and the reset reason are the two facts that tell you
whether the new build actually took.

The reporting at the end of that sketch is the [nodrix library](https://github.com/decoded-cipher/nodrix-sdk)
doing the plumbing — WiFi, TLS and the telemetry protocol behind `Nodrix.begin()` and
`Nodrix.send()`. It's worth adding before you migrate rather than after, because
`setFirmwareVersion()` is what turns a fleet-wide rebuild into something you can watch land instead
of hope about. nodrix installs from the Arduino Library Manager and PlatformIO alike, so it
survives the platform change this guide is about.

## PlatformIO is a separate problem

The official `espressif32` platform didn't follow the 3.x core, so a stock `platformio.ini`
resolves to a 2.0.x Arduino core no matter what your code expects. The community **pioarduino**
fork packages the newer cores, and pointing the `platform` line at it is the usual route.

This isn't only a version-hygiene question. The newer chips — ESP32-C6, ESP32-C5 — are only
supported on the 3.x core, so on stock PlatformIO they aren't selectable at all. If your reason
for migrating is new silicon, the platform change isn't optional.

## ESP-IDF 6.0

If you work in ESP-IDF rather than Arduino, the [6.0 release of 20 March 2026](https://developer.espressif.com/blog/2026/03/idf-v6-0-release/)
is the one to read release notes for. Three changes account for most of the breakage.

Legacy drivers that had been deprecated for several releases were removed rather than merely
warned about, which hits timer-group and I2S code hardest. Compiler warnings became errors by
default, so a project that built with a wall of warnings now stops. And Wi-Fi provisioning was
moved out of the framework: `wifi_provisioning` became an external component named
`network_provisioning`, pulled in through the component manager ([esp-idf #17052](https://github.com/espressif/esp-idf/issues/17052)). Includes and function prefixes
both change, and nothing in the tree resolves the old paths any more.

ESPHome users are on a third clock again. The 2026.x releases carried their own breaking changes to
ESP32 defaults, so an ESPHome config and an Arduino sketch on the same bench can be broken by
different things in the same week.

## After the migration, check that it landed

The part that catches people isn't the compile. It's that a migration touching timing,
peripherals and UART pins changes runtime behaviour on boards that are already deployed, and a
board that compiles cleanly can still boot-loop in a cupboard.

Report the core version, the reset reason and uptime as variables alongside your normal readings.
A successful migration then looks like a version string that changes and an uptime that climbs. A
failed one looks like an uptime that keeps resetting to zero, which is a different problem from a
board that has simply gone quiet — and you can tell them apart without walking to the device.

Pin the old core if you're mid-project and can't take the churn — it's a deferral, not a fix, and
the new silicon will force the migration eventually. Migrate when you can choose the week rather
than when a board you can't reach chooses it for you.
