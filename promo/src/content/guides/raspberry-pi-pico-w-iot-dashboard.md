---
title: "Raspberry Pi Pico W to the cloud with MicroPython — a live dashboard"
description: "Send Raspberry Pi Pico W sensor data to a cloud dashboard with MicroPython over HTTPS — no broker. Full code for telemetry with urequests, commands back to the board, the onboard temperature sensor, and an honest note on Pico W TLS."
category: hardware
board: Raspberry Pi Pico W
difficulty: beginner
datePublished: 2026-06-08
faqs:
  - q: "Can a Raspberry Pi Pico W send data to the cloud?"
    a: "Yes. In MicroPython, connect with the network module and POST JSON to a single HTTPS endpoint using urequests — each metric becomes a dashboard variable automatically. No MQTT broker and no SDK are required for periodic telemetry."
  - q: "MicroPython or Arduino for the Pico W?"
    a: "Both work. MicroPython is the fastest way to get a Pico W onto a dashboard — urequests handles the HTTPS POST in a few lines. If you'd rather write the same C++ you'd use on an ESP32, the arduino-pico core gives you WiFi + HTTPClient and the ESP-style pattern applies unchanged."
  - q: "Does the Pico W verify the HTTPS certificate?"
    a: "Be aware: MicroPython's urequests encrypts the connection but does not verify the server certificate by default — there's no CA store loaded, so it's confidential but unauthenticated, similar to setInsecure() on an ESP. For anything sensitive, pass an SSLContext with the server's certificate. The traffic is still TLS-encrypted either way."
  - q: "How do I get commands back to the Pico W?"
    a: "Poll the control endpoint on an interval and apply what comes back, then ack it so it isn't resent. A dashboard toggle or an automation queues the write; the board reads it from /v1/control and flips the pin."
  - q: "Can the Pico W run on battery like an ESP32?"
    a: "It can deep sleep with machine.deepsleep, but be honest about the RP2040: its sleep floor is higher than an ESP32's, so battery life is shorter for the same duty cycle. For long battery runs, an ESP32/ESP8266 with deep sleep is the better pick; the Pico W shines on mains power or short missions."
related:
  - href: "/guides/esp8266-iot-dashboard"
    label: "ESP8266 to the cloud over HTTPS"
    desc: "The same loop in Arduino C++ on the ESP8266."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The fuller treatment, including the control WebSocket and deep sleep."
  - href: "/widgets"
    label: "Dashboard widgets"
    desc: "Bind your new variables to value, gauge, chart, and map widgets."
  - href: "/docs"
    label: "Device protocol & read API"
    desc: "Telemetry, control, automations, and the read API in full."
---

A **Raspberry Pi Pico W** can put live sensor data on a cloud dashboard with a few lines of
MicroPython — no MQTT broker, no SDK. You POST JSON to one HTTPS endpoint and poll a second one for
commands. This guide builds the whole loop against a real backend (nodrix, which deploys to your own
Cloudflare account), using the Pico W's own onboard temperature sensor so you can run it with no
wiring at all. Variables appear on your dashboard the first time they're seen.

## The mental model

The board is just a bag of **variables**:

- **Telemetry (up):** POST `{"metrics": {"temperature": 23.4}}`; each key becomes a variable.
- **Control (down):** a dashboard toggle or an automation queues a write — "set `led` to `on`". The
  board fetches pending writes, applies them, and acks.

Two endpoints, one token.

## Step 1 — Connect Wi-Fi

```python
import network, time, ujson, urequests
from machine import Pin, ADC, deepsleep

SSID  = "your-ssid"
PASS  = "your-password"
HOST  = "https://nodrix.you.workers.dev"
TOKEN = "tok_your_project_token"
HEADERS = {"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"}

def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.connect(SSID, PASS)
    while not wlan.isconnected():
        time.sleep(0.25)
    print("Wi-Fi up:", wlan.ifconfig()[0])
    return wlan
```

## Step 2 — Read a sensor and POST it

No external sensor needed to start: the RP2040 has an onboard temperature sensor on ADC channel 4.

```python
def read_temp_c():
    raw = ADC(4).read_u16() * 3.3 / 65535
    return 27 - (raw - 0.706) / 0.001721   # datasheet conversion

def send_telemetry(metrics):
    body = ujson.dumps({"metrics": metrics})
    r = urequests.post(HOST + "/v1/telemetry", headers=HEADERS, data=body)
    print("POST /v1/telemetry ->", r.status_code)   # 204 = success
    r.close()                                        # always close — frees the socket
```

Open your dashboard and the `temperature` variable is already there. Drop a **value** or **gauge**
widget on it and you're watching live data; the **chart** widget plots a time window.

> Always call `r.close()` after a urequests call. The Pico W has limited sockets, and leaking them
> is the most common reason a long-running script stops sending after a while.

## Step 3 — Receive commands back

The board asks for pending commands and applies them. The Pico W's onboard LED is a perfect test
output — it's addressed as `Pin("LED")`.

```python
def poll_control():
    r = urequests.get(HOST + "/v1/control", headers=HEADERS)
    if r.status_code == 200:
        data = r.json()
        # { "control": [ { "id": "ctl_x", "variable": "led", "value": "on" } ] }
        for w in data.get("control", []):
            if w["variable"] == "led":
                Pin("LED", Pin.OUT).value(1 if w["value"] == "on" else 0)
            # POST w["id"] to /v1/control/ack so the platform stops resending it
    r.close()
```

Toggle the `led` variable from a dashboard control widget and the onboard LED follows. Poll every few
seconds for near-real-time control.

## Step 4 — The main loop (and an honest note on sleep)

On mains power, a simple loop is fine:

```python
connect_wifi()
while True:
    send_telemetry({"temperature": read_temp_c()})
    poll_control()
    time.sleep(15)
```

For battery, you can deep sleep instead — but be realistic about the RP2040. `machine.deepsleep`
resets the board and re-runs your script from the top on wake, like an ESP, yet its sleep-current
floor is higher than an ESP32's, so the same duty cycle gives shorter battery life:

```python
connect_wifi()
send_telemetry({"temperature": read_temp_c()})
poll_control()
deepsleep(15 * 60 * 1000)   # milliseconds; board resets and re-runs on wake
```

If long battery life is the goal, an [ESP32](/guides/esp32-https-cloud) or
[ESP8266](/guides/esp8266-iot-dashboard) with deep sleep will outlast a Pico W. The Pico W is at its
best on mains power, short missions, or where you specifically want MicroPython and the RP2040's PIO.

## Production checklist

- **Verify TLS for anything sensitive.** urequests encrypts but doesn't authenticate the server by
  default — pass an `SSLContext` loaded with the server certificate if confidentiality isn't enough.
- **Close every response.** `r.close()` after each call; leaking sockets is the classic Pico W bug.
- **Wrap network calls in try/except.** Wi-Fi blips happen — catch the exception, back off, and retry
  rather than crashing the script.
- **Keep the token secret.** The project token is a credential; keep it out of shared code.

That's a Pico W reporting to a dashboard you own, with commands flowing back — and the read API
behind it means you can pull the same telemetry into Grafana or your own app whenever you like.
