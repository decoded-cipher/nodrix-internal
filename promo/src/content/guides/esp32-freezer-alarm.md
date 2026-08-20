---
title: "Build an ESP32 fridge and freezer alarm that survives a power cut"
description: "A complete ESP32 freezer temperature alarm on the DS18B20: monitor fridge and freezer from one probe cable, alert on a sustained rise rather than a door opening, and keep the alarm alive when the power that killed the freezer would have killed the board too."
category: project
board: ESP32
difficulty: beginner
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "How accurate is a DS18B20 at freezer temperatures?"
    a: "Less accurate than its headline figure, and it's worth knowing before you trust it. The ±0.5°C spec applies from -10°C to +85°C only; below -10°C the datasheet tolerance widens to about ±2.0°C. For a freezer alarm that's fine, because you're detecting a ten-degree failure, not certifying a half-degree. For anything where the exact number matters — food safety records, lab samples — calibrate against a reference thermometer at the temperature you actually care about."
  - q: "How do I get the cable into the freezer without drilling?"
    a: "Through the door gasket. A DS18B20 probe cable is thin enough that a modern magnetic seal closes over it without losing its grip, and it's what commercial freezer loggers do. Run it through the hinge side where the gasket compresses least, and check the door still pulls itself shut. Drilling the cabinet means going through the insulation and, on many units, the refrigerant lines buried in it."
  - q: "Won't opening the door set the alarm off?"
    a: "It would if you alerted on raw readings, which is why this build doesn't. The sketch keeps a rolling average over roughly fifteen minutes and the alert binds to that, not to the instantaneous value. A door held open for a minute barely moves a fifteen-minute average; a compressor that has actually stopped moves it steadily and doesn't stop."
  - q: "Can one ESP32 watch both the fridge and the freezer?"
    a: "Yes, and it's the reason to pick the DS18B20 over an analog sensor. It's a 1-Wire part with a unique 64-bit address burned into every unit, so several probes share a single data pin and the board tells them apart by address. Two probes, one GPIO, one board."
  - q: "What happens if the power goes out?"
    a: "That's the case worth designing for, because a mains failure kills the freezer and the monitoring board at the same instant — and a board that is off cannot report anything. The fix is a small USB power bank between the board and the wall. The freezer stops, the ESP32 keeps running on battery, it watches the temperature climb, and the alert goes out over Wi-Fi or a phone hotspot while there's still time to act."
related:
  - href: "/guides/esp32-notifications"
    label: "ESP32 notifications"
    desc: "Telegram, Discord, Slack, and SMS from one sketch."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The Wi-Fi and TLS foundation this build stands on."
  - href: "/guides/esp32-water-tank-monitor"
    label: "Water tank level monitor"
    desc: "The same alert-before-it-matters pattern, for water."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The dashboard this reports to."
---

A freezer fails quietly. The compressor stops, the light still comes on when you open the door, and
nothing looks wrong for about eight hours — by which point a freezer full of food is finished. The
whole value of a freezer alarm is catching that in hour one, from wherever you happen to be.

This build puts a probe in the freezer and another in the fridge, streams both to a live dashboard,
and alerts on a sustained temperature rise. It also deals with the failure mode most DIY freezer
monitors quietly ignore: what happens when the power cut that killed the freezer kills the monitor
too.

## The design problem worth solving first

Think about how a freezer actually fails. There are two cases and they need different answers.

**The compressor dies, or the door is left ajar.** The freezer is still powered, so a monitor plugged
in beside it is still powered too. It watches the temperature climb and raises the alarm. Easy.

**The power goes out.** The freezer stops — and so does the ESP32 you plugged into the wall next to
it. A board with no power reports nothing, and *nothing* looks identical to *everything is fine*.
This is the failure that ruins freezers, and it's the one a naive build is blind to.

The fix is cheap: run the ESP32 from a small USB power bank that charges from the wall. Mains drops,
the freezer stops, the board keeps running for hours, and it reports the rise while you can still
move food. An ESP32 draws little enough that a modest power bank covers a long outage.

That still leaves the router, which also died. If the outage is local to your home, a phone hotspot
gets the board online; if you want certainty, the honest answer is that a truly power-independent
alarm needs its own uplink, which is beyond a Wi-Fi build.

One more layer helps: a **schedule** automation that messages you the temperature once a day. A daily
message that *arrives* proves the whole chain is alive. Silence, from a system that should have
spoken, is itself information. (A trigger that fires when a variable simply stops updating is on the
roadmap; until then the daily heartbeat is the way to get the same reassurance.)

## Why the DS18B20 — and what it can't do down there

The DS18B20 is the right sensor for this, mostly for packaging reasons. It comes in a sealed
stainless probe on a cable, it's digital so cable length doesn't degrade the reading, and it's
1-Wire — every part carries a unique 64-bit address, so several probes share one GPIO and the board
distinguishes them by address rather than by pin.

Its accuracy needs stating plainly, because the number everyone quotes doesn't apply here. The
famous **±0.5°C is specified from -10°C to +85°C**. Below that the datasheet tolerance widens to
roughly **±2.0°C**, which covers the entire useful range of a freezer.

For this application that's perfectly acceptable, and it's worth being clear why: you are detecting a
failure that moves the temperature by ten or twenty degrees, not auditing whether it sat at -18°C or
-19°C. If you need the exact number — food safety logs, laboratory samples — calibrate each probe
against a reference at freezer temperature and store the offset.

## What you'll need

- An **ESP32** dev board — any common DevKit variant.
- Two **waterproof DS18B20 probes** on cable (one per compartment).
- One **4.7 kΩ resistor** as the 1-Wire bus pullup.
- A small **USB power bank** that can charge and supply at once, for the outage case.
- The **Nodrix**, **OneWire**, and **DallasTemperature** Arduino libraries.
- A **nodrix instance** with a project and a project token.

## Wiring

Both probes land on the same three connections — that's the point of 1-Wire:

| From | To | Wire |
|------|----|------|
| DS18B20 <span class="pin">VDD</span> (red) | ESP32 <span class="pin">3V3</span> | Power |
| DS18B20 <span class="pin">GND</span> (black) | ESP32 <span class="pin">GND</span> | Ground |
| DS18B20 <span class="pin">DATA</span> (yellow) | ESP32 <span class="pin">GPIO4</span> | 1-Wire bus |
| <span class="pin">DATA</span> | <span class="pin">3V3</span> | 4.7 kΩ pullup |

The pullup is mandatory, not optional — 1-Wire is an open-drain bus and without it you read nothing
at all. One resistor serves the whole bus no matter how many probes hang off it.

Power the probes properly from 3V3 rather than using parasite power. Parasite mode saves a wire and
becomes unreliable exactly where this build lives: long cable runs and low temperatures. The third
wire is free; use it.

Route each cable through the door gasket on the hinge side. Modern magnetic seals close over a thin
probe cable without losing their seal, and it's how commercial freezer loggers are fitted. Don't
drill the cabinet — the insulation often has refrigerant lines running through it.

## The firmware

The sketch reads both probes by index, reports the raw values for the chart, and separately maintains
a rolling average that the alerts bind to. That split is the whole trick: raw data is what you want
to look at, and a smoothed value is what you want to alarm on.

```cpp
#include <Nodrix.h>
#include <OneWire.h>
#include <DallasTemperature.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

const int ONE_WIRE_PIN = 4;
const float ALPHA = 0.06;          // ~15 min smoothing at a 60 s cadence

OneWire oneWire(ONE_WIRE_PIN);
DallasTemperature sensors(&oneWire);

float freezerAvg = NAN, fridgeAvg = NAN;

float smooth(float prev, float now) {
  return isnan(prev) ? now : prev + ALPHA * (now - prev);
}

void setup() {
  sensors.begin();
  sensors.setResolution(12);
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();

  static unsigned long last = 0;
  if (millis() - last < 60000) return;
  last = millis();

  sensors.requestTemperatures();               // 12-bit conversion, ~750 ms
  float freezer = sensors.getTempCByIndex(0);
  float fridge  = sensors.getTempCByIndex(1);

  if (freezer > -100) {                        // -127 = probe not answering
    freezerAvg = smooth(freezerAvg, freezer);
    Nodrix.send("freezer_temp", freezer);
    Nodrix.send("freezer_temp_avg", freezerAvg);
  }
  if (fridge > -100) {
    fridgeAvg = smooth(fridgeAvg, fridge);
    Nodrix.send("fridge_temp", fridge);
    Nodrix.send("fridge_temp_avg", fridgeAvg);
  }
}
```

The `> -100` guard matters. A DS18B20 that has lost its connection returns **-127°C**, and sending
that value would look like the coldest freezer in history rather than a broken probe — skipping it
leaves an honest gap in the chart instead.

`getTempCByIndex` orders probes by their address, which is stable but arbitrary. Plug them in one at
a time the first time and note which index is which, or read the addresses explicitly if you'd rather
not depend on discovery order.

## Build the dashboard

Put `freezer_temp` and `fridge_temp` on **chart** widgets. The raw traces are genuinely informative:
you'll see the compressor's duty cycle as a regular sawtooth, and once you know its normal rhythm, a
compressor that has stopped is obvious long before the temperature reaches anything alarming.

Give each compartment a **value** widget bound to its averaged variable, so the number you glance at
is the stable one.

## Add the alerts

Create a **variable** trigger on `freezer_temp_avg`, condition *above -12*, with a
[**Telegram** action](/guides/esp32-notifications). Bind it to the averaged variable, never the raw one — that's what makes a door left open for
a minute a non-event while a genuine failure still gets through.

Set the trigger's **cooldown** to a few hours. Without it, a freezer sitting just over the threshold
re-fires the automation on every reading, and an alarm that messages you forty times is one you learn
to ignore.

Add a second automation on `fridge_temp_avg` above 8°C, and a **schedule** automation that reports
both temperatures each morning. That daily message is your proof the chain still works — the board,
the Wi-Fi, the automation, and the Telegram integration all had to be alive to produce it.

## Going further

A door sensor turns a false positive into an explanation. A reed switch on a GPIO,
[reported as a boolean](/guides/esp32-https-cloud), lets you see the door open in the same chart as the temperature bump — and lets an
automation stay quiet when the two coincide.

For a chest freezer in a garage or outbuilding, a water sensor on the same board is worth the couple
of GPIOs it costs. A freezer that has failed and thawed announces itself on the floor, usually before
anyone thinks to open the lid.

If you're monitoring several units — a small kitchen, a lab, a shop — keep one board per unit rather
than running long probe cables back to a central board. Cable runs are the fragile part of any 1-Wire
installation, and one board per appliance means one failure never blinds you to everything.

## Notes

A 12-bit conversion takes around 750 ms, during which `requestTemperatures()` blocks. At a one-minute
cadence that's irrelevant; if you ever need faster sampling, drop to 10-bit resolution and the
conversion time falls to roughly a quarter of that.

The exponential smoothing constant is set for a 60-second reporting cadence. Change the cadence and
the smoothing window changes with it — a smaller `ALPHA` means a longer, calmer average.

The probes read the air, not the food. Air temperature swings much faster than a frozen mass does,
which is why the smoothed value is the honest indicator of whether contents are actually at risk.
