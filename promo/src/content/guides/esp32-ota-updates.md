---
title: "ESP32 OTA updates: ship firmware to deployed boards without touching them"
description: "How to update ESP32 firmware over the air properly: the partition trade nobody warns you about, an HTTPS pull triggered from your own dashboard, rollback that catches a bad build, and fleet versions you can actually see."
category: concept
board: ESP32
difficulty: intermediate
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "Why does enabling OTA halve my available program space?"
    a: "Because the board has to hold two complete copies of your firmware. An OTA update downloads the new build into an inactive slot while the current one keeps running, then flips a pointer and reboots into it. That's what makes the update safe — a failure mid-download leaves the working copy untouched — and it's why a 4MB ESP32 gives you roughly 1.3MB per slot instead of one big 3MB one."
  - q: "I picked Huge APP because my sketch got too big. Can I still do OTA?"
    a: "No, and this catches people constantly. The Huge APP partition scheme is 3MB of application with no OTA partitions at all, so the option isn't merely inconvenient, it's absent. If your sketch has outgrown the default scheme, Minimal SPIFFS gives you a much larger app slot while keeping OTA. Choosing Huge APP is a decision to flash by cable forever."
  - q: "What happens if the update downloads but the new firmware is broken?"
    a: "With rollback enabled, the board recovers on its own. A freshly-flashed image boots in a pending state and must call `esp_ota_mark_app_valid_cancel_rollback()` to confirm itself; if it crashes or reboots before doing so, the bootloader reverts to the previous slot. Put that call after your Wi-Fi connects rather than at the top of setup, so 'working' means it can actually reach the network."
  - q: "Is it safe to trigger updates from a dashboard?"
    a: "It is when the device decides what to trust. The dashboard write should be a signal, not a command — the board fetches over HTTPS from a host you control and refuses URLs that don't match it. The danger isn't someone flipping a toggle, it's a device that will install firmware from any address it's handed."
  - q: "Can nodrix host my firmware binaries?"
    a: "Not today — it stores telemetry, not build artefacts. What it does well is the orchestration around the update: devices report their running version as a variable so you can see your fleet's versions at a glance, and a control write tells a board to go and fetch. Host the binary anywhere static — R2, GitHub releases, any bucket — and let the dashboard drive the rollout."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The TLS foundation a safe update pull depends on."
  - href: "/guides/esp32-receive-commands"
    label: "Receive commands on an ESP32"
    desc: "The downlink that triggers the update."
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
passes easily, and then sits there bricked-but-happy forever. Call it **after the board has connected
and reported in**, so confirmation means the firmware can actually do its job.

Note that rollback needs a partition table with two app slots and **no factory partition** — the
OTA-capable schemes are already laid out this way.

## The update flow

Nodrix doesn't host firmware binaries; it isn't a build artefact store. What it does host is the
signal and the visibility, which is most of what a small fleet needs:

- The board reports `firmware_version` as [ordinary telemetry](/guides/esp32-https-cloud), so the
  dashboard shows what every device is running.
- You publish the new binary anywhere static — R2, a GitHub release, any bucket over HTTPS.
- A control write to a `firmware_url` variable tells a board to go and fetch it.

The rollout is then just a dashboard action, and because the version is a variable, you can watch the
fleet move across as devices pick it up.

## The firmware

The write handler receives the URL, checks it against a host you trust, and hands off to
`httpUpdate`. The confirmation call sits at the end of a successful startup, not the beginning.

```cpp
#include <Nodrix.h>
#include <WiFiClientSecure.h>
#include <HTTPUpdate.h>
#include <esp_ota_ops.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

const char* FW_VERSION  = "1.4.0";
const char* TRUSTED_FW  = "https://fw.example.com/";   // updates must start with this

NODRIX_WRITE("firmware_url") {
  String url = value.asString();
  if (!url.startsWith(TRUSTED_FW)) {
    Nodrix.send("ota_status", "rejected_host");
    return;
  }

  Nodrix.send("ota_status", "downloading");
  Nodrix.flush();                       // get it out before the radio is busy

  WiFiClientSecure client;
  client.setInsecure();                 // pin a CA in production
  httpUpdate.rebootOnUpdate(true);

  t_httpUpdate_return r = httpUpdate.update(client, url);
  if (r == HTTP_UPDATE_FAILED) {
    Nodrix.send("ota_status", httpUpdate.getLastErrorString());
  }
  // On success the board reboots inside update() and never reaches here.
}

void setup() {
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);

  unsigned long t0 = millis();
  while (!Nodrix.connected() && millis() - t0 < 30000) {
    Nodrix.run();
    delay(50);
  }

  if (Nodrix.connected()) {
    Nodrix.send("firmware_version", FW_VERSION);
    Nodrix.send("ota_status", "ok");
    Nodrix.flush();
    esp_ota_mark_app_valid_cancel_rollback();   // only now is this build "good"
  }
}

void loop() {
  Nodrix.run();
}
```

The `Nodrix.flush()` before the download matters. Once `httpUpdate` starts, the board is busy writing
flash and will reboot without warning, so anything you wanted to report needs to have actually left
first.

The host check is the security boundary. Without it, anyone who can write that variable can point
your board at any binary on the internet — the toggle isn't the risk, a device that installs firmware
from arbitrary addresses is.

## Watching the rollout

Put `firmware_version` on a dashboard widget and it becomes your fleet inventory. With several boards
in one project, use a distinct variable per device — `sensor_a_version`, `sensor_b_version` — and a
glance tells you which ones took the update and which are stuck.

`ota_status` is the other half. Because it reports `downloading`, `rejected_host`, or a specific
error string, a failed update tells you *why* rather than leaving you with a board that simply went
quiet.

Add a **variable** trigger on `ota_status` not equal to `ok` with a
[Telegram action](/guides/esp32-notifications), and a failed rollout tells you rather than waiting to
be discovered.

## Notes

`setInsecure()` keeps the example readable. Firmware delivery is exactly the wrong place to skip
certificate validation in production — an unauthenticated transport plus an unvalidated binary is
how a fleet gets taken over. Pin the CA, and sign your images if the devices matter.

[Battery devices](/guides/esp32-deep-sleep-battery) that spend their lives asleep need the update
check on wake, not on a persistent socket. Poll the control endpoint once per wake cycle, and expect rollouts to take as long as your
sleep interval.

An OTA download needs enough free heap for the TLS session on top of everything your sketch is
already holding. If updates fail on a memory-tight build while plain telemetry works, that's the
cause — free what you can before starting one.

Test rollback deliberately before you rely on it. Flash a build that connects and then panics, and
confirm the board comes back on the previous version. Finding out that rollback was misconfigured
during a real bad deploy defeats the point of having it.
