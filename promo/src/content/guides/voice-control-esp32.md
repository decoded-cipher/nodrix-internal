---
title: "Voice control your own ESP32 hardware: three paths, honestly compared"
description: "How to actually add voice control to DIY hardware: fully offline recognition on an ESP32-S3, borrowing Siri or Google through Matter, or natural language through an AI agent — with the constraint that rules out custom wake words for individuals."
category: concept
board: ESP32-S3
difficulty: intermediate
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "Can I create my own custom wake word?"
    a: "Realistically, no — and this is the constraint nobody leads with. Espressif's requirements for training a custom wake word include recordings from more than 500 people, at least 100 of them children, captured in a room quieter than 40 dB. That's a data-collection project, not a weekend. You either use one of the pre-trained wake words that ship with the engine, or you pay for a commissioned model."
  - q: "But I can add my own commands?"
    a: "Yes, and this is the part that's genuinely easy. Wake words and commands use different engines: the wake word detector is the hard, always-listening one, while command recognition runs only after waking and supports up to 200 commands including your own. So 'Hi ESP, greenhouse fan on' is buildable today — the first half is fixed, the second half is entirely yours."
  - q: "Which ESP32 can do offline voice?"
    a: "Command recognition runs on the ESP32-S3 and the P4, and it needs PSRAM. That rules out the classic ESP32, the C3, and the C6 for this job. It's the same reasoning as any on-device model: the S3 has the vector instructions and the memory headroom, and the smaller variants don't."
  - q: "Do I need to build voice recognition at all?"
    a: "Often not, and skipping it is underrated. If your device is a Matter endpoint, Siri, Google Assistant, and Alexa already work through whichever ecosystem your household uses — no microphone on your board, no model, no wake word. You're borrowing voice infrastructure that already exists rather than rebuilding it badly."
  - q: "How does the AI agent path differ from Alexa?"
    a: "Fixed commands versus actual language. A voice assistant matches phrases to intents, so it handles what it was configured for and nothing else. An agent with access to your instance can act on requests it has never seen — comparing readings, creating an automation, reasoning about why a sensor looks wrong — because it's working with your data rather than matching a phrase."
related:
  - href: "/guides/control-esp32-with-claude-mcp"
    label: "Control your ESP32 with Claude"
    desc: "The MCP server behind the agent path."
  - href: "/guides/matter-thread-for-makers"
    label: "Matter and Thread for makers"
    desc: "How to borrow Siri, Google, and Alexa for free."
  - href: "/guides/esp32-s3-edge-ai"
    label: "ESP32-S3 edge AI"
    desc: "The same chip running vision models instead."
  - href: "/guides/esp32-smart-home-automation"
    label: "DIY smart home with an ESP32"
    desc: "The hardware voice control ends up switching."
---

"Just add voice control" is one of those requests that sounds like a feature and is actually three
different projects. Which one you want depends on whether you need it to work offline, whether you
mind Apple or Google being in the loop, and whether you want fixed commands or actual conversation.

Here are the three paths that genuinely work, what each costs, and the constraint that eliminates the
option most people ask for first.

## The constraint worth knowing before you start

Almost everyone begins by wanting a custom wake word. "Hey Greenhouse." It is the one part of this
you cannot practically build yourself.

Wake word detection is an always-on model listening to everything, which makes it unusually
demanding: it has to be tiny, run continuously on battery, almost never trigger falsely, and work
across every voice and accent. Espressif's own requirements for training one are a good measure of
the problem — **recordings from more than 500 people, including at least 100 children, captured in a
room quieter than 40 dB.**

That's a data-collection programme. For an individual maker it's out of reach, and the honest options
are to use one of the pre-trained wake words that ship with the engine, or to commission a model.

**Custom *commands*, though, are easy.** Wake words and commands are separate engines. Once the wake
word fires, command recognition takes over — and that supports up to **200 commands including your
own**. So "Hi ESP, greenhouse fan on" is a weekend project where "Hey Greenhouse, fan on" isn't. The
first half is fixed; everything after it is yours.

## Path one: fully offline, on the board

Espressif's speech stack runs recognition entirely on-device — no internet, no cloud, no audio
leaving the room.

**What it needs.** An **ESP32-S3** or **P4** with **PSRAM**. Command recognition doesn't run on the
classic ESP32, the C3, or the C6. Same reasoning as
[any on-device model](/guides/esp32-s3-edge-ai): the S3 has the vector instructions and the memory
headroom, the small variants don't.

**What it gives you.** A device that works with the internet down, answers instantly with no round
trip, and never sends audio anywhere. For a light switch or a fan, that's the correct architecture —
local control shouldn't depend on a datacentre.

**What it costs.** A fixed wake word, a fixed command grammar, and no ability to handle anything
outside the list. It recognises "fan on"; it has no idea what "it's stuffy in here" means.

Once a command is recognised, the rest is ordinary firmware — set a pin, and report the change as
telemetry so your dashboard reflects what the room just did.

## Path two: borrow Siri, Google, or Alexa

The most underrated option, because it involves building no voice infrastructure at all.

Make your device a **Matter endpoint**, and every voice assistant in the house works with it
immediately. Apple Home, Google Home, and Alexa all speak Matter, so "Hey Siri, turn on the
greenhouse fan" works without a microphone on your board, a model, or a wake word.

**What it costs** is scope. Matter defines a set of device types, and voice only reaches what fits
one — a switch, a light, a thermostat. A custom sensor reading in your own units has no Matter
representation and therefore no voice, and remote access runs through the ecosystem's infrastructure
rather than yours. The [Matter guide](/guides/matter-thread-for-makers) covers that boundary properly.

The pragmatic move is to do both: expose the switchable things through Matter so the household gets
voice for free, and report everything else to your own backend where it isn't constrained by a
standard's device model.

## Path three: talk to an agent

The third path replaces voice *commands* with actual language, and it needs no new hardware at all.

Nodrix ships an **MCP server**, so an AI client can read your live variable state, set values, create
automations, and fire events against your instance. Claude has voice input on phone and desktop. Put
those together and you are speaking to something that can act on your hardware — without you building
a recognition pipeline.

The difference from a voice assistant is not incremental. A voice assistant matches phrases to
intents it was configured for. An agent works with your actual data, so it handles requests nobody
enumerated in advance: *"is the greenhouse hotter than yesterday?"*, *"which sensor hasn't reported
today?"*, *"set up an alert if the tank drops below 20%"*. That last one creates an automation, which
no fixed-grammar system could do.

**What it costs.** It needs internet, it isn't instant the way a local wake word is, and the MCP
server is owner-gated and off by default for good reason — turning it on is covered in
[Control your ESP32 with Claude](/guides/control-esp32-with-claude-mcp).

## Choosing

The paths answer different questions, and plenty of setups use more than one.

- **Must work with the internet down, fixed set of actions** → offline on an S3.
- **Household should be able to say it, and it's a switch or a light** → Matter, and let the
  ecosystem do the work.
- **You want to ask questions and change behaviour, not just flip things** → an agent over MCP.

A greenhouse might reasonably use all three: local voice for the fan so it works during an outage,
Matter so anyone can ask Siri, and an agent for the *"why did humidity spike on Tuesday"* questions
that are the actual reason you instrumented it.

## Notes

Microphone placement matters more than the model. Recognition accuracy in a real room is dominated by
distance, reflections, and background noise, and a device on a shelf across the room will perform
worse than any tuning can fix.

Wake word engines typically support a handful of pre-trained options, and a wake word is normally
three to six syllables. Short ones trigger falsely far more often, which is why commercial assistants
all use multi-syllable names.

Voice is a control path, not a data path. Whichever route you take, the readings should still go to a
backend you own — voice tells the room what to do, and it's your dashboard that remembers what
happened.
