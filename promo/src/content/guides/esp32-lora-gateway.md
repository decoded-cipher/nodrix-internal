---
title: "ESP32 LoRa without LoRaWAN: long-range sensors to your own cloud"
description: "Put a sensor kilometres from the nearest Wi-Fi using point-to-point LoRa and an ESP32 gateway — the duty-cycle limit that decides your whole design, honest range expectations, and why skipping LoRaWAN is usually the right call for a maker."
category: project
board: ESP32
difficulty: advanced
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "What's the difference between LoRa and LoRaWAN?"
    a: "LoRa is the radio modulation — the physical layer. LoRaWAN is a network protocol stacked on top of it, with join procedures, network servers, and managed gateways. They use the same chips and the same modulation; everything that differs is software above the radio. For a handful of your own sensors reporting to your own gateway, point-to-point LoRa skips an entire infrastructure layer you'd otherwise have to run or rent."
  - q: "How often can I actually transmit?"
    a: "Far less often than you'd expect, and this is a legal limit rather than a technical one. The EU 868 MHz band allows a 1% duty cycle under ETSI EN 300 220 — about 36 seconds of transmission per hour, total. At SF12, a single packet takes roughly 1.5 seconds of airtime, which works out to around 24 transmissions per hour. Design your reporting interval from that budget, not from what your sensor could produce."
  - q: "How far will it really reach?"
    a: "Kilometres in clear line of sight, and dramatically less through buildings. The headline figures — 10 km for an SX1276, 15 km for an SX1262 — are open-air numbers with good antennas and clear sightlines. In a town, expect hundreds of metres to a couple of kilometres. It's still transformative compared to Wi-Fi, which gives up at the end of the garden."
  - q: "Is LoRa data encrypted?"
    a: "Not in point-to-point mode. LoRaWAN specifies encryption; raw LoRa is a radio link and sends exactly what you hand it, readable by anyone with a receiver on your frequency. If your payload is a soil moisture reading, that may not matter. If it's a door state or anything that reveals occupancy, encrypt it yourself with AES before transmitting — the developer owns security on this path."
  - q: "Can nodrix receive LoRaWAN directly?"
    a: "Not today — there's no LoRaWAN integration, so a Things Network setup would need a small shim to reshape TTN's uplink format into a telemetry POST. The gateway approach in this guide avoids that entirely: your ESP32 gateway speaks LoRa on one side and plain HTTPS on the other, so the platform only ever sees ordinary telemetry. Native LoRaWAN support is on the roadmap."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The gateway's uplink half."
  - href: "/guides/esp32-deep-sleep-battery"
    label: "ESP32 battery life"
    desc: "The power budget for a remote LoRa node."
  - href: "/guides/mqtt-vs-http-iot"
    label: "MQTT vs HTTP for IoT"
    desc: "Choosing transports closer to home."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "Where the gateway sends what it hears."
---

Every other build on this site assumes Wi-Fi reaches the sensor. Sometimes it doesn't — a gate at the
end of a field, a beehive in an orchard, a water tank on the far side of a property. LoRa exists for
exactly that gap: kilometres of range, on batteries, for a few dollars of radio.

This build puts a sensor somewhere with no network at all and gets its readings onto your dashboard,
using an ESP32 as the bridge. It deliberately doesn't use LoRaWAN, and the first section explains why
that's usually the right call.

## LoRa is not LoRaWAN

The two get used interchangeably and they're different layers.

**LoRa** is the modulation — the physical radio technique that trades data rate for range. **LoRaWAN**
is a network protocol built on top: device join procedures, network servers, managed gateways,
addressing, and encryption. Both use the same chips and the same over-the-air modulation. Everything
separating them is software above the radio.

LoRaWAN is the right answer when you want someone else's gateways to carry your traffic, or you're
deploying hundreds of nodes across a city. It brings a network server you host or rent, a join
procedure, and a payload format to decode.

**Point-to-point LoRa** is two radios talking directly. No gateway infrastructure, no network server,
no third party. You become responsible for what LoRaWAN would have handled — acknowledgements,
retries, addressing between nodes, duty cycle discipline, and encryption — and for a handful of
sensors reporting to one gateway you own, that's a much smaller job than running the alternative.

## The duty cycle decides your design

This is the constraint that surprises people, and it's a legal limit rather than a technical one.

The EU 868 MHz band operates under a **1% duty cycle** rule per ETSI EN 300 220. One percent of an
hour is **36 seconds of transmission per hour** — roughly 864 seconds a day, and that's your entire
budget. It applies to nodes and gateways alike.

Now combine that with airtime. A LoRa packet's time on air depends heavily on spreading factor: at
SF12, the slowest and longest-range setting, a single transmission takes around **1.5 seconds**. The
arithmetic is unforgiving:

**36 seconds ÷ 1.5 seconds ≈ 24 transmissions per hour.**

At SF7 the same packet takes roughly a thirtieth of the airtime, so you could send far more — but SF7
reaches a fraction of the distance. That's the real trade: **range and message frequency are the same
budget.** A sensor at the limit of its range gets to speak a couple of times an hour, and a design
that ignores this is illegal rather than merely impolite.

Regions differ. The US 915 MHz band uses frequency hopping with dwell-time rules instead of a flat
duty cycle. Check what applies where you are — and note that **the hardware is band-specific**, so a
868 MHz module is not something you can reconfigure for 915 MHz.

## Range, honestly

Datasheets quote up to 10 km for an SX1276 and up to 15 km for an SX1262. Those are line-of-sight
figures with decent antennas and clear paths, and they're achievable — across a valley, over water,
from a hilltop.

Through buildings and trees, expect hundreds of metres to a couple of kilometres. Still a
transformation compared to Wi-Fi, which stops at the end of the garden. Antenna placement and height
matter more than anything you'll do in software; getting the gateway antenna up high beats every
firmware optimisation available to you.

Between the two chips, the **SX1262** is the better modern choice — more sensitivity, lower transmit
current, and it's what current boards like recent Heltec modules carry. The SX1276 is older, common
in cheaper modules, and perfectly serviceable.

## The architecture

Since your nodes have no internet, the gateway supplies it:

**Sensor node** (LoRa only, battery, in a field) **→ LoRa → ESP32 gateway** (LoRa + Wi-Fi, mains
power, indoors) **→ HTTPS → your dashboard.**

The gateway is an ordinary ESP32 build. It receives packets, and forwards their contents as normal
telemetry. Nothing on the cloud side knows LoRa was involved — the readings look identical to a Wi-Fi
sensor's, which means charts, automations, and alerts all work unchanged.

## What you'll need

- **Two ESP32 boards with LoRa radios** — Heltec WiFi LoRa 32 or LilyGO T-Beam are the usual choices.
- Both must be the **correct frequency variant for your region** (868 MHz in the EU, 915 MHz in the
  US). This is not configurable in software.
- The **RadioLib** and **Nodrix** Arduino libraries. RadioLib handles SX1276 and SX1262 alike.
- A **nodrix instance** with a project and a project token.

## The firmware

Two sketches. The node reads a sensor and transmits a short string; the gateway listens and forwards.
Keep payloads small — LoRa packets are tiny, and every byte costs airtime against your duty cycle.

```cpp
// NODE: LoRa only, no Wi-Fi, battery powered
#include <RadioLib.h>

SX1276 radio = new Module(18, 26, 14, 33);   // CS, DIO0, RST, DIO1 — check your board

void setup() {
  radio.begin(868.0);          // MUST match your region and hardware
  radio.setSpreadingFactor(12); // max range, max airtime
  radio.setOutputPower(14);
}

void loop() {
  float moisture = analogRead(34) / 40.95;   // 0-100%
  float volts    = analogRead(35) * 2.0 * 3.3 / 4095.0;

  char msg[32];
  snprintf(msg, sizeof(msg), "n1,%.1f,%.2f", moisture, volts);
  radio.transmit(msg);

  esp_deep_sleep(15ULL * 60 * 1000000);   // 15 min: well inside the duty budget
}

// GATEWAY: LoRa in, HTTPS out
#include <Nodrix.h>
#include <RadioLib.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

SX1276 radio = new Module(18, 26, 14, 33);

void setup() {
  radio.begin(868.0);
  radio.setSpreadingFactor(12);            // must match the node exactly
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();

  String packet;
  if (radio.receive(packet) != RADIOLIB_ERR_NONE) return;

  char node[8]; float moisture, volts;
  if (sscanf(packet.c_str(), "%7[^,],%f,%f", node, &moisture, &volts) != 3) return;

  Nodrix.send(String(node) + "_moisture", moisture);
  Nodrix.send(String(node) + "_battery",  volts);
  Nodrix.send(String(node) + "_rssi",     radio.getRSSI());
  Nodrix.send(String(node) + "_snr",      radio.getSNR());
}
```

Prefixing variables with a node id is what makes this scale past one sensor. Add a second node
sending `n2,...` and it creates its own variables automatically — no gateway changes, no registration.

Sending **RSSI and SNR** as variables is the detail that pays for itself. They're your link quality,
charted over time, and they tell you whether a node that went quiet has a flat battery or a
deteriorating radio path. Debugging a link kilometres away without them is guesswork.

The `sscanf` check discards malformed packets. On an open ISM band you will receive noise and
fragments from other devices, and a gateway that trusts everything it hears will publish garbage into
your dashboard.

## Build the dashboard

Because each node names its own variables, a second sensor appears on the dashboard on its first
transmission without the gateway changing. Put each node's reading on a **chart** widget and its
battery voltage on another — a remote node's battery curve is the difference between swapping a cell
during a planned visit and walking to a field to find out why something went quiet.

Give `rssi` and `snr` a chart of their own. This is the payoff for sending them, and it's link
diagnostics you cannot get any other way at this range: rain, foliage filling in over a summer, and
an antenna nudged by wind all show up as a slow decline weeks before packets actually stop arriving.
A node that falls silent with healthy RSSI history is a flat battery; one that fades first is a path
problem.

For alerts, a **variable** trigger on a node's battery voltage gives you replacement warnings, and a
**schedule** automation reporting each node once a day is what distinguishes "nothing has changed"
from "the gateway died on Tuesday". Routing those anywhere useful is the
[notifications guide](/guides/esp32-notifications).

## Going further

Adding nodes costs nothing on the gateway — a third sensor sending `n3,...` creates its own variables
and appears on its own. What it does cost is airtime, which is shared: every node draws from the same
regional budget, so a growing network means longer intervals rather than more traffic.

Sending commands *back* to a node is possible and deliberately awkward. The node has to be listening
to receive, which contradicts the deep sleep that makes its battery last, and the gateway's transmit
budget is the same 1% everyone else's is. The usual pattern is a node that wakes, transmits, and
briefly listens for a reply before sleeping — accepting that a command waits until the node's next
scheduled wake rather than arriving when you press the button.

The gateway is an ordinary ESP32 with spare pins, so it can carry its own sensors too. Its readings
travel over [Wi-Fi and HTTPS](/guides/esp32-https-cloud) rather than the radio, which means they cost
no airtime at all and arrive at whatever cadence you like.

## Notes

Spreading factor, bandwidth, and frequency must match exactly on both ends. A mismatch isn't a
degraded link — it's silence, which reads as broken hardware and is the most common reason a first
LoRa build never receives anything.

Point-to-point LoRa has no encryption. Anyone with a receiver on your frequency reads your payload as
plainly as your gateway does. For soil moisture, shrug. For anything revealing occupancy or security
state, add AES to the payload before you transmit.

The duty cycle applies to your gateway too, which matters the moment you want it to acknowledge or
send commands downward. A gateway serving several nodes can exhaust its transmit budget quickly, and
this is the main reason downlink on LoRa is rationed rather than casual.

[Deep sleep](/guides/esp32-deep-sleep-battery) suits nodes perfectly here. The node above wakes every
fifteen minutes, transmits for about a second and a half, and sleeps — a duty cycle low enough that battery life is measured in
seasons, and comfortably inside what the regulations allow.
