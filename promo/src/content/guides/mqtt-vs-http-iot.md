---
title: "MQTT vs HTTP for IoT: an honest comparison for makers"
description: "Most MQTT-vs-HTTP comparisons are written by broker vendors, and it shows. Here's the maker's version: where MQTT genuinely wins, where the famous overhead numbers mislead, why WebSocket is the missing third option, and how to actually choose for an ESP32-class project."
category: concept
datePublished: 2026-07-10
dateUpdated: 2026-07-10
faqs:
  - q: "Is MQTT faster and lighter than HTTP?"
    a: "Per message on an open connection, yes — MQTT's fixed header is 2 bytes and HTTP's headers are hundreds. But the comparisons that turn this into 'HTTP is 8x heavier' assume a new HTTP connection per message while MQTT keeps its socket open — an unfair matchup. Give HTTP the same courtesy (keep-alive, or a WebSocket) and the per-message gap shrinks to noise for typical maker payloads. For a duty-cycled sensor, the TLS handshake on wake dominates either protocol equally."
  - q: "Do I need MQTT for an ESP32 project?"
    a: "Only if you need what a broker uniquely provides: fan-out of one message to many subscribers, device-to-device messaging, or presence via last-will. A board that reports readings to one backend and receives occasional commands — which is most maker projects — is a point-to-point conversation that HTTPS up and a WebSocket down handles with one less system to run."
  - q: "Does HTTP drain more battery than MQTT?"
    a: "Not in the sleep-most-of-the-time pattern that battery projects actually use. A sensor that wakes every 15 minutes pays for boot, Wi-Fi association, and a TLS handshake before either protocol says a word — that's the budget, and it's identical. MQTT's efficiency accrues to devices that stay awake and chat continuously; a device that sleeps can't benefit from a session it isn't holding."
  - q: "Why do most IoT platforms push MQTT?"
    a: "Partly genuine merit at fleet scale — and partly because many of them are broker companies, so the comparison you're reading is often the sales page. Note what their own numbers lean on: the widely-quoted latency and overhead benchmarks trace back to tests against a cloud IoT service that was retired in 2023, under connection-per-request assumptions. Read protocol advice the way you'd read a benchmark from anyone selling one side of it."
  - q: "What about CoAP, AMQP, or LoRaWAN?"
    a: "Different problems. CoAP targets networks too constrained for TCP (it runs over UDP); AMQP is enterprise message-queue territory; LoRaWAN is a radio network whose gateways typically hand data to a backend over IP anyway. For Wi-Fi-class maker hardware — ESP32, ESP8266, Pico W — the real decision is the one on this page."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The broker-free uplink, implemented end to end."
  - href: "/guides/esp32-receive-commands"
    label: "Receive commands on an ESP32"
    desc: "The downlink — the part HTTP skeptics are right to ask about."
  - href: "/guides/esp32-deep-sleep-battery"
    label: "ESP32 battery life"
    desc: "The wake-report-sleep pattern where the handshake math lives."
  - href: "/guides/open-source-iot-dashboard"
    label: "Open-source IoT dashboards"
    desc: "The platform layer this protocol choice feeds."
---

Search "MQTT vs HTTP" and nearly everything you'll read was published by a company that sells MQTT
brokers. The conclusions follow the incentive: HTTP gets framed as a legacy protocol tolerated only
for devices that can't do better, backed by overhead numbers measured under assumptions that flatter
the product. MQTT is genuinely excellent at what it was built for — this page gives it full credit —
but a maker choosing a protocol for an ESP32 deserves the version without the sales motion.

Three claims up front, argued below: the famous efficiency numbers compare an unfairly configured
HTTP; the decision for most maker projects is really about whether you want to operate a broker;
and the strongest architecture for boards-to-cloud is the one both camps skip — HTTPS up, WebSocket
down.

## What each protocol actually is

[**MQTT**](https://mqtt.org) is publish/subscribe through a broker. Every device holds a persistent TCP connection to a
central broker process; publishers push to topics, subscribers receive from them, and the broker
routes. The protocol carries real machinery for unreliable links: three QoS levels, retained
messages, and a last-will message the broker emits when a client vanishes. It was designed in 1999
to move pipeline telemetry over satellite links — scarce, expensive bytes — and that heritage is
exactly why its framing is so lean.

**HTTP** is request/response with no middleman. A device POSTs a reading to an endpoint and gets an
acknowledgment in the reply; TLS, load balancing, auth tokens, and debugging tooling come from the
web's thirty years of infrastructure. What plain request/response lacks is push: the server can't
initiate, so commands wait for the device to ask.

**WebSocket** is the third option most comparisons omit: a connection that starts as HTTPS on
port 443 and upgrades to a persistent, bidirectional channel. Server push without a broker,
firewall-friendly because it is web traffic, one socket carrying telemetry up and commands down.

## The overhead numbers, audited

The stock argument says MQTT's per-message overhead is a 2-byte header against HTTP's hundreds of
bytes of headers, quoting benchmark figures of roughly 8x the bytes and multiples of the latency.
Two things about those numbers:

- **They compare a held socket against connection-per-request.** MQTT gets a persistent session;
  HTTP is made to re-handshake for every message. Real HTTP clients reuse connections — and over a
  WebSocket, the per-message framing is bytes, not headers. Configured comparably, the protocols
  converge for the payload sizes makers ship.
- **Their provenance is stale.** The most-cited latency figures trace to tests against Google Cloud
  IoT Core — a service retired in 2023. Numbers that outlive the platform they were measured on are
  marketing, not engineering.

The honest version: on a continuously chatty, always-connected link, MQTT's framing really is
leaner, and at fleet scale that compounds. At one reading every ten seconds from a handful of
devices, the difference is invisible next to Wi-Fi beacons and TLS record overhead.

## The battery argument, audited

"MQTT saves battery" assumes a device that stays connected. Battery devices don't — they sleep. The
wake-report-sleep cycle pays for boot, Wi-Fi association, DHCP, and a TLS handshake before the
first application byte, whichever protocol follows; then it ships a few hundred bytes and loses
power on purpose. A session the device isn't holding can't save it anything. The protocol choice
for battery hardware is a rounding error against sleep current and wake frequency — the real
levers are in [the deep-sleep guide](/guides/esp32-deep-sleep-battery).

## Where MQTT genuinely wins

Credit where due — choose MQTT when the shape of your system is its shape:

- **Fan-out.** One sensor reading consumed by five services: pub/sub is the right primitive, and a
  broker does it natively.
- **Device-to-device.** Boards talking to boards through topics, no backend in the loop.
- **Presence.** Last-will gives you "device went dark" detection at the protocol level.
- **Sustained chatter on constrained links.** Always-on cellular devices streaming frequent small
  messages is the satellite-pipeline problem MQTT was born for.
- **Existing broker infrastructure.** A factory with Sparkplug conventions or a team already
  operating EMQX/Mosquitto — the ecosystem is mature and the marginal cost is paid.

## Where the HTTP family wins

- **Nothing to operate.** A broker is a server: something to host, secure, patch, and monitor.
  Point-to-point HTTPS deletes the component entirely — for a maker, that's usually the whole
  argument.
- **Networks just let it through.** Port 443 web traffic works from campus networks, offices,
  hotels, and behind corporate proxies where port 1883 is a support ticket.
- **The web's toolbox applies.** Bearer tokens, `curl` for debugging, serverless platforms,
  CDNs, standard load balancing — every piece of web infrastructure is your IoT infrastructure.
- **State and history live behind an API,** not in retained topic messages you have to mirror into
  a database anyway.

## The architecture the comparisons skip

The classic knock on HTTP for IoT is the downlink: "how does the server tell the device anything?"
Polling is the crude answer; a WebSocket is the good one. The pattern that gets the best of both
camps, and the one nodrix is built around:

- **Telemetry up** as plain HTTPS or over the socket — stateless, debuggable, serverless-friendly.
- **Commands down** the same WebSocket — real push, at-least-once delivery, no broker, no polling.
- **Battery devices** drop the socket entirely: wake, POST the reading, collect any pending command
  in the response, sleep — [the downlink guide](/guides/esp32-receive-commands) shows both modes
  behind one handler.

That's not a compromise position between MQTT and HTTP; for boards-talking-to-your-backend, it's
simply the fit. The broker earns its keep when messages have many consumers or device peers. When
every message has exactly one destination — your platform — the broker is a mandatory middleman for
a conversation with two parties.

## Choosing, compressed

| Your system looks like | Use |
|---|---|
| Boards report to your backend; occasional commands back | HTTPS + WebSocket |
| Battery sensors that sleep between reports | HTTPS, poll-on-wake |
| One stream, many independent consumers | MQTT |
| Devices messaging each other directly | MQTT |
| Existing broker/Sparkplug infrastructure | MQTT |
| Hostile networks (campus, corporate, hotel) | HTTPS + WebSocket |

If your project is in the first two rows — and most maker projects are — the practical next step is
seeing the broker-free version running: [an ESP32 on HTTPS](/guides/esp32-https-cloud) with
[commands coming down the socket](/guides/esp32-receive-commands), on an instance you
[deploy to your own Cloudflare account](/guides/deploy-nodrix-cloudflare) in one click. The best
protocol argument is a working dashboard with nothing else to run.
