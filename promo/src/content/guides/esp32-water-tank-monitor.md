---
title: "Build an ESP32 water tank level monitor with low-water alerts"
description: "A complete ESP32 water level sensor for a tank or sump: measure depth with a waterproof JSN-SR04T ultrasonic probe, stream percentage full to a live dashboard, and get a Telegram alert before the tank runs dry — no float switches, no broker, on your own Cloudflare account."
category: project
board: ESP32
difficulty: beginner
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "Why use a JSN-SR04T instead of a cheap HC-SR04?"
    a: "Because the air above stored water is saturated, and an HC-SR04's exposed transducers fog up and then read nonsense. The JSN-SR04T puts the transducer in a sealed, potted probe on a cable, so the electronics stay outside the tank and the sensing face tolerates condensation and splashing. It's a few dollars more and it's the difference between a build that works in week three and one that doesn't."
  - q: "How far above the water does the sensor need to be?"
    a: "At least 20 cm above the highest the water will ever reach. The JSN-SR04T's sealed probe has a minimum detection distance of about 20 cm — far longer than the HC-SR04's 2 cm — and anything closer than that reads as garbage rather than as zero. This is the single most common reason a tank monitor works fine when half full and goes haywire when it fills."
  - q: "Can I use this to control a pump automatically?"
    a: "Yes, and the guide wires it up — but put the cutoff logic in the cloud, not in the sketch. A level threshold that starts and stops a pump is an automation you can retune from your phone without reflashing a board that may be bolted to a tank. Add a hard maximum runtime as a second condition so a bad reading can never run a pump indefinitely."
  - q: "Why are my readings jumping around?"
    a: "Ultrasonic sensors report the nearest thing that echoes, which in a tank can be a ripple from the inlet, floating debris, or the tank wall if the beam clips it. Take several readings and use the median rather than the average — one wild value poisons a mean but not a median — and mount the probe away from where water enters."
  - q: "Is a pressure sensor more accurate?"
    a: "A submersible pressure transducer is more accurate and immune to surface chop, because it measures the column of water above it rather than bouncing sound off the top of it. It also costs several times more and has to live in the water permanently. For a domestic tank where you want to know roughly how many days you have left, ultrasonic from above is the better trade."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The Wi-Fi and TLS foundation this build stands on."
  - href: "/guides/esp32-notifications"
    label: "ESP32 notifications"
    desc: "Telegram, Discord, Slack, and SMS from one sketch."
  - href: "/guides/esp32-automatic-plant-watering"
    label: "Automatic plant watering"
    desc: "The same closed-loop pump pattern, at plant scale."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The dashboard this reports to."
---

Running a tank dry is the kind of problem you only notice at the worst possible moment. A level
sensor fixes it for about ten dollars, and the useful version isn't a gauge you walk out to read —
it's a number on your phone that tells you how full the tank is and messages you before it matters.

This build measures depth with a waterproof ultrasonic probe, streams percentage full to a live
dashboard, and sends a Telegram alert when the level drops past a threshold you can change without
touching the board. No float switches to corrode, no MQTT broker, and nothing running on a server at
home.

## What you'll build

An ESP32 mounted at the top of a tank, reporting two variables: the measured distance to the water
surface and the derived percentage full. The dashboard shows a gauge and a history chart; an
automation watches the percentage and fires the alert.

## Why the JSN-SR04T, and not an HC-SR04

The HC-SR04 is the ultrasonic sensor every tutorial reaches for, and it is the wrong part here. Its
two transducers are open to the air. The space above stored water sits at essentially 100% humidity,
so those transducers collect condensation, and a fogged transducer doesn't fail cleanly — it returns
plausible-looking wrong numbers.

The JSN-SR04T solves the packaging problem rather than the physics. The transducer is potted into a
sealed probe on the end of a cable, with the driver board outside the tank. The probe tolerates
condensation and the odd splash, and the electronics stay dry.

It buys that robustness with one significant trade, covered below: a much longer minimum range.

## What you'll need

- An **ESP32** dev board — any common DevKit variant.
- A **JSN-SR04T** waterproof ultrasonic sensor (version 2.0 if you can pick, for reasons below).
- A stable **5V supply** for the sensor — this matters more than it sounds.
- A weatherproof enclosure and a way to mount the probe pointing straight down.
- A **nodrix instance** with a project and a project token.

## Wiring

Four connections. The sensor's driver board takes 5V, the probe plugs into it, and two GPIOs do the
timing:

| From | To | Wire |
|------|----|------|
| JSN-SR04T <span class="pin">VCC</span> | ESP32 <span class="pin">VIN</span> / 5V | Power |
| JSN-SR04T <span class="pin">GND</span> | ESP32 <span class="pin">GND</span> | Ground |
| JSN-SR04T <span class="pin">TRIG</span> | ESP32 <span class="pin">GPIO5</span> | Trigger pulse |
| JSN-SR04T <span class="pin">ECHO</span> | ESP32 <span class="pin">GPIO18</span> | Echo timing |

Two wiring notes worth getting right the first time. The sensor wants a genuinely stable 5V — brownouts
on a shared USB rail are the most common cause of a sensor that returns one frozen value forever. And
on **version 2.0** boards the logic runs down to 3.0V, so ECHO connects straight to a 3.3V GPIO; on
**older revisions** ECHO idles at 5V and wants a divider (a 1kΩ / 2kΩ pair to ground) to keep it off
the ESP32's pin. If you don't know which revision you have, fit the divider — it's harmless on a 2.0.

## Mounting: the 20 cm rule

This is the constraint that decides whether the build works, and most tank tutorials inherit
HC-SR04 numbers and never mention it.

The sealed probe has a **minimum detection distance of about 20 cm**. Closer than that, the echo
returns while the transducer is still ringing, and the sensor reports a wrong number rather than an
error. So the probe must sit at least 20 cm above the highest the water will ever reach — not 20 cm
above the tank lid, 20 cm above the *full* waterline.

Get this wrong and the failure is maddening to debug, because it only appears when the tank is full:
the monitor reads correctly all week, then reports nonsense on the day it rains. Mount high, and if
the tank fills close to its lid, accept that the top 20 cm is a blind spot and calibrate `FULL_CM` to
the first distance the sensor reads reliably.

Point the probe straight down at open water, away from the inlet stream and at least a hand's width
from the tank wall, so the beam isn't clipping the side on its way down.

## The firmware

The sketch pulses the trigger, times the echo, and converts the round trip to a distance. It takes
five readings and uses the **median** — ultrasonic sensors report the nearest thing that echoes, and
a single ripple or a bit of floating debris will otherwise show up as a sudden empty tank.

Calibration is two constants. `EMPTY_CM` is the distance the sensor reads with the tank empty;
`FULL_CM` is what it reads when full. Measure both rather than calculating them from the tank's
dimensions — what matters is where the probe actually ended up, not where you meant to put it.

```cpp
#include <Nodrix.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

const int TRIG_PIN = 5;
const int ECHO_PIN = 18;

const float EMPTY_CM = 180.0;   // sensor -> tank floor, measured
const float FULL_CM  =  35.0;   // sensor -> full waterline, measured (keep >= 20)

float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(4);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long us = pulseIn(ECHO_PIN, HIGH, 60000UL);  // timeout ~10 m
  if (us == 0) return -1;                               // no echo
  return us / 58.0;
}

float medianDistanceCm() {
  float s[5];
  int n = 0;
  for (int i = 0; i < 5; i++) {
    float d = readDistanceCm();
    if (d > 0) s[n++] = d;
    delay(60);
  }
  if (n == 0) return -1;

  for (int i = 1; i < n; i++) {          // insertion sort, n is 5
    float k = s[i];
    int j = i - 1;
    while (j >= 0 && s[j] > k) { s[j + 1] = s[j]; j--; }
    s[j + 1] = k;
  }
  return s[n / 2];
}

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();

  static unsigned long last = 0;
  if (millis() - last >= 60000) {
    last = millis();

    float cm = medianDistanceCm();
    if (cm < 0) return;                                  // skip, don't send garbage

    float pct = (EMPTY_CM - cm) / (EMPTY_CM - FULL_CM) * 100.0;
    pct = constrain(pct, 0.0, 100.0);

    Nodrix.send("tank_distance_cm", cm);
    Nodrix.send("tank_level", pct);
  }
}
```

Note what happens on a failed reading: the sketch returns without sending. A gap in the chart is an
honest signal that the sensor didn't answer. Sending a zero instead would look exactly like an empty
tank, and would fire your low-water alert at three in the morning.

## Build the dashboard

Both variables appear the first time they're seen. Drop a **gauge** widget on `tank_level` with a
range of 0–100 for the at-a-glance view, and a **chart** widget on the same variable for history —
the slope is the genuinely useful part, because it tells you consumption rate and therefore how many
days you have left.

Keep `tank_distance_cm` on a **value** widget too. When something looks wrong, the raw distance is
what you debug with; the percentage is derived and hides the problem.

## Add the low-water alert

Create an automation with a **variable** trigger on `tank_level`, condition *below 20*, and a
**Telegram** action — or any of the other channels in the
[notifications guide](/guides/esp32-notifications). The message can interpolate the value, so it arrives as something useful rather
than a bare ping.

Putting the threshold in the cloud rather than in the sketch is the point. A tank monitor ends up
somewhere inconvenient — a roof, a pump house, a crawlspace — and the moment you want to change 20%
to 15%, the difference between editing an automation and fetching a laptop and a USB cable is the
difference between doing it and not bothering.

Add a second automation with a **schedule** trigger that reports the level once a day. A tank that
has stopped reporting entirely is the failure you most want to hear about, and only a positive daily
message tells you the difference between "level is fine" and "the board died a week ago".

## Going further

To drive a pump, add a relay and a write handler bound to a `pump` variable:

`NODRIX_WRITE("pump") { digitalWrite(PUMP_PIN, value.asBool() ? HIGH : LOW); Nodrix.send("pump", value.asBool()); }`

Then let an automation start it when the level drops and stop it when the level recovers — the
[same closed-loop pattern](/guides/esp32-automatic-plant-watering) as a self-watering planter, at
tank scale. Echo the real pin state back with `Nodrix.send` as shown, so a dashboard opened later
hydrates with what the hardware is actually doing rather than what someone last clicked.

Give any pump automation a hard maximum runtime as a second stop condition. Level-based control
assumes the level reading is correct, and a sensor that fails while a pump is running is precisely
the scenario that empties a well or floods a floor.

For a battery build on a remote tank, drop the always-on socket and use the wake-report-sleep
pattern from the [battery-life guide](/guides/esp32-deep-sleep-battery). A tank level changes slowly
enough that one reading every fifteen minutes is plenty, and the sensor's 5V draw only exists during
the brief window it's awake.

## Notes

Ultrasonic time-of-flight varies with air temperature — sound travels roughly 0.6% faster per degree
Celsius. Across a tank's working range that's a centimetre or two, which is irrelevant for a
percentage-full reading and would matter if you were billing someone for the contents.

The `pulseIn` timeout of 60,000 µs caps a measurement at roughly ten metres. A tank deeper than that
needs a longer timeout; a shallower one gets faster failure detection from a shorter one.

Foam and heavy surface debris absorb ultrasound rather than reflecting it, which shows up as
intermittent no-echo readings rather than wrong ones. The median filter and the skip-on-failure
behaviour above handle occasional cases; persistent foam is a reason to reach for a pressure sensor
instead.
