---
title: "Bridge cheap BLE sensors to your own cloud with an ESP32"
description: "Turn five-dollar Bluetooth thermometers into a monitored sensor network: passive BLE scanning on an ESP32, parsing the open BTHome v2 broadcast format, and the stack choice that decides whether BLE and Wi-Fi fit on one chip at all."
category: project
board: ESP32
difficulty: intermediate
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "Do I have to pair with each sensor?"
    a: "No, and that's what makes this practical. Cheap BLE sensors broadcast their readings in advertisement packets — the same packets that announce a device exists — so a gateway just listens. No pairing, no bonding, no connection limit. One ESP32 can watch as many sensors as are in range, and adding another sensor requires no gateway change at all."
  - q: "Why does my sketch crash when I add BLE to a Wi-Fi project?"
    a: "You're almost certainly out of RAM. The default Bluedroid stack was built to handle Bluetooth Classic alongside BLE, and it carries that weight even when Classic is disabled. Switching to NimBLE frees roughly 100 KB of RAM and about half the flash — which on a chip that also has to hold Wi-Fi buffers and a TLS session is frequently the difference between a build that runs and one that doesn't."
  - q: "Which sensors work with this?"
    a: "Anything broadcasting BTHome v2, which is an open, documented format rather than a reverse-engineered one. The five-dollar Xiaomi LYWSD03MMC thermometers are the classic candidates — custom firmware flashes onto them from a web browser over Bluetooth and makes them broadcast BTHome. Purpose-built BTHome sensors and DIY beacons work identically."
  - q: "Should I use the ATC or PVVX advertisement format instead?"
    a: "Target BTHome v2 for anything new. Those older custom formats work today, but the firmware maintainers have stated that support for non-standard, unregistered advertising formats is being dropped in favour of BTHome v2 only. Writing a parser for a format that's being retired is work you'll do twice."
  - q: "Will scanning for BLE interfere with Wi-Fi?"
    a: "They share one 2.4 GHz radio, so the chip time-slices between them and each gets less than its full attention. In practice a gateway still catches plenty of advertisements, because sensors broadcast repeatedly and missing one costs you nothing. It does mean you should treat a missed reading as normal rather than as a fault to engineer around."
related:
  - href: "/guides/esp32-lora-gateway"
    label: "ESP32 LoRa gateway"
    desc: "The same bridging pattern, at kilometre range."
  - href: "/guides/esp32-freezer-alarm"
    label: "Fridge and freezer alarm"
    desc: "A wired alternative when you want one trusted probe."
  - href: "/guides/home-assistant-vs-nodrix"
    label: "Home Assistant vs nodrix"
    desc: "The other consumer of BTHome broadcasts."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "Where the gateway sends what it hears."
---

There is a category of hardware that's almost too cheap to ignore: small BLE sensors that cost about
as much as a coffee and run for a year on a coin cell. Temperature and humidity in every room for the
price of one decent sensor.

What they don't come with is anywhere to put the data. This build turns an ESP32 into a gateway that
listens for them and forwards their readings to your own dashboard — no pairing, no vendor app, and
no cloud but yours.

## Why this works: advertisements, not connections

The thing that makes a one-to-many gateway possible is that you never connect to anything.

BLE devices broadcast **advertisement packets** to announce themselves, and sensors of this kind put
their actual readings inside those packets. Temperature, humidity, and battery are in the broadcast
itself. Your gateway sits and listens.

That has consequences worth appreciating. There's no pairing, no bonding, and no connection limit —
so a single ESP32 can watch every sensor in range at once, and adding a tenth sensor needs no gateway
change whatsoever. It's also why the sensors last so long on a coin cell: broadcasting briefly costs
far less than maintaining a connection.

## The stack choice that decides whether this fits

Before any code: if you add BLE to a Wi-Fi project and it crashes on boot or fails to allocate, this
is why.

The ESP32's default Bluetooth stack is **Bluedroid**, designed to handle Bluetooth Classic and BLE
together. Even with Classic disabled, that machinery is still compiled in and still resident.
**NimBLE** was designed as BLE-only from the start and drops all of it.

The saving is not marginal. NimBLE uses roughly **50% less flash and around 100 KB less RAM** for the
same functionality. On a gateway that must simultaneously hold Wi-Fi buffers, a TLS session, and a
BLE scanner, 100 KB is frequently the entire margin between working and not.

Use NimBLE. There's no scenario in this build where Bluedroid is the better choice.

## BTHome: the format worth targeting

Historically, reading these sensors meant reverse-engineering a manufacturer's packet layout, and the
maker community produced several custom formats — ATC and PVVX among them — for the Xiaomi
thermometers.

**BTHome v2** replaced that mess with an open, documented, properly registered format, and it's what
you should target now. This isn't just preference: the custom-firmware maintainers have said support
for non-standard, unregistered advertising formats is being dropped in favour of BTHome v2 only.
Writing a parser for the older formats is work you'd do again shortly.

The layout is refreshingly simple. Data arrives as **service data under UUID 0xFCD2**. The first byte
is a device-information byte — **0x40** meaning BTHome v2, unencrypted, regular updates. After that
it's a stream of measurements, each an object ID followed by its value, little-endian:

| Object ID | Property | Type | Factor |
|---|---|---|---|
| `0x00` | packet id | uint8 | 1 |
| `0x01` | battery | uint8 | 1 (%) |
| `0x02` | temperature | sint16 | 0.01 |
| `0x03` | humidity | uint16 | 0.01 |
| `0x0C` | voltage | uint16 | 0.001 |

## What you'll need

- An **ESP32** dev board on mains power, positioned centrally.
- One or more **BTHome v2 sensors** — Xiaomi LYWSD03MMC thermometers reflashed with custom firmware
  are the cheapest route, and the flashing is done from a web browser over Bluetooth.
- The **NimBLE-Arduino** (2.x) and **Nodrix** libraries.
- A **nodrix instance** with a project and a project token.

## The firmware

A passive scan, a BTHome parser, and a forward. Passive rather than active scanning is deliberate:
active scanning sends scan requests back to devices, which wastes power on both ends and gains
nothing when the data is already in the broadcast.

```cpp
#include <Nodrix.h>
#include <NimBLEDevice.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

static const NimBLEUUID BTHOME_UUID((uint16_t)0xFCD2);

String shortName(const NimBLEAddress& addr) {
  String s = addr.toString().c_str();
  s.replace(":", "");
  return "s" + s.substring(8);          // last 2 bytes -> stable per-sensor prefix
}

void parseBTHome(const uint8_t* d, size_t len, const String& id) {
  if (len < 1 || d[0] != 0x40) return;  // v2, unencrypted

  size_t i = 1;
  while (i < len) {
    uint8_t obj = d[i++];
    switch (obj) {
      case 0x00: i += 1; break;                                     // packet id
      case 0x01: Nodrix.send(id + "_battery", (int)d[i]); i += 1; break;
      case 0x02: {
        int16_t raw = (int16_t)(d[i] | (d[i + 1] << 8));
        Nodrix.send(id + "_temperature", raw * 0.01f); i += 2; break;
      }
      case 0x03: {
        uint16_t raw = (uint16_t)(d[i] | (d[i + 1] << 8));
        Nodrix.send(id + "_humidity", raw * 0.01f); i += 2; break;
      }
      case 0x0C: {
        uint16_t raw = (uint16_t)(d[i] | (d[i + 1] << 8));
        Nodrix.send(id + "_voltage", raw * 0.001f); i += 2; break;
      }
      default: return;                  // unknown id: length unknown, stop safely
    }
  }
}

class ScanCB : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice* dev) override {
    if (!dev->haveServiceData()) return;
    std::string sd = dev->getServiceData(BTHOME_UUID);
    if (sd.empty()) return;
    parseBTHome((const uint8_t*)sd.data(), sd.size(), shortName(dev->getAddress()));
  }
} scanCB;

void setup() {
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);

  NimBLEDevice::init("");
  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setScanCallbacks(&scanCB);
  scan->setActiveScan(false);           // passive: listen only
  scan->setInterval(100);
  scan->setWindow(99);
  scan->start(0, false);                // scan forever
}

void loop() {
  Nodrix.run();
  delay(10);
}
```

The `default: return` in the parser matters more than it looks. BTHome object IDs have varying data
lengths, so meeting an ID you don't handle means you no longer know where the next one starts —
continuing would misread the rest of the packet as plausible-looking nonsense. Stopping is the only
safe response.

Deriving the variable prefix from the last bytes of the MAC address gives each sensor stable,
automatic naming. Put a thermometer in a new room and `s4f2a_temperature` appears on its own; nothing
in the gateway needs editing.

## Build the dashboard

Every sensor creates its own variables on first broadcast, so a **chart** widget per room is the
natural layout, and several temperature series on one chart is where this gets genuinely useful —
comparing rooms shows you things a single sensor never will.

The battery variables deserve one **chart** between them. Coin cells fade slowly and predictably, and
a year of declining voltage tells you which sensor to attend to before it goes silent, rather than
after.

## Going further

Add a **variable** trigger on any room's temperature to catch a heating failure, or on a battery
level below 15% so replacements are planned rather than discovered — the
[notifications guide](/guides/esp32-notifications) covers routing those to Telegram, Discord, Slack,
or SMS.

The same gateway can carry a wired sensor of its own. It's an ordinary ESP32 with an idle I2C bus, so
a [BME280 on the gateway](/guides/esp32-weather-station) gives you a trustworthy reference reading
alongside the cheap broadcasters — useful for spotting one that has drifted.

If you also run [Home Assistant](/guides/home-assistant-vs-nodrix), note that it speaks BTHome
natively. Both can listen to the same
sensors simultaneously without conflict, because broadcasts are one-to-many by nature — local control
in one place, history and remote dashboards in the other.

## Notes

Wi-Fi and BLE share one 2.4 GHz radio, so the chip time-slices between them and your scanner misses
some advertisements. This is normal rather than a fault: sensors rebroadcast every few seconds, and a
missed packet costs nothing.

Passive scanning cannot see devices that only reveal data on connection. If a sensor shows up in a
scan but carries no service data, it's likely one that requires a connection — a different and much
less scalable job than this build.

BTHome supports encrypted broadcasts, which this parser doesn't handle. If you enable encryption on
your sensors, the gateway needs the bind key and a decryption step before parsing.
