---
title: "A Claude Skill for ESP32: teach Claude to write firmware for your hardware"
description: "Build a Claude Skill that makes Claude write correct ESP32 firmware for your own IoT backend — what a Skill is, how it differs from an MCP server, and a complete SKILL.md you can drop in today."
category: concept
board: ESP32
difficulty: intermediate
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "What's the difference between a Claude Skill and an MCP server?"
    a: "A Skill is knowledge; an MCP server is capability. A Skill is a folder of instructions Claude loads when a task looks relevant, so it changes what Claude *knows* — the right API calls, your conventions, the traps. An MCP server exposes tools Claude can *call*, so it changes what Claude can *do* — read a live sensor, flip a relay. For hardware work you want both: the Skill writes the firmware correctly, the MCP server checks whether it actually worked."
  - q: "Why not just paste the API docs into the chat?"
    a: "Because you'd do it every session, and you'd forget. A Skill loads automatically when the work matches its description, applies to every conversation without being asked, and lives in version control alongside your project. Pasting context works once; a Skill is the same thing made durable."
  - q: "Where does the skill file go?"
    a: "A folder containing `SKILL.md` — under `~/.claude/skills/<name>/` for skills you want everywhere, or `.claude/skills/<name>/` inside a repository for ones that belong to that project. Committing it to the repo is usually right for hardware work, because the conventions it encodes are the project's, not yours personally."
  - q: "What makes a skill actually get used?"
    a: "The description field, which is the only part Claude sees when deciding whether to load it. Write it as a list of triggers rather than a summary — name the libraries, the boards, the file types, and the tasks. A description reading 'helps with IoT' will sit unused; one naming ESP32, Arduino, telemetry, and your library will fire when it should."
  - q: "Can Claude flash the board too?"
    a: "Through the skill alone, no — a Skill is instructions, not tools. But Claude Code can run shell commands, so a skill that documents your build and flash commands effectively gives it that ability. Pair it with an MCP server on your instance and the loop closes: write the sketch, flash it, then read the telemetry back to confirm the board is actually reporting."
related:
  - href: "/guides/control-esp32-with-claude-mcp"
    label: "Control your ESP32 with Claude"
    desc: "The MCP half — giving Claude live access to hardware."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The API this skill teaches."
  - href: "/products/arduino-library"
    label: "The nodrix device library"
    desc: "The surface the skill encodes."
  - href: "/guides/esp32-project-ideas"
    label: "ESP32 project ideas"
    desc: "Builds worth pointing an assistant at."
---

Ask Claude to write ESP32 firmware and you'll get something plausible: a sketch built on whichever
IoT library was most common in its training data, with your API half-remembered. It compiles. It's
wrong in small ways that take an evening to find.

The fix isn't a better prompt. It's giving Claude the actual reference material, permanently, in a
form it loads on its own. That's what a Skill is.

## What a Skill actually is

A Skill is a folder with a `SKILL.md` inside it. The file has YAML frontmatter with a **name** and a
**description**, and a markdown body of instructions.

The mechanism is simpler than it sounds. Claude reads the description of every available skill, and
when a task looks like a match, it loads that skill's body into context. You don't invoke it. You ask
for what you want, and the relevant knowledge arrives with the request.

Skills live in `~/.claude/skills/<name>/` for ones you want everywhere, or `.claude/skills/<name>/`
inside a repository for ones belonging to that project. Larger skills can add a `references/`
directory of supporting documents that get pulled in only when needed, so the main file stays short.

## Skill or MCP server?

Both put Claude and your hardware together, and they're not alternatives — they solve opposite
halves.

An **MCP server** gives Claude **tools it can call**. Nodrix ships one: Claude can read your live
variable state, set values, create dashboards and automations, and fire events against your running
instance. That's covered in [Control your ESP32 with Claude](/guides/control-esp32-with-claude-mcp).
It changes what Claude can *do*.

A **Skill** gives Claude **knowledge it applies**. No tools, no network calls — just the correct API
surface, your conventions, and the mistakes worth avoiding. It changes what Claude *knows*.

The combination is where this gets genuinely useful. The Skill means the sketch it writes uses the
right calls in the right order. The MCP server means it can then look at your dashboard and confirm
the readings arrived. Write, flash, verify — without you translating between the two halves.

## Writing the skill

The description field deserves more care than the body, because it's the only part Claude sees when
deciding whether to load the skill. Write it as triggers, not as a summary: name the boards, the
libraries, the file types, and the tasks. "Helps with IoT projects" will never fire; the version
below names ESP32, Arduino, telemetry, and the library.

The body should encode what Claude gets wrong unaided — exact signatures, the ordering constraints,
and the traps. Here's a complete skill for ESP32 work against a nodrix instance:

```markdown
---
name: nodrix-esp32
description: Write ESP32 or ESP8266 firmware that talks to a nodrix IoT instance. Use when
  writing or reviewing Arduino sketches (.ino/.cpp) that send telemetry, handle control writes,
  use the Nodrix library, or connect hardware to a nodrix dashboard. Covers Nodrix.send,
  NODRIX_WRITE handlers, deep-sleep HTTP mode, and the raw HTTPS protocol for unsupported boards.
---

# nodrix ESP32 firmware

## Library API (ESP32 / ESP8266)

- `Nodrix.begin(ssid, pass, host, token)` — WebSocket mode; call `Nodrix.run()` every `loop()`.
- `Nodrix.begin(host, token)` — same, but assumes Wi-Fi is already connected. Use this after
  WiFiManager or any other provisioning. Also call `Nodrix.addAP(ssid, psk)` afterwards, or the
  library cannot reconnect on its own when the link drops.
- `Nodrix.beginHTTP(ssid, pass, host, token)` — polling mode for deep-sleep devices; call
  `Nodrix.poll()` once per wake instead of `run()`.
- `Nodrix.send(key, value)` — overloads for bool, int, long, float, double, const char*, String.
- `Nodrix.flush()` — sends queued telemetry now. REQUIRED before deep sleep or a long blocking
  operation, or queued readings are lost.
- `Nodrix.event(name)` — fires an event automations can trigger on.
- `Nodrix.setCACert(pem)` for pinned TLS; `setInsecure()` is development only.

## Control writes (cloud to device)

Register handlers with the macro, at file scope — not inside setup():

    NODRIX_WRITE("relay") {
      digitalWrite(RELAY_PIN, value.asBool() ? HIGH : LOW);
      Nodrix.send("relay", value.asBool());   // echo real state so dashboards hydrate correctly
    }

`value` is a NodrixValue: `asBool()`, `asInt()`, `asLong()`, `asFloat()`, `asDouble()`,
`asString()`, `isNull()`. Always echo the actual hardware state back after applying a write.

## Raw protocol (boards the library does not support)

- `POST /v1/telemetry` body `{"metrics": {"key": value}}` -> 204. Values are number, string,
  boolean, or null. Variables are created on first sight; never register them in advance.
- `GET /v1/control` -> `{"control": [{"id","variable","value"}]}`
- `POST /v1/control/ack` body `{"ids": ["ctl_..."]}` -> `{"acked": n}`. Unacked writes are resent.
- `POST /v1/events` body `{"event": "name"}` -> 204
- Auth is `Authorization: Bearer <project token>` on all of the above.

## Rules

1. Never send a placeholder value on a failed sensor read. Skip the send — a gap is honest, a
   zero looks like a real reading and will fire alerts.
2. Put thresholds and alert logic in cloud automations, not in firmware. Reflashing a deployed
   board to change a number is the problem this architecture exists to avoid.
3. Use `millis()` interval checks, never `delay()`, in WebSocket mode — `Nodrix.run()` must be
   called continuously.
4. Enabling OTA requires a partition scheme with two app slots. "Huge APP" has none.
```

## Using it

Drop that in `.claude/skills/nodrix-esp32/SKILL.md`, and the next time you ask for a sketch that
reports a sensor reading, the skill loads without being mentioned. The difference is immediate:
correct signatures, `flush()` before sleep, handlers at file scope, and no invented API.

The rules section is where the real value accumulates. Every trap this site has documented — sending
zeros on sensor failure, baking thresholds into firmware, the
[OTA partition mistake](/guides/esp32-ota-updates) — becomes something Claude won't walk into. When you find a new one, add a line.

## Going further

Split large skills. If your project has a lot of hardware-specific detail, keep `SKILL.md` short and
put the depth in `references/` files it can pull in when relevant — the same pattern the official
skills use.

Make it project-specific. A skill committed to a repository can encode that project's pin
assignments, its variable naming, and its build commands, which is knowledge no general-purpose
assistant could have.

Pair it with the [MCP server](/guides/control-esp32-with-claude-mcp) for the full loop. With both
in place, "add a humidity sensor to the greenhouse board and check it's reporting" is a single
request rather than three sessions of copy-paste.

## Notes

Skills are markdown, so version them like code. A skill in the repository means everyone working on
the project — including future you — gets the same conventions applied automatically.

Keep the body focused on what Claude gets wrong unaided. Restating general Arduino knowledge wastes
context; the API surface, the ordering constraints, and your project's specific traps are what earn
their place.

A skill that never seems to load almost always has a description problem, not a body problem. Add
the concrete nouns — board names, library names, file extensions — that appear in the requests you
actually make.
