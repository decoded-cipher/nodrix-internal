---
title: "Why your ESP32 analog readings are wrong"
description: "Non-linearity, a reference voltage that varies between chips, and an ADC the Wi-Fi driver takes for itself. The three causes behind most bad analogRead results, and when an ADS1115 is the answer."
category: concept
board: ESP32
difficulty: intermediate
datePublished: 2026-09-21
faqs:
  - q: "Why are my ESP32 analog readings inaccurate?"
    a: "Three causes account for most of it. The converter is noticeably non-linear near both ends of its range, so readings close to 0 V or close to the supply compress. The internal reference it calibrates against is nominally 1100 mV but varies between roughly 1000 and 1200 mV from chip to chip, so an uncalibrated conversion to volts can be out by ten percent. And if you're reading on an ADC2 pin with Wi-Fi active, the read may simply fail. None of these are wiring faults."
  - q: "Why does analogRead return 0 or 4095 when the voltage is clearly in between?"
    a: "The converter compresses at both ends of its range, so a small input can read as zero and an input near the top of the range saturates well before it reaches the supply rail. The fix is to scale your divider so the measurement sits in the middle of the range rather than against either rail, not to chase the reading with software correction."
  - q: "Why do my analog readings stop working when Wi-Fi is on?"
    a: "The ESP32 has two ADC blocks and Espressif's documentation states plainly that ADC2 is also used by Wi-Fi. With the radio active, a read on an ADC2 pin contends with the driver and can return a timeout error rather than a value. Move the measurement to an ADC1 pin, which isn't shared. This is the single most common cause of an analog input that works until the board connects."
  - q: "Why do two identical ESP32 boards read different voltages from the same input?"
    a: "Because the internal reference differs between individual chips. Espressif designs for 1100 mV but the real value ranges from about 1000 to 1200 mV across parts. Two boards from the same batch can therefore disagree on the same input. Per-chip calibration data addresses this, which is why the ESP-IDF calibration API is recommended over interpreting raw counts yourself."
  - q: "Do I actually need an ADS1115?"
    a: "Not for most things. If you're reading a battery divider, a potentiometer or a slowly changing resistive sensor, a calibrated ADC1 pin with averaging is fine. An external converter earns its place when you need absolute accuracy rather than a trend, when the signal is small and differential such as a current-shunt or a 4-20 mA loop, or when you need more inputs than you have good pins for."
  - q: "How many bits does the ESP32 ADC really give you?"
    a: "It's a 12-bit converter, but the usable resolution is lower once non-linearity and noise are accounted for, so treating the bottom bits as meaningful will mislead you. Averaging a number of samples and discarding the extremes recovers stability but not accuracy; averaging can't fix a reference that's off by ten percent."
related:
  - href: "/guides/esp32-solar-battery-monitor"
    label: "Solar and battery monitoring"
    desc: "Where a divider on an ADC pin is the whole measurement."
  - href: "/guides/esp32-energy-meter"
    label: "ESP32 energy meter"
    desc: "Current sensing, where the ADC limits bite hardest."
  - href: "/guides/esp32-water-tank-monitor"
    label: "Water tank monitoring"
    desc: "Level sensors and 4-20 mA loops."
  - href: "/guides/esp32-deep-sleep-battery"
    label: "Battery life"
    desc: "Reading cell voltage without wrecking the power budget."
---

A large share of ESP32 sensor problems are the same problem wearing different clothes. A current
clamp that worked on an Uno reads nonsense. A capacitive soil probe gives numbers that drift all
week. A battery divider says 3.9 V when the meter says 4.1 V. An input that behaves perfectly on
the bench returns zero the moment the board joins Wi-Fi.

These aren't five sensor faults. They are one converter with three well-documented limits.

## The three causes

| Symptom | Cause | Fix |
|---|---|---|
| Reads fine until Wi-Fi connects, then fails | Pin is on ADC2, which Wi-Fi uses | Move to an ADC1 pin |
| Two identical boards disagree | Reference voltage varies per chip | Use the calibration API |
| Readings compress near 0 V or near the top | Converter is non-linear at the extremes | Scale the divider to sit mid-range |

### ADC2 belongs to Wi-Fi

The ESP32 has two converter blocks. Espressif's [ADC oneshot documentation](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/adc/adc_oneshot.html)
is unambiguous that **ADC2 is also used by Wi-Fi**, and that a read can fail and return a timeout
when the ADC is in use by another driver.

This produces the most confusing symptom in the whole set, because it is time-dependent rather
than wiring-dependent. The sensor reads correctly during setup, then starts failing once the
board associates — which looks like a sensor that broke, or a power problem, or a loose jumper.

Check your board's pin map and move the measurement to an ADC1 pin. There's no software
workaround worth having; the contention is real and the fix is a different pin.

### The reference voltage isn't 1.1 V

The converter calibrates against an internal reference. Espressif's
[calibration documentation](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/adc/adc_calibration.html)
designs it for 1100 mV, but the actual value **ranges from roughly 1000 mV to 1200 mV across
individual chips**.

That's up to a ten percent error, and it is per-chip rather than per-design. It explains the
complaint that two boards from the same order, running the same sketch, on the same input, don't
agree — and it means a correction factor you derive on one board is wrong on the next one.

The answer is the calibration path rather than arithmetic on raw counts. ESP-IDF stores per-chip calibration data and exposes
[`adc_cali_raw_to_voltage()`](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/adc/adc_calibration.html)
for exactly this, and the documentation recommends using it rather than interpreting the raw value
directly. In Arduino terms, `analogReadMilliVolts`
goes through that path where `analogRead` doesn't. If you're converting counts to volts with a
constant you worked out once, you're carrying that chip's error into every reading.

### It isn't linear at the ends

The transfer function bends near both extremes of the range. Inputs close to ground read low or
read zero, and inputs approaching the top of the range saturate before they reach the supply.

The practical consequence is a design rule rather than a correction: **size your divider so the
signal you care about lands in the middle of the range**, not against either rail. A battery
divider that puts a full cell at the very top of the range will read a full cell and a nearly full
cell as the same number. Check the ADC characteristics section of the
[ESP32 datasheet](https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf)
for your chip's attenuation settings and their usable ranges, and pick the attenuation that centres
your signal.

## What to do before buying anything

Most bad readings improve substantially without new hardware:

- Move to an ADC1 pin if Wi-Fi is involved.
- Use the calibrated millivolt path rather than raw counts.
- Average a batch of samples and discard the highest and lowest, which suppresses noise.
- Scale the divider so the signal sits mid-range.
- Add a small capacitor at the ADC pin for a high-impedance source, because the sample-and-hold
  needs charge and a high source impedance can't supply it fast enough.

Averaging is worth being precise about: **it improves stability, not accuracy**. A thousand samples
averaged against a reference that's ten percent off gives you a beautifully stable wrong answer.

If the readings are already going somewhere, none of this needs new hardware to investigate. A
nodrix deployment takes `raw_count` and `millivolts` as two ordinary variables, and the pair plotted
together answers the question an afternoon with a multimeter can't.

## When an external converter is the right call

An ADS1115 is a 16-bit I2C converter with its own reference and differential inputs. It earns its
place in three situations:

**The signal is differential and small.** A current shunt or a 4-20 mA loop across a sense resistor
produces a small voltage that may not share the ESP32's ground reference cleanly. Differential
inputs measure the difference across two pins and reject what is common to both.

**You need absolute accuracy, not a trend.** For "is the tank filling or emptying", the on-chip ADC
is fine. For "how many amps, in a number someone will act on", a stable external reference is the
difference between a reading and a guess.

**You have run out of good pins.** Four extra analog inputs over two I2C wires is often the real
reason, and it is a perfectly good one.

It isn't a cure-all. An ADS1115 does nothing for a noisy sensor, a bad ground or an unstable
supply, and its default data rate is slow enough that it is the wrong tool for anything fast. If
your problem is that readings wander with temperature, the converter was never the issue.

## Reporting both numbers

Logging the calibrated value **and** the raw count separates a drifting reference from a drifting
sensor. If the raw count holds steady while the converted value walks, the reference moved.

```cpp
#include <Nodrix.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

#define SENSE_PIN 34            // ADC1 — never ADC2 with WiFi running

void setup() {
  analogSetPinAttenuation(SENSE_PIN, ADC_11db);
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

// Average and discard the extremes: improves stability, not accuracy.
uint32_t steadyRead(int pin, int n = 32) {
  uint32_t total = 0, lo = 4095, hi = 0;
  for (int i = 0; i < n; i++) {
    uint32_t r = analogRead(pin);
    total += r; lo = min(lo, r); hi = max(hi, r);
    delay(2);
  }
  return (total - lo - hi) / (n - 2);
}

void loop() {
  Nodrix.run();

  static unsigned long last = 0;
  if (millis() - last < 30000) return;
  last = millis();

  uint32_t raw = steadyRead(SENSE_PIN);
  uint32_t mv  = analogReadMilliVolts(SENSE_PIN);   // per-chip calibration path

  Nodrix.send("raw_count", (long)raw);              // moves only if the input does
  Nodrix.send("millivolts", (long)mv);              // moves if the reference drifts too
  Nodrix.send("chip_temp_c", temperatureRead());    // the usual correlate
}
```

`Nodrix.send()` takes both numbers as ordinary variables, so the raw count and the calibrated
millivolts sit side by side in the same series. That pairing is the whole diagnostic, and it costs
one extra line.

## The measurement you can't make on the bench

Everything above is checkable in an afternoon. The failure that isn't is **drift**.

A calibration done once, against a meter, on a Tuesday, tells you the reading was right on Tuesday.
Reference voltages move with temperature. Capacitive soil probes degrade in soil. Current clamps
shift with ambient heat. Load cells settle for weeks after mounting. Every one of those shows up as
a slow error that looks completely correct at any single moment, and is only visible as a line over
weeks next to something you trust.

That's an argument for keeping history rather than sampling. Log the calibrated value and the raw
count side by side, and a drifting reference separates itself from a drifting sensor: if the raw
count holds steady while the converted value walks, the reference moved, not the thing you're
measuring. Log the chip temperature too and you can usually see the correlation directly.

That's also the argument for logging the raw count forever rather than only the pretty number. The
converted value is what you read; the raw count is what lets you work out, months later, whether
the sensor changed or the board did.
