---
title: "Which cellular module actually works in India in 2026"
description: "NB-IoT advice from Western tutorials doesn't survive contact with Indian networks. What a maker can actually get a SIM for, and why 2G and LTE Cat-1 remain the safe picks."
category: hardware
board: ESP32
difficulty: advanced
datePublished: 2026-09-21
faqs:
  - q: "Can an individual in India get an IoT or M2M SIM?"
    a: "Not directly from the operator. Airtel's IoT onboarding form requires a company name and company email, so a maker with a personal address can't complete it, and Jio has no maker-facing offering at all. The practical route is an aggregator that resells M2M SIMs in single quantities with ordinary individual KYC, which is how most Indian hobbyists get one."
  - q: "Should I use an NB-IoT module like the SIM7080G or BC660K in India?"
    a: "Probably not, and this is where Western tutorials mislead. The verified Indian NB-IoT deployments are contract-bound smart-metering rollouts rather than an open network a retail SIM will attach to. A module that can't find a network is indistinguishable from a broken one, so choosing NB-IoT on the strength of international advice is a real risk here."
  - q: "Is 2G still usable in India in 2026?"
    a: "Yes. There's no announced national sunset, and operators have differed publicly on whether there should be one. That makes 2G modules such as the SIM800L or SIM868 a pragmatic choice for low-rate telemetry today, with the honest caveat that you're building on a technology whose remaining life is a commercial decision rather than a published date."
  - q: "What does an M2M SIM cost in India?"
    a: "Far less than a consumer plan for this use. Aggregator-sold Airtel M2M SIMs bundled with maker boards have been documented renewing at about Rs 50 a month for roughly 120 MB of data plus SMS, against Rs 300 or more for a consumer plan. For a sensor sending a few hundred bytes every few minutes, the data allowance is generous."
  - q: "Can I just put a normal prepaid SIM in my project?"
    a: "It usually works technically and is worth understanding before you rely on it. Consumer plans are priced and written for phones, the data is far more than you need at a much higher price, and you take on whatever the operator's terms say about use in devices. For one prototype it is expedient; for anything deployed it is the wrong product."
  - q: "What about LTE Cat-1 instead?"
    a: "It's the sensible middle ground and the safest forward-looking choice. Modules in the SIM7600 or A7670 family attach to ordinary 4G networks that demonstrably exist everywhere in India, draw more power than NB-IoT but far less than full LTE, and don't depend on a specialised network being open to retail SIMs."
related:
  - href: "/guides/esp32-gps-tracker"
    label: "ESP32 GPS tracker"
    desc: "The most common reason to want cellular."
  - href: "/guides/esp32-offline-buffering"
    label: "Buffering when the network drops"
    desc: "Essential on a metered, patchy link."
  - href: "/guides/esp32-remote-access-no-port-forwarding"
    label: "Remote access without port forwarding"
    desc: "The Wi-Fi alternative, where Wi-Fi exists."
  - href: "/guides/esp32-deep-sleep-battery"
    label: "Deep sleep and battery life"
    desc: "Cellular radios dominate a power budget."
---

Most cellular IoT advice online is written for European or North American networks, where NB-IoT and
LTE-M are widely deployed and a retail SIM will attach to them. Following it in India produces a
module that searches for a network it can't join, which looks exactly like a hardware fault and
wastes a great deal of time.

Two separate questions decide this: what network technology you can actually use, and how you get a
SIM at all.

## The SIM problem comes first

**Jio has no maker-facing IoT offering.** No development board, no public SDK, no documentation, no
free tier, no self-serve signup. Its IoT business is consumer gadgets on one side and
contact-sales enterprise connectivity on the other.

**Airtel is different, and still closed to you.** It publishes genuine API documentation for IoT
SIM management — OAuth2 with an API key, endpoints for activating and querying SIMs — but two things
make it unusable for a maker. It's a *SIM management* API, not a telemetry service, so it doesn't
solve the problem you have. And onboarding runs through a form that requires a company name and a
company email address, which a person with a personal address can't complete.

Worth correcting a common assumption while we are here: Airtel, not Jio, dominates Indian machine
connectivity. TRAI's July 2026 figures put roughly six in ten cellular M2M connections with Airtel
against about two in ten for Jio, out of roughly 137 million nationally.

**The route that works is an aggregator.** Resellers buy M2M connectivity in bulk and sell single
SIMs to individuals with ordinary Aadhaar and PAN KYC. Documented Indian examples bundle an Airtel
M2M SIM with a maker board and renew at
[about Rs 50 a month for roughly 120 MB plus SMS](https://circuitdigest.com/articles/airtel-m2m-simcard),
with KYC verification taking a day or two. Against Rs 300 or more for a consumer plan that gives
you gigabytes you'll never use, that's the correct product for a sensor.

## Which radio technology

| Technology | Status in India | Verdict for a maker |
|---|---|---|
| NB-IoT | Deployed, but into contract-bound smart-metering rollouts | Avoid unless your SIM provider explicitly confirms attach |
| LTE-M | Could not be verified as generally available | Don't design around it |
| LTE Cat-1 | Ordinary 4G, available everywhere | **Safest choice** |
| 2G | Still running, no announced sunset | Workable now, finite life |

**The NB-IoT row is the important one.** India does have NB-IoT, but the verified deployments are
operator-and-vendor contracts for smart meters — an Airtel and Secure Meters rollout covering over a
million meters, for instance. That isn't the same thing as a network a retail M2M SIM will attach
to, and nothing found suggests it is open in that way.

So the modules Western tutorials recommend first — the SIM7080G, the Quectel BC660K — are the ones
most likely to leave you debugging a module that's working perfectly and simply can't find a home
network.

## Module choice

**LTE Cat-1 (SIM7600, A7670 family)** is the default recommendation. It attaches to ordinary 4G,
which unambiguously exists nationwide, and Cat-1 is specifically the low-complexity tier intended
for machines rather than phones. It costs more power than NB-IoT would and more than 2G, and it
works.

**2G (SIM800L, SIM868)** remains pragmatic for low-rate telemetry, and the SIM868 adds GNSS in the
same package, which is why it turns up in so many Indian tracker projects. The caveat must be
stated plainly: you're building on a technology whose retirement is a commercial decision that
could be announced at any time. For a student project or a two-year deployment that's an
acceptable risk. For a product it isn't.

Whatever you choose, **the power budget is the design constraint**. A cellular module's transmit burst
dwarfs anything an ESP32 does on Wi-Fi, and the peak current will brown out a supply sized for the
microcontroller alone. Undersized supplies are the most common cause of cellular modules that
"randomly reset" — and LilyGO-style boards have been reported permanently damaged by exactly this.
Give the modem bulk capacitance and a supply rated for its peak, not its average.

On a WiFi-reachable site the [nodrix library](https://github.com/decoded-cipher/nodrix-sdk) would
handle all of this for you; on cellular you are writing the transport yourself until modem support
lands. The design advice below applies either way.

## Design for the link you have

A metered, intermittent cellular link changes the software as much as the hardware.

**Batch aggressively.** Each connection costs a registration, a TLS handshake and a teardown.
Sending twelve readings once an hour uses dramatically less energy and data than one reading twelve
times, and the readings are equally useful.

**Buffer locally, always.** Coverage at a remote site isn't the coverage at your desk. A device
that discards readings whenever the modem can't register produces a dataset with holes exactly
where the interesting events are — see
[buffering telemetry when the network drops](/guides/esp32-offline-buffering).

**Watch your own data use.** A 120 MB monthly allowance is enormous for telemetry and trivially
exhausted by a retry loop that reconnects every few seconds for a week. Report bytes sent as a
metric so a runaway shows up as a line rather than a bill.

**Prefer HTTP to a persistent broker.** Holding an MQTT session open over cellular keeps the radio
in a higher power state and, on some metered plans, keeps a session billable while the device is
idle. A short POST that opens, sends and closes fits the medium better.

## A note on library support

The [Nodrix Arduino library](https://github.com/decoded-cipher/nodrix-sdk) currently targets ESP32
and ESP8266 boards reaching the network over their own WiFi radio. Cellular modems aren't
supported yet — that's on the roadmap — so a SIM7600 or SIM868 build today means driving the modem
with AT commands and posting over HTTP yourself.

The practical consequence is a split design that's worth adopting anyway on a metered link: buffer
locally, batch several readings per connection, and send as one request rather than holding a
session open. That's the same shape described in
[buffering telemetry when the network drops](/guides/esp32-offline-buffering), and it suits
cellular better than a persistent socket would.

## Where the readings go

A cellular device is, by definition, somewhere you're not. That makes the destination for its data
more consequential than usual: you can't plug in a serial cable to find out what happened, so the
telemetry is the only account of the deployment you'll ever have.

Sending signal strength and modem registration status alongside the actual readings turns a silent
week into a readable one — a node that stopped reporting because it lost coverage looks completely
different from one whose sensor failed, and you can only tell them apart if the device said so
while it still could.

Get the SIM sorted before you buy the module. The network you can actually attach to decides which
modem is worth owning, so it's worth settling that first even though the hardware is the more
interesting half.
