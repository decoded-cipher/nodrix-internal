---
title: "Buffering telemetry on an ESP32 when the network drops"
description: "A sensor that only reports when the Wi-Fi is up has a gap in every dataset. Storing readings through an outage, replaying them on reconnect, and keeping the measurement time meaningful."
category: concept
board: ESP32
difficulty: intermediate
datePublished: 2026-09-21
faqs:
  - q: "How do I stop losing sensor readings when the Wi-Fi drops?"
    a: "Write the reading to local storage first and treat sending as a separate step. The device samples on its own schedule into a ring buffer in flash or on an SD card, and a second routine drains that buffer whenever a connection is available. Coupling the two is what causes data loss, because a failed POST then destroys the reading rather than deferring it."
  - q: "Where should an ESP32 store buffered readings?"
    a: "For a few hundred readings, a [Preferences](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/preferences.html)
namespace or a LittleFS file is enough and needs no extra hardware. For thousands, or for a device that may be offline for days, an SD card is the practical choice. Avoid writing every individual reading to flash if you can batch them, because flash has a finite erase-cycle budget and a reading every ten seconds will consume it faster than you expect."
  - q: "Will my backfilled readings appear at the right time on the chart?"
    a: "Not automatically. Most ingest endpoints, including nodrix today, timestamp a reading when it arrives rather than accepting a time from the device, so a replayed batch lands as a cluster at the reconnect moment. The workaround is to send the measurement time as a field of its own alongside the value, so the true time is preserved in the data even when the chart's x-axis is arrival time."
  - q: "How many readings should I buffer?"
    a: "Work backwards from the longest outage you want to survive. An hourly reading needs 24 slots a day; a reading every ten seconds needs 8,640. Multiply by the bytes per record and check it against the storage you have, then decide what happens when the buffer fills — overwrite oldest, or stop and keep the earliest. Both are defensible and the choice should be deliberate."
  - q: "Should the device reboot if it can't connect?"
    a: "Rarely, and never as the first response. A reboot loses anything held only in RAM and, if the outage is upstream, produces a boot loop that drains a battery far faster than idling would. Retry with a backoff, keep sampling into the buffer, and reserve a reset for the case where the network stack itself is wedged."
  - q: "Does this matter on a stable home network?"
    a: "More than expected. Router reboots, firmware updates, power cuts and brief ISP outages all produce gaps, and they cluster around exactly the events you later want to investigate. A dataset with holes in it during every power event is least useful precisely when it matters most."
related:
  - href: "/guides/esp32-wifi-keeps-disconnecting"
    label: "Wi-Fi keeps disconnecting"
    desc: "Fixing the outages rather than surviving them."
  - href: "/guides/esp32-https-cloud"
    label: "Posting over HTTPS"
    desc: "The send half of the problem."
  - href: "/guides/esp32-deep-sleep-battery"
    label: "Deep sleep and battery life"
    desc: "Buffering on a device that sleeps."
  - href: "/guides/esp32-keeps-restarting"
    label: "Reading the reset reason"
    desc: "Telling a deliberate reset from a crash."
---

Most ESP32 telemetry code samples a sensor and posts it in the same breath. If the post fails, the
reading is gone. That's fine on a desk and produces a dataset full of holes anywhere real, because
outages aren't random — they cluster around power cuts, router reboots and bad weather, which are
the events you're most likely to want to look back at.

The fix is structural rather than clever: **separate sampling from sending.** If the outages
themselves are the problem, [Wi-Fi keeps disconnecting](/guides/esp32-wifi-keeps-disconnecting)
covers fixing them rather than surviving them.

## Two loops, one buffer

Sampling runs on its own schedule and writes into local storage. Sending drains that storage
whenever a connection exists. Neither knows about the other's failures.

That single change means a network outage costs you nothing but delay, and a failed POST is a
retry rather than a loss.

## Where to put the buffer

| Storage | Good for | Watch out for |
|---|---|---|
| RAM ring buffer | Short outages, sleeping devices | Lost on reset or power cut |
| [Preferences / NVS](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/preferences.html) | Hundreds of readings | Flash wear if you write constantly |
| LittleFS file | Thousands, no extra hardware | Needs care on power-loss during write |
| SD card | Days or weeks of data | Mount failures, current draw, cost |

The wear point is worth taking seriously. Flash has a finite erase-cycle budget, and a device
writing one reading every ten seconds will work through it far faster than the datasheet figure
suggests if each write triggers an erase. Batch several readings into one write where you can.

## Sizing it

Work backwards from the outage you want to survive rather than from the storage you happen to have:

| Interval | A day | A week |
|---|---|---|
| Every 10 seconds | 8,640 | 60,480 |
| Every minute | 1,440 | 10,080 |
| Every 5 minutes | 288 | 2,016 |
| Every hour | 24 | 168 |

Then decide what happens when it fills, because it will. Overwriting oldest keeps the picture
current and loses the start of a long outage. Stopping at capacity keeps the beginning and loses
everything after. For diagnosing a failure, the beginning is usually more valuable; for knowing the
current state, the end is. Choose deliberately rather than by accident.

## The timestamp problem, stated honestly

Here is the part most tutorials skip.

When you replay a buffered batch, the readings arrive now but were measured earlier. Most ingest
endpoints — including nodrix as it stands today — timestamp a reading **when it arrives**, not from
a time supplied by the device. Native back-dated ingest is on the roadmap; it isn't there yet.

So a naive replay of six hours of buffered data produces six hours of readings all stamped within a
few seconds of each other. The values are preserved, the chronology isn't.

The workaround is to carry the measurement time in the data itself, as a field alongside the value.
The chart's x-axis is still arrival time, but the true time is in the record, so the information is
not lost and any later export or analysis can use it. Sending the reading's **age in seconds** is
more robust than an absolute timestamp on a device whose clock may not have survived the outage.

```cpp
// Sample into a ring buffer; hand readings to Nodrix when the link is up.
// beginHTTP + poll() suits a device that sleeps or has a patchy connection:
// poll() sends what is staged and returns false when it could not.

#include <Nodrix.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

const size_t CAPACITY = 500;          // size this from your worst expected outage
struct Record { uint32_t measuredAt; float value; };

Record buffer[CAPACITY];
size_t head = 0, count = 0;
uint32_t dropped = 0;

void setup() {
  Nodrix.beginHTTP(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void sample(float v) {
  if (count == CAPACITY) dropped++;   // overwriting oldest — record that we did
  buffer[head] = { (uint32_t)(millis() / 1000), v };
  head = (head + 1) % CAPACITY;
  if (count < CAPACITY) count++;
}

void drain() {
  // Oldest first. Stop at the first failure so ordering survives the outage.
  while (count > 0) {
    size_t tail = (head + CAPACITY - count) % CAPACITY;
    uint32_t age = (millis() / 1000) - buffer[tail].measuredAt;

    Nodrix.send("temperature", buffer[tail].value);
    Nodrix.send("age_s", (long)age);       // the real chronology
    Nodrix.send("buffered", age > 90);
    Nodrix.send("dropped", (long)dropped);

    if (!Nodrix.poll()) return;            // could not send — keep the reading
    count--;
    delay(50);                             // do not arrive as a burst
  }
}

void loop() {
  sample(readSensor());
  drain();                                 // no-op offline; catches up when not
  delay(60000);
}
```

Three details are doing the work. A record is only dropped from the buffer **after** a 2xx
response, so a failure defers rather than destroys. Draining stops at the first failure rather than
skipping ahead, which keeps the readings in order. And the small delay between sends stops a device
that has been offline for six hours from arriving as a burst that looks like an attack.

`Nodrix.send()` stages a reading and `poll()` transmits, which is why the drain loop above can stage
four variables and then decide, from one return value, whether the whole record survived. That
split is what makes buffering tractable — nodrix holds the staged batch, and your code only has to
own the ring buffer.

## What not to do

**Don't reboot on a failed connection.** It loses anything in RAM, and if the outage is upstream it
produces a boot loop that flattens a battery far faster than idling.

**Don't retry immediately and forever.** Back off. A device hammering a dead access point wastes
power at the worst possible moment, and on some stacks repeated failed attempts leak memory until
the board wedges.

**Don't silently discard.** If the buffer overflows, record that it did. A `dropped_count` metric
turns "the data looks odd there" into "the buffer filled at 03:40", which is the difference between
a mystery and a fact.

## Knowing the gap was a gap

The reason to send `buffered` and `age_s` at all is that it makes outages legible after the fact. A
reading that arrived late and a reading that was measured late look identical on a chart otherwise.

With those fields, the questions you'll actually ask become answerable: how long was it offline,
did it recover on its own, did anything get dropped, and was the sensor still sampling the whole
time. Without them the honest answer is that you can't tell, which is an uncomfortable position to
be in when the gap sits over the incident you're investigating.

Size the buffer from the longest outage you're willing to survive, decide deliberately what happens
when it fills, and record that it filled. A gap you can explain is a data point; a gap you can't is
just a hole in the dataset.
