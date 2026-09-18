---
title: "ESPHome without Home Assistant: reaching it remotely"
description: "ESPHome is local-first by design. The honest options for seeing your devices from outside the house, including pushing readings out without leaving ESPHome."
category: concept
difficulty: intermediate
datePublished: 2026-09-18
faqs:
  - q: "Can ESPHome work without Home Assistant?"
    a: "Yes. A device runs standalone with its own web server component, and you can reach it on the local network by IP without any Home Assistant instance. What you lose is the layer Home Assistant provides: history, dashboards across devices, and automations that span more than one board. ESPHome is firmware, not a platform, and the gap is deliberate."
  - q: "How do I access ESPHome devices outside my WiFi network?"
    a: "Four practical routes. Reach Home Assistant remotely through Nabu Casa or a VPN and use it as the front door. Put your phone and your network on Tailscale or WireGuard. Run a tunnel to expose a dashboard. Or have the device push its readings outward to an endpoint you control, which needs no inbound path at all."
  - q: "Does nodrix replace ESPHome?"
    a: "No. ESPHome is firmware with an excellent configuration model and a large library of supported sensors, and inside the house paired with Home Assistant it is hard to beat. nodrix is a backend. They solve different halves, which is why the useful configuration is often both: ESPHome keeps doing local control, and pushes a copy of the readings outward for remote viewing and alerting."
  - q: "Can an ESPHome device send data to an external endpoint?"
    a: "Yes, with the http_request component. It makes HTTPS POST requests with custom headers and a JSON body, validating certificates against ESP-IDF's bundled CA set by default. That is enough to post readings to any endpoint that accepts JSON, which is how you get remote visibility without reflashing to different firmware."
  - q: "Will pushing data out break my Home Assistant setup?"
    a: "No. The native API connection to Home Assistant is unaffected — you are adding an outbound POST on an interval, not replacing anything. Local control keeps working exactly as before, including when your internet connection is down, which is the main reason to keep ESPHome doing the local half."
related:
  - href: "/guides/home-assistant-vs-nodrix"
    label: "Home Assistant vs nodrix"
    desc: "Where each fits, and why people run both."
  - href: "/guides/esp32-remote-access-no-port-forwarding"
    label: "Reaching a board from anywhere"
    desc: "The four remote-access approaches compared."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The endpoint shape this posts to."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "Where the pushed readings land."
---

ESPHome is firmware, and a good one — a clean configuration model, a large library of supported
sensors, and local control that keeps working when your internet does not. Paired with Home
Assistant inside the house it is genuinely hard to beat.

It is also local-first on purpose, which is why "how do I see this from work" is one of the most
repeated questions in the community and one of the least well answered. The threads are plentiful;
the write-ups are not.

## What ESPHome gives you on its own

A device runs standalone. With the [web server component](https://esphome.io/components/web_server.html) enabled you can open its IP on your network
and see current values and controls. No Home Assistant required.

What you do not get is the layer above: history beyond what is on screen, dashboards spanning
several devices, automations across boards, or alerting. ESPHome does not claim to provide those —
it is firmware, and that is the boundary.

## The four remote options

| Approach | Setup | Works when internet is down | Sharing with non-technical people |
|---|---|---|---|
| Home Assistant + Nabu Casa | Subscription | Locally, yes | Good |
| VPN (Tailscale, WireGuard) | Per-client config | Locally, yes | Poor — everyone needs the VPN |
| Tunnel to a dashboard | Moderate | Locally, yes | Good |
| Push readings outward | Small | Local control unaffected | Good |

The first three make your network reachable from outside. The fourth reverses the direction: the
device sends readings out, so nothing inbound is required at all.

That last one is worth understanding properly, because it composes with the others rather than
replacing them.

## Keeping ESPHome and adding remote

The honest configuration for most people is not a migration. It is ESPHome continuing to do local
control exactly as it does now, plus an outbound POST so the readings are also somewhere you can
reach.

ESPHome's [`http_request` component](https://esphome.io/components/http_request.html) makes HTTPS POSTs with a JSON body and custom headers. By default
it validates certificates against ESP-IDF's bundled CA set, so this is a properly verified
connection rather than one with checks disabled.

Pointing it at a nodrix deployment is one block of YAML:

```yaml
# Local control is unchanged — this is added alongside it.
api:
  encryption:
    key: !secret api_key

http_request:
  verify_ssl: true          # uses ESP-IDF's bundled CA set
  timeout: 10s

sensor:
  - platform: bme280_i2c
    temperature:
      name: "Greenhouse temperature"
      id: temp
    humidity:
      name: "Greenhouse humidity"
      id: humidity
    address: 0x76
    update_interval: 60s

# Push a copy outward every five minutes.
interval:
  - interval: 5min
    then:
      - http_request.post:
          url: https://nodrix.you.workers.dev/v1/telemetry
          request_headers:
            Content-Type: application/json
            Authorization: !secret nodrix_token
          json:
            metrics:
              temperature: !lambda return id(temp).state;
              humidity: !lambda return id(humidity).state;
          on_error:
            then:
              - logger.log: "telemetry post failed"
```

Points worth noting:

- **The `api:` block is untouched.** Home Assistant keeps its native connection, local automations
  keep running, and none of that depends on the POST succeeding.
- **Variables appear on first sight.** There is no schema to define on the receiving end — send
  `temperature` and a temperature variable exists.
- **Five minutes, not sixty seconds.** The local sensor updates every minute for local automations;
  the outbound copy is for remote viewing and alerting, where a five-minute resolution is usually
  plenty and uses a fraction of the request budget.
- **`on_error` logs rather than retries.** A failed POST should not disturb a device whose primary
  job is local control.

## What that gets you

The readings now exist somewhere reachable without a VPN, a tunnel, or an inbound port, in a
deployment in your own Cloudflare account:

- **Dashboards** that stream over a WebSocket and can be shared read-only by link — which is how you
  show someone the greenhouse without giving them access to your home network.
- **Automations** on variable, schedule and sunrise/sunset triggers, sending to Telegram, Discord,
  Slack or email. Useful for the alerts you want to arrive whether or not you are home.
- **A read API** behind one token, for Grafana or an app of your own.
- **History** beyond what the device holds in memory.

Local control stays where it belongs. If your internet drops, ESPHome and Home Assistant carry on
exactly as before and the outbound posts simply resume when the connection returns.

## Choosing

- **Everything is inside the house and stays there.** ESPHome plus Home Assistant. Nothing here
  improves on that.
- **You want remote access to the whole Home Assistant instance.** Nabu Casa, or Tailscale if you
  prefer to run it yourself. Both are good answers.
- **You want specific readings visible and alerting reliably from anywhere, including to people who
  will not install a VPN.** Push them outward. It composes with either of the above.
- **You are starting fresh, remote-first, and have no Home Assistant.** Then the question is
  different — a device reporting outbound from the start does not need the local platform at all,
  and [connecting an ESP32 over HTTPS](/guides/esp32-https-cloud) is the shorter path.

The framing that causes trouble is treating this as a choice between platforms. ESPHome is firmware
and a backend is a backend; the reason the forum threads go in circles is that people keep looking
for one thing that does both, when running both is straightforward and neither has to lose.
