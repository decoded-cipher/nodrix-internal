---
title: "Matter and Thread for makers: what they solve, and what they leave to you"
description: "An honest guide to Matter and Thread for DIY hardware: which ESP32 variants can do what, why a border router may not be needed at all, the certification reality for homemade devices, and the jobs Matter deliberately doesn't do."
category: concept
board: ESP32-C6
difficulty: intermediate
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "Do I need a Thread border router to use Matter?"
    a: "No — that's the most common misconception about Matter. Matter runs over Wi-Fi, Ethernet, and Thread, and a device that speaks Matter over Wi-Fi joins your smart home with no border router at all. Thread is one transport option, chosen for battery devices and mesh coverage, not a requirement of the standard. If you have a classic ESP32 and want a Matter light switch, you can build it today."
  - q: "Which ESP32 variants can do Thread?"
    a: "The ones with an 802.15.4 radio: the C6, the H2, and the C5. The classic ESP32, the S3, and the C3 have Wi-Fi and Bluetooth only, so they can be Matter devices over Wi-Fi but never Thread devices. The C6 is the interesting one because it carries both radios on a single chip, which also lets it act as a border router bridging the two networks."
  - q: "Can I certify a homemade Matter device?"
    a: "Not practically, and you don't need to for personal use. Certification means going through the CSA, who assign your vendor ID, and it's priced for companies shipping products. For a device on your own network you build with test credentials, which work with the major ecosystems for development. What you can't do is distribute that device to others as a certified Matter product."
  - q: "Does Matter replace my own IoT backend?"
    a: "No, and this is the part worth understanding before you invest in either. Matter standardises local control of common device types — it deliberately doesn't do telemetry history, remote access outside your home ecosystem, custom data that has no cluster defined, or detailed device diagnostics. Industry guidance is explicit that those capabilities still require cloud connectivity alongside Matter, not instead of it."
  - q: "What if my sensor measures something Matter has no cluster for?"
    a: "Then Matter can't carry it, and that's a design property rather than a gap that will close for you. Matter defines a baseline set of device types and attributes, and a device cannot exceed that baseline within the standard. A soil moisture reading in your own units, or a custom diagnostic your build cares about, needs its own path — which is exactly the case for keeping a data backend alongside."
related:
  - href: "/guides/esp32-c6-for-makers"
    label: "ESP32-C6 for makers"
    desc: "The chip that makes Thread possible, in depth."
  - href: "/guides/home-assistant-vs-nodrix"
    label: "Home Assistant vs nodrix"
    desc: "Where the smart-home hub ends and your cloud begins."
  - href: "/guides/esp32-smart-home-automation"
    label: "DIY smart home with an ESP32"
    desc: "The build that doesn't need Matter at all."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The data layer Matter deliberately leaves out."
---

Matter arrived promising to end the smart-home compatibility mess, and for buying off-the-shelf
devices it has largely delivered. For makers building their own hardware, the picture is more
interesting and less discussed: some of what you'd expect to be hard is easy, and some of what sounds
like a detail turns out to be the whole decision.

Here's what Matter and Thread actually do for a DIY project, and — more usefully — what they don't.

## Matter is not Thread

These two get conflated constantly, and separating them clears up most of the confusion.

**Matter** is an application-layer standard: how a device describes itself, what a "light" or a
"temperature sensor" is, how it's commissioned, and how it's controlled. It runs over **Wi-Fi,
Ethernet, or Thread**.

**Thread** is one of those transports — a low-power 802.15.4 mesh network, the same radio family as
Zigbee.

The practical consequence is the thing most people get wrong: **you do not need a Thread border
router to build a Matter device.** A Matter device over Wi-Fi joins Apple Home, Google Home, or
Alexa with no extra hardware. If you own a classic ESP32 and want a Matter-compatible relay, nothing
is stopping you today.

Thread earns its complexity for battery devices and for coverage. A Thread sensor sips power in a way
a Wi-Fi device can't, and Thread meshes so distant nodes route through nearer ones. That needs a
border router to bridge the mesh onto your IP network — many smart speakers and hubs already contain
one.

## Which ESP32 can do what

The split is a hardware fact, not a firmware option.

**Thread-capable — the C6, H2, and C5** carry an 802.15.4 radio. These can be Thread devices. The [C6](/guides/esp32-c6-for-makers)
is the most interesting of the three because it has Wi-Fi 6 *and* 802.15.4 on one chip, which means
it can also act as a **Thread border router itself**, bridging the mesh to your network from a single
five-dollar part.

**Wi-Fi Matter only — the classic ESP32, S3, and C3** have no 802.15.4 radio. They can be perfectly
good Matter devices over Wi-Fi. They can never be Thread devices.

The **H2** is the odd one: 802.15.4 and Bluetooth but *no Wi-Fi at all*. It's a pure Thread endpoint,
useless for anything that needs to reach the internet on its own.

Espressif's **ESP-Matter** SDK is the path for all of them, built on ESP-IDF.

## What Matter gives you

Genuinely valuable things, worth being clear about before the criticisms:

- **Real interoperability.** A Matter device works with Apple Home, Google Home, Alexa, and Home
  Assistant without writing an integration for each.
- **Local control.** Commands don't round-trip through a vendor cloud, so they're fast and they work
  when your internet doesn't.
- **A commissioning flow people understand.** Scan a QR code, device joins. No captive portal, no
  app-specific pairing dance.

For a light, a switch, a plug, or a basic sensor you want to say "hey Siri" at, this is exactly right
and hard to beat with anything homemade — including
[the plain Wi-Fi version of the same build](/guides/esp32-smart-home-automation).

## What Matter deliberately doesn't do

Here's the part that decides whether Matter is sufficient for your project, and it's not a criticism
— these are scope decisions, not gaps waiting to be filled.

**Matter defines a baseline, and devices can't exceed it.** The standard specifies device types and
their attributes. If your build measures something with no cluster defined for it, Matter has no way
to carry it. Industry guidance for people shipping Matter products is explicit: custom features and
data types outside the specification require a cloud platform alongside.

**No history.** Matter tells a controller what a device's state *is*. It isn't a time-series
database, and it doesn't keep a record of what your sensor read last Tuesday.

**No telemetry or diagnostics path.** The same guidance notes that OTA updates, telemetry, remote
management, and detailed device diagnostics all still need cloud connectivity. Matter carries
control, not operational data about your fleet.

**Remote access belongs to the ecosystem.** Reaching your devices from outside the house means going
through Apple, Google, or Amazon's infrastructure and playing by their rules — not through anything
you control.

## Using both, which is the actual answer

Once you see the split clearly, the design follows. Matter is a **control interface**. A backend like
nodrix is a **data layer**. A device can do both, and for a lot of maker projects it should.

Take a greenhouse controller on an ESP32-C6. As a **Matter device**, it exposes a relay so the family
can turn the fan on from the Home app and a temperature reading that shows up beside the thermostat.
Over [**HTTPS to your own instance**](/guides/esp32-https-cloud), it reports soil moisture, light
hours, water consumed, and its own battery voltage — variables no Matter cluster describes — with months of history, charts, alerts
when a threshold trips, and a read API you can query from a script.

Neither replaces the other. Matter makes the device a good citizen of the house; your own backend
makes it a good instrument.

## The certification reality

For DIY, this is simpler than it sounds and worth knowing before you plan a product.

Matter devices carry cryptographic identity — a vendor ID assigned by the CSA, a product ID you
assign, and attestation certificates. During development you use **test credentials**, with the
declaration marked provisional rather than official, and these work with the major ecosystems for
building and testing.

For a device on your own network, that's the end of the story. For a device you intend to sell as
certified Matter, you go through the CSA, and the process is priced for companies rather than
individuals. Nothing prevents you from publishing your design and letting others build it — it just
isn't a certified Matter product when they do.

## Notes

Matter over Wi-Fi doesn't reduce your device's power draw. It's an application layer over the same
radio, so a Matter Wi-Fi sensor has the same battery problem as any Wi-Fi sensor. Thread is where the
power advantage lives, and it's the main reason to reach for a C6 over a C3.

The ESP32-C6's ability to be a Thread border router is genuinely useful even if you never build a
Matter device — an ESP-IDF example turns one into a border router that lets a Home Assistant setup
talk to Thread devices without buying a hub.

Zigbee runs on the same 802.15.4 radio, so a C6 or H2 can be a Zigbee device instead. If you already
have a Zigbee network and no interest in Matter, that path is open on identical hardware.
