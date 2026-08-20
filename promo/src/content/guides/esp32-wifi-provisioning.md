---
title: "ESP32 Wi-Fi provisioning: stop hardcoding credentials in your sketch"
description: "How to get Wi-Fi credentials onto an ESP32 without recompiling: a captive portal that also collects your server and token, credentials stored in NVS, a factory reset that actually works, and an honest look at what the provisioning window exposes."
category: concept
board: ESP32
difficulty: intermediate
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "What's actually wrong with putting the SSID in the sketch?"
    a: "Three things, and they get worse as a project succeeds. Moving a device to a different network means recompiling and reflashing it. Your home Wi-Fi password ends up in your source, which is awkward the moment you publish the sketch or push it to a repo. And you can't hand the device to anyone else — a build that only works on your network isn't a project someone can follow, it's a project they have to modify."
  - q: "Where do the credentials get stored?"
    a: "In NVS, the ESP32's non-volatile storage partition, which survives reboots and reflashing the application. That persistence is the point, and it's also the thing that surprises people: erasing and reuploading your sketch does not clear saved Wi-Fi credentials, so a device that keeps connecting to an old network is usually remembering rather than misbehaving."
  - q: "Is the setup portal secure?"
    a: "Adequately, with caveats worth knowing. The configuration access point is typically open, and the portal is plain HTTP, so during that window someone in range could connect. It's a short window on a network with one client, so the practical risk is low — but provision on your own premises rather than in a café, and put a password on the portal AP if the device will be set up somewhere public."
  - q: "How do I make a device forget its network?"
    a: "Give it a button. Read a GPIO at boot and, if it's held, call the library's reset and restart into the portal. This is the difference between a prototype and something usable: without it, the only way to move a device to a new network is a cable and a laptop, which is exactly the problem provisioning was supposed to solve."
  - q: "Can I provision the server and token this way too?"
    a: "Yes, and you should — Wi-Fi is only half of what a cloud-connected board needs to know. Captive portal libraries support custom fields, so the same form that collects the network can collect your instance host and project token. Then one firmware image works for every device you deploy, and each one is configured rather than compiled."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "What the board does once it has credentials."
  - href: "/guides/esp32-ota-updates"
    label: "ESP32 OTA updates"
    desc: "The other thing every deployed board needs."
  - href: "/guides/esp32-project-ideas"
    label: "ESP32 project ideas"
    desc: "Builds worth making configurable rather than hardcoded."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The instance a provisioned board points at."
---

Every guide on this site, including every one I've written, starts the same way:

`const char* WIFI_SSID = "your-ssid";`

That's the right call for a tutorial and the wrong call for anything you keep. It means moving a
board to a different network requires a laptop and a cable, it puts your Wi-Fi password in your
source code, and it makes the project impossible to hand to anyone else without them editing and
recompiling it.

Provisioning fixes all three. The board asks for credentials once, remembers them, and one firmware
image works everywhere — which is also the precondition for
[updating those boards over the air](/guides/esp32-ota-updates) instead of visiting them.

## What you'll build

An ESP32 that boots, tries its saved network, and — if it has none or can't reach it — starts its own
access point with a setup page. That page collects the Wi-Fi network **and** your instance host and
project token. Everything is saved, and a button press wipes it.

## The three approaches, honestly

**Captive portal.** The board becomes an access point; you connect a phone, a setup page appears, you
pick a network and type the password. It's the most common approach because it needs no app and no
special tooling, and it's what this guide uses.

**Native Espressif provisioning.** ESP-IDF ships a provisioning system over BLE or SoftAP with a
proof-of-possession secret and encrypted exchange, driven by Espressif's phone apps. It's genuinely
more secure and the right answer for a product. It's heavier to set up and ties your users to a
specific app, which is a poor trade for a handful of personal devices.

**Improv Wi-Fi.** A small open standard for provisioning over serial or BLE, which lets a web page
configure a board over Web Serial. Lovely when the device is plugged into a computer during setup;
not applicable once it's on a roof.

For a maker fleet, the captive portal wins on the thing that matters most: no app, no cable, works
from any phone.

## What you'll need

- An **ESP32** dev board.
- The **WiFiManager** and **Nodrix** Arduino libraries.
- A spare GPIO and a momentary button, for the factory reset.
- A **nodrix instance** with a project and a project token.

## The firmware

The flow is: check the reset button, hand Wi-Fi to the portal, then start Nodrix with whatever host
and token the portal collected.

The integration is cleaner than it looks. `Nodrix.begin(host, token)` — the overload without Wi-Fi
arguments, alongside [the usual four-argument form](/guides/esp32-https-cloud) — checks whether Wi-Fi
is already connected and returns immediately if it is. So once
WiFiManager has done its job, Nodrix simply uses the connection that already exists.

```cpp
#include <Nodrix.h>
#include <WiFiManager.h>
#include <Preferences.h>

const int RESET_PIN = 0;             // BOOT button on most DevKits

Preferences prefs;
WiFiManager wm;

char host[64]  = "nodrix.you.workers.dev";
char token[64] = "";
bool shouldSave = false;

void setup() {
  pinMode(RESET_PIN, INPUT_PULLUP);

  prefs.begin("nodrix", false);
  prefs.getString("host",  host,  sizeof(host));
  prefs.getString("token", token, sizeof(token));

  if (digitalRead(RESET_PIN) == LOW) {   // held at boot -> forget everything
    delay(3000);
    if (digitalRead(RESET_PIN) == LOW) {
      prefs.clear();
      wm.resetSettings();
      ESP.restart();
    }
  }

  WiFiManagerParameter pHost("host", "nodrix host", host, sizeof(host));
  WiFiManagerParameter pToken("token", "project token", token, sizeof(token));
  wm.addParameter(&pHost);
  wm.addParameter(&pToken);
  wm.setSaveConfigCallback([]() { shouldSave = true; });
  wm.setBreakAfterConfig(true);          // callback fires even if Wi-Fi failed
  wm.setConfigPortalTimeout(300);        // don't sit in the portal forever

  if (!wm.autoConnect("nodrix-setup")) {
    ESP.restart();                       // timed out; try the saved network again
  }

  if (shouldSave) {
    strncpy(host,  pHost.getValue(),  sizeof(host));
    strncpy(token, pToken.getValue(), sizeof(token));
    prefs.putString("host",  host);
    prefs.putString("token", token);
  }

  // Wi-Fi is already up, so this only sets up the socket.
  Nodrix.begin(host, token);
  // Let the library reconnect on its own if the link drops later.
  Nodrix.addAP(WiFi.SSID().c_str(), WiFi.psk().c_str());
}

void loop() {
  Nodrix.run();
  // ... your sketch
}
```

That last `addAP` line is easy to miss and worth understanding. Nodrix reconnects dropped links
through its own multi-AP handler, which only knows about networks you've given it. WiFiManager
connects the board without telling Nodrix anything, so handing back the SSID and passphrase after the
fact is what lets the library recover from a Wi-Fi drop hours later.

`setBreakAfterConfig(true)` is the other non-obvious line. Without it, the save callback never fires
if the Wi-Fi attempt fails — so a user who typos their password loses the host and token they just
typed as well.

## The factory reset is not optional

A device that cannot forget its network is a device you cannot move. That's the whole problem
provisioning was meant to solve, so a build without a reset path has only relocated the cable
dependency rather than removed it.

Holding the BOOT button for three seconds at power-up is a good pattern: no extra hardware on most
dev boards, hard to trigger accidentally, and it clears both the Wi-Fi credentials and your stored
host and token together. Clearing only one leaves a board that connects to a network and then talks
to the wrong instance, which is a confusing state to debug.

## What the setup window exposes

Two things worth being clear about, because most captive-portal tutorials skip them.

**The portal AP is open by default, and the page is plain HTTP.** For the minute or two the board is
in setup mode, anyone in range can connect to it. In practice the exposure is small — it's a brief
window, and you're the only client — but provision at home rather than in a public space, and set a
password on the portal if devices will be configured somewhere less controlled.

**NVS is not encrypted by default.** Credentials saved to the ESP32's storage are readable by anyone
who can attach a flash programmer to the board. That's an acceptable trade for a home sensor and not
for something that leaves your control; NVS encryption exists for the latter case.

## Notes

Reflashing your sketch does not clear saved credentials. NVS lives in its own partition and survives
application uploads, which is exactly what you want in the field and confusing on the bench — a board
that keeps joining an old network is remembering, not malfunctioning. Erase flash entirely, or use
the reset button.

Give the config portal a timeout. A board that fails to connect once and then sits in setup mode
forever will never retry the network that was only briefly down, which is the most common way a
provisioned device becomes unreachable.

Name the setup AP after the device rather than the project when you deploy several — worth deciding
early if you're building out [several boards at once](/guides/esp32-project-ideas). Three boards all
advertising `nodrix-setup` is a guessing game; `tank-sensor-setup` is not.
