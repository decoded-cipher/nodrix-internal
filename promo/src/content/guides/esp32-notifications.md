---
title: "ESP32 notifications: Telegram, Discord, Slack, or SMS from one sketch"
description: "Send alerts from an ESP32 to Telegram, Discord, Slack, SMS, or WhatsApp — without baking bot tokens and webhooks into firmware. The board sends one line of telemetry; the alert logic, credentials, and channel live in the cloud, swappable without reflashing."
category: project
board: ESP32
difficulty: beginner
datePublished: 2026-07-10
dateUpdated: 2026-07-10
faqs:
  - q: "Can an ESP32 send a Discord or Slack message directly?"
    a: "Yes — both are one HTTPS POST to a webhook URL, and plenty of sketches do it. The cost is where the credentials end up: the webhook URL is a secret, and anything baked into firmware can be read back out of flash. It also welds the channel to the board — changing where alerts go, their wording, or their threshold means reflashing. Keeping the send in the cloud fixes all three."
  - q: "How do I get a Telegram bot token and chat ID?"
    a: "Message @BotFather on Telegram, send /newbot, and it hands you the bot token. Then message your new bot once (it can't message you first), and fetch https://api.telegram.org/bot<TOKEN>/getUpdates in a browser — your chat ID is in the reply. Those two values go into the nodrix Telegram integration, not into the sketch."
  - q: "Does the SMS route cost money?"
    a: "Yes — SMS is the one channel here with real per-message cost, via a Twilio account (a trial account works for testing but adds a prefix and only texts verified numbers). That's also why the cloud-side design matters: with thresholds and hysteresis keeping the alert count honest, an SMS bill for a freezer monitor is cents per month, not per day."
  - q: "Why did I get twenty alerts for one event?"
    a: "A reading that jitters around the threshold retriggers on every crossing — 29.9, 30.1, 29.8 is three alerts for zero information. Use two levels: alert when the value crosses the alarm line, and only rearm once it recovers past a second line. The dead band between them is hysteresis, it's the same trick a thermostat uses, and it's a condition edit in the automation, not firmware."
  - q: "Does this work while the ESP32 deep-sleeps?"
    a: "Yes, and better than on-device sending would. The board wakes, reports one reading over HTTP, and sleeps; the automation evaluates and does any messaging while the board is already unconscious. A battery sensor doesn't stay awake for a TLS handshake with Telegram — it doesn't even know the alert happened."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The Wi-Fi and TLS firmware this build stands on."
  - href: "/guides/esp32-deep-sleep-battery"
    label: "ESP32 battery life"
    desc: "The wake-report-sleep pattern the alert design pairs with."
  - href: "/guides/esp32-automatic-plant-watering"
    label: "ESP32 plant watering"
    desc: "A full build using the same alert pattern in anger."
  - href: "/docs#automations"
    label: "Automations"
    desc: "Triggers, conditions, and every alert action in full."
---

Search for "ESP32 Telegram notification" and every tutorial hands the board a bot token and an
HTTPS client and wishes it luck. It works — until you want the same alert on Discord, or the token
leaks with a firmware dump, or you're reflashing a deployed board because the wording changed.

This guide inverts it. The ESP32 sends **one line of telemetry** and holds **zero secrets**. The
threshold, the message, the credentials, and the channel — Telegram, Discord, Slack, SMS, WhatsApp,
email, or PagerDuty — live in an automation on **your own Cloudflare account**, where changing any
of them is an edit, not a reflash. One sketch, any channel, swappable forever.

The worked example is a freezer monitor — the project where notifications aren't a novelty but the
entire point.

## Why the board shouldn't send the alert

Sending from firmware means, for every channel: its TLS endpoint compiled in, its credential stored
in flash (readable by anyone with the board and five minutes), its message format hard-coded, and
its failure modes handled at 3 a.m. by a microcontroller. Multiply by every channel you add.

Sending from the cloud means the board's contract is just `temperature` every minute. Then:

- **Secrets stay out of flash.** The bot token and webhook URLs live in your nodrix instance, not
  in something you might one day post to GitHub.
- **The channel is a dropdown.** Telegram today, Discord for the household tomorrow, SMS for the
  cabin with no one watching chat — same firmware, forever.
- **The logic is editable.** Threshold, wording, hysteresis, recipients: dashboard edits, applied
  on the next reading.
- **Deep sleep stays deep.** A battery board reports and sleeps; the alerting happens after it's
  already unconscious.

## What you'll need

- An **ESP32** dev board and a temperature sensor — a DS18B20 on a long lead is the classic
  freezer choice.
- The **Arduino IDE** with the ESP32 board package, the **Nodrix** library, and the
  **DallasTemperature** library, from the Library Manager.
- A **nodrix instance** with a project and a project token.
- An account on whichever channel should wake you: Telegram, Discord, Slack, or Twilio for SMS and
  WhatsApp.

## The firmware

All of it. Note what's absent: no bot token, no webhook URL, no threshold, no message text.

```cpp
#include <Nodrix.h>
#include <OneWire.h>
#include <DallasTemperature.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

OneWire oneWire(4);
DallasTemperature sensors(&oneWire);

void setup() {
  sensors.begin();
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();

  static unsigned long lastReading = 0;
  if (millis() - lastReading >= 60000) {
    lastReading = millis();
    sensors.requestTemperatures();
    float t = sensors.getTempCByIndex(0);
    if (t > -100) Nodrix.send("temperature", t);   // -127 = sensor disconnected
  }
}
```

The library keeps the socket alive and reconnects on its own; for a battery build, swap
`Nodrix.begin` for `Nodrix.beginHTTP` and report once per wake — the alert side of this guide
doesn't change at all.

## Wire up a channel

Each channel is added once, under your project's integrations, and then reused by any automation.

**Telegram** — the best free option for personal alerts: instant, free, works everywhere. Message
`@BotFather`, create a bot, paste the **bot token** into the integration; message your bot once,
pull your **chat ID** from the `getUpdates` URL, done. Group alerts: add the bot to a group and use
the group's chat ID.

**Discord** — the right answer when a household or team already lives there. In your server:
channel settings → Integrations → Webhooks → copy the **webhook URL**. That URL is the entire
credential. The integration can send a plain message or a titled embed — embeds read better for
alerts with a value in them.

**Slack** — same shape as Discord for workplaces: create an Incoming Webhook in your Slack app
settings, paste the URL. If the freezer is in an office, the alert belongs in the channel people
actually have open.

**SMS and WhatsApp via Twilio** — for alerts that must land when nobody's watching a chat app.
Paste your **Account SID**, **auth token**, and sending number. SMS costs real (small) money per
message, which the hysteresis below keeps honest; a trial account works for testing but only texts
verified numbers.

Email and PagerDuty follow the same pattern — a webhook-shaped credential pasted once — and
everything below applies to them identically.

## Build the alert

One automation: trigger on a new `temperature` reading, condition **above -10**, action: send —
"Freezer at {{value}}°C — check the door." The `{{value}}` fills in from the reading that tripped
it. That's a working alert.

Now make it a good alert:

- **Add hysteresis.** A freezer cycling around the line would ping you on every crossing. Alarm
  above **-10**, and only rearm after the reading recovers below **-15** — the automation's
  set-a-flag pattern: on alarm, also set an `alerted` variable; condition the alert on `alerted`
  being off; clear it on recovery. Three conditions in the editor, zero firmware.
- **Alert on silence, too.** A dead sensor sends nothing — which no threshold ever catches. Add a
  schedule trigger (say, every morning) with an `if-variable` check that the last `temperature` is
  fresh; stale means power, Wi-Fi, or the board itself. A monitor that fails silently is worse
  than none.
- **Escalate by severity.** Above -10: Telegram. Above -5: Telegram and SMS. Two automations,
  same variable, different thresholds and channels — the melted-food tier earns the message that
  costs money.

## One sketch, any alert

Nothing in this pattern is about freezers. The same firmware shape — read, `Nodrix.send`, repeat —
with a different sensor and threshold is a leak detector under the washing machine, a mailbox
switch, a greenhouse heat alarm, or the [plant-watering monitor](/guides/esp32-automatic-plant-watering)
that messages you when the reservoir runs dry. The channel decision stays where it belongs: in a
dropdown, six months from now, when you've moved from Telegram to Discord and the board neither
knows nor cares.

## Notes

- **Credentials live in one place.** Rotating a leaked webhook is one edit in your instance —
  not a reflash of every deployed board.
- **The alert path is yours.** Board → your Cloudflare account → channel API. No third-party
  automation service in the middle, no monthly task quota.
- **Every alert has a paper trail.** The readings that tripped it are in your dashboard's chart
  and behind the read API — the alert tells you now, the chart tells you why.
