---
title: "Build a DIY smart home with an ESP32 and your own cloud"
description: "A complete ESP32 smart-home build: switch lights and appliances through relays, control them from anywhere on one private dashboard, and let scenes, schedules, and a sunset trigger run the house — no hub, no broker, on your own Cloudflare account."
category: project
board: ESP32
difficulty: beginner
datePublished: 2026-07-04
faqs:
  - q: "Can I control my ESP32 smart home from anywhere, not just on home Wi-Fi?"
    a: "Yes. The board holds an outbound connection to nodrix in the cloud, so a toggle on the dashboard reaches it wherever it is — you're not on the same network, and you never open a port or set up a VPN. The device makes the connection outward over HTTPS, which every home router already allows, so it works behind NAT and captive portals."
  - q: "Do I need a hub or an MQTT broker for a DIY smart home?"
    a: "No. There's no hub to keep powered and no broker to run or secure. The ESP32 talks straight to nodrix over a WebSocket, and the dashboard, automations, and scenes live in the cloud. The only always-on thing is Cloudflare, which you don't operate."
  - q: "How many lights or appliances can one ESP32 control?"
    a: "As many as it has free GPIO pins — a common 4- or 8-channel relay board covers a room or two. Beyond that, flash a second ESP32 with its own token and namespace its variables (light_kitchen, light_garage). One dashboard shows every board at once; the firmware never changes."
  - q: "Is it safe to switch mains-voltage lights with an ESP32 relay?"
    a: "Mains wiring is dangerous and, in many places, must be done by a licensed electrician. Use a properly rated, opto-isolated relay module, keep mains conductors enclosed and away from the ESP32's low-voltage side, and if you're unsure, switch low-voltage LED strips or smart plugs instead. The firmware is identical either way."
  - q: "Will my smart home keep working if the internet goes down?"
    a: "Your physical wall switches always work — the relays don't remove them. Cloud control and automations pause while the connection is down and resume when it returns, and any command you send meanwhile is delivered once the board reconnects. If a routine must survive an outage, keep that one rule on the board itself."
  - q: "Does my smart-home data stay private?"
    a: "It stays in your own Cloudflare account. nodrix is single-tenant and open-source — there's no shared vendor cloud holding your device history, and nothing leaves your tenancy. You hold the one token that authorizes the whole project."
related:
  - href: "/guides/esp32-receive-commands"
    label: "Receive commands on an ESP32"
    desc: "The control-write downlink that drives every relay here."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The Wi-Fi and TLS firmware, in full."
  - href: "/guides/home-assistant-vs-nodrix"
    label: "Home Assistant vs nodrix"
    desc: "Local hub or your own cloud — how they differ and pair."
  - href: "/docs#automations"
    label: "Automations"
    desc: "The trigger and action model behind the scenes and schedules."
---

A smart home is really two things: switches you can throw from anywhere, and rules that throw them
for you. The usual DIY route bolts those onto a hub you keep alive in a closet and a broker you have
to secure. This build skips both. An ESP32 switches the lights and appliances through relays, and
every decision — the dashboard, the scenes, the schedules, the sunset trigger — lives in nodrix on
**your own Cloudflare account**.

The board's whole job is to flip relays when it's told to and report what state they're in. Nothing
about the house is compiled into it, so you add a room, retime the porch light, or build a
"Goodnight" scene from the dashboard, and the firmware you flashed once never changes.

## The idea: your house, your cloud, no hub

Put the automation logic on the ESP32 and every change means reflashing, every rule is invisible,
and the board can't tell you a relay stuck on. Split it the other way:

- **The device switches and reports** — it listens for `light_living`, `light_bedroom`,
  `light_porch`, and `fan`, and echoes each relay's real state back. That contract almost never
  changes.
- **The cloud holds the logic** — scenes, schedules, the sunset trigger, and any condition are
  edited in nodrix and take effect immediately, no reflash.
- **The cloud holds the controls** — one dashboard drives every relay from any phone or laptop,
  on the home network or off it.

## What you'll build

- A **dashboard** with a toggle per light and appliance, reachable from anywhere.
- A **porch light that follows the sun** — on at dusk, off in the morning, no timer to reset.
- A **Goodnight scene** that turns the house off in one tap, and again on a schedule.
- **State that stays honest** — each toggle reflects the relay's actual position, even after a
  reboot or a reconnect.

## What you'll need

- An **ESP32** dev board (any common DevKit variant).
- A **relay module** — a 4- or 8-channel, **opto-isolated** board. Match the channel count to how
  many circuits you're switching.
- The loads: **light fixtures, LED strips, a fan, or smart plugs**. Prefer low-voltage loads while
  you're learning; leave mains wiring to a qualified electrician.
- Jumper wires, and a **5V supply** for the relay board if it draws more than the ESP32 can source.
- The **Arduino IDE** with the ESP32 board package and the **Nodrix** library from the Library
  Manager (it pulls in ArduinoJson and WebSockets).
- A **nodrix instance** with a project and a project token.

## Wiring the relays

Each relay is switched by one GPIO. Wire four control lines from the ESP32 to the relay board's
inputs, power the board, and share a ground:

| From | To | Wire |
|------|----|------|
| ESP32 <span class="pin">GPIO16</span> | Relay <span class="pin">IN1</span> | Signal (living) |
| ESP32 <span class="pin">GPIO17</span> | Relay <span class="pin">IN2</span> | Signal (bedroom) |
| ESP32 <span class="pin">GPIO18</span> | Relay <span class="pin">IN3</span> | Signal (porch) |
| ESP32 <span class="pin">GPIO19</span> | Relay <span class="pin">IN4</span> | Signal (fan) |
| ESP32 <span class="pin">5V (VIN)</span> | Relay <span class="pin">VCC</span> | Power |
| ESP32 <span class="pin">GND</span> | Relay <span class="pin">GND</span> | Ground |

Each relay's **COM** and **NO** terminals go in series with the load's supply — the relay is just a
switch in that circuit. GPIO16–19 are safe general-purpose outputs; avoid the strapping pins
(GPIO0, 2, 12, 15) for relay control so a relay's power-on state can't hold the ESP32 in boot mode.

**Mains voltage is dangerous.** Anything switching household AC must use a properly rated,
opto-isolated relay with the mains side fully enclosed and isolated from the ESP32's low-voltage
wiring — and in many places that wiring must be done by a licensed electrician. If any of that is
uncertain, switch **low-voltage LED strips or a smart plug** instead. The firmware doesn't care what
the relay switches.

## The firmware

One socket carries the whole house. Toggle states come *down* it the instant you tap the dashboard
or a scene fires; each relay's real state goes back *up* it so the controls never lie. The
[nodrix Arduino library](https://github.com/decoded-cipher/nodrix-sdk) holds that socket, acks each
command, and reconnects on its own, so the sketch is just four relays and their handlers.

```cpp
#include <Nodrix.h>

#define WIFI_SSID "your-wifi"
#define WIFI_PASS "your-password"
#define HOST      "nodrix.you.workers.dev"
#define TOKEN     "tok_your_project_token"

const int LIGHT_LIVING  = 16;
const int LIGHT_BEDROOM = 17;
const int LIGHT_PORCH   = 18;
const int FAN           = 19;

const int RELAY_ON  = LOW;     // most relay boards are active-LOW — swap if yours isn't
const int RELAY_OFF = HIGH;

void setRelay(int pin, const char* var, bool on) {
  digitalWrite(pin, on ? RELAY_ON : RELAY_OFF);
  Nodrix.send(var, on);        // echo the real state so the dashboard stays honest
}

NODRIX_WRITE("light_living")  { setRelay(LIGHT_LIVING,  "light_living",  value.asBool()); }
NODRIX_WRITE("light_bedroom") { setRelay(LIGHT_BEDROOM, "light_bedroom", value.asBool()); }
NODRIX_WRITE("light_porch")   { setRelay(LIGHT_PORCH,   "light_porch",   value.asBool()); }
NODRIX_WRITE("fan")           { setRelay(FAN,           "fan",           value.asBool()); }

void setup() {
  int pins[] = { LIGHT_LIVING, LIGHT_BEDROOM, LIGHT_PORCH, FAN };
  for (int p : pins) { pinMode(p, OUTPUT); digitalWrite(p, RELAY_OFF); }
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();
}
```

A few things worth understanding rather than copying:

- **The echo keeps controls honest.** Sending the state back inside each handler means a toggle
  shows the relay's true position — so a scene, a schedule, and a manual tap can't leave the
  dashboard out of sync with the wall.
- **Handlers are idempotent.** Setting a pin to a definite on/off is safe to receive twice, which is
  exactly what at-least-once delivery can do across a reconnect. There's no toggle-flip that a
  duplicate could reverse.
- **State survives a reboot.** On reconnect the library re-applies the last known values, so the
  house comes back the way you left it after a power blip.
- **TLS is skipped for the first run.** `Nodrix.begin()` connects encrypted but unverified. For
  production, pin a certificate with `Nodrix.setCACert()` — see
  [Connect an ESP32 over HTTPS](/guides/esp32-https-cloud).

## Build the dashboard

Add the controls in the dashboard editor, each bound to a variable:

| Widget | Bind to | Does |
|---|---|---|
| Toggle | `light_living` | switch the living-room light |
| Toggle | `light_bedroom` | switch the bedroom light |
| Toggle | `light_porch` | switch the porch light |
| Toggle | `fan` | switch the fan |
| Value | `light_porch` | show whether the porch light is on |

Each toggle writes its variable, the library delivers it to the board, and the relay's echoed state
flows back to settle the toggle — so the dashboard mirrors the house whether the change came from
your thumb, a schedule, or a scene. The controls update live over a hibernating WebSocket, so
nothing polls and an idle house costs almost nothing to keep connected.

## Automations that run without you

The point of a smart home is the rules you don't touch. In nodrix these are **trigger → condition →
action** flows evaluated at the edge — no code on the board. Build them in the automation editor.

**Porch light at dusk.** A **sunset trigger** fires at your location's sunset and sets `light_porch`
to `on`. A **schedule trigger** at, say, 6:30 in the morning sets it back to `off`. The porch now
tracks the seasons on its own — no timer to reset when the days get shorter.

**Fan on a schedule.** A schedule trigger can turn the `fan` on before you get home and off
overnight. Add a condition later — only if a temperature variable is above a threshold — without
rewiring anything; that's the [plant-watering pattern](/guides/esp32-automatic-plant-watering) of a
sensor reading gating an action.

**Goodnight, in one tap.** A **scene** is a saved set of variable states you apply together —
`light_living`, `light_bedroom`, and `fan` off, `light_porch` on. Put a scene control on the
dashboard to run it when you head to bed, and add a schedule trigger that applies the same scene at
11:30pm as a backstop. Because the board echoes state, every toggle settles to match the scene the
moment it runs.

Swap a channel — send to Slack or Telegram instead of switching a relay, or add an "only on
weekdays" condition — and none of it touches the firmware.

## Control it from anywhere, privately

The ESP32 opens the connection **outward** to nodrix, so there's nothing to expose: no port
forwarding, no dynamic-DNS, no VPN, and it works behind the strictest home router or cellular NAT.
Port 443 is open everywhere, and the same dashboard that runs the house on your couch runs it from
another country.

And it's yours. nodrix is single-tenant on **your own Cloudflare account**, so the device history,
the scenes, and the schedules live in your tenancy — not a shared vendor cloud that can change its
terms or read your patterns. One project token authorizes the whole thing; treat it as a secret and
load it from config for anything permanent.

## When the internet drops

A smart home has to fail gracefully, so it's worth being clear about what happens:

- **Wall switches never stop working.** The relays sit alongside the existing switches, so the house
  is always operable by hand.
- **Cloud control pauses, then catches up.** While the link is down the board holds its last state;
  a command you send meanwhile is queued and delivered at-least-once the moment it reconnects, and
  automations resume on their own.
- **Critical rules belong on the board.** If one routine must run during an outage — a safety cutoff,
  say — keep that single rule in the firmware and leave the convenience logic in the cloud.

## Going further

- **Add a room by repeating.** Flash a second ESP32 with its own token and namespaced variables
  (`light_kitchen`, `light_garage`); one dashboard shows every board, no firmware change.
- **Make it sense the house.** Feed a temperature, motion, or door sensor as telemetry and gate
  actions on it — fan on when it's warm, porch light on motion after dark.
- **Dim instead of switch.** Drive a PWM channel or a dimmer module and bind a **slider** widget to
  a `brightness` variable for smooth control rather than on/off.
- **Voice and presence.** Trigger scenes from an event the firmware emits, or from a phone-presence
  webhook, so "arriving home" sets the lights without a tap.

## Notes

- **No hub, no broker.** The device speaks plain HTTPS and WebSocket; the house logic runs on your
  Cloudflare account, with nothing to keep alive at home.
- **Configurable without reflashing.** Scenes, schedules, the sunset trigger, and every condition
  are edited in the dashboard — the firmware is flashed once.
- **Single-tenant data.** Every state change stays in your own account, queryable through the read
  API.
- **Scales by repeating, not rewriting.** The same sketch runs one room or the whole house; you add
  boards and variables, never new firmware.
