---
title: "ESP32 OTA updates: ship firmware to deployed boards without touching them"
description: "How to update ESP32 firmware over the air properly: the partition trade nobody warns you about, an HTTPS pull from the instance the board already talks to, rollback that catches a bad build, and fleet versions you can actually see."
category: concept
board: ESP32
difficulty: intermediate
datePublished: 2026-08-20
dateUpdated: 2026-09-19
faqs:
  - q: "Why does enabling OTA halve my available program space?"
    a: "Because the board has to hold two complete copies of your firmware. An OTA update downloads the new build into an inactive slot while the current one keeps running, then flips a pointer and reboots into it. That's what makes the update safe — a failure mid-download leaves the working copy untouched — and it's why a 4MB ESP32 gives you roughly 1.3MB per slot instead of one big 3MB one."
  - q: "I picked Huge APP because my sketch got too big. Can I still do OTA?"
    a: "No, and this catches people constantly. The Huge APP partition scheme is 3MB of application with no OTA partitions at all, so the option isn't merely inconvenient, it's absent. If your sketch has outgrown the default scheme, Minimal SPIFFS gives you a much larger app slot while keeping OTA. Choosing Huge APP is a decision to flash by cable forever."
  - q: "What happens if the update downloads but the new firmware is broken?"
    a: "With rollback enabled, the board recovers on its own. A freshly-flashed image boots in a pending state and must call `esp_ota_mark_app_valid_cancel_rollback()` to confirm itself; if it crashes or reboots before doing so, the bootloader reverts to the previous slot. Put that call after your Wi-Fi connects rather than at the top of setup, so 'working' means it can actually reach the network."
  - q: "Is it safe to trigger updates from a dashboard?"
    a: "It is when the device decides what to trust. A board should never be handed a URL to install from. With nodrix it asks its own instance over the connection it is already authenticated on, and the answer is either an image or nothing — no address from the outside is ever involved. The danger was never someone flipping a toggle, it is a device that will install firmware from anywhere it is pointed."
  - q: "Can nodrix host my firmware binaries?"
    a: "Yes. Upload the compiled `.ino.bin` under Devices, assign it to a board, and nodrix serves the image to that board when it checks in. The upload is inspected first, so a merged whole-flash image — the one that would leave a board unbootable if installed over the air — is refused rather than shipped. You don't need a separate bucket or release host."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The TLS foundation a safe update pull depends on."
  - href: "/guides/esp32-receive-commands"
    label: "Receive commands on an ESP32"
    desc: "The other direction: telling a running board what to do."
  - href: "/guides/update-nodrix"
    label: "Updating your nodrix instance"
    desc: "The same problem, solved on the server side."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The dashboard that tracks your fleet's versions."
---

The first ESP32 you deploy is easy to update: unplug it, carry it to your desk, flash it. The fourth
one is in a roof space. The seventh is potted in resin on a tank. At some point "just reflash it"
stops being an answer, and the project either grows an update path or quietly freezes at whatever
firmware it happened to have.

This guide covers doing that properly: what OTA costs you in flash, how to pull an update over HTTPS,
how rollback saves you from a bad build, and how to see which board is running what.

## The trade nobody mentions first

OTA works by keeping **two complete copies of your firmware** on the board. The running copy stays
untouched while the new one downloads into a second slot; only when the download completes and
verifies does a pointer flip and the board reboot into the new image. That's precisely what makes it
safe — lose power halfway through and the working copy is still there.

The cost is arithmetic. A 4MB ESP32 that could hold one 3MB application holds two of about 1.3MB
instead.

This produces the single most common OTA mistake, and it happens by accident. A sketch grows, the
compiler complains it doesn't fit, and the obvious fix in the Arduino IDE is switching the partition
scheme to **Huge APP (3MB No OTA)**. It compiles, it works, and OTA is now impossible — that scheme
has no OTA partitions at all. If you're running out of room and want to keep updates, **Minimal
SPIFFS** is the scheme you want: a much larger app slot, OTA intact.

Decide this at the start of a project, not when the board is already on a roof.

## How the boot slot is chosen

Worth understanding, because it explains rollback. Alongside the two app slots is a small `otadata`
partition holding a counter that points at whichever slot should boot. Updating doesn't rewrite your
firmware in place — it writes a new image to the inactive slot and then updates that pointer.

That partition is deliberately two flash sectors, written and verified independently, so that losing
power while updating the pointer itself can't leave the board unbootable. If the two disagree on the
next boot, a counter decides which was written more recently.

## Rollback: the part that makes this survivable

An update that downloads perfectly and then crashes on boot is worse than no update at all, because
now the board is unreachable *and* broken. The bootloader can handle this, if you let it.

With rollback enabled, a newly flashed image boots in a **pending verification** state. It has to
declare itself healthy by calling `esp_ota_mark_app_valid_cancel_rollback()`. If it crashes, hangs,
or reboots before making that call, the bootloader gives up on it and boots the previous slot
instead.

Where you put that call is the entire design decision. Calling it at the top of `setup()` means
"working" only means "reached the first line of code" — which a build with a broken Wi-Fi config
passes easily, and then sits there bricked-but-happy forever. Confirmation should mean the firmware
can actually do its job.

The nodrix SDK makes that call when the board reaches your instance, not when it boots. A build that
comes up but cannot connect is never marked good, so the next reset takes the board back to the
version that could.

Note that rollback needs a partition table with two app slots and **no factory partition** — the
OTA-capable schemes are already laid out this way.

## The update flow

Nodrix hosts the image and tracks who took it. Compile with the toolchain you already use, then:

- **Upload** the compiled `.ino.bin` under **Devices → Firmware**, named with the version string the
  sketch reports. Arduino IDE writes it to `build/<board>/` under **Sketch → Export Compiled Binary**;
  PlatformIO leaves it at `.pio/build/<env>/firmware.bin`. Upload the app image, not
  `.ino.merged.bin`.
- **Assign** it to a board on **Devices**. That is the whole of starting an update — there is no job
  to schedule and nothing to poll.
- **The board pulls it.** One on the socket is told as soon as you assign; one on HTTP finds it at
  its next check. It downloads over the connection it is already authenticated on, writes the spare
  slot, and restarts.

The board reporting the new version is what marks the update landed, which is why the string in the
sketch has to match the string on the upload. If they differ, the board installs an update it can
never complete — so nodrix stops offering after a few attempts and says the device gave up, instead
of leaving it reinstalling forever. Assigning again clears that and retries.

## The firmware

> **Needs Nodrix 0.2.0 or newer**
>
> `setFirmwareVersion()` and the update check do not exist in earlier versions — a board built
> against one of those reports nothing and is never offered an update. Update the library under
> **Tools → Manage Libraries** in the Arduino IDE, or pin `decoded-cipher/Nodrix@^0.2.0` in
> PlatformIO.

Name the version the sketch is before `begin()`. The SDK reports that string, asks for an assigned
update when it connects and every six hours after that, downloads anything that differs from what it
is running, and restarts into it. `Nodrix.checkForUpdate()` forces a check when you don't want to
wait for the next one.

There is no update handler to write and no host to guard against: the board is never handed a URL,
only an answer to a question it asked.

```cpp
#include <Nodrix.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

// Upload the compiled .ino.bin under this exact string.
const char* FW_VERSION = "1.4.0";

// openssl s_client -showcerts -connect nodrix.you.workers.dev:443 </dev/null
const char* ROOT_CA = R"(-----BEGIN CERTIFICATE-----
...the last certificate in that chain...
-----END CERTIFICATE-----)";

void setup() {
  Serial.begin(115200);

  Nodrix.setFirmwareVersion(FW_VERSION);
  Nodrix.setCACert(ROOT_CA);           // firmware delivery is the wrong place to skip validation
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();
}
```

`Nodrix.run()` is what services the check, so the download happens between loop iterations rather
than inside a callback — nothing you are in the middle of handling gets interrupted by a reboot.

## Watching the rollout

**Devices** is the inventory: one row per board, showing the chip it reported, the version it is
running, the version assigned to it, and when it was last heard from. Boards appear the first time
they report — there is nothing to enrol.

A stalled rollout nearly always has one cause. The sketch reports `1.4.0` while the upload was named
`1.4`, so the board installs, reboots, reports a string that isn't the one assigned, and would go
round again forever. Nodrix stops offering after a few attempts and marks that device as having
given up, which points you at the version string instead of at the board.

## Notes

The SDK does not validate certificates until you pin one, and firmware delivery is exactly the wrong
place to leave that off — an unauthenticated transport plus an unvalidated binary is how a fleet gets
taken over. `setCACert()` on an ESP32, `setFingerprint()` on an ESP8266 in HTTP mode.

What that gets you is a validated connection to your own instance, a project token that authorises
the download, and the version the board reports afterwards as proof of what actually landed. Signed
images, where the board verifies a signature before it boots the new slot, are on the roadmap.

[Battery devices](/guides/esp32-deep-sleep-battery) never hold a socket, so nothing can nudge them;
the check runs on the first wake after you assign. Budget the download into that wake's power
envelope — it is the most expensive thing the node will do that cycle.

An OTA download needs enough free heap for the TLS session on top of everything your sketch is
already holding. If updates fail on a memory-tight build while plain telemetry works, that's the
cause — free what you can before starting one.

Test rollback deliberately before you rely on it. Flash a build that connects and then panics, and
confirm the board comes back on the previous version. Finding out that rollback was misconfigured
during a real bad deploy defeats the point of having it.
