---
title: "Build an ESP32 vibration monitor for motor health, measured properly"
description: "A complete ESP32 vibration sensor for predictive maintenance: sample an ADXL345 over SPI, convert acceleration to the RMS velocity that ISO 10816 actually grades machines on, and trend a motor's health on a live dashboard instead of guessing from raw g."
category: project
board: ESP32
difficulty: advanced
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "Why measure velocity instead of acceleration?"
    a: "Because that's what machine vibration standards are written in. ISO 10816 and its successor ISO 20816 grade severity as broadband RMS velocity in mm/s over the 10–1000 Hz band, and the reason is physical: velocity correlates with the energy a machine is dumping into its bearings across a wide frequency range, while raw acceleration over-weights high frequencies and under-weights the low-frequency imbalance that actually destroys machines. An accelerometer measures acceleration, so converting is part of the job, not an optional refinement."
  - q: "Can an ADXL345 really do this?"
    a: "For broadband trending, yes — with one condition: use SPI, not I2C. The part samples at up to 3200 Hz over SPI, which after Nyquist covers the 10–1000 Hz band the standard specifies. Over I2C the bus itself becomes the bottleneck and you can't sustain the rate. What the ADXL345 won't do well is high-frequency bearing defect analysis, which needs a lower-noise sensor and more bandwidth."
  - q: "What vibration level should worry me?"
    a: "For a small machine under about 15 kW, ISO 10816 puts newly commissioned equipment below 0.71 mm/s and the alarm boundary around 4.5 mm/s, with medium machines allowed proportionally more. Treat those as orientation rather than verdict — the number depends on how the sensor is mounted, so your own established baseline is a better alarm source than the table. A motor that has been running at 1.2 mm/s for a year and is now at 2.5 mm/s is telling you something, regardless of which zone either value falls in."
  - q: "Does it matter how I mount the sensor?"
    a: "Enormously — mounting is the single biggest source of bad vibration data. The sensor needs a rigid path to the bearing housing. A stud or a strong magnet on a machined flat is good; double-sided tape is mediocre; a 3D-printed bracket or a zip tie is not measuring the machine, it's measuring the bracket's own resonance. Mount at the bearing, in line with the shaft or radial to it, and mount the same way every time or your trend is meaningless."
  - q: "Can this detect a specific bearing fault?"
    a: "Not reliably, and it's worth being straight about that. Identifying which bearing element is failing means resolving defect frequencies well above this setup's usable band with a lower-noise accelerometer than the ADXL345. What this build does well is notice that something is getting worse and when — which is what actually gets a machine inspected before it fails."
related:
  - href: "/guides/esp32-energy-meter"
    label: "ESP32 energy meter"
    desc: "Motor current, the other half of a condition-monitoring picture."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The Wi-Fi and TLS foundation this build stands on."
  - href: "/guides/esp32-notifications"
    label: "ESP32 notifications"
    desc: "Routing a rising-trend alert to someone who can act on it."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The dashboard this reports to."
---

Rotating machines announce their failures for weeks before they happen. A pump, a fan, a compressor,
a lathe spindle — imbalance, misalignment, and worn bearings all show up as rising vibration long
before anything sounds wrong. Industrial condition monitoring is built entirely on noticing that
rise, and the instruments that do it cost more than the motors most people own.

This build does the useful part with an ESP32 and a ten-dollar accelerometer: it measures vibration
the way the standards define it, and trends it so you can see a machine getting worse.

## The thing most DIY vibration projects get wrong

Search for an ESP32 vibration monitor and you'll mostly find sketches that read an accelerometer and
report raw g, or a "vibration level" derived from how much the numbers wobble. That's a number that
goes up when things get worse, which feels like enough. It isn't, for two reasons.

**Machine vibration standards are written in velocity.** ISO 10816, and the ISO 20816 series that now
supersedes it, grade severity as broadband **RMS velocity in mm/s** across the **10–1000 Hz** band.
Every published threshold, every A/B/C/D zone, every alarm limit a maintenance engineer would
recognise is in those units. Report raw acceleration and none of that reference material applies to
your numbers.

**Acceleration weights the spectrum wrongly.** Acceleration scales with frequency squared, so a raw-g
reading is dominated by high-frequency content while the low-frequency imbalance that actually chews
through bearings barely registers. Velocity flattens that out, which is exactly why the standards
chose it.

Converting is the difference between a graph that wiggles and a measurement that means something.

## What you'll build

An ESP32 sampling an ADXL345 at 3200 Hz over SPI, computing RMS velocity in mm/s from a windowed
spectrum, and reporting it every minute alongside the dominant frequency. The dashboard trends it;
an automation alerts when the trend crosses a level you set from your own baseline.

## What you'll need

- An **ESP32** dev board — any common DevKit variant.
- An **ADXL345** breakout, wired for **SPI** (see below — this is not optional).
- A rigid mount: a threaded stud, or a strong magnet on a clean machined surface.
- The **Nodrix** and **arduinoFFT** Arduino libraries.
- A **nodrix instance** with a project and a project token.

## Wiring

The ADXL345 supports both I2C and SPI, and most tutorials use I2C because it's two wires. Use SPI
anyway: the I2C bus cannot sustain the sample rate this measurement needs, and an under-sampled
signal doesn't give you a slightly worse answer, it gives you a wrong one through aliasing.

| From | To | Wire |
|------|----|------|
| ADXL345 <span class="pin">VCC</span> | ESP32 <span class="pin">3V3</span> | Power |
| ADXL345 <span class="pin">GND</span> | ESP32 <span class="pin">GND</span> | Ground |
| ADXL345 <span class="pin">SCL/SCLK</span> | ESP32 <span class="pin">GPIO18</span> | SPI clock |
| ADXL345 <span class="pin">SDA/MOSI</span> | ESP32 <span class="pin">GPIO23</span> | SPI MOSI |
| ADXL345 <span class="pin">SDO/MISO</span> | ESP32 <span class="pin">GPIO19</span> | SPI MISO |
| ADXL345 <span class="pin">CS</span> | ESP32 <span class="pin">GPIO5</span> | Chip select |

Mount the sensor on the bearing housing, not on a guard or a cover panel. Radial to the shaft catches
imbalance and misalignment best. Whatever you choose, record it and repeat it exactly — a trend built
from readings taken at different mounting points is not a trend.

## The firmware

The sketch samples one axis at a fixed rate, removes the DC component (gravity, which would otherwise
dominate and make the integration diverge), runs an FFT, and converts each frequency bin from
acceleration to velocity by dividing by 2πf. Summing the velocity bins across 10–1000 Hz gives the
broadband RMS velocity the standards are written in.

```cpp
#include <Nodrix.h>
#include <SPI.h>
#include <arduinoFFT.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

const int  CS_PIN     = 5;
const int  N          = 1024;
const float FS        = 3200.0;      // ADXL345 max over SPI
const float LSB_TO_MS2 = 0.0039 * 9.80665;   // full-res: 3.9 mg/LSB

double vReal[N], vImag[N];
ArduinoFFT<double> FFT(vReal, vImag, N, FS);

void wr(uint8_t reg, uint8_t val) {
  digitalWrite(CS_PIN, LOW);
  SPI.transfer(reg); SPI.transfer(val);
  digitalWrite(CS_PIN, HIGH);
}

int16_t readZ() {
  digitalWrite(CS_PIN, LOW);
  SPI.transfer(0x36 | 0x80);                  // DATAZ0, read
  uint8_t lo = SPI.transfer(0), hi = SPI.transfer(0);
  digitalWrite(CS_PIN, HIGH);
  return (int16_t)((hi << 8) | lo);
}

void setup() {
  pinMode(CS_PIN, OUTPUT); digitalWrite(CS_PIN, HIGH);
  SPI.begin();
  SPI.beginTransaction(SPISettings(2000000, MSBFIRST, SPI_MODE3));
  wr(0x31, 0x0B);                             // full resolution, +/-16g
  wr(0x2C, 0x0F);                             // 3200 Hz output data rate
  wr(0x2D, 0x08);                             // measure
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();

  static unsigned long last = 0;
  if (millis() - last < 60000) return;
  last = millis();

  unsigned long period = 1000000UL / (unsigned long)FS;
  double mean = 0;
  for (int i = 0; i < N; i++) {
    unsigned long t = micros();
    vReal[i] = readZ() * LSB_TO_MS2;
    vImag[i] = 0;
    mean += vReal[i];
    while (micros() - t < period) { }
  }
  mean /= N;
  for (int i = 0; i < N; i++) vReal[i] -= mean;   // strip gravity / DC

  FFT.windowing(FFTWindow::Hann, FFTDirection::Forward);
  FFT.compute(FFTDirection::Forward);
  FFT.complexToMagnitude();

  double sumSq = 0, peak = 0; int peakBin = 0;
  double binHz = FS / N;
  for (int i = 1; i < N / 2; i++) {
    double f = i * binHz;
    if (f < 10 || f > 1000) continue;            // the ISO band
    double aAmp = 2.0 * vReal[i] / N;            // m/s^2, amplitude
    double vAmp = aAmp / (2.0 * PI * f) * 1000;  // -> mm/s
    sumSq += vAmp * vAmp / 2.0;                  // amplitude -> RMS
    if (vAmp > peak) { peak = vAmp; peakBin = i; }
  }

  Nodrix.send("vibration_mm_s", (float)sqrt(sumSq));
  Nodrix.send("dominant_hz",    (float)(peakBin * binHz));
}
```

Two lines carry most of the meaning. Subtracting the mean removes the steady 1g of gravity sitting on
whichever axis faces down — leave it in and the division by frequency turns it into an enormous
phantom low-frequency velocity. And `aAmp / (2πf)` is the integration: in the frequency domain,
integrating acceleration to velocity is just dividing each bin by its angular frequency, which is far
more stable than integrating in the time domain where drift accumulates.

## Build the dashboard

`vibration_mm_s` on a **chart** widget is the whole point of the build. A single reading tells you
little; a month of readings tells you everything. Healthy machines are boringly flat, and the shape
you're watching for is a slow upward drift.

Put `dominant_hz` on a **value** widget. Compared against the machine's running speed it's a first
diagnostic hint: energy concentrated at one times running speed suggests imbalance, twice running
speed often points at misalignment or looseness. It won't diagnose a bearing, but it narrows what to
look at.

## Add the alert

Set a **variable** trigger on `vibration_mm_s` with a threshold drawn from your own baseline — run
the machine healthy for a week, read the chart, and set the alarm meaningfully above the normal band,
routed wherever you'll actually see it via the
[notifications guide](/guides/esp32-notifications). Give it a generous **cooldown**; a developing fault is a slow story, and you don't need hourly
reminders.

The ISO figures are the sanity check rather than the trigger. Small machines sit below roughly
0.71 mm/s when newly commissioned, with about 4.5 mm/s as the boundary into genuinely unacceptable
for that class. If your healthy baseline already sits near the top of that range, that's worth
investigating before you trust the trend at all.

## Going further

Sampling all three axes triples the data and roughly triples the useful information, because
imbalance, misalignment, and looseness present differently across radial and axial directions. The
FFT work is per-axis; the loop structure doesn't change.

Pairing vibration with motor current is where small-scale condition monitoring gets genuinely good.
The [energy meter build](/guides/esp32-energy-meter) reports the electrical side, and rising
vibration alongside rising current is a much stronger signal than either alone — mechanical drag
shows up in both.

Classifying the signature rather than just trending it is the next step up, and it runs on the board:
the [S3 edge AI build](/guides/esp32-s3-edge-ai) covers training a model on your own sensor data and
reporting the conclusion instead of the spectrum.

If you outgrow the ADXL345, the upgrade is a lower-noise accelerometer with more bandwidth rather
than a faster processor. The ESP32 is not the limiting factor here; the sensor's noise floor is.

## Notes

The busy-wait timing loop is crude but adequate at 3200 Hz, and it keeps the sample interval even —
which matters more than absolute rate, because a jittery sample clock smears the spectrum. A
hardware-timer implementation is the correct upgrade if you push the rate higher.

A Hann window is applied before the transform to reduce spectral leakage. Without it, a frequency
that doesn't land exactly on a bin centre bleeds across neighbours and inflates the broadband sum.

The 10 Hz lower bound is part of the standard, not an arbitrary filter setting. Below it, sensor
noise and thermal drift dominate, and dividing those by a very small frequency produces impressive
velocity numbers that mean nothing at all.
