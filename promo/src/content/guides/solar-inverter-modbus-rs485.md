---
title: "Solar inverter monitoring over Modbus RS485 with an ESP32"
description: "Growatt, Deye and Solis all speak Modbus RTU over RS485 at 9600 baud. Wiring a MAX485, polling registers, and keeping the history your inverter's own app throws away."
category: project
board: ESP32
difficulty: advanced
datePublished: 2026-09-21
faqs:
  - q: "What baud rate do Growatt, Deye and Solis inverters use on RS485?"
    a: "All three commonly default to 9600 baud, 8N1, which is the sensible first thing to try. Some models are configurable through the inverter's own display and a few ship at 19200, so if a correctly wired bus returns nothing but timeouts, the baud rate is the cheapest thing to change before you start suspecting the hardware."
  - q: "Can I monitor more than one inverter on the same bus?"
    a: "Yes. RS485 is a multi-drop bus supporting up to 32 devices on a segment, and each inverter carries its own Modbus slave ID. Poll them in turn from a single ESP32. Give each one a distinct ID through its display first, because two devices answering on the same ID produces corrupted replies rather than an obvious error."
  - q: "Which RS485 adapter should I use with an ESP32?"
    a: "A plain MAX485 module works and is what most published projects use, but it needs a GPIO to drive the direction pin, because RS485 is half duplex and the transceiver has to be told when to transmit. Boards with an onboard transceiver such as the LilyGO T-CAN485 handle that for you and remove the most common source of wiring mistakes."
  - q: "Why does my Modbus read return all zeros or time out?"
    a: "In order of likelihood: A and B swapped, which is harmless and extremely common; the wrong Modbus slave ID; the wrong baud rate; the direction pin not being toggled or toggled too slowly; or reading a register the model doesn't implement. Swap A and B first, because it costs nothing and is the single most frequent cause."
  - q: "Do I need to open the inverter to do this?"
    a: "No. Monitoring uses the inverter's existing RS485 or COM port, which is a low-voltage data connection on the outside of the unit. You're not touching the DC or AC side. That said, the inverter is still a mains-connected device, so isolate before connecting anything and check whether the work affects your warranty or your grid-connection agreement."
  - q: "Why not just use the manufacturer's app?"
    a: "Use it, but don't depend on it for history. Vendor monitoring is typically a cloud account with retention you don't control, resolution that's aggregated after a short window, and an outage story that's entirely theirs. Reading the inverter directly gives you the same numbers at full resolution, locally, with no account involved."
related:
  - href: "/guides/esp32-energy-meter"
    label: "ESP32 energy meter"
    desc: "AC metering with a PZEM, the other half of the picture."
  - href: "/guides/esp32-solar-battery-monitor"
    label: "Solar battery monitoring"
    desc: "The battery side of an off-grid system."
  - href: "/guides/dynamic-tariff-automation"
    label: "Tariff-driven automation"
    desc: "Acting on the numbers once you have them."
  - href: "/guides/esp32-adc-accuracy"
    label: "Analog accuracy"
    desc: "Why not to measure this with an ADC pin."
---

Every grid-tie and hybrid inverter worth buying already computes the numbers you want. Yield,
instantaneous power, string voltages, battery state of charge, grid import and export — all of it
is inside the unit and exposed over RS485, because that's how installers commission them.

What you usually can't get is the history at full resolution, on your terms. Vendor apps keep a
window, aggregate beyond it, and depend on a cloud account. Reading the inverter directly changes
that without touching anything dangerous.

## What you're actually connecting to

The inverter's COM or RS485 port is a low-voltage data connection on the outside of the unit. You
aren't opening the enclosure and not going near the DC strings or the AC side. Isolate the
inverter before connecting anything anyway, and check your warranty and grid-connection terms
first, because some agreements are specific about attached equipment.

Growatt, Deye and Solis all speak **Modbus RTU at 9600 baud, 8N1** by default, which makes the
first attempt largely the same across brands. Register maps differ per manufacturer and often per
model, and that's where the real work sits.

## Hardware

| Part | Why |
|---|---|
| ESP32 with a spare UART | Two hardware serial ports, so the USB console stays usable |
| MAX485 module, or a board with an onboard transceiver | Converts UART to the differential RS485 pair |
| Twisted pair, ideally shielded | A and B are a differential pair; treat them as one |
| 120 Ω terminating resistor | On long runs, at each end of the bus |

A bare MAX485 needs a GPIO for its direction pin, because RS485 is half duplex and something has to
tell the transceiver when to drive the line. Boards with an integrated transceiver such as the
LilyGO T-CAN485 manage that internally and remove the most common source of "it compiles and
returns nothing".

## Polling it

```cpp
// Read a Growatt/Deye/Solis-style inverter over Modbus RTU and report it.
// Register numbers are placeholders — get the real map for your model from
// its Modbus protocol document.

#include <Nodrix.h>
#include <ModbusMaster.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

#define RS485_RX   16
#define RS485_TX   17
#define RS485_DE   4          // direction pin; omit on boards that auto-toggle
#define SLAVE_ID   1          // set on the inverter's own display
#define BAUD       9600       // 8N1; try 19200 if this is silent

ModbusMaster node;

void preTransmission()  { digitalWrite(RS485_DE, HIGH); }
void postTransmission() { digitalWrite(RS485_DE, LOW);  }

void setup() {
  pinMode(RS485_DE, OUTPUT);
  digitalWrite(RS485_DE, LOW);

  Serial2.begin(BAUD, SERIAL_8N1, RS485_RX, RS485_TX);
  node.begin(SLAVE_ID, Serial2);
  node.preTransmission(preTransmission);
  node.postTransmission(postTransmission);

  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

// Many inverters return 32-bit values as two consecutive 16-bit registers.
float readPair(uint16_t reg, float scale) {
  uint8_t rc = node.readInputRegisters(reg, 2);
  if (rc != node.ku8MBSuccess) {
    Nodrix.send("modbus_error", (int)rc);   // code 2 = bad register, not wiring
    return NAN;
  }
  uint32_t raw = ((uint32_t)node.getResponseBuffer(0) << 16) | node.getResponseBuffer(1);
  return raw * scale;
}

void loop() {
  Nodrix.run();

  static unsigned long last = 0;
  if (millis() - last < 30000) return;      // inverters do not change faster
  last = millis();

  float pacW     = readPair(35, 0.1f);      // AC output power
  float todayKwh = readPair(53, 0.1f);      // energy today
  float totalKwh = readPair(55, 0.1f);      // lifetime energy

  if (isnan(pacW)) return;                  // never send a fabricated zero

  Nodrix.send("pac_w", pacW);
  Nodrix.send("today_kwh", todayKwh);
  Nodrix.send("total_kwh", totalKwh);
}
```

Two things there are deliberate. A failed read returns `NAN` and reports nothing rather than
sending a zero, because a fabricated zero in an energy series is worse than a gap — it will be
averaged into your totals forever. And the poll interval is thirty seconds; inverter values don't
change meaningfully faster than that, and aggressive polling upsets some firmware.

The reporting side is [nodrix](https://github.com/decoded-cipher/nodrix-sdk) rather than hand-rolled
HTTP, which matters more here than usual: an inverter poll that fails should record *why* it failed,
and `Nodrix.send("modbus_error", rc)` puts the Modbus exception code into the same series as the
readings. A week later that column tells you whether the gaps were the bus or the network.

## When it doesn't work

Work through this in order, because the list is roughly by frequency:

- **Swap A and B.** Harmless, and by far the most common cause. Labelling isn't consistent between
  manufacturers.
- **Check the slave ID** on the inverter's display. Default is usually 1, but not always.
- **Try 19200** if 9600 is silent.
- **Check the direction pin** is actually being toggled, on a bare MAX485.
- **Confirm the register exists** for your exact model. A valid request for an unimplemented
  register returns an exception code, not a value.

Modbus exception codes are worth printing rather than swallowing. Code 2 means the register address
is wrong, which is a very different problem from a timeout and points you at the protocol document
instead of the wiring.

Getting that document is the real difficulty. Manufacturers publish Modbus protocol PDFs to
installers and they circulate unevenly. Working implementations are often the faster route —
[JasperE84's Growatt ESPHome RS485 example](https://github.com/JasperE84/Growatt_ESPHome_ESP32_Modbus_RS485_Example)
and [Svennix/growatt-solar-mqtt](https://github.com/Svennix/growatt-solar-mqtt) both encode real
register maps, and the [DIY Solar Power Forum](https://diysolarforum.com/threads/esp32-rs485-inverter-battery-monitor.90937/)
has long threads where people compare what actually responded on which model.

## Several inverters, one ESP32

RS485 is multi-drop: up to 32 devices on a segment, each with its own Modbus ID. Set distinct IDs
on each inverter's display, then call `node.begin(id, Serial2)` before each poll and iterate.

Two inverters left on the same ID will both answer and corrupt each other's replies, which presents
as intermittent garbage rather than a clean failure — worth checking early if readings are
occasionally nonsensical.

## Why bother, when the app exists

**The honest answer is history and independence.**

The complaint that recurs across off-grid communities isn't that vendor monitoring is bad, it is
that it forgets. Victron's Bluetooth monitoring keeps roughly thirty days, and going beyond that
means a GX device or a Raspberry Pi running Venus OS — another box to maintain. Growatt and Solis
cloud portals have their own retention and their own outages, and none of it is queryable in a form
you own.

Reading the inverter directly gives you the same numbers at full resolution with no account in the
path, which is what makes the questions people actually care about answerable: is this string
underperforming compared with last spring, did the battery hold through the outage, what did the
export actually earn this quarter. All of those need years rather than a rolling window.

Keep the register map you worked out in the repository with the sketch. Manufacturers revise them
between firmware versions, the documents circulate unevenly, and in two years the map will be far
harder to reconstruct than the code was.
