---
title: "M5Stack EzData stores 500 readings: what to do next"
description: "EzData is a variable store, not a historian. The documented limits, the arithmetic they imply for your sampling rate, and how to send M5Stack telemetry somewhere you control."
category: comparison
board: M5Stack
difficulty: beginner
datePublished: 2026-09-21
faqs:
  - q: "How much data does M5Stack EzData actually store?"
    a: "M5Stack's documentation states that a data field supports recording up to 500 historical data entries. That's a count of readings, not a time period, so the window it gives you depends entirely on how often you write. At one reading a minute it is a little over eight hours; at one an hour it is about three weeks."
  - q: "Does EzData delete my data?"
    a: "Yes, after a period of inactivity. The documentation states that if no data operations are performed within six months, the data queue corresponding to that token will be cleared. That matters for a project you revisit occasionally rather than one that reports continuously, because a seasonal device can come back to an empty history."
  - q: "Is EzData being discontinued?"
    a: "No. As of September 2026 it is documented and current, with no deprecation notice. The reason to move data elsewhere is capacity and durability rather than any expectation that the service is going away. It does what it was designed to do; it was just not designed to be a historian."
  - q: "Why did my EzData token change?"
    a: "The documentation notes that all operations rely on a unique token which remains fixed within the same browser environment. A different browser, a cleared profile or a different machine can therefore leave you addressing a different data queue than the one you were writing to, which reads as data loss but is really an addressing problem."
  - q: "How do I send M5Stack data to my own server instead?"
    a: "Both UIFlow and the Arduino path can make an HTTP POST, which is the smallest change from an EzData workflow. In UIFlow2 the usual failure is omitting the JSON content-type header, which produces a 400 with an unhelpful body. From there the readings go wherever you point them, and the retention question becomes yours rather than the platform's."
  - q: "Should I run MQTT and InfluxDB and Grafana instead?"
    a: "That stack works and plenty of people run it, but it is three services to install, secure, back up and keep patched for what is often a handful of readings a minute from one device. It's the right answer when you already operate that infrastructure and the wrong one when the alternative is a dashboard you didn't have to run at all."
related:
  - href: "/guides/open-source-iot-dashboard"
    label: "Open-source IoT dashboards"
    desc: "The wider set of options for telemetry you own."
  - href: "/guides/best-free-iot-platforms"
    label: "Free IoT platform limits"
    desc: "How the free tiers actually compare."
  - href: "/guides/esp32-https-cloud"
    label: "Posting over HTTPS"
    desc: "The mechanics of getting readings off a device."
  - href: "/guides/mqtt-vs-http-iot"
    label: "MQTT or HTTP"
    desc: "Choosing a transport for device telemetry."
---

EzData is the path of least resistance on an M5Stack device. It's built into [UIFlow](https://docs.m5stack.com/en/uiflow2/blockly/ezdata/ezdata_manager), it
needs no account setup beyond a token, and it turns a sensor reading into something you can see from
anywhere in about a minute of block dragging.

It's also a variable store rather than a historian, and M5Stack documents the limit plainly. Once
you understand what the number means for your sampling rate, the question of when to move on
answers itself.

## The documented limits

Three statements from M5Stack's own documentation define the shape of the service.

On capacity, the [EzData2 documentation](https://docs.m5stack.com/en/guide/ezdata/ezdata_v2) states
that a data field **"supports recording up to 500 historical data entries"**.

On retention, the [EzData manager documentation](https://docs.m5stack.com/en/uiflow2/blockly/ezdata/ezdata_manager)
states: **"If no data operations are performed within six months, the data queue corresponding to
that token will be cleared."**

On addressing: **"All operations rely on the unique token, which remains fixed within the same
browser environment."**

**None of these is a criticism.** They are the specification of a lightweight key-value service that
happens to keep a short rolling history. **The mistake is reading it as a logging platform.**

## What 500 entries means at your sampling rate

The cap is a count, not a duration, so the window depends on how often you write:

| Sampling interval | History you keep |
|---|---|
| Every 10 seconds | About 1 hour 23 minutes |
| Every minute | About 8 hours 20 minutes |
| Every 5 minutes | About 1 day 17 hours |
| Every 15 minutes | About 5 days |
| Every hour | About 20 days |

A one-minute interval is a common default and feels conservative. It gives you less than a working
day of history. If you check a chart on Monday morning covering a problem that happened over the
weekend, it is already gone.

The six-month clause compounds this for anything seasonal. A greenhouse controller, a holiday-home
monitor or a frost alarm that sits idle through the off-season can return to a cleared queue at
exactly the moment last year's data would have been useful to compare against.

Nothing here argues against EzData for what it was built for. It's the difference between a variable
store and a historian, and nodrix sits on the other side of that line — same device, same HTTP call,
retention you set rather than inherit.

## The signals that you have outgrown it

Worth moving when any of these is true:

- You want to compare this week against last month.
- You need an alert based on a trend rather than a single threshold, such as a slow leak or a
  drifting sensor.
- More than one person, or more than one browser, needs to see the same data.
- The device reports intermittently and gaps matter.
- You're adding a second or third device and want them on one screen.

None of those is exotic. They are simply what happens as a project stops being a demo, and they're
all outside what a 500-entry rolling buffer can do.

## Getting data out

The smallest change from an EzData workflow is an HTTP POST to an endpoint you control. Both UIFlow
and the Arduino core can do it, and the shape is the same either way:

```cpp
// M5Stack is an ESP32, so the Nodrix library runs on it directly — the
// readings go to a deployment you own instead of a 500-entry queue.

#include <Nodrix.h>
#include <M5Unified.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);

  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();
  M5.update();

  static unsigned long last = 0;
  if (millis() - last < 60000) return;
  last = millis();

  float temp = 0, hum = 0;
  if (!readEnvUnit(&temp, &hum)) return;    // sensor absent — send nothing

  Nodrix.send("temperature", temp);
  Nodrix.send("humidity", hum);
  Nodrix.send("uptime_s", (long)(millis() / 1000));

  M5.Display.setCursor(0, 0);
  M5.Display.printf("%.1fC %.0f%%  %s", temp, hum,
                    Nodrix.connected() ? "online" : "offline");
}
```

Two details cause most of the trouble here, and neither produces a useful error message.

Omitting the JSON content-type header is the first. The request goes out, the server rejects it,
and what comes back is a 400 with a body that doesn't explain itself. The second is calling
`.json()` on a response that has no JSON body, which in some UIFlow builds hangs rather than
raising. Print the status code and close the response; don't parse what you don't need.

Note also that the failure path above logs and continues. A network error on a device in a
greenhouse should not restart the device, and a `try` block that reboots on failure turns a brief
outage into a boot loop.

## Where the readings should land

Three options, honestly compared.

**Keep EzData** for anything where a short rolling window is genuinely enough: a live value on a
phone, a demo, a switch state you only ever want the current reading of. It's the least work and
there's no reason to move.

**Run MQTT, InfluxDB and Grafana** if you already operate that infrastructure. It's capable and
well understood. For a single device reporting once a minute it is three services to install,
secure, back up and patch, and the ongoing cost is attention rather than money.

**Post to a dashboard you own** if what you actually wanted was the EzData experience without the
ceiling. That's what nodrix is: you deploy it to your own Cloudflare account, the device posts
JSON to it exactly as above, and the history is bounded by what you choose to keep rather than by a
500-entry queue. Because it runs in your account, the data is yours in the straightforward sense —
there's no token in someone else's browser standing between you and it.

The M5Stack hardware isn't the limitation here and nothing above suggests replacing it. The ENV,
the Core and the Stick are good devices doing exactly what they should. It's only the default
place their readings land that has a ceiling worth knowing about before you hit it.
