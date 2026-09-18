---
title: "Access an ESP32 from anywhere without port forwarding"
description: "Four ways to reach a board on your home network from outside it, what each costs in setup and risk, and why outbound-only suits most projects."
category: concept
difficulty: beginner
datePublished: 2026-09-18
faqs:
  - q: "How do I access my ESP32 from outside my home network?"
    a: "There are four workable approaches: forward a port on your router, put the board and your phone on a VPN such as Tailscale or WireGuard, run a tunnel client that dials out to a tunnel provider, or have the board make an outbound connection to a backend you control and talk to that instead. The last one needs no router configuration and no inbound path, which is why it is the usual answer for a sensor or a relay."
  - q: "Is port forwarding to an ESP32 safe?"
    a: "It is the riskiest of the four. Forwarding a port publishes a device with a small TLS stack, a simple HTTP server and no meaningful update cadence directly to the internet, where it will be scanned within hours. If you do it anyway, put the board on a separate VLAN, never expose a device that can act on the physical world, and be certain you can patch it."
  - q: "Do I need a static IP or dynamic DNS?"
    a: "Only if something outside your network needs to open a connection inward, which is the case for port forwarding and for hosting a server on the board. If the board dials out instead, your home IP can change as often as your ISP likes and nothing notices."
  - q: "Is Tailscale a good option for an ESP32?"
    a: "Tailscale is excellent for reaching a Raspberry Pi or a home server, and if you already run it, using it is reasonable. It is a heavier fit for a microcontroller: you are adding a daemon and key management to a device whose whole job is to report a number, and every client that wants the data has to be on the same tailnet. For a phone dashboard you want to share, that is friction."
  - q: "What does outbound-only actually mean?"
    a: "The board opens the connection, not the internet. It makes an HTTPS request or holds a WebSocket to a backend, exactly as a browser does when you load a page. Your router already allows that, so there is nothing to configure, nothing listening on your home IP, and nothing for a scanner to find."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The outbound approach, built end to end."
  - href: "/guides/esp32-receive-commands"
    label: "Send commands back to a board"
    desc: "Control without an inbound connection."
  - href: "/guides/esp32-notifications"
    label: "Alerts from a board"
    desc: "Getting told when something happens."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The endpoint the board dials out to."
---

You have an ESP32 on your home Wi-Fi reporting something you care about, and you want to see it from
work. Every answer you find says "forward port 80 on your router", which is both the oldest advice
and the worst.

There are four real options. Only one of them requires nothing from your router.

## The four approaches

| Approach | Router config | Exposed to the internet | Sharing with others |
|---|---|---|---|
| Port forwarding | Port forward + dynamic DNS | The board itself | Anyone with the URL |
| VPN (Tailscale, WireGuard) | Usually none | Nothing | Only tailnet members |
| Tunnel client | None | The tunnel endpoint | Anyone with the URL |
| Outbound to your own backend | None | Nothing | However you choose |

### Port forwarding

You open a port on your router and point it at the board's local IP, then add dynamic DNS because
your home IP changes.

This publishes a microcontroller to the open internet. An ESP32 running a small HTTP server has a
minimal TLS stack, no rate limiting worth the name, and whatever patch cadence you personally
maintain. Mass scanners will find it within hours of it going up — not because anyone targeted you,
but because the entire address space is swept continuously.

If you do this anyway: put it on a separate VLAN, never expose a board that can switch something
physical, and be honest with yourself about whether you will apply updates.

### VPN

[Tailscale](https://tailscale.com/) or [WireGuard](https://www.wireguard.com/) put your phone and your device on the same private network. Nothing is
exposed, and for a Raspberry Pi or a home server this is genuinely the right answer.

On a microcontroller it fits less well. You are adding a daemon and key management to a device whose
job is to report a temperature, and everyone who wants to see the data has to join the tailnet. If
you want to show a dashboard to someone in the house who is not technical, that is a real obstacle.

### Tunnel client

A tunnel client on the board, or on a Pi next to it, dials out to a provider — [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) is the common one — which gives you a public URL. No router changes, and the inbound path terminates at the provider rather than on your device.

The trade is that you have added a dependency, usually a daemon that wants more resources than a
microcontroller has, which is why this is typically run on a Pi rather than on the ESP32 itself.

### Outbound to a backend you control

The board opens the connection. It makes an HTTPS request, or holds a WebSocket, to a backend — the
same thing a browser does when it loads a page. Your router permits that already.

Nothing listens on your home IP. There is no port to forward, no dynamic DNS, no VPN membership, and
nothing for a scanner to find, because from the network's point of view your board is a client, not
a server.

The catch, and it is the real one: you need a backend for it to dial. If that backend is somebody's
IoT cloud, you have swapped a router problem for a vendor problem — device caps, message quotas, and
your data on their infrastructure.

## Running the backend yourself

nodrix is that backend, deployed to your own Cloudflare account. The board dials out to it, the
data lands in your tenancy, and there is no per-device pricing.

The device side is small on purpose:

```cpp
#include <Nodrix.h>
#include <WiFi.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

const int RELAY_PIN = 2;          // LED_BUILTIN on most dev boards, so this runs unwired

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);

  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

// A dashboard control writing back down the same outbound connection.
NODRIX_WRITE(relay) {
  digitalWrite(RELAY_PIN, value.asBool());
}

void loop() {
  Nodrix.run();

  static unsigned long last = 0;
  if (millis() - last >= 30000) {
    last = millis();
    Nodrix.send("uptime_s", (long)(millis() / 1000));
    Nodrix.send("rssi", WiFi.RSSI());
  }
}
```

That compiles and runs on a bare board with nothing wired to it — `uptime_s` and `rssi` need no
sensor, and `RELAY_PIN` is the built-in LED on most dev boards, so the dashboard toggle is visible
immediately. Swap in your own sensor and pin once the connection is proven.

Note what is not there: no server, no port, no DDNS hostname, no VPN config.

**Control works the same way**, which is the part people expect to need an inbound connection for.
The board holds a WebSocket out to your deployment; when you move a toggle on the dashboard, the
write travels down the connection the board already opened. A sleeping device polls for pending
writes when it wakes instead. Either way nothing connects inward.

From there the useful parts are on the deployment rather than the device:

- **Dashboards** that stream over a WebSocket, shareable read-only by link — which is how you show
  someone the data without giving them access to anything.
- **Automations** on variable, schedule and sunrise/sunset triggers, so alerts fire without the
  board needing to be reachable.
- **A read API** for Grafana or your own app, behind one token.

## Which to pick

- **A sensor reporting somewhere, or a relay you want to flip from your phone.** Outbound. There is
  no router configuration and no exposure, and it is the only option that stays simple when you add
  a second device.
- **You already run Tailscale and want to reach a Pi.** Use it. Adding a second mechanism for one
  board is not worth it.
- **You need to serve a real web app from the board itself.** A tunnel, on a Pi beside it.
- **Port forwarding.** Only behind a VLAN, only for something that cannot act physically, and only
  if you will keep it patched.

The reason outbound wins for most projects is not that it is clever. It is that it removes the
question entirely: there is nothing to configure on the router, so there is nothing to get wrong.
