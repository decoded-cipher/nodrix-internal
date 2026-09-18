---
title: "ESP32 Wi-Fi keeps disconnecting: a reconnect that holds"
description: "Why a board that connects fine drops out after hours, the reconnect loop that actually survives it, and how to know a device went offline instead of guessing."
category: concept
board: ESP32
difficulty: intermediate
datePublished: 2026-09-18
faqs:
  - q: "Why does my ESP32 keep disconnecting from WiFi?"
    a: "Most long-running disconnects are not the board failing. The common causes are the access point expiring the association and requiring a fresh handshake, DHCP lease renewal going wrong, band steering moving the SSID to a 5 GHz radio the ESP32 cannot join, a mesh system roaming the client to a different node, and weak signal at the edge of range. The board is usually reporting a real network event, which is why a blind retry loop rarely fixes it."
  - q: "Why does my ESP32 reconnect but then drop again immediately?"
    a: "Usually because the retry has no backoff. A tight loop hammering the access point on failure often makes things worse, and on some routers it looks enough like abuse to get the client temporarily rejected. Backing off progressively, from about a second up to roughly a minute, both recovers faster in practice and stops the board making its own situation worse."
  - q: "Should I use WiFi.setAutoReconnect?"
    a: "It is worth enabling, but do not rely on it alone. It handles the simple case where the association drops and the same credentials still work. It does not help when the authentication state has expired, when DHCP fails, or when the access point has moved to a band the board cannot use, and those are exactly the cases that produce the slow overnight failures people complain about."
  - q: "How do I know my ESP32 went offline?"
    a: "From the other end, because a board that is off the network cannot tell you anything. Send a heartbeat on a regular interval and have the backend alert when it stops arriving. That distinguishes a device that is offline from a sensor reading that simply has not changed, which is a distinction you cannot make by looking at the last value."
  - q: "Should the board reboot itself if WiFi will not come back?"
    a: "As a last resort, yes. After a number of failed attempts, a restart clears driver and TCP state that a reconnect loop cannot reach, and it is the difference between a device that recovers by itself and one you have to go and power-cycle. Make it the fallback after backoff has genuinely failed, not the first response to a dropped packet."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The connection this keeps alive."
  - href: "/guides/esp32-notifications"
    label: "Alerts from a board"
    desc: "Getting told when a device stops reporting."
  - href: "/guides/esp32-deep-sleep-battery"
    label: "ESP32 battery life"
    desc: "Reconnect behaviour on a duty-cycled device."
  - href: "/guides/esp32-wifi-provisioning"
    label: "WiFi provisioning"
    desc: "Getting credentials onto the board in the first place."
---

The board connects fine on the bench. Then it runs for eleven hours and stops, and the next morning
you power-cycle it and it runs for another eleven. The usual advice is to call `WiFi.reconnect()` in
a loop, which is where most write-ups end and where the real problem starts.

## Why it actually drops

A long-running disconnect is nearly always the network doing something, not the board failing:

- **The association expires.** Access points periodically require a fresh handshake. A client that
  assumes its authentication is permanent gets dropped and does not always recover on its own.
- **DHCP lease renewal fails.** The lease expires, renewal does not complete, and the board holds an
  address it no longer owns.
- **Band steering.** A router publishing one SSID across 2.4 and 5 GHz decides the client belongs on
  5 GHz. Most ESP32 variants cannot join it, so the SSID is visibly present and unjoinable. The
  [ESP32-C5](https://www.espressif.com/en/news/ESP32-C5_Mass_Production) is the exception — it is the
  first dual-band part in the family.
- **Mesh roaming.** A multi-node system moves the client to a different node. Well-behaved clients
  follow; a board that cached one BSSID may not.
- **Edge of range.** Reported signal looks acceptable but sits close to the threshold, so ordinary
  interference tips it over.

Only the last is about the board's radio. The rest are events it is correctly reporting, which is
why retrying harder does not help.

## What a reconnect needs

Four things, in order of how much they matter:

1. **Backoff.** Retry after a second, then two, then four, capped around a minute. A tight retry
   loop recovers no faster and on some routers looks enough like abuse to get you rejected.
2. **A reboot fallback.** After a number of failed attempts, restart. This clears driver and TCP
   state a reconnect cannot reach, and it is what separates a device that recovers by itself from
   one you have to go and unplug.
3. **More than one network.** If a second access point is reachable, having the board choose the
   strongest removes band steering and roaming as single points of failure.
4. **Knowing it happened.** A board that is off the network cannot report that it is off the
   network. That has to come from the other end.

## The device side

The [nodrix Arduino library](https://github.com/decoded-cipher/nodrix-sdk) handles the loop, the backoff and the reconnect, so the sketch stays about the
work rather than about the network. What it adds is the fourth item — a heartbeat, so the absence of
a device is itself a signal:

```cpp
#include <Nodrix.h>
#include <WiFi.h>

const char* HOST  = "nodrix.you.workers.dev";
const char* TOKEN = "tok_your_project_token";

const unsigned long HEARTBEAT_MS = 60000;

void setup() {
  Serial.begin(115200);

  // Register every network the board might see; the strongest reachable one wins.
  Nodrix.addAP("house-2.4", "your-password");
  Nodrix.addAP("garage",    "your-other-password");

  Nodrix.setFirmwareVersion("1.0.0");

  Nodrix.onConnect([]    { Serial.println("link up"); });
  Nodrix.onDisconnect([] { Serial.println("link lost"); });

  Nodrix.begin(HOST, TOKEN);             // networks come from addAP above
}

void loop() {
  Nodrix.run();                          // reconnect and backoff live here

  static unsigned long lastBeat = 0;
  if (millis() - lastBeat >= HEARTBEAT_MS) {
    lastBeat = millis();
    Nodrix.send("uptime_s", (long)(millis() / 1000));
    Nodrix.send("rssi", WiFi.RSSI());
  }
}
```

Two variables carry most of the diagnostic value:

- **`uptime_s`** resets to zero on reboot. A sawtooth on that chart is a board restarting, and the
  period tells you how often. It is the difference between "the network is flaky" and "the board is
  crashing", which look identical from the dashboard otherwise.
- **`rssi`** logged over time shows whether disconnects line up with signal dropping. If they do,
  the fix is an antenna or a location, not code.

## Knowing it went offline

This is the part a reconnect loop cannot do, and it is why the interesting half of this problem lives
on the backend rather than on the board.

Because the heartbeat arrives on an interval, its absence is detectable. On your deployment:

- Add a **last-seen** widget to the dashboard, so a stale device is visible at a glance rather than
  hiding behind a plausible-looking last reading.
- Build an **automation** that fires when the heartbeat stops arriving, and have it send to Telegram,
  Discord, Slack or email through an integration.
- Chart **`uptime_s`** and **`rssi`** together. The shape of those two lines usually identifies the
  cause without a serial cable.

That distinction — offline versus unchanged — is the one you cannot make by looking at the last
value. A temperature that reads 21.4 °C is indistinguishable from a board that died three hours ago
while reporting 21.4 °C, unless something is watching for the silence.

## Router-side fixes worth trying

Before rewriting more firmware, some of these are a five-minute change and remove the cause outright:

| Symptom | Try |
|---|---|
| SSID visible, board will not join | Split the 2.4 GHz SSID from 5 GHz, or disable band steering for it |
| Drops when moving between rooms | Pin the board to one access point, or accept roaming and rely on reconnect |
| Drops at a consistent interval | Look at the DHCP lease time; a static reservation removes renewal as a cause |
| Drops only under load | Check for channel congestion; 2.4 GHz is crowded and the ESP32 has a small antenna |

A static DHCP reservation on the router is worth doing regardless. It makes the board's address
stable without hardcoding a static IP in firmware, which is the version of this that breaks when you
move house.

## What good looks like

A board that has been up for weeks, a heartbeat that has not gaped, and an alert that would have
told you if it had. If `uptime_s` shows a sawtooth you have a crash rather than a network problem,
and that is a different guide — but at least you now know which one you are reading.
