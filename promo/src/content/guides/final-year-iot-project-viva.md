---
title: "A final-year IoT project you can defend in a viva"
description: "Examiners don't ask whether your project is novel. They ask why you chose that sensor, that interval and that threshold. One complete build, and the evidence to answer them."
category: project
board: ESP32
difficulty: intermediate
datePublished: 2026-09-21
faqs:
  - q: "What makes a final-year IoT project good enough to pass a viva?"
    a: "Not novelty. Examiners ask why you made each choice and whether you can support it with evidence. A modest project where you can justify the sensor, the sampling interval, the accuracy and the failure behaviour scores better than an ambitious one that only worked once. The deciding factor is almost always whether you collected real data over real time."
  - q: "How early should I start a final-year project?"
    a: "Before the even semester if you can. Indian engineering programmes run the project phase roughly January to May, with submission deadlines in April or May, and the single thing you can't compress is elapsed time. A month of continuous logged data can't be produced in the week before submission, and it is the strongest evidence in the whole report."
  - q: "Do I need an original idea?"
    a: "No, and chasing one is usually a mistake. A well-executed version of a known problem, with real measurements, honest error analysis and a working deployment, demonstrates more engineering than an unproven original concept. If you want originality, put it in the analysis — comparing two sensors, or characterising drift — rather than in the premise."
  - q: "How do I get data out for my report?"
    a: "Decide this before you start collecting, not after. You need the readings in a form you can put in a spreadsheet and plot, which means an export path from wherever the data lands. Screenshots of a live dashboard are weak evidence in a written report; a CSV you can chart, tabulate and compute statistics from is what examiners expect."
  - q: "What do examiners usually ask about an IoT project?"
    a: "Why that sensor rather than alternatives, why that sampling interval, how accurate the readings are and how you know, what happens when the network or power fails, and what the data actually shows. Almost all of it is about justification and evidence rather than about the code, which is the opposite of how most students prepare."
  - q: "Should I use a cloud platform or build my own backend?"
    a: "Use something that exists rather than writing a backend from scratch, unless the backend is the project. Your marks come from the engineering you can explain, and a hand-rolled server usually adds failure modes without adding anything defensible. What matters is that you can explain where the data lives, who controls it, and how you get it out."
related:
  - href: "/guides/esp32-project-ideas"
    label: "ESP32 project ideas"
    desc: "Choosing a problem worth solving."
  - href: "/guides/esp32-air-quality-monitor"
    label: "Air quality monitor"
    desc: "A worked build in this shape."
  - href: "/guides/esp32-offline-buffering"
    label: "Buffering when the network drops"
    desc: "The failure handling examiners ask about."
  - href: "/guides/esp32-adc-accuracy"
    label: "Reading accuracy"
    desc: "Where your error analysis comes from."
---

Search for final-year IoT projects and you'll find lists of twenty-five ideas, often the same
twenty-five with a city name appended. They aren't useless, but they answer the wrong question.
**Choosing a topic is the easy part.** Defending it in a viva is what decides the mark, and almost
nothing written for this audience prepares you for that.

Examiners rarely ask whether your idea was original. They ask **why**, repeatedly, about decisions
you made without noticing you were making them.

## The questions you'll actually be asked

| Question | What it is testing | What a good answer contains |
|---|---|---|
| Why this sensor? | Whether you compared anything | Two alternatives, and the tradeoff you chose on |
| Why this sampling interval? | Whether the number is justified | The phenomenon's timescale, and power or data cost |
| How accurate is it? | Whether you validated | A comparison against a reference, with numbers |
| What happens if the Wi-Fi drops? | Whether you thought past the demo | A buffering or retry strategy you implemented |
| What does the data show? | Whether you collected any | A chart over weeks, with something explained |
| What would you do differently? | Engineering maturity | A specific, honest limitation |

Notice how little of that's about code. A project that compiles and demonstrates but can't answer
column three scores below a modest project that can.

## Pick one problem and finish it

**The most common failure mode is scope.** A project that monitors air quality *and* controls a fan
*and* has a mobile app *and* uses machine learning is four half-finished things, and an examiner
will find the seam in about ninety seconds.

A defensible project has this shape:

- **One measurement** taken properly, with a known accuracy.
- **One decision** made from it, with a justified threshold.
- **One month** of continuous data behind it.
- **One honest limitation** you identified yourself.

Air quality with a CO2 sensor and a ventilation alert. Water tank level with a pump cutoff. Energy
monitoring with a cost calculation. Cold-storage temperature with an out-of-range alarm. All are
unoriginal, and all are perfectly defensible if the four points above are solid.

## Start before you think you need to

Indian engineering programmes run the project phase in the even semester, roughly January to May,
with thesis submission deadlines in April or May — IIT Kharagpur set
[4 May 2026](https://www.iitkgp.ac.in/assets/pdf/AcademicCalendar2025-26.pdf) for its undergraduate
thesis, and most institutions cluster around that.

The thing you can't compress is elapsed time. Hardware can be assembled in a weekend and code
written in a week, but **a month of continuous logged data takes a month**, and it is the single
most persuasive element in the report. A student who can show six weeks of readings with a visible
weekly pattern, a sensor drift they detected, and a two-day gap they can explain has answered half
the viva before it starts.

Start logging with a half-finished build. Imperfect early data is far more valuable than no data,
and the failures you hit in week one are the error analysis in your report.

## Build the evidence as you go

Three things to set up before you start collecting, because retrofitting them is painful.

**A reference comparison.** Put a second sensor, or a calibrated instrument, alongside yours for at
least a few days. The difference between them is your accuracy claim. Without it, "accurate to
±2%" is a number copied from a datasheet, and examiners know that.

**Failure handling that you can point at.** Networks drop and power cuts happen, and in most Indian
deployments they happen often. A device that buffers readings and reports afterwards demonstrates
engineering judgement; one that silently loses them demonstrates that you didn't consider it. The
mechanics are in [buffering telemetry when the network drops](/guides/esp32-offline-buffering).

**An export path.** You'll need the data as a table to plot, tabulate and compute statistics from.
Decide early where the readings land and confirm you can get them out in a usable form. Dashboard
screenshots are weak evidence in a written report, and discovering at the end that your data is
locked inside a free tier that only shows the last week is a genuinely bad week to have.

That last point deserves emphasis, because it is where free IoT platforms catch students. Several
keep only days of history, so the month of data your report depends on has quietly been discarded
before you go to write it up. The specifics are in
[what free tier limits actually mean](/guides/iot-platform-free-tier-limits).

On the last point, a nodrix deployment on your own Cloudflare account is a defensible answer to
"where does the data live" — you control the retention, you can export it, and you can explain the
whole path in the viva. Deploying it is covered in
[deploy nodrix to Cloudflare](/guides/deploy-nodrix-cloudflare).

## Write the report around the data

The structure that survives questioning follows the evidence rather than the build:

1. **The problem**, stated concretely with a number attached.
2. **The design decisions**, each with the alternative you rejected and why.
3. **The implementation**, briefly — this is the part you'll be tempted to over-write.
4. **Validation**, with your reference comparison and the error you measured.
5. **Results**, being the actual data over time and what it shows.
6. **Limitations**, identified by you before the examiner identifies them.

**Section six is where marks are won**, counter-intuitively. "The sensor drifted about 4% over six
weeks, which I detected by comparing against a reference, and which I would address with periodic
recalibration" is a stronger answer than claiming everything worked. Examiners have seen enough
projects to know that nothing works perfectly, and a student who found their own problems is
demonstrably the one doing the engineering.

## The build, in one page

```cpp
#include <Nodrix.h>

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

#define THRESHOLD_PPM 1000      // justify this number in your report

float readCO2();                // your sensor driver

void setup() {
  Nodrix.setFirmwareVersion("1.0.0");
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();

  static unsigned long last = 0;
  if (millis() - last < 60000) return;       // one minute: justify this too
  last = millis();

  float ppm = readCO2();
  if (isnan(ppm)) {                          // a fault is not a zero
    Nodrix.event("sensor_fault");
    return;
  }

  Nodrix.send("co2_ppm", ppm);
  Nodrix.send("uptime_s", (long)(millis() / 1000));
  Nodrix.send("rssi", (int)WiFi.RSSI());     // evidence for the outage questions

  static bool alerted = false;               // edge-triggered, not every minute
  if (ppm > THRESHOLD_PPM && !alerted) {
    Nodrix.event("ventilation_needed");
    alerted = true;
  } else if (ppm < THRESHOLD_PPM - 100) {
    alerted = false;                         // hysteresis: explain this in the viva
  }
}
```

Three things in there are viva answers rather than code. The sampling interval and the threshold
are constants you'll be asked to justify. The hysteresis band exists so the alert doesn't
chatter around the threshold, which is exactly the kind of detail that separates a considered
project from a working one. And `rssi` alongside the reading is what lets you answer "what happened
during that gap" six weeks later.

## Where the data should live

Whatever you use, you need three properties: it keeps a month or more of history, you can export
it, and it will still be there on submission day.

Running your own deployment satisfies all three and is itself defensible in the viva — being able
to explain that the data is stored in infrastructure you control, with a retention policy you chose
and an export you can demonstrate, is a better answer than "it goes to a free website". nodrix
deploys to your own Cloudflare free tier, which keeps it at student cost, and the readings stay
exportable for the report.

That isn't the part that earns the mark. The month of honest data is. But it is the part that
quietly decides whether the month of data still exists when you need it.
