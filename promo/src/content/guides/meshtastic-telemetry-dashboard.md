---
title: "Meshtastic telemetry to a dashboard you own"
description: "Meshtastic shows readings on a screen. How to persist, chart and alert on them without assembling an MQTT, InfluxDB and Grafana stack of your own."
category: project
difficulty: intermediate
datePublished: 2026-09-18
faqs:
  - q: "Can Meshtastic send sensor data to a dashboard?"
    a: "Not directly, but it can publish to MQTT, and that is the bridge. A node with internet access forwards mesh packets to an external MQTT broker, and the module has a JSON option intended for exactly this kind of integration. From there a small bridge forwards the readings to whatever backend you want."
  - q: "Do all my nodes need internet access?"
    a: "No, and this is the useful part. Only one node needs connectivity. It acts as the gateway for the mesh, forwarding packets from nodes that may be kilometres away with no internet of their own. That is the whole point of running a mesh: one uplink covers everything reachable through it."
  - q: "Is the JSON output on Meshtastic MQTT encrypted?"
    a: "No. The documentation is explicit that JSON packets are not encrypted, which is the tradeoff for easy integration. If that matters, keep the broker on your own network rather than using a public one, and treat what you publish as visible to anyone with access to that broker."
  - q: "Does this work on every Meshtastic device?"
    a: "The JSON output is not supported on the nRF52 platform, which rules out some low-power nodes for this specific approach. ESP32-based nodes handle it. If your gateway node is nRF52, use a different node as the MQTT gateway or consume the protobuf output instead."
  - q: "What sensors does Meshtastic telemetry carry?"
    a: "The telemetry module covers device metrics such as battery level, voltage and channel utilisation, along with environment metrics including temperature, humidity and pressure, plus air quality and power metrics depending on what is attached. Those arrive as named values you can map straight onto dashboard variables."
related:
  - href: "/guides/esp32-lora-gateway"
    label: "ESP32 LoRa gateway"
    desc: "The other long-range option, compared."
  - href: "/guides/esp32-notifications"
    label: "Alerts from readings"
    desc: "Turning a threshold into a message."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "Where the mesh readings land."
  - href: "/guides/cloudflare-free-tier-limits"
    label: "What it costs to run"
    desc: "Request budget for a gateway that posts continuously."
---

Meshtastic solves the hard part. Nodes form a LoRa mesh, relay for each other, and reach places with
no Wi-Fi and no cellular — a valley, a ridge, a field several kilometres from anything.

What it does not solve is what happens to the readings afterwards. The [telemetry module](https://meshtastic.org/docs/configuration/module/telemetry/) carries battery, voltage, channel utilisation, temperature, humidity and pressure, and you can see all of it
on a device screen or in the app. Keeping it, charting it over a season, or being told when a value
crosses a line is left to you, and the usual answer is to assemble an MQTT broker, a time-series
database and Grafana.

There is a shorter path.

## The bridge

Meshtastic's [MQTT module](https://meshtastic.org/docs/configuration/module/mqtt/) forwards mesh packets to an external broker, and it has a JSON option that exists specifically to make integration easy. That gives you a clean seam:

```
nodes  →  mesh  →  gateway node  →  MQTT (JSON)  →  bridge  →  your deployment
```

**Only the gateway node needs internet.** Everything else reaches it over LoRa, which is the entire
reason to run a mesh in the first place.

Two caveats worth knowing before you build on it:

- **JSON packets are not encrypted.** The documentation says so plainly. Keep the broker on your own
  network rather than a public one, and treat anything you publish as visible to whoever can read
  that broker.
- **JSON is not supported on nRF52.** If your gateway is an nRF52 node, use an ESP32-based node as
  the gateway instead.

## Configuring the gateway

On the node with connectivity, enable MQTT and turn on JSON output. Point it at your broker — a
Mosquitto instance on a Pi is fine — and set a root topic you will recognise.

The telemetry module should be enabled on the nodes doing the sensing, with an update interval that
suits the airtime you have. LoRa is slow, so readings every fifteen minutes are ordinary and every
thirty seconds is usually antisocial on a shared mesh.

> **Region settings are not optional**
>
> Your [`lora.region`](https://meshtastic.org/docs/configuration/radio/lora/) must be set or the
> device will not transmit at all — it shows a message on screen and stays silent. The band differs
> by region: roughly 902–928 MHz in the US, 869.4–869.65 MHz on EU_868, and 920.5–923.5 MHz in
> Japan. **EU_433 and EU_868 are additionally limited to a 10% hourly duty cycle**, calculated every
> minute, where most other regions permit 100%. If you are in the EU, that ceiling is the thing that
> decides your reporting interval; elsewhere it is courtesy to the mesh rather than law.

## Forwarding to your deployment

The bridge is small because both ends speak JSON. It subscribes to the topic, pulls telemetry
packets out, and posts them to `/v1/telemetry` with the node name as a prefix so several nodes can
share one project:

```python
import json
import paho.mqtt.client as mqtt
import requests

BROKER   = "192.168.1.50"
TOPIC    = "msh/+/2/json/#"            # root topic from the MQTT module config
NODRIX   = "https://nodrix.you.workers.dev/v1/telemetry"
TOKEN    = "tok_your_project_token"

def on_message(_client, _userdata, msg):
    try:
        packet = json.loads(msg.payload)
    except ValueError:
        return

    if packet.get("type") != "telemetry":
        return

    node = packet.get("sender") or str(packet.get("from", "unknown"))
    payload = packet.get("payload", {})

    # Flatten to variables, prefixed per node: cabin_temperature, cabin_battery_level…
    metrics = {
        f"{node}_{key}": value
        for key, value in payload.items()
        if isinstance(value, (int, float, bool))
    }
    if not metrics:
        return

    requests.post(
        NODRIX,
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={"metrics": metrics},
        timeout=10,
    )

client = mqtt.Client()
client.on_message = on_message
client.connect(BROKER, 1883, 60)
client.subscribe(TOPIC)
client.loop_forever()
```

The filter on `int, float, bool` matters. Telemetry payloads carry strings and nested objects
alongside the numbers, and passing those through creates variables you will spend an evening
deleting.

Run it wherever the broker runs — the same Pi is the obvious place — under systemd so it restarts
with the machine.

## What you get

Variables appear the first time they arrive, so there is no schema to define. On the deployment:

- **Charts per node.** `cabin_temperature` and `ridge_temperature` on one graph, over months rather
  than the last few points held in device memory.
- **Battery monitoring that matters.** A remote node's `battery_level` trending down over weeks is
  the single most useful thing a mesh can tell you, because it predicts the node going silent before
  it happens. An automation on a threshold turns that into a message.
- **Alerts on silence.** Because each node reports on an interval, absence is detectable. A node
  that stops relaying is a node worth visiting, and you would rather learn that from a notification
  than from noticing a gap three weeks later.
- **A read API** behind one token, if you want the data in Grafana or your own app anyway.
- **Shared dashboards** by read-only link, which is how you show a mesh community what the network
  is doing without giving anyone access to it.

## Why not the usual stack

MQTT plus InfluxDB plus Grafana works and plenty of people run it. It is also three services to
install, secure, back up and upgrade, on a Pi that is often also the gateway — and InfluxDB's
version transitions have been genuinely disruptive for small self-hosted deployments.

The bridge above keeps the broker, which you need anyway, and replaces the rest with a deployment in
your own Cloudflare account: no database to run, no dashboards to provision, no retention policy to
tune, and no machine whose SD card failing takes a season of readings with it.

If you already run the full stack and like it, there is no reason to change. If you have been
putting it off because it is three days of work before you see a chart, this is an afternoon.
