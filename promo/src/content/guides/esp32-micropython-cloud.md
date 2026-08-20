---
title: "ESP32 MicroPython to the cloud — a live dashboard with no broker"
description: "Push ESP32 sensor data to a cloud dashboard with MicroPython over HTTPS — no MQTT broker, no SDK. Full code for telemetry, commands back to the board, the internal temperature sensor, and an honest account of what TLS costs you on an ESP32."
category: hardware
board: ESP32
difficulty: beginner
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "Can MicroPython on an ESP32 do HTTPS?"
    a: "Yes, and it's the part worth planning for. The ESP32 port ships mbedtls, so `requests.post` to an https:// URL works out of the box. What bites people is memory: a TLS session wants a large record buffer, and on a board with a few tens of KB of free heap a handshake can fail with an mbedtls error even though the same code ran yesterday. Collect garbage before the request, close every response, and keep one connection pattern rather than opening sockets ad hoc."
  - q: "Should I use urequests or requests?"
    a: "Write new code against `requests` — that's the current name in micropython-lib, installed with `mip install requests`. `urequests` is the legacy name and still works through a compatibility wrapper, which is why so much older tutorial code imports it. Both are the same library; only the import line differs."
  - q: "Is MicroPython fast enough for a sensor project?"
    a: "For anything that reads a sensor and reports it, comfortably. MicroPython is interpreted, so it's slower than compiled C++ per operation, but a project that samples every few seconds spends essentially all its time waiting on Wi-Fi and the sensor, not executing Python. Where it genuinely loses is tight timing — bit-banged protocols, high-rate sampling, and interrupt work with microsecond deadlines belong in the Arduino framework or ESP-IDF."
  - q: "Does the ESP32 have a built-in temperature sensor I can use?"
    a: "It does, and the API depends on which chip you have. The original ESP32 exposes `esp32.raw_temperature()`, which returns Fahrenheit. The C3, C6, S2, and S3 expose `esp32.mcu_temperature()`, which returns Celsius. Either way it measures the die, not the room — it reads high because the chip warms itself, so treat it as a free way to prove your pipeline works, not as a thermometer."
  - q: "How does the board receive commands without a broker?"
    a: "It asks. The board polls a control endpoint, applies any pending variable writes it finds, and acks them by id so the platform stops resending. That's the whole downlink — no broker, no subscription, no always-on socket. Polling every few seconds feels immediate for switching things on and off, and for a battery device you poll once per wake instead."
related:
  - href: "/guides/esp32-https-cloud"
    label: "The same build in Arduino C++"
    desc: "If you'd rather write C++ and let a library own the socket."
  - href: "/guides/raspberry-pi-pico-w-iot-dashboard"
    label: "Pico W with MicroPython"
    desc: "The same pattern on Raspberry Pi silicon."
  - href: "/guides/esp32-deep-sleep-battery"
    label: "ESP32 battery life"
    desc: "The wake-report-sleep structure this script is built for."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The dashboard this reports to."
---

Most ESP32 cloud tutorials hand you C++. That's a fine default, but it's not why a lot of people
bought the board — MicroPython turns an ESP32 into something you can poke at over a serial prompt,
change a line, and rerun, without a compile-and-flash cycle between every idea.

This guide builds the whole loop in MicroPython: Wi-Fi, telemetry up to a cloud dashboard over plain
HTTPS, commands back down to the board, and deep sleep. No MQTT broker, no vendor SDK, and no
external sensor required to start — the ESP32's own die sensor is enough to prove the pipeline
before you wire anything.

## What you'll build

A script that connects to Wi-Fi, posts readings to your own instance, checks for pending commands,
applies them, and sleeps. Variables show up on the dashboard the first time they're seen, so there's
nothing to register in advance.

## Why MicroPython here (and when Arduino still wins)

The honest case for MicroPython on an ESP32 is iteration speed. You get a REPL over USB, so you can
read a sensor interactively and see the value immediately instead of adding a `Serial.println` and
waiting forty seconds. For sensor-and-report projects — which is most IoT — that loop is genuinely
faster to work in.

The honest case against it is equally clear. Compiled C++ wins on tight timing, on RAM headroom, and
on library coverage: if your part has a driver, it's an Arduino library first and a MicroPython
module maybe. Anything with microsecond deadlines — bit-banged protocols, high-rate sampling,
interrupt-driven counting — should be C++. And as the section below covers, TLS is more comfortable
on the Arduino side.

Pick MicroPython because you want the REPL and the shorter loop, not because you expect it to be
smaller or faster. It isn't.

## What you'll need

- An **ESP32** dev board — any common variant. The internal temperature sensor differs between the
  original ESP32 and the C3/C6/S2/S3, and the script handles both.
- A **USB cable** and **esptool** to flash the firmware.
- A **nodrix instance** with a project and a project token.
- No sensor, no wiring, no breadboard to get the first reading on screen.

## Flashing MicroPython

Download the current `.bin` for your exact chip from
[micropython.org/download](https://micropython.org/download/) — the ESP32, C3, C6, S2, and S3 each
have their own build, and flashing the wrong one gives you a board that boots to nothing. Then erase
and write: `esptool.py --chip esp32 --port /dev/ttyUSB0 erase_flash`, then
`esptool.py --chip esp32 --port /dev/ttyUSB0 --baud 460800 write_flash -z 0x1000 ESP32_GENERIC.bin`.

Erasing first matters more than it looks: leftover filesystem blocks from a previous firmware are a
common cause of a board that boots into a broken state. Once it's flashed, install the HTTP client
on the device with `mpremote mip install requests`.

## The script

One file. It connects, reads the die sensor, posts telemetry, drains any pending control writes,
acks them, and loops. The `mcu_temperature` / `raw_temperature` split is handled at import time so
the same script runs on an original ESP32 and on a C3 or S3 without edits.

```python
import network, time, gc, json, machine, esp32
import requests

SSID  = "your-ssid"
PASS  = "your-password"
HOST  = "https://nodrix.you.workers.dev"
TOKEN = "tok_your_project_token"

HEADERS = {"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"}


def read_die_temp_c():
    if hasattr(esp32, "mcu_temperature"):
        return esp32.mcu_temperature()          # C3 / C6 / S2 / S3 — Celsius
    return (esp32.raw_temperature() - 32) / 1.8  # original ESP32 — Fahrenheit


def connect_wifi(timeout=20):
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        wlan.connect(SSID, PASS)
        deadline = time.time() + timeout
        while not wlan.isconnected():
            if time.time() > deadline:
                machine.reset()
            machine.idle()
    return wlan


def post(path, payload):
    gc.collect()
    r = None
    try:
        r = requests.post(HOST + path, headers=HEADERS, data=json.dumps(payload))
        return r.status_code
    finally:
        if r:
            r.close()


def send_telemetry(metrics):
    return post("/v1/telemetry", {"metrics": metrics})


def apply_control():
    gc.collect()
    r = None
    try:
        r = requests.get(HOST + "/v1/control", headers=HEADERS)
        if r.status_code != 200:
            return
        pending = r.json().get("control", [])
    finally:
        if r:
            r.close()

    done = []
    for w in pending:
        if w["variable"] == "led":
            machine.Pin(2, machine.Pin.OUT).value(1 if w["value"] in (True, "on", 1) else 0)
        done.append(w["id"])

    if done:
        post("/v1/control/ack", {"ids": done})


connect_wifi()
while True:
    send_telemetry({"temperature": read_die_temp_c()})
    apply_control()
    gc.collect()
    time.sleep(5)
```

Telemetry returns `204` on success. Values can be numbers, strings, booleans, or null, and every key
becomes a variable — send `{"temperature": 24.1, "humidity": 61}` and you get two.

## Build the dashboard

Open your project and the `temperature` variable is already listed. Drop a **value** widget on it
for the current reading, or a **chart** widget to watch it move. For the downlink, add a **toggle**
bound to a variable named `led` — flipping it queues a write that the script picks up on its next
poll and applies to GPIO2, the onboard LED on most DevKit boards.

That round trip is the thing worth confirming early: it proves both directions work before you've
soldered anything.

## The TLS reality on ESP32

This is the section most MicroPython tutorials skip, and it's the one that will cost you an evening.

HTTPS works on the ESP32 port — mbedtls is built in, and `requests.post` to an `https://` URL needs
no extra setup. The catch is memory. A TLS session wants a large record buffer, and MicroPython is
already holding a heap full of Python objects. The result is a failure mode that looks like
flakiness rather than a bug: the same script that ran fine for an hour throws an mbedtls handshake
error, usually after the heap has fragmented.

Three habits avoid nearly all of it, and they're already in the script above:

- **Collect before every request.** `gc.collect()` immediately before a TLS call gives the handshake
  the largest contiguous block available. This single line fixes most reports of intermittent
  handshake failures.
- **Close every response, always.** A leaked socket is the most common reason a long-running script
  stops sending after a few hours. The `try/finally` shape above means an exception mid-request still
  closes it.
- **Don't hold JSON you've finished with.** Parse what you need, let the response object go, and
  collect. Large response bodies kept in scope are what fragment the heap in the first place.

If you're on a memory-tight board and still fighting it, that's a real signal to use the Arduino
path instead — [the same build in C++](/guides/esp32-https-cloud) hands the socket and the TLS
session to a library that keeps one connection open rather than handshaking repeatedly.

## Going further

Swap the die sensor for a real one and nothing else changes. A BME280 over I2C gives you
temperature, humidity, and pressure as three keys in the same `send_telemetry` call — the
[weather station build](/guides/esp32-weather-station) covers the sensor side, and the reporting
line is identical.

For a battery device, replace the `while True` loop with a wake-report-sleep structure:
`machine.deepsleep(300000)` at the end of the script sleeps five minutes and reboots into it. Read
the die sensor immediately after waking — the chip is coolest then, so the reading is closest to
ambient. The [battery-life guide](/guides/esp32-deep-sleep-battery) covers the power budget and the
dev-board traps that quietly ruin it.

## Notes

The internal sensor measures the die, not the room. It reads several degrees above ambient because
the chip heats itself, and that offset grows the longer the board has been awake — which is exactly
why it's a good pipeline test and a poor thermometer.

`requests` and `urequests` are the same library under two names. New code should import `requests`;
older tutorials import `urequests`, which still resolves through a compatibility wrapper.

The control endpoint returns pending writes and expects an ack by id. Skipping the ack isn't fatal —
the platform simply keeps offering the same write until someone confirms it — but it does mean your
board reapplies the same command on every poll.
