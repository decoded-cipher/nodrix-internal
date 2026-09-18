---
title: "ESP32 certificate verification failed: pinning and rotation"
description: "What the TLS handshake error actually means, why setInsecure is not a fix, and how to pin a certificate so a CA rotation does not take your whole fleet offline."
category: concept
board: ESP32
difficulty: intermediate
datePublished: 2026-09-18
faqs:
  - q: "What does 'X509 - Certificate verification failed' mean on an ESP32?"
    a: "The TLS handshake completed far enough to receive the server's certificate chain, and the board rejected it. The usual causes are no trusted root loaded, a pinned certificate that has since been replaced, or a clock that is wrong enough to put the certificate outside its validity window. The last one is common on a board that has just powered on and has not yet set its time."
  - q: "Is setInsecure a valid fix?"
    a: "No. It disables verification, so the handshake succeeds with any certificate at all, including one presented by whatever is between you and the server. The connection is still encrypted, which is why it looks like it works, but you have no idea who you are encrypting to. It is a debugging step, not a configuration."
  - q: "Should I pin the leaf certificate or the root CA?"
    a: "The root. A leaf certificate is replaced every few months, and pinning it means every renewal breaks every device until you reflash them. A root CA typically lasts years, so pinning it survives ordinary certificate renewal. Fingerprint pinning is the leaf-level version of this and carries the same maintenance cost."
  - q: "What happens when the root CA rotates?"
    a: "Every device pinned to the old root stops connecting, all at once, and because they connect over TLS they cannot be reached to be fixed. This is the failure mode worth designing against: root rotations are announced well in advance, so the recovery path is to push firmware carrying the new root before the old one stops being served."
  - q: "Why does TLS work on my laptop but fail on the ESP32?"
    a: "Your laptop carries a large trust store maintained by its operating system, and its clock is correct. An ESP32 has neither unless you provide them. That is the entire difference in most cases: no trusted roots loaded, or a clock sitting at January 1970 which places every certificate outside its validity window."
related:
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The happy path this one troubleshoots."
  - href: "/guides/esp32-ota-updates"
    label: "Over-the-air updates"
    desc: "The recovery path when a pin has to change."
  - href: "/guides/esp32-c3-vs-esp8266"
    label: "ESP8266 vs ESP32-C3"
    desc: "Why RAM headroom decides how you pin."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The server whose certificate the board trusts."
---

The board connects to Wi-Fi, the request goes out, and the handshake fails:

```
[E][ssl_client.cpp] start_ssl_client(): (-9984) X509 - Certificate verification failed
```

The first search result tells you to call `setInsecure()`. That makes the error disappear, which is
not the same as fixing it.

## What the error means

The handshake got far enough to receive the server's certificate chain, and the board decided not to
trust it. Three causes account for nearly all of it:

- **No trusted root loaded.** Your laptop carries a trust store maintained by its operating system.
  An ESP32 has nothing unless you give it something.
- **A pin that no longer matches.** You pinned a certificate or fingerprint and the server has since
  been issued a new one.
- **The clock is wrong.** Certificates are only valid between two dates. A board that has just
  powered on may think it is January 1970, which is outside every validity window ever issued.

The third catches people out because it is intermittent by nature: it fails on cold boot and works
after time is set.

## Why setInsecure is not the answer

`setInsecure()` turns verification off. The handshake then succeeds against any certificate at all,
including one presented by something sitting between you and your server.

The connection remains encrypted, which is exactly why it looks like it works. You simply no longer
know who is on the other end — and on a device that can act on the physical world, "encrypted to
someone unspecified" is a meaningfully worse position than it sounds.

It is a useful five-minute debugging step to confirm the problem is verification and not routing.
It is not a setting to ship.

## Pin the root, not the leaf

There are two levels you can pin at, and the choice decides how much maintenance you have signed up
for.

| | Fingerprint / leaf | Root CA |
|---|---|---|
| Survives certificate renewal | No | Yes |
| Survives CA rotation | No | No |
| Typical lifetime | Weeks to months | Years |
| RAM cost | Lower | Higher |
| Breaks when | The server renews | The CA rotates |

A leaf certificate is replaced routinely — often every couple of months with modern automated
issuance. Pinning it means every one of those renewals takes your fleet offline until you reflash.

Pinning the root survives renewals, because the new leaf still chains to the same root. It costs
more RAM, which is why fingerprint pinning exists at all: on an ESP8266 with roughly 40 KB of usable
heap, full chain validation is a genuine squeeze. On an ESP32 it is a non-event, and the maintenance
difference compounds across a fleet's lifetime.

## Setting it up

The nodrix library exposes all three options, and is explicit that **TLS is unvalidated until you
pin one of them**. Pick before `begin()`:

```cpp
#include <Nodrix.h>
#if defined(ESP8266)
  #include <ESP8266WiFi.h>
#else
  #include <WiFi.h>
#endif
#include <time.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

// ESP8266 only: SHA-1 fingerprint of the server's leaf certificate.
const char* HOST_FP = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD";

// Paste your deployment's root CA here, including both marker lines.
static const char ROOT_CA_PEM[] PROGMEM = R"(
-----BEGIN CERTIFICATE-----
MIIDrzCCApegAwIBAgIQCDvgVpBCRrGhdWrJWZHHSjANBgkqhkiG9w0BAQUFADBh
...paste the rest of your root certificate here...
-----END CERTIFICATE-----
)";

void setup() {
  Serial.begin(115200);

  // NTP needs the network, so Wi-Fi comes up first here rather than letting
  // Nodrix.begin() do it. That is what the two-argument begin() is for.
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(200);

  // Certificates are time-bounded, so the clock has to be right before the
  // first handshake. Without this, a cold boot fails verification every time.
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  while (time(nullptr) < 8 * 3600 * 2) delay(200);

#if defined(ESP8266)
  Nodrix.setFingerprint(HOST_FP);   // chain validation is heavy for 40 KB of heap
#else
  Nodrix.setCACert(ROOT_CA_PEM);    // ESP32: pin the root, survive renewals
#endif

  Nodrix.setFirmwareVersion("1.0.0");
  Nodrix.begin(HOST, TOKEN);        // Wi-Fi is already up
}

void loop() {
  Nodrix.run();

  static unsigned long last = 0;
  if (millis() - last >= 30000) {
    last = millis();
    Nodrix.send("uptime_s", (long)(millis() / 1000));
    Nodrix.send("rssi", WiFi.RSSI());
  }
}
```

The `configTime` block is the part most write-ups omit, and it is the cause of the "works sometimes"
version of this error. The wait loop blocks until the clock is plausibly correct rather than
assuming NTP has completed.

> **On ESP-IDF rather than Arduino**
>
> ESP-IDF ships an [x509 certificate bundle](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/protocols/esp_crt_bundle.html)
> you attach with `esp_crt_bundle_attach`, carrying the Mozilla NSS root store rather than a single
> PEM you embed yourself. If you are on IDF, prefer it — it removes the
> single-root fragility described below.

## The failure mode worth designing against

A root CA rotation takes down every pinned device simultaneously. Because those devices connect over
TLS, and TLS is what just broke, you cannot reach them to fix it.

This is the scenario that turns a certificate detail into a fleet incident, and it has a shape:

1. The CA announces a rotation, usually months ahead.
2. Your devices are pinned to the outgoing root.
3. On the cutover date, every one of them stops connecting.
4. Each needs physically reflashing, because the remote update path is also TLS.

The defence is to change the pin **before** the old root stops being served, while the devices can
still reach you. That means firmware updates are not a nice-to-have on a pinned fleet — they are the
recovery mechanism, and they have to work before you need them.

Practically:

- **Ship OTA from the first release**, even when the first firmware is otherwise finished. A board
  without an update path is a board you will eventually retrieve by hand.
- **Report the running version** as a variable, so you can see which devices have taken a new root
  and which have not. A rollout you cannot observe is a rollout you cannot trust.
- **Watch the heartbeat during a rotation.** Devices dropping off in a cluster is the signal that
  the new pin did not reach everything.

On nodrix, the running version is reported back and shown per device, so a pin change is visible as
it propagates rather than discovered afterwards. The [OTA guide](/guides/esp32-ota-updates) covers
the rollout mechanics.

## Quick triage

| Symptom | Likely cause |
|---|---|
| Fails always, on every board | No root loaded, or wrong root for the chain |
| Fails on cold boot, works later | Clock not set before the first handshake |
| Worked for months, now fails everywhere at once | Certificate renewed and you pinned the leaf |
| Works on one board, fails on another | Different firmware, different pin |
| Works with `setInsecure()` | Confirms verification is the issue — now fix it properly |
