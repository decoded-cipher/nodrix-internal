---
title: "ESP32 keeps restarting: reading the reset reason"
description: "Brownout, task watchdog, Guru Meditation and bootloop produce different serial output. Read the string, find the cause, and see reboots on remote boards."
category: concept
board: ESP32
difficulty: intermediate
datePublished: 2026-09-18
faqs:
  - q: "Why does my ESP32 keep restarting?"
    a: "The board prints the reason on the serial monitor at the moment it restarts, and the four common causes look completely different. Brownout means the supply sagged. A task watchdog trigger means something blocked for too long without yielding. A Guru Meditation Error means the code faulted, usually on a null or out-of-bounds access. A bootloop with an RTCWDT reset means it is failing before your code runs at all."
  - q: "What does 'Brownout detector was triggered' mean?"
    a: "The supply voltage dropped below the threshold, so the chip reset itself rather than behaving unpredictably. It is almost always power rather than code: a USB port or cable that cannot deliver the current a Wi-Fi transmit burst demands, a regulator sized for idle draw instead of peak, or missing bulk capacitance near the module. It typically appears the moment the radio transmits."
  - q: "What causes 'Task watchdog got triggered'?"
    a: "A task held a core for longer than the watchdog timeout without yielding. Common causes are a long blocking loop, a delay inside a task that should be using vTaskDelay, a slow flash or filesystem write, or a network call with no timeout. The message names the task that was blocked, which is usually enough to find it."
  - q: "How do I decode a Guru Meditation backtrace?"
    a: "The backtrace is a list of addresses that mean nothing on their own. Feed it to the ESP Exception Decoder with the exact ELF file from the build that produced the crash, and it maps to file and line numbers. LoadProhibited almost always means dereferencing a null or uninitialised pointer."
  - q: "How do I tell why a remote board rebooted without a serial cable?"
    a: "Report the reset reason and the uptime as variables when the board starts up. Then a restart is visible on the dashboard as a reason you can read and an uptime that drops to zero, rather than a gap you have to interpret. Without that, a crashing board and a flaky network look identical from the outside."
related:
  - href: "/guides/esp32-wifi-keeps-disconnecting"
    label: "ESP32 Wi-Fi keeps disconnecting"
    desc: "When it is the network rather than a crash."
  - href: "/guides/esp32-deep-sleep-battery"
    label: "ESP32 battery life"
    desc: "Power behaviour, and why brownouts appear on battery."
  - href: "/guides/esp32-notifications"
    label: "Alerts from a board"
    desc: "Getting told when a device restarts."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "Reporting diagnostics to a dashboard."
---

A board that restarts on its own is not one problem, it is four, and they are easy to tell apart
because each prints something different at the moment it happens. Open the serial monitor at 115200
and read the line printed immediately after the restart. Everything follows from that string.

## The four signatures

| Serial output | Cause | Where to look |
|---|---|---|
| `Brownout detector was triggered` | Supply voltage sagged | Power, cable, regulator, capacitors |
| `Task watchdog got triggered` | A task blocked too long | The named task's loop |
| `Guru Meditation Error … LoadProhibited` | Code faulted | Null or uninitialised pointer |
| `rst:0x10 (RTCWDT_RTC_RESET)` repeating | Fails before your code runs | Flash, partition table, bad image |

### Brownout

This is power, not code, almost every time. The chip detected the supply falling below threshold and
reset deliberately rather than behaving unpredictably.

It shows up the moment the radio transmits, because a Wi-Fi burst can draw several hundred
milliamps in spikes against an idle draw of a few tens. Anything sized for the average will sag.

The usual culprits, in the order worth checking:

- A thin or long USB cable. Many are charge-oriented and drop meaningful voltage under load.
- A laptop port or hub that cannot supply the peak.
- Powering from a sensor board's 3.3 V regulator rather than a supply sized for the module.
- No bulk capacitance near the module. A few hundred microfarads across the supply pins absorbs the
  spikes that the regulator cannot respond to quickly enough.

If it only browns out on battery, the battery's internal resistance is the constraint, not capacity.

### Task watchdog

A task held a core longer than the timeout without yielding. The message names the task, which is
usually enough.

Typical causes are a long blocking loop with no yield, `delay()` used inside a task where
`vTaskDelay()` belongs, a slow flash or filesystem write, or a network call without a timeout. The
fix is to yield, or to move the work off the loop, rather than to raise the timeout — raising it
hides the symptom and the underlying stall remains.

### Guru Meditation

The code faulted. `LoadProhibited` is the most common and means a null or uninitialised pointer was
dereferenced.

The backtrace is a list of addresses that mean nothing by themselves. Decode it with the ESP
Exception Decoder against the **exact ELF from the build that crashed** — a rebuilt binary produces
different addresses and a plausible but wrong answer, which is worse than none.

### Bootloop before your code

If the reset repeats with `rst:0x10 (RTCWDT_RTC_RESET)` and you never see your own output, it is
failing before `setup()`. Usually a bad flash, a partition table that does not match the image, or
an image built for a different chip. Erase the flash entirely and reflash rather than flashing over
the top.

## Seeing it on a board you cannot reach

The serial monitor works when the board is on your desk. It is no use when the device is in a
greenhouse and restarting once a day.

The [ESP-IDF system API](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/misc_system_api.html)
exposes why the last reset happened, so a board can report its own cause on the way back up:

```cpp
#include <Nodrix.h>
#include <esp_system.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

const char* resetReason() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON:  return "poweron";
    case ESP_RST_SW:       return "software";
    case ESP_RST_PANIC:    return "panic";        // Guru Meditation
    case ESP_RST_INT_WDT:  return "int_wdt";
    case ESP_RST_TASK_WDT: return "task_wdt";
    case ESP_RST_BROWNOUT: return "brownout";
    case ESP_RST_DEEPSLEEP:return "deepsleep";
    default:               return "other";
  }
}

void setup() {
  Serial.begin(115200);

  Nodrix.setFirmwareVersion("1.0.0");
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);

  // Reported once per boot: why we restarted, and an event to mark the moment.
  Nodrix.send("reset_reason", resetReason());
  Nodrix.event("device_boot");
}

void loop() {
  Nodrix.run();

  static uint32_t last = 0;
  if (millis() - last > 60000) {
    last = millis();
    Nodrix.send("uptime_s", (long)(millis() / 1000));
    Nodrix.send("heap_free", (long)ESP.getFreeHeap());
  }
}
```

Three variables turn a mystery into a diagnosis:

- **`reset_reason`** distinguishes the four cases above without a cable. `brownout` points at power,
  `panic` at code, `task_wdt` at a blocking loop.
- **`uptime_s`** resets to zero on every restart. A sawtooth on the chart is a board rebooting, and
  the period tells you how often — a detail that is invisible if you only look at sensor values.
- **`heap_free`** trending downward over hours is a memory leak, and the crash that eventually
  follows is a consequence rather than the problem. This is the one you cannot see any other way.

On the deployment, an automation on the `device_boot` event sends to Telegram, Discord, Slack or
email, so an unexpected restart arrives as a message rather than as a gap you notice next week. A
board that reboots nightly at 03:00 tells you something quite specific about your power situation,
but only if someone is counting.

## Order of attack

1. **Read the serial line.** It identifies which of the four you have and saves hours of guessing.
2. **Rule out power first.** It is the cheapest to test — a better cable and a proper supply — and
   it is the most common cause on a board that worked on the bench and fails in place.
3. **Decode before theorising.** A backtrace with the right ELF is precise; a guess about it is not.
4. **Watch `heap_free` if it takes hours to fail.** Slow failures are usually leaks, and no amount
   of staring at the crash point reveals that.
