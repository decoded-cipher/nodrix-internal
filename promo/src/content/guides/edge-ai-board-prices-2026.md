---
title: "SBC prices in 2026: Raspberry Pi, Jetson and Arduino compared"
description: "DRAM costs repriced the whole single-board market in 2026. Current prices for Raspberry Pi, Jetson and Arduino's Linux boards, at matching memory tiers, with the dates each figure was checked."
category: comparison
difficulty: intermediate
datePublished: 2026-09-21
faqs:
  - q: "Why did Raspberry Pi and Jetson prices both rise in 2026?"
    a: "The same cause: LPDDR4 memory. Raspberry Pi named it directly, citing competition for memory fab capacity from the AI infrastructure roll-out, and said the cost of some parts had more than doubled in a quarter. NVIDIA gave no reason, but had already phased out Jetson modules over memory costs. AI datacentre demand is consuming the supply that hobbyist boards were built on."
  - q: "How much is a Raspberry Pi 5 now?"
    a: "It depends entirely on the memory tier, which is the whole point. The 1GB Pi 5 has held at $45 through every round of increases, while the 16GB version went from $120 at launch through roughly $145 and $205 to around $305. Memory is the cost, so the cheapest way to stay near the old prices is to buy less of it."
  - q: "Which board kept a cheap entry point?"
    a: "Raspberry Pi did. Every 1GB variant was held through the increases, the Pi 4 stayed at $35 and the Pi 400 at $60, and a 1GB Pi 5 was introduced at $45. On the Jetson side the entry-level module moved from $99 to $199, so the cheapest route in roughly doubled. If budget is the constraint, that difference matters more than any spec on the page."
  - q: "Can Arduino's VENTUNO Q replace a Raspberry Pi?"
    a: "Not for most people, though the spec sheet argues otherwise. It carries a 40 TOPS NPU against the 13 or 26 TOPS of a Pi with an AI HAT+, so on paper it has more inference capability. What it doesn't have is the ecosystem — the community, the documentation depth, the accessory range, the OS support and the decade of answered questions — and for a maker that usually decides a project faster than TOPS do."
  - q: "What is the cheapest usable Linux SBC in 2026?"
    a: "The 1GB Raspberry Pi 5 at $45, or the Arduino UNO Q at $44 for 2GB. Those are genuinely comparable — similar money, both Linux, both with a real microcontroller story. The Pi has vastly more community behind it; the UNO Q has shield compatibility and a tighter MCU pairing. For a first Linux board, the Pi is the safer choice."
  - q: "Are these prices going to come back down?"
    a: "Raspberry Pi has said it considers the situation temporary and intends to unwind the increases once memory supply improves, which is a commitment no other vendor here has made. NVIDIA has said nothing. Treat every figure on this page as a snapshot and check current pricing before ordering."
related:
  - href: "/guides/raspberry-pi-zero-2-w-iot"
    label: "Raspberry Pi for IoT"
    desc: "Where a Pi earns its place."
  - href: "/guides/arduino-uno-q-ventuno-q"
    label: "Arduino's Linux boards"
    desc: "The UNO Q and VENTUNO Q in detail."
  - href: "/guides/edge-ai-results-to-dashboard"
    label: "Forwarding inference results"
    desc: "The pattern, whichever board wins."
  - href: "/guides/raspberry-pi-pico-w-iot-dashboard"
    label: "Raspberry Pi Pico W"
    desc: "Raspberry Pi's smaller board."
---

**DRAM repriced the entire single-board computer market in 2026**, and it hit every vendor at once.
What separates them is not the increases — those were unavoidable — but how each handled them.

This compares like with like: Linux single-board computers against other Linux single-board
computers, at comparable memory tiers, with like-for-like pricing.

## Raspberry Pi

Raspberry Pi raised prices three times in five months, documenting each round on
[its own blog](https://www.raspberrypi.com/news/1gb-raspberry-pi-5-now-available-at-45-and-memory-driven-price-rises/)
and naming the cause: **"unprecedented rise in the cost of LPDDR4 memory, thanks to
competition for memory fab capacity from the AI infrastructure roll-out"**, with
[some parts having "more than doubled over the last quarter"](https://www.raspberrypi.com/news/more-memory-driven-price-rises/).

| Raspberry Pi 5 | Launch | After Feb 2026 |
|---|---|---|
| 1GB | — | **$45, held** |
| 2GB | $50 | $65 |
| 4GB | $60 | $85 |
| 8GB | $80 | $125 |
| 16GB | $120 | $205 |

A third round followed on 1 April 2026, which took the 16GB to roughly $305. The per-model figures
for that round aren't itemised here, so treat the column above as the February position and the
16GB as the clearest indicator of where the top of the range went. **Check current pricing before
ordering.**

The shape of that table is the story. **Memory is the cost, so the increases scale with memory** —
and the 1GB variants, the Pi 4 at $35 and the Pi 400 at $60 were all held deliberately. Raspberry
Pi also introduced a 1GB Pi 5 at $45 specifically to keep a cheap entry point alive, and stated the
situation is "ultimately a temporary one" that it intends to unwind when supply improves.

## Jetson

NVIDIA raised Jetson prices by
[33% to 101% across eighteen products](https://www.cnx-software.com/2026/07/22/nvidia-increases-the-price-of-jetson-modules-and-devkits-by-up-to-101/)
in July 2026. The revised figures were published in an FAQ on the developer site.

Developer kits, complete and usable:

| Kit | Was | Now |
|---|---|---|
| Orin Nano Super Developer Kit | $249 | **$399** |
| AGX Thor Developer Kit | $3,499 | $5,499 |

Modules, which still need a carrier board:

| Module | Was | Now |
|---|---|---|
| Jetson Nano | $99 | **$199** |
| Orin NX 16GB | $599 | $999 |
| AGX Orin 32GB | $899 | **$1,799** |

NVIDIA didn't publish a reason alongside the change. In practical terms, **the entry-level module
moved from $99 to $199**, so the cheapest route into the platform roughly doubled.

## The comparison people actually want

At current prices, three Linux boards land close enough to compare directly:

| | Pi 5 1GB | Arduino UNO Q | Pi 5 16GB + AI HAT+ | VENTUNO Q |
|---|---|---|---|---|
| Price | **$45** | $44 (2GB) | ~$375–415 | €298.99 |
| NPU | none | none | 13 or 26 TOPS | **40 TOPS** |
| Ecosystem | **enormous** | new | **enormous** | new |
| Availability | shipping | shipping | shipping | pre-order |

On raw inference the VENTUNO Q wins, and it's worth saying plainly rather than pretending
otherwise: 40 TOPS against 26 is not close. **But specification is the smaller half of the
decision.** A Raspberry Pi has a decade of answered questions, an OS that everything supports,
accessories that exist, and boards you can buy today. The VENTUNO Q was listed as pre-order and out
of stock, from a product line that is months old, at a company that changed hands in 2025.

For a maker, that gap decides more projects than TOPS do. **Arduino's new boards don't match
Raspberry Pi where it counts** — not on the spec sheet, but on everything around it.

The genuinely close call is at the bottom: a **$45 1GB Pi 5 against a $44 2GB UNO Q**. Same money,
same category, both Linux with a real microcontroller story. The UNO Q offers shield compatibility
and a tighter MCU pairing; the Pi offers the ecosystem. For a first Linux board, take the Pi.

## So which one

**Raspberry Pi, unless you have a specific reason not to.** It's the cheapest way in at $45, the
boards are in stock, and it's the only vendor here that has committed publicly to reversing the
increases when memory supply eases.

The stronger reasons are the ones that don't appear on a spec sheet. A Pi boots into ordinary
Debian with no vendor application in the path and no network required to start working, so a decade
of unrelated Linux tutorials applies directly. Its documentation, forums and accessories are
largely community-produced, which means they keep working regardless of any single company's
roadmap. And because nothing in the stack is specific to the vendor, moving a project off a Pi
later is a normal Linux migration rather than an extraction. **For most projects the decision ends
there.**

**Jetson, if you need CUDA or large models.** That ecosystem is real and nothing else substitutes
for it. Just budget for what it now costs rather than what it cost last year, and prefer a
developer kit over a module unless you're designing a carrier board.

**Arduino's boards, if the spec gap matters more than the ecosystem gap.** They're cheaper at
matching memory and the VENTUNO Q carries more NPU than a Pi with an accelerator. Weigh that
against a platform months old and, at the time of writing, out of stock.

Whichever wins, the output is the same handful of numbers — a count, a class, a confidence. Those
chart identically from any of them, which is why the storage decision is independent of the
hardware one, and why a nodrix deployment on your own Cloudflare account takes readings from all
three without caring which board you chose.

## Check the price before you order

Every figure here is dated 21 September 2026, and they've all moved at least once this year — one
of them without any announcement at all.

The practical habit under the price tables: **check the vendor's own pricing page on the day you
order**, and where you're planning a build months ahead, cost it at the memory tier rather than the
board, because memory is what's moving. Raspberry Pi has said it considers the situation temporary
and intends to unwind the increases once supply improves.
