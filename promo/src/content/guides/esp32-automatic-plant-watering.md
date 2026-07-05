---
title: "Build an ESP32 automatic plant watering system"
description: "A complete ESP32 self-watering build: calibrate a capacitive soil sensor, switch a pump safely through a relay, and let the cloud run the watering logic over a single WebSocket — closed-loop, broker-free, on your own Cloudflare account."
category: project
board: ESP32
difficulty: beginner
datePublished: 2026-06-08
dateUpdated: 2026-07-04
faqs:
  - q: "Why does the watering logic live in the cloud instead of on the ESP32?"
    a: "So you can change it without reflashing. Thresholds, burst length, alert channels, and the whole trigger-condition-action flow are edited in nodrix and take effect on the next reading. The board keeps one job — report a number, act on a flag — which is the part you don't want to be reprogramming every time you re-pot a plant or swap a sensor."
  - q: "How do I calibrate the dry and wet readings?"
    a: "Read the raw analog value with the sensor in open air, then again fully submerged in water (or in soil you've just saturated), and put those two numbers in DRY and WET. They drift with soil type, pot size, and even the sensor batch, so calibrate in the exact setup you'll run. Everything downstream — the 0-100% scale, the 30% and 60% thresholds — is relative to those two anchors."
  - q: "Can the ESP32 switch the pump directly from a GPIO pin?"
    a: "No. A GPIO sources a few milliamps; a pump wants hundreds. Drive the pump through a relay or a logic-level MOSFET powered from its own supply, share grounds, and put a flyback diode across the motor. Wiring a pump straight to a pin browns out the board at best and kills it at worst."
  - q: "Why two thresholds (30% and 60%) instead of one?"
    a: "Hysteresis. With a single setpoint the pump would chatter on and off every time the reading jittered across the line. Turning on below 30% and only off again above 60% gives the soil room to actually wet through before the system reconsiders — the same reason a thermostat has a dead band."
  - q: "What happens if Wi-Fi or the cloud is unreachable?"
    a: "The board reports nothing and receives no pump command, so it does nothing — the safe default. The capped burst is synchronous, so even if Wi-Fi drops mid-pour the pulse still finishes and stops on its own. If watering must survive an outage, add a local fallback that runs a short burst on a low reading without waiting for the cloud."
  - q: "Why GPIO34 for the sensor specifically?"
    a: "It's an ADC1 pin, and ADC1 keeps working while Wi-Fi is on. The ESP32's ADC2 pins are borrowed by the radio, so an analog read there returns garbage once you're connected. GPIO34 is also input-only with no internal pull-up, which is exactly what an analog sensor output wants."
  - q: "Is the project token safe baked into the firmware?"
    a: "Treat it as a secret. It scopes to this one project and all traffic is HTTPS, but don't commit it to a public repo — load it from NVS or a config file for anything real, and rotate it if it leaks."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The full Wi-Fi and TLS firmware this build links out to."
  - href: "/guides/esp32-receive-commands"
    label: "Receive commands on an ESP32"
    desc: "The control-write downlink that drives the pump."
  - href: "/widgets"
    label: "Dashboard widgets"
    desc: "The gauge, chart, toggle, and value widgets used here."
  - href: "/docs#automations"
    label: "Automations"
    desc: "The trigger and action model behind the watering logic."
---

A capacitive sensor and a small pump are all a plant needs to water itself. The hard part is
deciding when to water without over-watering, doing it reliably when Wi-Fi flakes, and being able to
retune later without unplugging anything. This build puts the sensor and pump on an ESP32 and keeps
every decision in the cloud, so the firmware you flash once never changes.

The board does two things: report a moisture number, and run the pump when told. The rules,
dashboard, alerts, and safety checks live in nodrix on **your own Cloudflare account** — no broker to
operate, no server to keep alive, no data leaving your tenancy.

## The idea: a dumb device and a smart cloud

Bake the watering logic into the ESP32 and every tweak means reflashing — and the board can't tell
you it's been watering hourly because the sensor came loose. Split it the other way:

- **The device reports and reacts** — it sends `soil_moisture` and watches for a `pump` flag. That
  contract rarely changes.
- **The cloud holds the logic** — thresholds, burst length, and the trigger-condition-action flow are
  edited in nodrix and apply on the next reading, no reflash.
- **The cloud holds the memory** — every reading is stored and charted, so a misbehaving sensor is
  obvious at a glance.

## What you'll build

- A live **soil-moisture gauge** and a rolling **24-hour chart** of the watering rhythm.
- **Automatic watering**: the pump runs when the soil dries out and stops once it recovers.
- A **pump toggle** for watering on demand, and a **value** readout of the current pump state.
- A **Telegram alert** each time the plant is watered, and a scheduled **reservoir check**.

## What you'll need

- An **ESP32** dev board (any common DevKit variant).
- A **capacitive** soil-moisture sensor — not the resistive forks, which corrode within weeks.
- A **5V pump**, a **relay module or logic-level MOSFET**, tubing, and a small reservoir.
- A **separate 5V supply** sized for the pump's stall current — don't run the pump off the board.
- The **Arduino IDE** with the ESP32 board package and the **Nodrix** library from the Library
  Manager (it pulls in ArduinoJson and WebSockets).
- A **nodrix instance** with a project and a project token.

## Reading the soil

A capacitive sensor outputs a voltage that tracks moisture — high in dry air, low when wet. The
ESP32 reads it on a 12-bit ADC (0–4095), with two gotchas:

- **Use an ADC1 pin.** ADC2 is shared with the Wi-Fi radio, so an analog read there returns nonsense
  once connected. **GPIO34** is on ADC1, input-only, and has no internal pull-up — ideal for a sensor
  output.
- **Average the samples.** Raw readings jitter and are least accurate near the rails; averaging a
  handful smooths it.

Calibration is two numbers: the raw value in open air (`DRY`) and fully submerged (`WET`).
Everything between maps to a 0–100% scale. Those anchors shift with soil type and pot size, so
calibrate in the setup you'll actually run — "30% moisture" only means anything relative to your
`DRY` and `WET`.

## Wiring

The sensor's analog output goes to **GPIO34**. The pump draws far more current than a GPIO can
supply, so the ESP32 only switches a relay or MOSFET on **GPIO26**, and the pump runs from its own
5V supply — never off a board pin.

| From | To | Wire |
|------|----|------|
| Soil sensor <span class="pin">AOUT</span> | ESP32 <span class="pin">GPIO34</span> | Signal |
| Soil sensor <span class="pin">VCC</span> | ESP32 <span class="pin">3V3</span> | Power |
| Soil sensor <span class="pin">GND</span> | ESP32 <span class="pin">GND</span> | Ground |
| ESP32 <span class="pin">GPIO26</span> | Relay <span class="pin">IN</span> | Signal |
| Relay <span class="pin">VCC</span> | ESP32 <span class="pin">5V (VIN)</span> | Power |
| Relay <span class="pin">GND</span> | ESP32 <span class="pin">GND</span> | Ground |
| 5V supply <span class="pin">+</span> | Relay <span class="pin">COM</span> | Power (pump) |
| Relay <span class="pin">NO</span> | Pump <span class="pin">+</span> | Power (switched) |
| Pump <span class="pin">−</span> | 5V supply <span class="pin">−</span> | Ground |

The sensor and relay share the ESP32's ground; the pump's separate supply feeds only the relay's
load side. Tie the grounds together so the control signal has a common reference.

## Switching the pump safely

A pump is an inductive, current-hungry load, and treating it like an LED kills boards. Three rules:

- **Never drive it from a GPIO.** A pin sources a few milliamps; a pump pulls hundreds, more at
  stall. Switch it with a relay or logic-level MOSFET on the separate supply.
- **Add a flyback diode** across the pump, cathode to **+**, to absorb the reverse spike when the
  motor switches off.
- **Check relay polarity.** Many modules are active-low. The firmware below assumes active-high
  (`HIGH` = on); invert the two `digitalWrite` calls if yours differs.

## The control loop

The loop is deliberately gentle, because soil and water are slow:

1. The ESP32 reports `soil_moisture` every few minutes.
2. Below **30%**, the automation sets `pump` to `on`.
3. The ESP32 runs a **short, capped burst**.
4. Above **60%**, the automation sets `pump` to `off`.

The two thresholds give hysteresis: a single setpoint would make the pump chatter on sensor jitter,
so turning on at 30% and only off at 60% builds a dead band that lets the soil wet through between
decisions. And the burst is capped, not "run until wet" — water takes time to reach the probe, so it
pours briefly, waits, and measures again. All of it lives in nodrix, so you retune from the
dashboard without reflashing.

## The firmware

One socket carries everything: moisture goes up, pump commands come down. The
[nodrix Arduino library](https://github.com/decoded-cipher/nodrix-sdk) owns the socket, the acks, and
the reconnects, so the sketch is only your logic — read the sensor, run one capped burst per command,
and report the pump state back.

```cpp
#include <Nodrix.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

const int SENSOR_PIN = 34;
const int PUMP_PIN   = 26;
const int DRY = 3200;        // raw ADC reading in dry air — calibrate
const int WET = 1300;        // raw ADC reading submerged — calibrate
const int BURST_MS = 5000;

int readMoisture() {
  long sum = 0;
  for (int i = 0; i < 16; i++) { sum += analogRead(SENSOR_PIN); delay(10); }
  return constrain(map(sum / 16, DRY, WET, 0, 100), 0, 100);
}

NODRIX_WRITE("pump") {
  if (!value.asBool()) { digitalWrite(PUMP_PIN, LOW); return; }
  digitalWrite(PUMP_PIN, HIGH);
  delay(BURST_MS);
  digitalWrite(PUMP_PIN, LOW);
  Nodrix.send("pump", false);
  Nodrix.event("watered");
}

void setup() {
  pinMode(PUMP_PIN, OUTPUT);
  digitalWrite(PUMP_PIN, LOW);
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();

  static unsigned long lastReading = 0;
  if (millis() - lastReading >= 5UL * 60 * 1000) {
    lastReading = millis();
    Nodrix.send("soil_moisture", readMoisture());
  }
}
```

Worth understanding rather than copying:

- **The burst is self-limiting.** It's a synchronous `digitalWrite` / `delay` / `digitalWrite`, so a
  pulse always ends even if Wi-Fi drops mid-pour — there's no path that latches the pump on. And
  because a command is delivered at-least-once, a "water now" sent while the board was offline still
  arrives on reconnect; a short burst repeating now and then just waters a little more.
- **HTTP works too.** For a wake-report-sleep node, `Nodrix.beginHTTP()` with `Nodrix.poll()` reports
  the reading and collects any pending command per wake — same handler.
- **Pin TLS before you ship.** `Nodrix.begin()` connects encrypted but unverified for the first run;
  add `Nodrix.setCACert()` for production, covered in
  [Connect an ESP32 over HTTPS](/guides/esp32-https-cloud).

## Build the dashboard

Add four widgets, each bound to a variable:

| Widget | Bind to | Shows |
|---|---|---|
| Gauge | `soil_moisture` | current moisture, 0–100% |
| Chart | `soil_moisture` | the 24-hour watering rhythm |
| Toggle | `pump` | manual water-now switch |
| Value | `pump` | current pump state |

The gauge and chart update live over a hibernating WebSocket. The toggle writes the same `pump` flag
the automation uses, so manual and automatic watering share one path, and the device's echoed state
keeps the toggle and value honest.

The chart is the diagnostic that earns its place. A tuned system settles into a sawtooth — slow
dry-down, sharp recovery, repeat. A flattening curve means water isn't reaching the probe (empty
reservoir, slipped tubing); a sawtooth that's suddenly twice as fast usually means the sensor has
shifted in the pot.

## Add the automation

One automation runs the whole thing — two triggers routed by `if-variable` conditions. Build it in
the automation editor.

**Trigger 1 — a new `soil_moisture` reading:**

- **Below 30** → set `pump` to `on`, then send a Telegram message like "Soil at {{value}}% —
  watering now."
- **Above 60** → set `pump` to `off`.
- **Between 30 and 60**, nothing happens — that gap is the hysteresis dead band.

**Trigger 2 — a schedule (say, twice a day):**

- **If `soil_moisture` is still below 30** → send a Telegram warning to check the reservoir. Soil
  that stays dry after watering usually means an empty tank or slipped tubing.

Swap the integration for Slack, Discord, or SMS without touching the conditions. And because the
firmware emits a `watered` event on every pour, you can branch off that event later without touching
the board.

## Reliability and failure modes

A self-watering system fails unattended, so design for two cases:

- **The cloud is unreachable.** No command arrives, so the pump stays off — the safe default — and
  any in-flight burst finishes on its own. If watering must survive an outage, add a local fallback
  that runs a short burst on a low reading without the cloud.
- **The reservoir runs dry.** Pumping air does nothing and can damage some pumps. The scheduled check
  catches moisture staying low despite watering, and the flat chart confirms it.

## Going further

- **Run it on a battery.** Swap the always-open socket for a wake-report-sleep cycle over HTTP and a
  single cell lasts months — see [ESP32 battery life](/guides/esp32-deep-sleep-battery).
- **Add plants by repeating.** Send `soil_moisture_2`, `soil_moisture_3`, and so on; each
  auto-creates its own variable. Add a gauge per plant and duplicate the automation — no firmware
  change.
- **Dose by volume.** Replace the fixed burst with a measured one (flow rate × time, or a flow
  sensor) so each watering delivers a repeatable amount.
- **React to the `watered` event.** Keep a watering log, post a daily summary, or escalate if
  waterings spike — all as event-triggered automations, none of it on the board.

## Notes

- **No broker or server to run.** The device speaks plain HTTPS and WebSocket; nodrix runs on your
  Cloudflare account.
- **Configurable without reflashing.** Thresholds, burst length, messages, and channels are all set
  in the dashboard — the firmware is flashed once.
- **Single-tenant data.** Every reading stays in your own account, queryable through the read API.
- **Scales by repeating, not rewriting.** The dumb-device contract is what lets one sketch run a
  windowsill or a greenhouse.
