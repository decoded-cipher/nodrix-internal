---
title: "Build an ESP32 automatic plant watering system"
description: "A complete ESP32 self-watering build: calibrate a capacitive soil sensor, switch a pump safely through a relay, and let the cloud run the watering logic over a single WebSocket — closed-loop, broker-free, on your own Cloudflare account."
category: project
board: ESP32
difficulty: beginner
datePublished: 2026-06-08
dateUpdated: 2026-06-08
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

A capacitive sensor and a small pump are all the hardware a plant needs to water itself. The
interesting part is everything around them: deciding *when* to water without over-watering, doing
it reliably when Wi-Fi flakes, and being able to change your mind later without unplugging
anything. This build puts the sensor and pump on an ESP32 and keeps every decision in the cloud,
so the firmware you flash once never has to change.

The board does two things and nothing else: it reports a moisture number, and it runs the pump
when it's told to. The watering rules, the dashboard, the alerts, and the safety checks all live
in nodrix, which runs on **your own Cloudflare account** — so there's no broker to operate, no
server to keep alive, and no data leaving your tenancy.

## The idea: a dumb device and a smart cloud

Putting the watering logic on the ESP32 works on the bench and bites you later: the thresholds are
baked into a binary, tuning them means reflashing, and the board can't tell you it's been watering
hourly because the sensor came loose. Split the system the other way instead:

- **The device reports state and reacts to commands** — it sends `soil_moisture` and watches for a
  `pump` flag. That contract almost never changes.
- **The cloud holds the logic** — thresholds, burst length, the trigger-condition-action flow, and
  alert channels are edited in nodrix and apply on the next reading, no reflash.
- **The cloud holds the memory** — every reading is stored and charted, so the watering rhythm is
  visible and a misbehaving sensor is obvious at a glance.

## What you'll build

- A live **soil-moisture gauge** and a rolling **24-hour chart** of the watering rhythm.
- **Automatic watering**: the pump runs when the soil dries out and stops once it recovers.
- A **pump toggle** for watering on demand, and a **value** readout of the current pump state.
- A **Telegram alert** each time the plant is watered, and a scheduled **reservoir check** that
  warns you when watering stops helping.

## What you'll need

- An **ESP32** dev board (any of the common DevKit variants).
- A **capacitive** soil-moisture sensor. Avoid the cheap resistive forks — they corrode within
  weeks because they pass current through wet soil.
- A **5V pump** plus a **relay module or logic-level MOSFET**, tubing, and a small reservoir.
- A **separate 5V supply** sized for the pump's stall current. Don't run the pump off the board.
- The **Arduino IDE** with the ESP32 board package and the **ArduinoJson** and **arduinoWebSockets**
  (by Markus Sattler) libraries.
- A **nodrix instance** with a project and a project token.

## Reading the soil honestly

A capacitive sensor outputs an analog voltage that tracks how much water is around its probe — high
in dry air, low when wet. The ESP32 reads that on a 12-bit ADC (0–4095), and two details bite
people:

- **Use an ADC1 pin.** The ESP32's ADC2 channels are shared with the Wi-Fi radio, so once you're
  connected an analog read on ADC2 returns nonsense. **GPIO34** is on ADC1, is input-only, and has
  no internal pull-up — ideal for a sensor output.
- **The reading is noisy and non-linear.** Raw ADC samples jitter, and the converter is least
  accurate near its rails. Averaging a handful of samples smooths the jitter; a two-point
  calibration handles the rest.

Calibration is just two numbers. Read the raw value in open air (`DRY`) and fully submerged
(`WET`), then map everything between them to a 0–100% scale. Those anchors shift with soil type and
pot size, so calibrate in the setup you'll actually run — and remember that "30% moisture" only
means anything relative to *your* `DRY` and `WET`.

## Wiring

The sensor's analog output goes to **GPIO34**. The pump draws far more current than a GPIO can
supply, so the ESP32 only switches a relay or MOSFET on **GPIO26**, and the pump runs from its
**own 5V supply** — never off a board pin.

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

The sensor and relay share the ESP32's ground; the pump's separate supply only feeds the relay's
load side. Tie the two grounds together so the control signal has a common reference.

## Switching the pump safely

A pump is an inductive, current-hungry load, and treating it like an LED is how boards die. Three
rules:

- **Never drive it from a GPIO.** A pin sources a few milliamps; even a small pump pulls hundreds
  and spikes higher at stall. Use a relay or a logic-level MOSFET as the switch, powered from the
  separate supply.
- **Add a flyback diode** across the pump terminals, cathode to **+**. When the motor switches off
  its collapsing field produces a reverse voltage spike; the diode gives that spike somewhere to go
  instead of through your switch.
- **Mind the relay's polarity.** Many relay modules are **active-low** — pulling `IN` low energizes
  the coil. The firmware below assumes active-high (`HIGH` = on); if your board is the other way,
  invert the two `digitalWrite` calls.

## The control loop

The loop is deliberately gentle, because soil and water are slow:

1. The ESP32 reports `soil_moisture` every few minutes.
2. When it drops **below 30%**, the automation's dry branch sets `pump` to `on` and sends a Telegram message.
3. The ESP32 sees `pump = on` and runs the pump in a **short, capped burst**.
4. When moisture climbs back **above 60%**, the same automation's recovered branch sets `pump` to `off`.

Two design choices matter here. The **two separated thresholds** give the system hysteresis: if it
turned on and off at a single 45% line, normal sensor jitter would make the pump chatter. Turning
on at 30% and only releasing at 60% builds in a dead band, so the soil genuinely wets through
between decisions. And the burst is **capped and short** rather than "run until wet," because water
takes time to wick to the probe — pour for thirty seconds, wait, measure again. Chasing the reading
in real time is how you flood a desk.

Because all of that lives in nodrix, none of it is compiled into the board. You can widen the dead
band, shorten the burst, or add a "only water during daylight" condition from the dashboard, and
the next reading picks up the new rules.

## The firmware

One WebSocket carries everything. Moisture and pump-state go *up* it; pump commands come *down* it
the instant you flip the dashboard toggle or an automation fires, so "water now" is immediate
rather than waiting for the next poll. Cloudflare hibernates the socket, so holding it open all day
costs almost nothing while idle. Each reading averages several samples, each command runs one
capped burst and is acked so it isn't repeated, and the board reports the pump state back so the
dashboard always reflects reality.

```cpp
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";   // host only — no https://
const char* TOKEN     = "tok_your_project_token";

const int SENSOR_PIN = 34;          // ADC1, input-only, no Wi-Fi clash
const int PUMP_PIN   = 26;          // switches the relay/MOSFET, never the pump itself
const int DRY = 3200;               // raw ADC reading in dry air   (calibrate)
const int WET = 1300;               // raw ADC reading submerged     (calibrate)
const int BURST_MS = 5000;          // one capped watering pulse

const unsigned long TELEMETRY_MS = 5UL * 60 * 1000;   // report moisture every 5 min
unsigned long lastTelemetry = 0;
String lastCmdId;                   // dedupe re-delivered commands

WebSocketsClient ws;

int readMoisture() {
  long sum = 0;
  for (int i = 0; i < 16; i++) { sum += analogRead(SENSOR_PIN); delay(10); }
  return constrain(map(sum / 16, DRY, WET, 0, 100), 0, 100);   // averaged, 0-100%
}

void reportPump(const char* state) {
  String msg = String("{\"type\":\"telemetry\",\"metrics\":{\"pump\":\"") + state + "\"}}";
  ws.sendTXT(msg);
}

// Cloud pushes { type:"control", id, variable, value }. Commands are at-least-once,
// so skip one we've already run — but ack every delivery so the cloud stops resending.
void onCommand(uint8_t* payload, size_t len) {
  JsonDocument cmd;
  if (deserializeJson(cmd, payload, len) || cmd["type"] != "control") return;

  String id = cmd["id"].as<String>();
  if (id != lastCmdId && cmd["variable"] == "pump" && cmd["value"] == "on") {
    lastCmdId = id;
    reportPump("on");
    digitalWrite(PUMP_PIN, HIGH);   // active-LOW relay? invert this and the line below
    delay(BURST_MS);                // short, capped burst — finishes even if Wi-Fi drops
    digitalWrite(PUMP_PIN, LOW);
    reportPump("off");
    ws.sendTXT("{\"type\":\"event\",\"event\":\"watered\"}");
  }
  String ack = "{\"type\":\"ack\",\"ids\":[\"" + id + "\"]}";
  ws.sendTXT(ack);
}

void setup() {
  pinMode(PUMP_PIN, OUTPUT);
  digitalWrite(PUMP_PIN, LOW);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(250);

  // One socket: telemetry/events up, commands down. Pending commands flush on connect.
  ws.beginSSL(HOST, 443, String("/v1/control/ws?token=") + TOKEN);
  ws.onEvent([](WStype_t type, uint8_t* payload, size_t len) {
    if (type == WStype_TEXT) onCommand(payload, len);
  });
  ws.setReconnectInterval(5000);
}

void loop() {
  ws.loop();                        // service the socket (pushes + reconnect)
  if (ws.isConnected() && (lastTelemetry == 0 || millis() - lastTelemetry >= TELEMETRY_MS)) {
    lastTelemetry = millis();
    String msg = "{\"type\":\"telemetry\",\"metrics\":{\"soil_moisture\":" + String(readMoisture()) + "}}";
    ws.sendTXT(msg);
  }
}
```

A few things worth understanding rather than copying:

- **At-least-once delivery.** nodrix keeps a command pending until the device acks it, and re-sends
  anything undelivered the moment the socket reconnects. That guarantees a "water now" you sent
  while the board was asleep still arrives — but it means the *same* command can arrive twice, so
  the board dedupes by `id` and acks regardless. Idempotency on the device is what makes
  at-least-once safe.
- **The burst is self-limiting.** It's a synchronous `digitalWrite` / `delay` / `digitalWrite`, so
  once a pulse starts it always ends, even if Wi-Fi drops in the middle. There's no path where the
  pump latches on because a "stop" message got lost.
- **TLS is skipped for the first run.** `beginSSL` without a CA gets you connected quickly. For
  production, pin a certificate — see [Connect an ESP32 over HTTPS](/guides/esp32-https-cloud) —
  and for a hardened command path (reconnect backoff, stricter parsing) see
  [Receive commands on an ESP32](/guides/esp32-receive-commands).
- **HTTP is equally valid.** If your device wakes briefly and sleeps rather than holding a socket
  open, a plain `POST /v1/telemetry` reports the reading and `GET /v1/control` collects any pending
  command — nodrix accepts both transports interchangeably.

## Build the dashboard

Add four widgets in the dashboard editor, each bound to a variable:

| Widget | Bind to | Shows |
|---|---|---|
| Gauge | `soil_moisture` | current moisture, 0–100% |
| Chart | `soil_moisture` | the 24-hour watering rhythm |
| Toggle | `pump` | manual water-now switch |
| Value | `pump` | current pump state |

The gauge and chart update live over a hibernating WebSocket — the same kind the device holds, so
values stream in without polling. The widgets are bidirectional: the toggle writes the same `pump`
flag the automations use, so manual and automatic watering share one path, and the device's
reported pump state flows back to keep the toggle and value honest.

The chart is the diagnostic that earns its place. A healthy, tuned system settles into a regular
sawtooth — a slow dry-down, a sharp recovery, repeat. When that pattern changes, the chart tells
you before the plant does: a flattening curve means water isn't reaching the probe (empty
reservoir, slipped tubing), and a sawtooth that's suddenly twice as fast usually means the sensor
has shifted in the pot.

## Add the automation

One automation runs the whole thing. It has two entry points — a live reading and a scheduled check
— and `if-variable` conditions route each down the right branch. Every condition node has a **yes**
and a **no** output, which is what lets a single flow express water, stop, and watch without three
separate rules drifting out of sync. Build it in the automation editor.

**Trigger 1 — a new `soil_moisture` reading.** It flows into a condition that branches on the value:

- **If `soil_moisture` is below 30** (the yes branch) → set `pump` to `on`, then send a Telegram
  message such as "Soil at {{value}}% — watering now."
- **Otherwise** (the no branch) → a second condition: **if `soil_moisture` is above 60** → set
  `pump` to `off`.
- **Between 30 and 60**, both conditions are false and nothing happens. That gap is the hysteresis
  dead band — turning on and turning off are 30 points apart, so the pump can't chatter.

**Trigger 2 — a schedule (say, twice a day).** It flows into one condition:

- **If `soil_moisture` is still below 30** → send a Telegram warning to check the reservoir. Soil
  that stays dry after watering usually means an empty reservoir or slipped tubing — something more
  pumping won't fix.

nodrix evaluates the whole flow at the edge and runs the pump commands and messages itself. To
alert on Slack, Discord, or SMS instead, swap the integration; the conditions don't change. And
because the firmware emits a `watered` event on every pour, you can branch off that event later
without touching the board.

## Reliability and failure modes

A self-watering system fails unattended, so two cases are worth designing for:

- **The cloud is unreachable.** No command arrives, so the pump simply doesn't run — the safe
  default is "off," and the capped burst means any in-flight pour still finishes on its own. If
  watering must survive an outage, add a local fallback that runs a short burst on a low reading
  without the cloud.
- **The reservoir runs dry.** Pumping air does nothing and can damage some pumps. The scheduled
  reservoir check catches moisture staying low despite watering, and the flattened chart confirms it.

## Going further

- **Run it on a battery.** Swap the always-open socket for a wake-report-sleep cycle over HTTP and a
  single cell lasts months — see [ESP32 battery life](/guides/esp32-deep-sleep-battery).
- **Add plants by repeating.** Send `soil_moisture_2`, `soil_moisture_3`, and so on; each
  auto-creates its own variable. Add a gauge per plant and duplicate the automation — no firmware
  change, because the device contract never assumed a single plant.
- **Dose by volume.** Replace the fixed burst with a measured one (a known flow rate × time, or a
  flow sensor) so each watering delivers a repeatable amount regardless of head height.
- **React to the `watered` event.** Keep a watering log, post a daily "watered N times" summary, or
  escalate if waterings spike — all as event-triggered automations, none of it on the board.

## Notes

- **No broker or server to run.** The device speaks plain HTTPS and WebSocket; nodrix runs on your
  Cloudflare account.
- **Configurable without reflashing.** Thresholds, burst length, messages, and channels are all set
  in the dashboard — the firmware is flashed once.
- **Single-tenant data.** Every reading stays in your own account, queryable through the read API.
- **Scales by repeating, not rewriting.** The dumb-device contract is what lets one sketch run a
  windowsill or a greenhouse.
