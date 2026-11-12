---
title: "Forwarding edge AI results to a dashboard"
description: "Send the counts and the classifications, not the frames. The pattern works the same on an ESP32-S3, a Raspberry Pi with an AI HAT+ or a Jetson, and the payload is tiny either way."
category: concept
board: ESP32-S3
difficulty: intermediate
datePublished: 2026-09-21
faqs:
  - q: "Should I send video frames or inference results to the cloud?"
    a: "Results, almost always. A frame is hundreds of kilobytes and needs bandwidth, storage and a privacy conversation. The count, the class and the confidence are a few dozen bytes, they chart directly, and they answer the questions people actually ask of a vision system. Send frames only when a human genuinely needs to look at the image."
  - q: "What does an edge AI device actually report?"
    a: "Numbers and labels. How many objects were detected, what class they were, the confidence, and often an event when a threshold is crossed. That's ordinary telemetry of exactly the shape a dashboard already handles, which is why the transport question is much simpler than people expect."
  - q: "Does this work on a Jetson as well as an ESP32?"
    a: "Yes, and the pattern is identical — only the inference half differs. On a Jetson, DeepStream already includes a message broker that emits detection metadata over MQTT, Kafka or AMQP, so you're configuring an existing path rather than writing one. On an ESP32 you post the result yourself, which is a few lines."
  - q: "Should I use this instead of Frigate?"
    a: "No, if Frigate fits. Frigate already publishes per-camera and per-zone object counts over MQTT into Home Assistant, for free, and competing with it on camera NVR is a bad trade. This pattern is for the cases Frigate doesn't cover — a microcontroller with a camera, a counting sensor, or a device that isn't a security camera at all."
  - q: "How often should an edge AI device report?"
    a: "Far less often than it infers. A model running at 10 frames a second does not need to send 10 readings a second. Aggregate over a window — maximum count in the last minute, or total crossings in the last five — and send that. It cuts traffic by orders of magnitude and produces a more readable chart."
  - q: "Do I need a GPU board for this at all?"
    a: "Often not. Counting, presence detection and small-class classification run on an ESP32-S3 or ESP32-P4 without a Linux machine anywhere. Decide what the model has to do before deciding what hardware runs it, because the answer frequently fits on a microcontroller."
related:
  - href: "/guides/esp32-s3-edge-ai"
    label: "Edge AI on the ESP32-S3"
    desc: "Running the model itself."
  - href: "/guides/edge-ai-board-prices-2026"
    label: "Edge AI board prices in 2026"
    desc: "Choosing hardware after the price rises."
  - href: "/guides/esp32-offline-buffering"
    label: "Buffering when the network drops"
    desc: "Keeping counts through an outage."
  - href: "/guides/esp32-notifications"
    label: "Alerts from a device"
    desc: "Acting on a threshold crossing."
---

The interesting output of an edge AI device is almost never the picture. **It's the number.**

How many cars used the drive. Whether the gate was left open. How many bees left the hive this
afternoon. Those are small, numeric, and they chart — which means the hard-sounding part of edge AI,
getting the results somewhere useful, is the easy part.

## Send results, not frames

A frame is hundreds of kilobytes. A result is a few dozen bytes:

```json
{ "count": 3, "class": "car", "confidence": 0.91 }
```

That difference decides the architecture. Frames need bandwidth, storage, retention policy and a
conversation about who can see them. Results need none of that — and they answer the question you
actually had, which was how many rather than what did it look like.

**The privacy story changes too.** A device that never transmits an image is much easier to justify
in a shared house, a workplace or anywhere pointed at a public path, and it's a materially different
conversation from one about a camera that uploads.

## The pattern

Three steps, the same on every board:

1. **Infer locally** at whatever rate the model runs.
2. **Aggregate over a window** — maximum count in the last minute, total crossings in the last five.
3. **Report the aggregate**, plus an event when a threshold is crossed.

Step two is where most implementations go wrong. A model running at 10 fps does not need to report
10 times a second; that's 864,000 readings a day describing a driveway that had four cars on it.
Aggregate first and the chart becomes readable as well as cheap.

```cpp
// ESP32-S3 running a small detector: report the count, never the frame.
// Aggregate over a minute, then send one reading plus an event on crossing.

#include <Nodrix.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

#define WINDOW_MS   60000
#define ALERT_COUNT 5

int windowMax = 0;
bool alerted = false;

int runDetector();          // your model: returns objects detected this frame

void setup() {
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();

  int n = runDetector();                 // 10 fps or whatever the model manages
  if (n > windowMax) windowMax = n;      // aggregate, don't transmit

  static unsigned long last = 0;
  if (millis() - last < WINDOW_MS) return;
  last = millis();

  Nodrix.send("object_count", windowMax);       // one reading per window
  Nodrix.send("uptime_s", (long)(millis() / 1000));

  if (windowMax >= ALERT_COUNT && !alerted) {
    Nodrix.event("crowd_detected");             // edge-triggered, not per window
    alerted = true;
  } else if (windowMax < ALERT_COUNT - 1) {
    alerted = false;                            // hysteresis stops it chattering
  }

  windowMax = 0;                                // reset the window
}
```

The hysteresis band matters more than it looks. Without it, a count hovering at the threshold fires
an event every minute, and an alert that cries wolf gets muted — at which point the system is worse
than no system.

## On bigger boards

The pattern doesn't change; only the inference half does.

**Raspberry Pi with an AI HAT+.** Run the model in Python, aggregate in the same loop, post the
result. Raspberry Pi's own traffic-monitoring example graphs vehicle and person counts over time —
the same shape as above with a larger model behind it.

**Jetson.** DeepStream already ships this path: `Gst-nvmsgconv` turns detection metadata into a
payload and
[`Gst-nvmsgbroker`](https://docs.nvidia.com/metropolis/deepstream/dev-guide/text/DS_plugin_gst-nvmsgbroker.html)
sends it over MQTT, Kafka, AMQP or Redis. You're configuring an existing path rather than writing
one, and a small bridge subscribed to that topic puts the results wherever you want them.

**Where not to do this.** If what you want is a security camera with recording and zones,
[Frigate](https://docs.frigate.video/integrations/mqtt/) already publishes per-camera and per-zone
counts over MQTT into Home Assistant for free. Don't rebuild it. This pattern is for the cases it
doesn't cover — a microcontroller with a camera, a counter that isn't a camera at all, or a device
where a full NVR is absurd overkill.

## Latency, and where the decision lives

One design question decides a lot: **does the device act on its own, or does the dashboard tell it
what to do?**

Keep the decision local wherever the consequence is physical. A gate that closes, a heater that
switches, an alarm that sounds — all of those should act on the edge device's own inference, with
the dashboard as a record of what happened rather than as a step in the loop. A round trip over the
internet is fine until the internet isn't, and a device that can't decide anything without a
network is a device that stops working during an outage.

Send the result upward regardless. That way the dashboard holds the count, the event and the
confidence, and the device holds the responsibility — which is the split that survives a bad week
of connectivity.

## What the history is for

A single count is nearly useless. The same count every minute for three months is a different
thing: you learn that the car park fills at 08:40, that the hive's afternoon activity collapsed the
week it rained, that the corridor sensor has been reading two since Tuesday because something is
parked in front of it.

Because the payload is a handful of numbers, keeping years of it costs almost nothing — and a nodrix
deployment on your own Cloudflare account takes `object_count` as an ordinary variable, with the
retention being your decision. **The inference is the hard engineering; the storage genuinely
isn't.**

One habit worth adopting from the start: send the model's confidence alongside the count. A
detector whose confidence drifts down over months is usually telling you the lens is dirty or the
light changed, and that's visible in the series long before the counts go obviously wrong.
