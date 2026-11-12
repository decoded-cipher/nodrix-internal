---
title: "CircuitPython Wi-Fi and MQTT that reconnects reliably"
description: "MiniMQTT's reconnect() can drop your subscriptions and your QoS, and repeated Wi-Fi failures leak memory until the board dies. A reconnect loop that survives both."
category: concept
board: ESP32
difficulty: intermediate
datePublished: 2026-09-21
faqs:
  - q: "Why does my CircuitPython board stop receiving MQTT messages after a reconnect?"
    a: "Because reconnecting doesn't reliably restore what you were subscribed to. There are open issues on Adafruit's own MiniMQTT tracker reporting that reconnect() can produce partial resubscriptions and that it loses QoS on subscribed topics. The connection looks healthy and publishing still works, so the board appears fine while silently receiving nothing. Resubscribe explicitly after every reconnect rather than trusting the library to restore state."
  - q: "Why does my CircuitPython board run out of memory after a few days?"
    a: "A documented core issue reports that a sequence of ConnectionError exceptions raised from wifi eventually leads to a MemoryError. Each failed connection attempt can leave something behind, so a board in a location with marginal signal accumulates the damage over days. Bounding retry attempts and falling back to a hard reset is the practical defence, because a reset costs seconds and a wedged board costs the whole dataset."
  - q: "Should I use MQTT or HTTPS on CircuitPython?"
    a: "If you're only sending readings up, HTTPS POST avoids the entire problem class. The MQTT failure cluster is almost all session-state pain — subscriptions, QoS, broker sessions, reconnection — and a stateless POST has none of that state to lose. Choose MQTT when you genuinely need the broker to push messages down to the device, and HTTP when you're reporting telemetry in one direction."
  - q: "Why does my MiniMQTT connection fail with a confusing SSL error?"
    a: "A long-standing issue notes that the exception is tricky to troubleshoot when the client defaults to SSL but the broker isn't using it. The mismatch surfaces as a socket or handshake error that doesn't name the real cause. Check the port first: 1883 is normally plaintext and 8883 is normally TLS, and a client configured for one against a broker expecting the other produces exactly this."
  - q: "Does a watchdog fix a wedged CircuitPython board?"
    a: "Partly. A hardware watchdog recovers a board that has stopped feeding it, which covers a hard lock-up but not a board that's still looping happily while subscribed to nothing. That silent failure needs an application-level check — track when you last received or successfully published, and reset yourself when that goes stale."
  - q: "Which CircuitPython version should I be on?"
    a: "The 10.x line is current, with 10.3.1 released in September 2026 on a fast minor-release cadence. Networking fixes land regularly, so being several minor versions behind on a board that reconnects a lot is worth avoiding. Check the open issues for your specific board before assuming a bug is in your code."
related:
  - href: "/guides/esp32-wifi-keeps-disconnecting"
    label: "Wi-Fi keeps disconnecting"
    desc: "The network-side causes, on the Arduino core."
  - href: "/guides/mqtt-vs-http-iot"
    label: "MQTT or HTTP"
    desc: "Choosing a transport, and what each costs you."
  - href: "/guides/esp32-https-cloud"
    label: "Posting over HTTPS"
    desc: "The stateless alternative in practice."
  - href: "/guides/esp32-keeps-restarting"
    label: "Reading the reset reason"
    desc: "Telling a deliberate reset from a crash."
---

A CircuitPython board that runs perfectly on your desk and mysteriously goes quiet after three days
in a shed is usually not a power problem. It's reconnection, and the evidence for that's sitting
in Adafruit's own issue trackers.

**This is worth stating plainly**, because it changes how you write the code: the library's reconnect
path has known gaps, so a robust device has to assume it and compensate, rather than call
`reconnect()` and trust the result.

## What the trackers actually say

Three open issues on [Adafruit's MiniMQTT tracker](https://github.com/adafruit/Adafruit_CircuitPython_MiniMQTT/issues) describe the same class of problem:

| Issue | Reported behaviour |
|---|---|
| [#253](https://github.com/adafruit/Adafruit_CircuitPython_MiniMQTT/issues/253) | `reconnect()` can produce partial resubscriptions |
| [#252](https://github.com/adafruit/Adafruit_CircuitPython_MiniMQTT/issues/252) | `reconnect()` loses QoS on subscribed topics |
| [#256](https://github.com/adafruit/Adafruit_CircuitPython_MiniMQTT/issues/256) | `connect()` retry throws an exception after one failed attempt |

And on the core side, [circuitpython #7448](https://github.com/adafruit/circuitpython/issues/7448)
reports that a sequence of `ConnectionError` exceptions raised from `wifi` eventually leads to a
`MemoryError`.

Read together, those describe a board that reconnects, believes it is fine, receives nothing, and
slowly leaks memory every time the network wobbles. That's exactly the failure people describe as
"it just stops working after a while".

A fourth, [MiniMQTT #60](https://github.com/adafruit/Adafruit_CircuitPython_MiniMQTT/issues/60),
is worth knowing separately: the exception is hard to troubleshoot when the client defaults to SSL
but the broker isn't using it. If a first connection fails with something opaque, check the port
before you change anything else.

## The three rules

**Resubscribe explicitly, every time.** Don't rely on the reconnect path restoring subscriptions.
Keep your topic list in a variable and re-subscribe from it after every successful connect. It's a
few lines and it removes the entire class of silent-subscription failure.

**Bound your retries and reset.** Since failed attempts can accumulate memory damage, an unbounded
retry loop is the worst available option: it is the exact pattern the tracker says leads to
`MemoryError`. Count attempts, and hand over to `microcontroller.reset()` after a handful. A reset
costs a few seconds and starts from a clean heap.

**Detect silence, not just disconnection.** The dangerous state is a connection that's up but
useless. Track the time of the last successful publish or receive, and treat a long gap as a fault
even when the socket claims to be healthy.

## A loop that survives

```python
# CircuitPython 10.x — reconnect-and-resubscribe with a bounded retry
# and a hard-reset fallback. The pattern matters more than the specifics.

import time, ssl, wifi, socketpool, microcontroller
import adafruit_minimqtt.adafruit_minimqtt as MQTT
from os import getenv

BROKER   = getenv("BROKER_HOST")
PORT     = 8883                       # 8883 TLS, 1883 plaintext — mismatch here is MiniMQTT #60
TOPICS   = [("devices/shed/cmd", 1)]  # keep the list; reconnect() may not restore it
MAX_TRIES = 5                         # then reset rather than loop forever (#7448)
SILENT_LIMIT = 15 * 60                # no traffic for 15 min means something is wrong

last_ok = time.monotonic()

def on_message(client, topic, message):
    global last_ok
    last_ok = time.monotonic()
    print("rx", topic, message)

def connect_all():
    """Bring up Wi-Fi and MQTT, then resubscribe from our own list."""
    if not wifi.radio.connected:
        wifi.radio.connect(getenv("WIFI_SSID"), getenv("WIFI_PASS"))

    pool = socketpool.SocketPool(wifi.radio)
    client = MQTT.MQTT(
        broker=BROKER, port=PORT,
        username=getenv("MQTT_USER"), password=getenv("MQTT_PASS"),
        socket_pool=pool, ssl_context=ssl.create_default_context(),
    )
    client.on_message = on_message
    client.connect()

    for topic, qos in TOPICS:        # explicit: do not trust reconnect() (#252, #253)
        client.subscribe(topic, qos)
    return client

def resilient_connect():
    """Bounded retries, then hand over to a reset with a clean heap."""
    for attempt in range(MAX_TRIES):
        try:
            return connect_all()
        except Exception as e:
            print("connect failed", attempt + 1, e)
            time.sleep(2 ** attempt)   # back off; do not hammer
    microcontroller.reset()            # unreachable on success

client = resilient_connect()

while True:
    try:
        client.loop(timeout=1)
        client.publish("devices/shed/temp", str(read_temperature()))
        last_ok = time.monotonic()
    except Exception as e:
        print("loop failed:", e)
        try:
            client.disconnect()        # best effort; it may already be gone
        except Exception:
            pass
        client = resilient_connect()   # full reconnect + resubscribe, not reconnect()

    # The silent failure: connected, looping, subscribed to nothing.
    if time.monotonic() - last_ok > SILENT_LIMIT:
        print("no traffic in 15 min — resetting")
        microcontroller.reset()

    time.sleep(30)
```

Two details are doing the real work. `resilient_connect` rebuilds the client and resubscribes from
`TOPICS` rather than calling `reconnect()`, which sidesteps #252 and #253 entirely. And the
`SILENT_LIMIT` check is the only thing in the loop that can catch a connection that's technically
up and functionally dead.

## When to skip MQTT entirely

Look again at that failure list. Partial resubscription, lost QoS, broker session state, retry
behaviour, TLS-versus-plaintext confusion — almost all of it is the cost of a stateful protocol.

If your device only reports readings upward and never needs the server to push anything down, an
HTTPS POST has none of that state to lose. There's no subscription to restore, no QoS to drop and
no session for a broker to forget. A failed POST is one failed request, and the next one starts
clean.

MQTT earns its complexity when you genuinely need downstream messages: a relay you toggle from a
phone, a configuration change pushed to a fleet, a command topic. For a sensor that publishes
every thirty seconds, it is machinery you're maintaining for no benefit.

## If you're not committed to CircuitPython

Worth naming the alternative honestly. The [Nodrix Arduino library](https://github.com/decoded-cipher/nodrix-sdk)
handles the whole of this — WiFi, TLS, transport, reconnection and the telemetry protocol — behind
`Nodrix.begin()` and `Nodrix.send()`, on the same ESP32 hardware:

```cpp
#include <Nodrix.h>

void setup() {
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);   // reconnection included
}

void loop() {
  Nodrix.run();                                      // pumps the link, flushes telemetry

  static unsigned long last = 0;
  if (millis() - last < 30000) return;
  last = millis();

  Nodrix.send("temperature", readSensor());
  Nodrix.send("uptime_s", (long)(millis() / 1000));
}
```

There's no CircuitPython equivalent today; a Python port is on the roadmap. If your project is
committed to CircuitPython — because of a library, a board, or because it is what you know — the
loop earlier in this guide is the pattern to use, and the reconnect-and-resubscribe discipline
still applies.

## Knowing it stayed up

Whichever transport you pick, the useful signal is the same: a board that reports its uptime and
reset reason alongside its readings tells you which failure you had. An uptime that climbs steadily
means the network wobbled and recovered. An uptime that resets to zero every few hours means your
fallback is firing, which is working as designed but points at something worth fixing upstream.

Without that, a board that silently stopped receiving and a board that lost power look identical,
and you'll go and stand in the shed to find out which.

If you take one thing from this: don't trust `reconnect()` to restore your subscriptions. Keep the
topic list yourself and re-subscribe from it every time. It's four lines, and it removes the failure
that's hardest to notice.
