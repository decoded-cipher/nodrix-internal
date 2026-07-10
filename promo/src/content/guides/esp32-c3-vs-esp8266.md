---
title: "ESP32-C3 vs ESP8266: the upgrade question, answered honestly"
description: "The ESP8266 still works and still costs two dollars — but the ESP32-C3 is its designated successor at nearly the same price, with the RAM headroom that makes TLS comfortable instead of a squeeze. When to switch, when the old board is still the right call, and what changes in firmware."
category: hardware
board: ESP32-C3
difficulty: beginner
datePublished: 2026-07-10
dateUpdated: 2026-07-10
faqs:
  - q: "Is the ESP8266 obsolete in 2026?"
    a: "No — dated, not dead. Espressif's longevity commitment keeps the ESP8266 series in production toward the end of the decade, the ecosystem still receives real investment, and boards cost under two dollars in bulk. For a Wi-Fi-only sensor with modest TLS needs it remains perfectly serviceable. Obsolete is the wrong frame; 'no longer what you'd design in' is the right one."
  - q: "What does the ESP32-C3 actually improve over the ESP8266?"
    a: "The ones that change your day: several times the usable RAM, which turns TLS from a heap-anxiety exercise into a non-event; Bluetooth LE 5 for provisioning or beacons; hardware crypto acceleration; more usable GPIO with saner boot-strapping quirks; and a current toolchain that gets first-class attention. The CPU jump (a 160 MHz RISC-V core vs the 8266's aging Tensilica) matters less than the memory for typical projects."
  - q: "Do I have to change my code to move from ESP8266 to ESP32-C3?"
    a: "Less than you'd fear. Arduino-side, most sketches move with pin-number edits — and with the nodrix library the cloud calls are literally identical. The one visible difference is TLS pinning: on the 8266 you pin a certificate fingerprint (setFingerprint) because full chain validation is heavy for its RAM; on the C3 you pin the CA properly (setCACert) and stop thinking about the heap during handshakes."
  - q: "Should I buy ESP8266 boards for a new project just because they're cheaper?"
    a: "Only if the project is genuinely at the two-dollar end: a fixed sensor, one HTTPS report every few minutes, no BLE, no growth ambitions — the 8266 still does that with dignity. The moment the plan includes always-on TLS connections, bigger payloads, OTA headroom, or Bluetooth anything, the one-dollar saving buys you the exact constraints the C3 was designed to remove."
related:
  - href: "/guides/esp8266-iot-dashboard"
    label: "ESP8266 to the cloud"
    desc: "The old guard's full walkthrough, BearSSL squeeze and all."
  - href: "/guides/esp32-c6-for-makers"
    label: "ESP32-C6 for makers"
    desc: "One tier up: the current default board, examined."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The C3 runs this firmware unchanged."
  - href: "/guides/esp32-deep-sleep-battery"
    label: "ESP32 battery life"
    desc: "Deep-sleep patterns for either chip."
---

The ESP8266 is the board that made Wi-Fi microcontrollers a hobby: a decade of tutorials, a
sub-two-dollar price, and millions of deployed nodes still dutifully reporting. It's also a 2014
design whose RAM budget makes modern TLS feel like packing a suitcase by sitting on it. The
ESP32-C3 is Espressif's designed successor — near-8266 pricing with the constraints removed — and
"should I switch" has become the default question at the budget end of the family.

The honest answer has three parts: for new designs, yes; for working deployments, no; and the
details are worth two minutes because the 8266's remaining advantages are real.

## What the C3 fixes

The upgrades that actually change a maker's day, in order:

- **RAM headroom.** The C3 has several times the usable memory of the 8266, whose ~40–50 KB of
  practical heap made every TLS handshake a negotiation. On the C3, HTTPS with full certificate
  validation is a non-event — the difference between pinning a fingerprint and hoping and
  pinning a CA properly.
- **Bluetooth LE 5.** Provisioning without hardcoded credentials, beacons, phone-adjacent tricks —
  a whole category the 8266 simply doesn't have.
- **Hardware crypto.** TLS handshakes lean on acceleration instead of grinding the core.
- **Saner pins.** More usable GPIO without the 8266's minefield of boot-strapping pins that reset
  the board if a sensor holds them low at the wrong moment — and deep-sleep wake without the
  famous GPIO16-to-RST bodge wire.
- **A current toolchain.** RISC-V core, first-class attention in today's SDK and Arduino core, and
  the same platform generation as the C6 above it.

## What the ESP8266 still has

- **Price and ubiquity.** Under $2 in bulk, in every parts drawer, on every tutorial site — the
  cheapest ticket to Wi-Fi there has ever been.
- **A decade of documented behavior.** Every quirk has a forum thread; the platform holds no
  surprises, which is its own kind of reliability.
- **Continued life.** Espressif's 15-year production commitment carries the series toward the end
  of the decade, and the software ecosystem still sees genuine investment — this is a supported
  legacy, not abandonware.
- **It already works.** A deployed 8266 that reports on schedule owes you nothing. Boards in
  service are not an upgrade queue.

## The firmware reality

With the [nodrix Arduino library](https://github.com/decoded-cipher/nodrix-sdk), both chips run
the same sketch — same `Nodrix.begin`, same `Nodrix.send`, same `NODRIX_WRITE` handlers. The one
line that differs is how you pin TLS, and it's the whole story of the two chips in miniature:

```cpp
#include <Nodrix.h>

void setup() {
#if defined(ESP8266)
  Nodrix.setFingerprint(HOST_FP);   // chain validation is heavy for 40 KB of heap
#else
  Nodrix.setCACert(ROOT_CA_PEM);    // C3: validate the chain properly, RAM is a non-issue
#endif
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();
}
```

The 8266 route works — [the full walkthrough](/guides/esp8266-iot-dashboard) squeezes BearSSL into
that budget deliberately, and a fingerprint pin is honest security. But a fingerprint pins one
certificate rather than a chain, so certificate rotation upstream means re-pinning; a CA pin on
the C3 shrugs rotation off. That maintenance difference compounds over a fleet's lifetime.

Everything else in a migration is pin numbers and the pleasant deletion of workarounds: the ADC
that's no longer a single overloaded pin, the wake wire that's no longer soldered, the payload
size you stop budgeting.

## Choosing, compressed

| Situation | Pick |
|---|---|
| New design, any TLS ambition, BLE, or growth plans | ESP32-C3 |
| Absolute-minimum-cost fixed sensor, modest reporting | ESP8266, still |
| Deployed 8266 fleet, working fine | Leave it be |
| Buying for the drawer in 2026 | C3 — or [a C6](/guides/esp32-c6-for-makers) for the radio options |
| Deep-sleep battery sensor | Either — [the pattern](/guides/esp32-deep-sleep-battery) fits both; the C3 skips the wake-wire bodge |

## The bottom line

The ESP8266 earned its retirement-age respect, and nothing about 2026 forces it out of service.
But the design conversation is over: the C3 costs pennies more and deletes the exact constraints —
RAM, TLS comfort, pin quirks, no BLE — that every 8266 project spends its first evening working
around. Point either one at [your own instance](/guides/deploy-nodrix-cloudflare) and the cloud
can't tell them apart — the difference is the workarounds you no longer write.
