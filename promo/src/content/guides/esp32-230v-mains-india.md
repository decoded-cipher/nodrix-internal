---
title: "Switching 230V safely from an ESP32 in India"
description: "Western relay tutorials are written for 110V and NEC conventions. What changes at 230V, why the JD-VCC jumper matters, and how a monitoring device wired into mains should fail."
category: concept
board: ESP32
difficulty: advanced
datePublished: 2026-09-21
faqs:
  - q: "Can I control a 230V appliance with an ESP32?"
    a: "Yes, through a relay or a contactor, with the ESP32 on the low-voltage side and properly isolated from the mains side. The controlling logic is the easy part. The parts that require care are isolation, enclosure, fusing and deciding what the load should do when the ESP32 fails, because at 230V the failure modes are electrocution and fire rather than a reset."
  - q: "What is the JD-VCC jumper on a relay module and why remove it?"
    a: "Most optocoupler relay boards ship with a jumper tying JD-VCC to VCC, which powers the relay coil from the same supply as the input side. That defeats the optocoupler, because both sides then share a supply and a ground. Removing the jumper and feeding JD-VCC from a separate isolated supply is what makes the optocoupler actually isolate anything."
  - q: "Is an optocoupler relay module enough isolation on its own?"
    a: "Not by itself. An optocoupler isolates the signal path, but if the coil and the logic share a supply and ground through the JD-VCC jumper, the isolation is bypassed. Isolation is a property of the whole arrangement — separate supplies, adequate physical separation on the board, and an enclosure — rather than a component you can point at."
  - q: "Do Western ESP32 relay tutorials apply in India?"
    a: "Only partly. The code is identical and the electrical reasoning isn't. They are written for 110 to 120V and NEC or UL conventions, while Indian installations run at 230V under IS 732. Higher voltage means larger required separation between mains and low-voltage conductors, and the wiring colours, protective device conventions and plug standards all differ."
  - q: "Which Indian standard covers this?"
    a: "IS 732, the Code of Practice for Electrical Wiring Installations for systems up to 650V, currently in its 2019 fourth revision. It's the document to consult for creepage and clearance, conductor sizing and protective devices rather than any tutorial, including this one. Anything permanently connected to house wiring is also work for a licensed electrician."
  - q: "What should a relay do if the ESP32 crashes?"
    a: "Whatever is safe for that specific load, decided deliberately before you build it. A relay holds its last state when the controller stops, so a heater left on by a crashed board stays on indefinitely. A watchdog that drops the relay on a hang, and a load that defaults to off, is the right pattern for anything that produces heat or moves."
related:
  - href: "/guides/esp32-energy-meter"
    label: "ESP32 energy meter"
    desc: "Measuring mains rather than switching it."
  - href: "/guides/esp32-smart-home-automation"
    label: "Smart home automation"
    desc: "The control side, on low voltage."
  - href: "/guides/esp32-keeps-restarting"
    label: "Why boards restart"
    desc: "Brownouts, and what they do to a relay."
  - href: "/guides/esp32-notifications"
    label: "Alerts from a device"
    desc: "Being told when something fails."
---

**Mains voltage kills people.** At 230V it does so more readily than at the 110 to 120V most published
ESP32 relay tutorials assume, and the protective conventions differ too. If you're not confident
working with mains, the correct answer is to stop here and have a licensed electrician do the
high-voltage side. Nothing below replaces that.

What follows is what changes when the tutorial you're following was written for a different
country, and the failure modes specific to a *monitoring* device that's itself wired into mains —
which is the part almost nobody covers.

## Consult the standard, not a tutorial

Indian wiring installations are governed by **IS 732, Code of Practice for Electrical Wiring
Installations** for systems not exceeding 650V, currently in its
[2019 fourth revision](https://archive.org/details/gov.in.is.732.2019).

That's where creepage and clearance distances, conductor sizing and protective device requirements
come from. This guide deliberately doesn't reprint those figures. Numbers for separation distances
circulate widely on retailer blogs and tutorial sites, they vary with pollution degree and insulation
class, and getting them from a secondary source is exactly the wrong way to design something that
can start a fire. Read IS 732:2019, or IEC 60664-1 for the insulation coordination detail.

The practical consequence of 230V rather than 110V is simply that everything needs more separation
and more respect. A board layout or a module that's adequate in the United States isn't
automatically adequate here.

## The isolation detail that gets skipped

Optocoupler relay modules are sold as the safe option, and they're — if wired the way the
optocoupler assumes.

Most ship with a **jumper linking JD-VCC to VCC**. That powers the relay coil from the same supply
as the logic side. Both sides then share a supply and a ground, and the optocoupler, which is there
precisely to break that path, is bypassed. You have bought isolation and jumpered around it.

The correct arrangement is to **remove the JD-VCC jumper and feed JD-VCC from a separate isolated
supply**, leaving the ESP32 on its own. The optocoupler then genuinely separates the two sides.
This is documented in the better tutorials, including
[Random Nerd Tutorials' relay guide](https://randomnerdtutorials.com/esp32-relay-module-ac-web-server/),
and omitted by most of the rest.

**Isolation is a property of the whole arrangement, not a component.** Separate supplies, adequate
physical separation, and an enclosure — all three, or none of them count.

## Procedure

The rules that matter are procedural and boring, and skipping them is how people get hurt:

- **Everything disconnected from mains while you wire or flash.** Every time, including the
  "quick change".
- **Never wire the high-voltage side live.** There's no version of this that's acceptable.
- **Fuse the live input**, sized for the load, ahead of everything else.
- **Final build in a proper enclosure**, with no exposed mains conductors and adequate separation
  from the low-voltage side. A breadboard isn't a permanent installation and neither is an open
  project box on a shelf.
- **Use an appropriately rated relay or contactor.** A module rated at 10A resistive isn't rated
  for a 10A motor, because inductive loads and inrush change the picture entirely.
- **Anything connected to house wiring is a licensed electrician's job.** A plug-in appliance you
  control is a different category from something wired into a distribution board.

Keeping the controller on the low-voltage side is also what makes remote control sane. The nodrix
handler runs on the ESP32, never on the mains side, so the network-facing part of the system is
electrically separated from the part that can hurt someone.

## The part nobody writes about: how it fails

This is where a monitoring device wired into mains differs from a sensor on a desk, and it is the
most useful thing in this guide.

**A relay holds its last state when the controller dies.** If the ESP32 hangs, browns out or
crashes with the relay energised, the load stays on indefinitely. For a lamp that's an annoyance.
For a heater, a pump or a motor it is a hazard that outlasts whatever caused the crash. Decide the
safe state for your specific load before you build, and arrange for the hardware to reach it — a
watchdog that de-energises on a hang, and a normally-open wiring arrangement so that loss of power
means off.

**Brownouts are more likely here, not less.** A device sharing an enclosure with switching mains
sees supply dips when the relay coil pulls in and when an inductive load switches. That's exactly
the condition that triggers the ESP32's brownout detector, and the temptation to disable the
brownout detector to make the resets stop is the worst available response: it exchanges a visible
reset for undefined behaviour in a device controlling mains. The reset reasons are covered in
[why your ESP32 keeps restarting](/guides/esp32-keeps-restarting).

**Give the controller its own supply.** A small isolated SMPS for the ESP32, separate from anything
feeding the relay coil, removes most of this class of problem.

**A sensor reading of zero can be a safety event.** A thermocouple whose grounded sheath touches
earthed metal can read 0.00 °C. If that reading drives a heater control loop, the loop concludes it
is cold and applies heat. Treat implausible readings as faults that fail safe, not as data.

## A relay that fails safe

`NODRIX_WRITE` handles the command from the dashboard; the watchdog decides what happens when the
board stops answering. For anything that heats or moves, that second part is the one that matters.

```cpp
#include <Nodrix.h>
#include <esp_task_wdt.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

#define RELAY_PIN   26
#define RELAY_OFF   LOW           // wire normally-open: loss of power means off
#define WDT_SECONDS 30

bool relayState = false;

NODRIX_WRITE("relay") {           // dashboard writes "relay" -> this runs
  relayState = value.asBool();
  digitalWrite(RELAY_PIN, relayState ? HIGH : RELAY_OFF);
  Nodrix.send("relay", relayState);            // report the state actually set
}

void setup() {
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_OFF);          // safe state before anything else

  esp_task_wdt_init(WDT_SECONDS, true);        // true = reset the chip on timeout
  esp_task_wdt_add(NULL);

  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();
  esp_task_wdt_reset();                        // stop feeding this and the board resets

  static unsigned long last = 0;
  if (millis() - last < 30000) return;
  last = millis();

  float tempC = readThermocouple();
  if (isnan(tempC) || tempC <= 0.01f) {        // 0.00 C is a fault, not a reading
    digitalWrite(RELAY_PIN, RELAY_OFF);
    Nodrix.event("sensor_fault");
    return;
  }

  Nodrix.send("temperature", tempC);
  Nodrix.send("relay", relayState);
  Nodrix.send("reset_reason", (int)esp_reset_reason());
  Nodrix.send("uptime_s", (long)(millis() / 1000));
}
```

`NODRIX_WRITE` is the nodrix library's handler for a value written from the dashboard, and it runs
on the low-voltage side — the ESP32 never sees mains, and the command path is the same whether you
are in the next room or not. Pair it with the watchdog above, because the dashboard can only ask
the board to change state; it cannot make a wedged board answer.

## Watching it from a distance

The reason to instrument any of this is that the failures above are silent. A relay stuck on, a
board resetting every few minutes, a sensor reading a plausible-looking zero — none announces
itself, and all of them are visible immediately in a series you can look at.

Report the relay's commanded state alongside its actual state if you can read it back, plus the
reset reason and uptime. A board that's restarting whenever the relay switches shows up instantly
as an uptime that never climbs past a few minutes, and that pattern is worth finding before it
becomes a fire rather than after.

None of this monitoring makes an installation safe. The enclosure, the isolation, the fusing and
the protective devices do that, and they're what a licensed electrician is for. Instrumentation only
tells you when a safe installation has started behaving differently — which is worth knowing, and is
not a substitute for building it properly in the first place.
