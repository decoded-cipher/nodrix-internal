---
title: "Raspberry Pi Zero 2 W to the cloud: when a Linux box beats a microcontroller"
description: "Send Raspberry Pi Zero 2 W sensor data to a cloud dashboard in plain Python — with an honest account of the two things that decide whether a Pi belongs in your project: it cannot run on batteries, and its SD card will eventually betray you."
category: hardware
board: Raspberry Pi Zero 2 W
difficulty: intermediate
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "Can I run a Pi Zero 2 W on batteries like an ESP32?"
    a: "Realistically, no. A Zero 2 W idles around 100–180 mA with Wi-Fi up, and it has no hardware deep sleep — the SoC only offers software halt modes, so there's no equivalent of an ESP32 sleeping at microamps. The gap is roughly four orders of magnitude. Battery-only Pi sensors end up needing weekly swaps or a solar panel and a sizeable bank, which is usually the moment to reach for a microcontroller instead."
  - q: "Will the SD card really fail?"
    a: "Eventually, and unclean power loss accelerates it dramatically. The two standard mitigations are moving logs to a RAM disk so routine writes stop wearing the card, and mounting the root filesystem read-only with an overlay so power loss can't corrupt it. Both help enormously. Neither is absolute — if the card's own controller is mid wear-levelling when power disappears, it can still be damaged."
  - q: "When is a Pi the better choice over an ESP32?"
    a: "When the job genuinely needs an operating system. Real Python libraries, a camera with actual image processing, USB peripherals, a local database, several things running at once, or code that would be miserable in C++. The Pi's advantage isn't that it's faster — it's that everything you know from a desktop works, including pip, cron, and ssh."
  - q: "How do I make my script start on boot and stay running?"
    a: "A systemd service, not a cron entry or an rc.local line. systemd will start it after the network is up, restart it if it crashes, and give you real logs through journalctl. That single piece of configuration is most of the difference between a script that works when you're watching and a device that stays up for months."
  - q: "Do I need a special library to talk to nodrix from Python?"
    a: "No — plain `requests` is enough. The device protocol is a JSON POST with a bearer token and a matching GET for pending commands, so the whole integration is a few dozen lines with no dependency beyond what most Pi projects already have installed."
related:
  - href: "/guides/raspberry-pi-pico-w-iot-dashboard"
    label: "Pico W with MicroPython"
    desc: "Raspberry Pi's microcontroller, for when you need low power."
  - href: "/guides/raspberry-pi-pico-2-w-vs-esp32"
    label: "Pico 2 W vs ESP32"
    desc: "Choosing between the microcontroller options."
  - href: "/guides/esp32-micropython-cloud"
    label: "MicroPython on ESP32"
    desc: "Python on a microcontroller instead of Linux."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The dashboard this reports to."
---

Every other board on this site is a microcontroller. The Pi Zero 2 W isn't — it's a quad-core Linux
computer the size of a stick of gum, and that difference decides everything about where it belongs.

You get real Python, pip, ssh, cron, and any library you'd use on a desktop. You also get two
liabilities that microcontrollers don't have, and being clear-eyed about both is what separates a Pi
project that runs for a year from one that dies quietly in a cupboard.

## When a Pi is the right answer

Reach for a Zero 2 W when the work genuinely needs an operating system:

- **Real Python libraries.** numpy, pandas, OpenCV, anything on PyPI. No porting, no memory ceiling
  measured in kilobytes.
- **Camera work with actual processing.** Not just capture — decode, transform, analyse, store.
- **USB peripherals.** Cameras, SDR dongles, serial adapters, storage.
- **Several things at once.** A logger, a web interface, and a periodic upload are three processes,
  not one carefully interleaved loop.
- **Code you'd hate to write in C++.** Sometimes that alone is the deciding factor.

Reach for an [ESP32](/guides/esp32-https-cloud) or a Pico when the job is reading a sensor and
reporting it. A microcontroller will do that [on a battery](/guides/esp32-deep-sleep-battery), start
in milliseconds, and never corrupt a filesystem.

## The power reality

This is the constraint people most often discover too late.

A Zero 2 W with Wi-Fi up draws roughly **100–180 mA at 5V** just sitting there, and it has **no
hardware deep sleep** — the SoC offers software halt modes rather than the microamp sleep states a
microcontroller has. Against an ESP32 in deep sleep, idle draw is something like four orders of
magnitude higher.

In practice that means an ESP32 sensor node runs a year or more on cells, while a battery-powered Pi
needs recharging weekly unless you pair it with a solar panel and a substantial bank. If your project
has mains power, none of this matters. If it doesn't, this is the whole decision.

## What you'll need

- A **Raspberry Pi Zero 2 W** with Raspberry Pi OS Lite and Wi-Fi configured.
- A power supply that can actually deliver — undervoltage causes more Pi weirdness than any other
  single cause.
- Python 3 with `requests` (`pip install requests`).
- A **nodrix instance** with a project and a project token.

## The script

No library needed. This sends telemetry, drains pending control writes, acknowledges them by id, and
loops. It uses the Pi's own CPU temperature so it runs with nothing wired up.

```python
#!/usr/bin/env python3
import time
import requests

HOST  = "https://nodrix.you.workers.dev"
TOKEN = "tok_your_project_token"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

session = requests.Session()          # reuse the TLS connection
session.headers.update(HEADERS)


def cpu_temp_c():
    with open("/sys/class/thermal/thermal_zone0/temp") as f:
        return int(f.read()) / 1000.0


def send_telemetry(metrics):
    r = session.post(f"{HOST}/v1/telemetry", json={"metrics": metrics}, timeout=10)
    r.raise_for_status()              # 204 on success


def apply_control():
    r = session.get(f"{HOST}/v1/control", timeout=10)
    r.raise_for_status()
    pending = r.json().get("control", [])
    if not pending:
        return

    done = []
    for w in pending:
        if w["variable"] == "led":
            set_led(w["value"] in (True, "on", 1))
        done.append(w["id"])

    session.post(f"{HOST}/v1/control/ack", json={"ids": done}, timeout=10)


def set_led(on):
    print(f"led -> {'on' if on else 'off'}")   # replace with real GPIO


def main():
    while True:
        try:
            send_telemetry({"cpu_temp": cpu_temp_c()})
            apply_control()
        except requests.RequestException as e:
            print(f"network error: {e}", flush=True)   # keep going; systemd is the safety net
        time.sleep(30)


if __name__ == "__main__":
    main()
```

The `Session` object is doing real work. Without it, every request renegotiates TLS from scratch —
fine occasionally, wasteful every thirty seconds forever. Reusing the connection is one line and it's
the difference between a polite client and a noisy one.

Catching `RequestException` and continuing matters more on a Pi than you'd think. A Wi-Fi blip that a
microcontroller library would silently retry will terminate a naive Python script, and a dead script
on a headless box is invisible until someone checks the dashboard.

## Build the dashboard

`cpu_temp` appears in your project the first time the script posts — variables are created on sight,
so there's nothing to register. Put it on a **chart** widget rather than a value widget: on a Pi the
CPU temperature is a genuine health metric, and a Zero 2 W in a sealed case throttles under sustained
load, which shows as a ceiling the trace refuses to cross.

For the downlink, add a **toggle** bound to a variable named `led`. Flipping it queues a write the
script collects on its next pass and acknowledges by id. Confirming that round trip early is worth
the two minutes — it proves both directions before you've wired a single GPIO.

Then add a **schedule** automation that reports once a day. A headless box in a cupboard is precisely
the device you never look at, and a message that arrives proves the whole chain — Pi, network, script,
and systemd — was alive to produce it.

## Run it as a service

A script you started over ssh dies when your session ends. A device that runs for months needs
systemd.

Create a unit at `/etc/systemd/system/nodrix-sensor.service` with `After=network-online.target` so it
waits for the network, `ExecStart=/usr/bin/python3 /home/pi/sensor.py`, and — the two directives that
matter — `Restart=always` and `RestartSec=10`. Then `systemctl enable --now nodrix-sensor`.

That gives you three things a background process doesn't: it starts on boot, it comes back if it
crashes, and its output goes to the journal, so `journalctl -u nodrix-sensor -f` is your live log
from anywhere. Add `flush=True` to your prints — Python buffers stdout when it isn't a terminal, and
without it your logs arrive in confusing bursts.

## Making the SD card survive

The Pi's other liability is storage. SD cards wear out from writes and corrupt on unclean power loss,
and an IoT device is a machine that logs constantly and gets unplugged carelessly. Two mitigations,
in increasing order of commitment:

**Move logs to RAM.** `log2ram` puts `/var/log` on a ramdisk and writes it back on clean shutdown.
Routine logging stops touching the card at all, which addresses the wear half of the problem for very
little effort.

**Mount the root filesystem read-only with an overlay.** All writes land in a RAM overlay and the card
is never written during normal operation, so pulling the power cannot corrupt it. This is the strong
option for a device that will be switched off at the wall.

Two honest caveats. Read-only root makes changes awkward — you disable the overlay, reboot, edit,
re-enable, reboot. And it isn't absolute: if the card's own controller is midway through a
wear-levelling operation when power vanishes, it can still be damaged. Lower the odds, don't assume
they're zero, and keep a written image of a working card.

## Going further

The Pi's real advantage shows once you use the OS. A camera with OpenCV doing local analysis and
reporting only results is a genuinely Pi-shaped project — the same send-conclusions-not-frames
architecture as the [S3 edge AI build](/guides/esp32-s3-edge-ai), with vastly more headroom for the
model.

It also makes a good gateway. A Pi can collect from [Bluetooth](/guides/esp32-ble-sensor-gateway) or
serial devices that can't reach the network themselves and forward their readings — a job Linux does
naturally, though an ESP32 handles the BLE case on far less power.

## Notes

Undervoltage is the most common cause of mysterious Pi behaviour — random reboots, SD corruption,
Wi-Fi dropping. Check for it with `vcgencmd get_throttled`; a non-zero result means the supply, not
the software.

`/sys/class/thermal/thermal_zone0/temp` reports millidegrees, hence the division by 1000. Like the
ESP32's die sensor, it measures the chip rather than the room, and it's a useful health metric in its
own right — a Zero 2 W under sustained load in a sealed case throttles.

Raspberry Pi OS **Lite** is the right image here. The desktop version spends memory and card writes
on things a headless sensor will never use.
