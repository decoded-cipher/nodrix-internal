---
title: "Free MQTT brokers in 2026, compared by their limits"
description: "HiveMQ counts connections, EMQX counts session minutes including disconnected ones, Mosquitto counts nothing and costs your time. Plus what PubSubClient's rc=-2 actually means."
category: comparison
difficulty: intermediate
datePublished: 2026-09-21
faqs:
  - q: "Which free MQTT broker should I use?"
    a: "For a handful of devices, HiveMQ's Serverless tier is the least friction: 100 connections and 10 GB a month with no credit card. EMQX Serverless allows more connections but meters session minutes in a way that catches people. Mosquitto on your own machine has no quota at all and costs you the maintenance. The deciding factor is usually whether you want to operate a service."
  - q: "What does rc=-2 mean in PubSubClient?"
    a: "It's MQTT_CONNECT_FAILED, meaning the network connection to the broker failed before MQTT itself was negotiated. On port 8883 it is almost always TLS: a missing or wrong root certificate, or a WiFiClient used where a WiFiClientSecure is needed. A negative return code is a transport problem and a positive one is a protocol or credentials problem, which is the fastest way to halve the search space."
  - q: "Does an MQTT broker store my sensor history?"
    a: "No, and this is the most common misunderstanding about brokers. A broker routes messages to whoever is subscribed at that moment. Retained messages keep only the single most recent value per topic, not a series. If nothing is subscribed and listening when a reading arrives, that reading is gone. Charts and history need something else behind the broker."
  - q: "What is a session minute and why is my usage higher than expected?"
    a: "EMQX counts a session minute for every minute a client is connected, and its documentation states that minutes are also counted for disconnected clients that have persistent sessions. A device that sleeps between readings but keeps a persistent session can therefore consume minutes while it is asleep. Using a clean session, or HTTP for one-way telemetry, avoids this."
  - q: "Should I run Mosquitto myself?"
    a: "It's a reasonable choice if you already run a machine that's always on and are comfortable with TLS certificates and keeping software patched. The software is free; the cost is that you're now the on-call engineer for your own message bus. For a local-only network with no internet exposure it is genuinely simple. Exposed to the internet, it is a security responsibility."
  - q: "Do I even need MQTT?"
    a: "Only if something needs to push messages down to your devices. MQTT's real strength is bidirectional messaging and fan-out to multiple subscribers. If your devices only report readings upward, an HTTPS POST does that with no broker, no session state, no connection quota and no certificate to rotate on the broker side."
related:
  - href: "/guides/mqtt-vs-http-iot"
    label: "MQTT or HTTP"
    desc: "Which transport your project actually needs."
  - href: "/guides/esp32-certificate-verification-failed"
    label: "Certificate verification failed"
    desc: "The TLS errors behind most connection failures."
  - href: "/guides/iot-platform-free-tier-limits"
    label: "Platform free tiers compared"
    desc: "The storage side of the same question."
  - href: "/guides/esp32-https-cloud"
    label: "Posting over HTTPS"
    desc: "The no-broker alternative."
---

**Broker free tiers can't be ranked against each other**, because they don't meter the same thing.
One counts concurrent connections, one counts session minutes, and one counts nothing because you
are running it. Picking well means knowing which of those your project produces most of.

First, the thing worth being clear about before any comparison.

## A broker isn't a database

**An MQTT broker routes messages between whoever is connected at the moment they arrive.** It's a
switchboard, not a filing cabinet.

Retained messages are the usual source of confusion. A retained message keeps the **most recent**
value on a topic so that a new subscriber gets something immediately. **One value, not a series.** There
is no history to chart and nothing to query.

So "I will use a free MQTT broker instead of an IoT platform" isn't a like-for-like swap. It
replaces the transport and leaves storage unsolved. If nothing is subscribed and writing readings
down when they arrive, they're gone.

## The published limits

**Checked 21 September 2026.** Broker pricing changes; re-check before committing.

| Broker | Free tier | Meters | Next tier |
|---|---|---|---|
| [HiveMQ Serverless](https://www.hivemq.com/pricing/) | 100 connections, 10 GB/month, no credit card | Connections and data | Starter, from $0.34/hour + $0.80 per million messages |
| [EMQX Serverless](https://www.emqx.com/en/pricing) | Up to 1000 connections, monthly quota on sessions, traffic and rule actions | Session minutes | Pay-as-you-go from $0/month |
| Mosquitto (self-hosted) | No quota | Your time | Not applicable |

Two things this table can't show.

EMQX describes a free monthly quota on sessions, traffic and rule actions rather than publishing
the amounts on its pricing page, so the figures are worth confirming with them directly before you
plan around a number.

HiveMQ's Starter tier is where the SLA appears: 10,000 connections, 1 MB/sec and a 99.95% uptime
commitment. The free tier carries no uptime commitment, which is the practical difference between a
free broker and a production one.

## The session-minute trap

This is the one worth internalising, because it produces a bill or an exhausted quota that doesn't
match your mental model.

EMQX's documentation states that a session minute is counted for every minute a client is connected,
and that **minutes are also counted for disconnected clients that have persistent sessions**.

A battery sensor that wakes, publishes and sleeps looks like it should consume almost nothing. If it
connects with a persistent session so the broker holds its subscriptions, the meter can keep running
while the device is asleep. The fix is a clean session for devices that only publish, and only
requesting persistence where you genuinely need messages queued for a device that's offline.

Whichever broker you pick, something still has to write the readings down. A nodrix deployment can
sit behind the broker via a small bridge, or take the readings over HTTP directly and remove the
broker from the picture entirely — which for one-way telemetry is usually the simpler system.

## When the connection fails

Almost every first-time broker problem surfaces as a number from the client library rather than a
message. For PubSubClient on an ESP32, the sign of that number halves the search space immediately:

| Code | Meaning | Where to look |
|---|---|---|
| `-4` | Connection timeout | Network reachability, firewall, wrong host |
| `-3` | Connection lost | Signal, power, broker restart |
| `-2` | **Connect failed** | TLS — the transport never came up |
| `-1` | Disconnected | Client called disconnect, or never connected |
| `0` | Connected | — |
| `1` | Bad protocol version | Broker expects a different MQTT version |
| `2` | Bad client ID | Empty, too long, or duplicate |
| `3` | Unavailable | Broker up but refusing connections |
| `4` | Bad credentials | Username or password |
| `5` | Not authorised | Credentials valid, permissions aren't |

**Negative means transport. Positive means protocol or credentials.**

`rc=-2` on port 8883 is the single most common one, and it is nearly always TLS. Either a
`WiFiClient` is being used where a `WiFiClientSecure` is required, or no root certificate has been
supplied, or the certificate supplied has expired. Port 1883 is conventionally plaintext and 8883
conventionally TLS, and pointing a plaintext client at a TLS port produces exactly this with no
explanation. The mechanics of the certificate side are in
[certificate verification failed](/guides/esp32-certificate-verification-failed).

## Choosing

**Use a hosted free broker** if you need messages pushed down to devices, have a small fleet, and
would rather not run infrastructure. HiveMQ's Serverless tier is the least ceremony to start.

**Run Mosquitto** if you already have an always-on machine, your devices are on your own network,
and you're comfortable with certificates and patching. On a local network with no internet
exposure this is genuinely simple. Exposed to the internet it is a security responsibility you have
taken on.

**Skip the broker** if your devices only report upward. This is the case more often than the
prominence of MQTT in IoT tutorials suggests. A sensor posting a reading every thirty seconds gains
nothing from a broker and inherits connection quotas, session state, certificate rotation and a
return code to decode. An HTTPS POST has none of that; a failed request is one failed request.

Either way the storage question remains, because the broker was never going to answer it. nodrix
takes the readings — over HTTP, or from a small bridge subscribed to your broker — and keeps them
in a deployment running in your own Cloudflare account, which is the half of the problem a
switchboard was never built to solve.
