---
title: "Build an ESP32 solar and battery monitor that counts real amp-hours"
description: "A complete ESP32 solar battery monitor on the INA226: measure charge and discharge current through a proper shunt, count amp-hours in and out, and watch a live dashboard from anywhere — with an honest account of why battery voltage is not state of charge."
category: project
board: ESP32
difficulty: intermediate
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "Why doesn't the INA226 module measure my solar current?"
    a: "Because of the shunt it ships with. Almost every INA226 breakout carries a 0.1 Ω shunt, and with the chip's ±81.92 mV shunt range that caps measurement at about 0.82 A — fine for bench work, useless for a solar system. You have to replace it with a much lower value: 0.002 Ω gives you roughly 20 A, which is why the common Arduino library defaults to exactly those numbers."
  - q: "Will this work on a 48V system?"
    a: "No. The INA226's bus voltage input tops out at 36V, which comfortably covers 12V and 24V banks and rules out 48V. For a 48V system you need a part rated for it or a front-end divider, and a divider costs you the accuracy that made the INA226 worth choosing."
  - q: "Should I use an INA219 instead?"
    a: "Only if you already own one. The INA226 has a 16-bit ADC against the INA219's 12-bit and reads to 36V against 26V, and the difference shows up exactly where a solar build lives — the small charge currents at dawn and dusk. Reports of the INA219 drifting by double-digit percentages at low overnight current are common; the INA226 stays honest down to microamps."
  - q: "How do I know the state of charge?"
    a: "Not from voltage, which is the thing most DIY monitors get wrong. A battery's voltage sags under load and rises while charging, so a reading taken during either tells you about the current, not the charge. Resting voltage is meaningful but needs the battery genuinely idle, and even then takes time to settle. Counting amp-hours in and out — which this build does — tracks charge far better between full-charge resets."
  - q: "Where in the circuit does the shunt go?"
    a: "On the battery leg, not the panel leg. A shunt there measures net battery current, and because the INA226 reports a signed value you get charging and discharging from one sensor: positive means the panels are winning, negative means the loads are. Putting it on the panel side only tells you what's coming in, which is the less useful half."
related:
  - href: "/guides/esp32-energy-meter"
    label: "ESP32 energy meter"
    desc: "The AC-side equivalent, using a PZEM-004T."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The Wi-Fi and TLS foundation this build stands on."
  - href: "/guides/esp32-notifications"
    label: "ESP32 notifications"
    desc: "Getting the low-battery alert somewhere you'll see it."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The dashboard this reports to."
---

An off-grid battery bank fails slowly and then all at once. The useful monitor isn't the voltage
readout on the charge controller — it's a record of how much energy actually went in and came out,
kept somewhere you can look at it from the house instead of the shed.

This build measures battery voltage and bidirectional current with an INA226, counts amp-hours in
and out, and streams the lot to a live dashboard. It's aimed at 12V and 24V systems: a cabin, a
shed, an RV, a boat, a solar-powered gate.

## What you'll build

A single current sensor on the battery leg reporting five variables: bus voltage, signed current,
instantaneous power, and cumulative amp-hours charged and discharged. It's the DC counterpart to
[metering mains power](/guides/esp32-energy-meter), and the measurement problem is genuinely
different. Positive current means the
panels are outrunning the loads; negative means they aren't.

## Why the INA226 — and the shunt problem nobody mentions

The INA226 is the right chip here. It's a high-side current and power monitor with a 16-bit ADC and
a 0–36V bus range, and it holds accuracy down to microamps. The INA219 you'll see in older tutorials
has a 12-bit ADC and a 26V ceiling, and it drifts badly at low current — which is precisely the
overnight trickle and dawn charge you care about on a solar system.

Now the part that catches almost everyone. The INA226 doesn't measure current directly; it measures
the voltage across a shunt resistor, and its shunt input range is **±81.92 mV**. The breakout board
you'll buy ships with a **0.1 Ω** shunt soldered to it. Ohm's law does the rest:

**81.92 mV ÷ 0.1 Ω ≈ 0.82 A.**

That is the entire measurement range of a stock INA226 module. It is a bench instrument as sold, and
wiring it into a solar system either reads a permanently pinned value or releases the smoke. To
measure a real system you desolder that 0.1 Ω part and fit a low-value power shunt: **0.002 Ω** gives
about 20 A, which is why the Arduino library's calibration call defaults to exactly `20.0` amps and
`0.002` ohms. Size the shunt for the largest current your system can actually produce, not the
largest it usually does.

## What you'll need

- An **ESP32** dev board — any common DevKit variant.
- An **INA226** breakout, plus a **0.002 Ω** (or similar) power shunt to replace the stock one.
- A **12V or 24V** battery bank. Not 48V — see the bus-voltage limit above.
- An appropriately fused connection into the battery's negative or positive leg.
- The **Nodrix** and **RobTillaart/INA226** Arduino libraries.
- A **nodrix instance** with a project and a project token.

## Wiring

The INA226 sits between the battery and everything else, with the shunt carrying full system
current. The ESP32 only ever sees I2C:

| From | To | Wire |
|------|----|------|
| INA226 <span class="pin">VCC</span> | ESP32 <span class="pin">3V3</span> | Power |
| INA226 <span class="pin">GND</span> | ESP32 <span class="pin">GND</span> | Ground |
| INA226 <span class="pin">SDA</span> | ESP32 <span class="pin">GPIO21</span> | I2C data |
| INA226 <span class="pin">SCL</span> | ESP32 <span class="pin">GPIO22</span> | I2C clock |
| INA226 <span class="pin">VIN+</span> | Battery side of shunt | Sense high |
| INA226 <span class="pin">VIN−</span> | Load side of shunt | Sense low |

The shunt goes in the battery leg so the sensor sees net battery current — charge minus load. Fuse
that leg. A shunt is a deliberate low-resistance path across your battery terminals, and the failure
mode of getting it wrong is not a wrong reading.

The module's I2C address is set by its A0 and A1 pads, defaulting to `0x40`. That matters if you
later add a second sensor, which the last section covers.

## The firmware

Calibration is mandatory — `getCurrent()` and `getPower()` return nothing meaningful until
`setMaxCurrentShunt()` has told the chip what shunt is fitted. Pass your actual shunt value here, not
the stock one.

Amp-hours come from integrating current over time. The sketch samples every two seconds, accumulates
amp-seconds, and reports the running totals as two separate counters so a glance tells you the day's
balance.

```cpp
#include <Nodrix.h>
#include <INA226.h>
#include <Wire.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

const float SHUNT_OHM = 0.002;   // the shunt you actually fitted
const float MAX_AMP   = 20.0;

INA226 ina(0x40);

double ahIn = 0, ahOut = 0;      // cumulative, amp-hours
unsigned long lastSample = 0;

void setup() {
  Wire.begin();
  ina.begin();
  ina.setMaxCurrentShunt(MAX_AMP, SHUNT_OHM);
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
  lastSample = millis();
}

void loop() {
  Nodrix.run();

  unsigned long now = millis();
  if (now - lastSample >= 2000) {
    double hours = (now - lastSample) / 3600000.0;
    lastSample = now;

    float amps = ina.getCurrent();          // signed: + charging, - discharging
    if (amps >= 0) ahIn  += amps * hours;
    else           ahOut += -amps * hours;
  }

  static unsigned long lastReport = 0;
  if (millis() - lastReport >= 30000) {
    lastReport = millis();

    Nodrix.send("battery_voltage", ina.getBusVoltage());
    Nodrix.send("battery_current", ina.getCurrent());
    Nodrix.send("battery_power",   ina.getPower());
    Nodrix.send("ah_charged",      (float)ahIn);
    Nodrix.send("ah_discharged",   (float)ahOut);
  }
}
```

Sampling and reporting run on separate clocks on purpose. Amp-hour counting needs frequent samples
to be accurate — a two-second cadence catches load steps that a thirty-second one would average away
— while the dashboard only needs a reading every half minute.

## Build the dashboard

Put `battery_voltage` and `battery_current` on **chart** widgets side by side. Read together they
tell the story a single number can't: voltage sagging while current goes sharply negative is a load
switching on, and voltage climbing with positive current is the array doing its job.

`battery_power` suits a **value** widget with a **gauge** if you want the at-a-glance version, and
the two amp-hour counters belong on plain **value** widgets — they're running totals, and their
usefulness is in the difference between them.

## Add the alerts

Two automations earn their keep here. A **variable** trigger on `battery_voltage` below 11.8V (for a
12V lead-acid bank) with a [**Telegram** action](/guides/esp32-notifications) catches deep discharge
while you can still do something about it. A second on `battery_current` above your array's realistic maximum catches a
sensor or wiring fault, because a reading that can't physically happen is worth knowing about
immediately.

Add a **schedule** automation that reports the day's amp-hours each evening. A bank that quietly
stops charging is the failure you most want to catch, and only a positive daily message tells you
the difference between a good day and a dead board.

## Voltage is not state of charge

This is where most DIY battery monitors mislead their owners, so it's worth being plain about.

A battery's terminal voltage moves with current, not just with charge. Under load it sags; while
charging it rises. A 12V lead-acid bank reading 12.1V might be half empty at rest or nearly full with
a heavy load on it, and the voltage alone can't tell you which. Resting voltage genuinely does
indicate state of charge — but only once the battery has been idle long enough to settle, and that
equilibrium takes hours, not minutes.

Counting amp-hours is the better instrument, and it's why this build integrates current rather than
just logging voltage. Energy in and energy out is a direct measurement of what happened, not an
inference from a number that three different conditions can produce.

It isn't perfect either. Coulomb counting drifts, because charging a battery never returns quite as
much energy as it took, and small errors in current accumulate over days. The standard fix is to
reset the counters whenever the bank reaches a known full charge — an automation on
`battery_voltage` holding at absorption voltage is a reasonable trigger for exactly that.

## Going further

Two INA226s give you the full picture. Set the second module's address to `0x41` with its A0 pad,
put it on the array leg, and you can separate generation from consumption instead of inferring the
split from net current. The sketch grows by one object and two `Nodrix.send` lines.

For a remote installation without Wi-Fi at the battery, the wake-report-sleep pattern from the
[battery-life guide](/guides/esp32-deep-sleep-battery) works — with one caveat specific to this
build. Amp-hour counting needs continuous sampling, so a sleeping board can't do it. Either keep the
monitor powered from the bank it's watching (its draw is negligible against a solar system) or accept
voltage-and-power snapshots without the counters.

## Notes

The INA226 reports signed current, so sign is your charge/discharge indicator and no extra hardware
is needed to detect direction. If yours reads negative while charging, VIN+ and VIN− are swapped.

Shunt resistors have a temperature coefficient, and a shunt carrying 20A gets warm. Precision
readings from a hot shunt drift slightly; for amp-hour counting over a day this is lost in the noise,
and it's another reason not to undersize the part.

The 0.1 Ω shunt you desolder is worth keeping. It turns the module back into a useful bench
instrument for anything under 800 mA, which is most of what you'll want to measure on a workbench.
