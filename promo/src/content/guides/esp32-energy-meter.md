---
title: "Build an ESP32 energy meter with a live dashboard"
description: "A complete ESP32 energy monitor: read real volts, amps, watts, and kWh with a PZEM-004T, push them to a live dashboard over one WebSocket, and get a Telegram alert when the load spikes — no broker, no vendor app, on your own Cloudflare account."
category: project
board: ESP32
difficulty: intermediate
datePublished: 2026-07-10
dateUpdated: 2026-07-10
faqs:
  - q: "Why a PZEM-004T instead of an SCT-013 clamp and EmonLib?"
    a: "The PZEM-004T measures voltage, current, power, energy, frequency, and power factor in dedicated metering hardware and hands the ESP32 finished numbers over serial. The SCT-013 route reads a raw current waveform on the ADC and estimates power by assuming a fixed mains voltage, so it drifts with every sag and it can't see power factor. The clamp still has one advantage — it's fully non-invasive — but for numbers you'd bill against, the PZEM is the right tool."
  - q: "Does this work on both 230V and 110V mains?"
    a: "Yes. The PZEM-004T v3.0 measures 80–260V AC at 45–65Hz, which covers 110V/60Hz and 230V/50Hz systems alike. The firmware doesn't change — the meter reports whatever it sees."
  - q: "Where is the kWh total stored, and does it reset when the board reboots?"
    a: "The energy counter accumulates inside the PZEM itself and survives both ESP32 reboots and power cuts. The firmware just reports it. If you want billing-period totals, keep the lifetime counter as-is and compute deltas in the cloud — or call the library's resetEnergy() from a control write when a new period starts."
  - q: "Is it safe to build this myself?"
    a: "The low-voltage side — ESP32, serial wiring, USB — is as safe as any breadboard project. The mains side is not: the PZEM's screw terminals connect to live line and neutral. Work with the circuit de-energized, put everything in an enclosure so no live terminal is exposed, fuse the tap, and if you're not comfortable working inside a mains box, stop at a plug-in smart meter or ask an electrician. The CT coil itself clips around one insulated conductor and never touches copper."
  - q: "Can the same build switch the load on and off?"
    a: "Yes — add a relay on a spare GPIO and a NODRIX_WRITE handler for a switch variable, the same downlink pattern as the toggle in the smart-home guide. Size the relay for the load and keep it on the mains side of the enclosure. The meter and the switch stay independent: you can monitor without switching, or switch without trusting the meter."
  - q: "How much data does reporting every 10 seconds generate?"
    a: "Four variables every 10 seconds is about 34,000 updates a day. That's nothing for a WebSocket on your own Cloudflare account, but it's exactly the kind of rate that burns through hosted-platform free tiers with monthly message caps — one reason energy monitors are usually the first project to outgrow them."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The Wi-Fi and TLS firmware this build stands on."
  - href: "/guides/esp32-receive-commands"
    label: "Receive commands on an ESP32"
    desc: "The downlink pattern for adding a relay to this meter."
  - href: "/guides/esp32-smart-home-automation"
    label: "ESP32 smart home"
    desc: "Switching loads with relays, scenes, and schedules."
  - href: "/widgets"
    label: "Dashboard widgets"
    desc: "The gauge, chart, and value widgets used here."
---

Most ESP32 energy-meter tutorials you'll find are built on platforms that have since changed out
from under them — deprecated app flows, retired tokens, code that no longer compiles as written.
This build has no such dependency. A PZEM-004T does the metering, the ESP32 reports over plain
HTTPS/WebSocket, and the dashboard, history, and alerts run in nodrix on **your own Cloudflare
account** — nothing in the path can be discontinued on you.

What you get: live volts, amps, watts, and a lifetime kWh counter on a dashboard you can open from
anywhere, a 24-hour load curve, and a Telegram message when something draws more than it should.

## Safety first

This project meters mains electricity. The ESP32 side is all low-voltage, but the PZEM's input
terminals connect to live line and neutral:

- **De-energize the circuit** before touching any mains wiring, every time.
- **Enclose everything.** No exposed screw terminal when powered — a cheap junction box is fine.
- **Fuse the voltage tap** with a small inline fuse (0.5A is plenty; it only feeds the meter).
- The **CT clamp is non-invasive** — it clips around one insulated conductor (line or neutral,
  never both) and touches no copper.

If any of that reads as unfamiliar rather than routine, build the firmware against a bench supply
and have an electrician land the mains side.

## What you'll need

- An **ESP32** dev board (any common DevKit variant).
- A **PZEM-004T v3.0** with its split-core CT coil — the version with the Modbus serial interface.
- A **5V supply** for the ESP32, an enclosure, and a fused tap off the circuit you're metering.
- The **Arduino IDE** with the ESP32 board package, the **Nodrix** library, and the
  **PZEM004Tv30** library, both from the Library Manager.
- A **nodrix instance** with a project and a project token.

## Why use dedicated metering hardware

The classic DIY route — an SCT-013 current clamp into the ESP32's ADC with EmonLib — measures only
current and assumes a mains voltage to estimate watts. Real mains sags and swells a few percent
all day, the ESP32's ADC is famously nonlinear, and reactive loads (fridges, motors, anything with
a power supply) make apparent and real power diverge.

The PZEM-004T v3.0 samples voltage and current together in purpose-built metering silicon and hands
the ESP32 six finished numbers over serial: volts, amps, watts, kWh, hertz, and power factor. It
measures 80–260V, up to 100A with the external CT, and keeps its energy count through power cuts.
The ESP32's job collapses to what it's good at: asking for numbers and shipping them to the cloud.

## Wiring

Two sides, kept physically apart. The mains side: line and neutral into the PZEM's voltage
terminals (through the fuse), and the CT clipped around the line conductor. The low-voltage side is
four wires:

| From | To | Wire |
|------|----|------|
| PZEM <span class="pin">5V</span> | ESP32 <span class="pin">3V3</span> | Power |
| PZEM <span class="pin">GND</span> | ESP32 <span class="pin">GND</span> | Ground |
| PZEM <span class="pin">TX</span> | ESP32 <span class="pin">GPIO16 (RX2)</span> | Serial |
| PZEM <span class="pin">RX</span> | ESP32 <span class="pin">GPIO17 (TX2)</span> | Serial |

Power the PZEM's interface side from the ESP32's **3.3V pin**, not 5V. The comms side is optically
isolated from the mains-side metering chip and runs happily at 3.3V — and it keeps the PZEM's TX at
levels the ESP32's RX pin (which is not 5V-tolerant) is built for. If your particular module only
talks when powered at 5V, keep the 5V supply but put a two-resistor divider on the PZEM-TX line.

## The firmware

One socket carries everything: readings go up, and the connection stays open for anything you add
later (a relay, a counter reset). The [nodrix Arduino library](https://github.com/decoded-cipher/nodrix-sdk)
owns the socket and the reconnects; the sketch is just a read-and-send loop.

```cpp
#include <Nodrix.h>
#include <PZEM004Tv30.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

PZEM004Tv30 pzem(Serial2, 16, 17);

void setup() {
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();

  static unsigned long lastReading = 0;
  if (millis() - lastReading >= 10000) {
    lastReading = millis();

    float voltage = pzem.voltage();
    float current = pzem.current();
    float power   = pzem.power();
    float energy  = pzem.energy();

    if (isnan(voltage)) return;   // meter not answering — skip, don't send garbage

    Nodrix.send("voltage", voltage);
    Nodrix.send("current", current);
    Nodrix.send("power", power);
    Nodrix.send("energy_kwh", energy);
  }
}
```

Worth understanding rather than copying:

- **The `isnan` check matters.** When the PZEM sees no mains voltage (breaker off, loose tap) it
  returns NaN for everything. Skipping the send keeps the chart honest — a gap reads as "meter
  offline", a stream of zeros reads as "house off", and those are different diagnoses.
- **The kWh counter lives in the meter.** `pzem.energy()` is a lifetime total that survives reboots
  and outages on both sides. Report it as-is; derive per-day or per-billing-period numbers in the
  cloud from the stored series.
- **Ten seconds is a deliberate rate.** Fast enough to catch a kettle, slow enough to be free on
  your own infrastructure — and a rate that monthly-capped hosted tiers can't sustain.
- **Pin TLS before you ship.** `Nodrix.begin()` connects encrypted but unverified on first run; add
  `Nodrix.setCACert()` for production, covered in
  [Connect an ESP32 over HTTPS](/guides/esp32-https-cloud).

## Build the dashboard

Four widgets, each bound to a variable the firmware is already sending:

| Widget | Bind to | Shows |
|---|---|---|
| Gauge | `power` | live draw in watts |
| Chart | `power` | the 24-hour load curve |
| Value | `energy_kwh` | lifetime energy total |
| Value | `voltage` | mains health at a glance |

The chart is where the project pays for itself. A day of household load has a shape — the overnight
baseline, the morning spike, the compressor sawtooth of a fridge. Once you know your baseline, two
things become obvious: what's always on (that's the number that dominates the bill), and anything
new that shouldn't be. A baseline that steps up 60W and stays there is how you find the amplifier
that never sleeps.

## Add the alerts

Two automations cover the useful cases; both are edited in the dashboard, not the firmware.

**Load spike.** Trigger on a new `power` reading, condition **above 3000** (tune to your circuit),
action: Telegram — "Drawing {{value}}W right now." A washing machine tripping this at 2 p.m. is
routine; a space heater tripping it at 3 a.m. is worth a message.

**Meter offline.** A schedule trigger every morning with an `if-variable` condition on `voltage` —
if the latest reading is stale or missing, something upstream is off: breaker, fuse, or the meter
itself. A monitor that fails silently is worse than none.

Swap Telegram for Slack, Discord, or SMS without touching the conditions — the alert channel is a
detail of the automation, not the build.

## What it costs to run

Four variables at six readings a minute is roughly a million updates a month. On hosted maker
platforms that's deep into paid territory — monthly message caps are exactly what continuous
monitoring burns through. Here the meter reports to your own Cloudflare account, where that volume
sits comfortably inside normal Workers usage; there is no per-device fee and no message quota to
manage. The economics are the point: an energy monitor only earns its keep if it runs continuously
for years.

## Going further

- **Switch loads from the same board.** A relay on a spare GPIO plus a `NODRIX_WRITE` handler turns
  the meter into a metered smart switch — the pattern is in
  [Receive commands on an ESP32](/guides/esp32-receive-commands).
- **Meter more circuits.** Additional PZEM units share one serial bus with distinct Modbus
  addresses, so one ESP32 can report `power_lights`, `power_kitchen`, `power_ac` — each
  auto-creates its own variable and chart series.
- **Compute the bill.** Pull the `energy_kwh` series from the read API and multiply by your tariff
  in a spreadsheet or script — the data is yours, behind one token.
- **Track power factor.** The PZEM also reports `pf()` and `frequency()`; two more `Nodrix.send`
  lines if you want them.

## Notes

- **Nothing here can be deprecated on you.** The meter speaks Modbus, the board speaks HTTPS and
  WebSocket, and the platform is open source (MIT) on your own account.
- **The data is queryable.** Every reading lands in your tenancy and comes back out through the
  read API — no export button to hunt for.
- **Configurable without reflashing.** Thresholds, alert channels, and message text all live in the
  automation editor.
