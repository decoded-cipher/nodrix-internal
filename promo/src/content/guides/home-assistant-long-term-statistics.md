---
title: "Home Assistant keeps only a week of my REST sensor"
description: "A missing state_class is why your sensor history vanishes. The free fix, what long-term statistics actually store, and why years of raw data need somewhere other than the recorder."
category: concept
difficulty: intermediate
datePublished: 2026-09-21
faqs:
  - q: "Why does my Home Assistant REST sensor lose its history?"
    a: "Because without a state_class, the recorder treats it as ordinary state data and purges it on the normal schedule, which defaults to ten days. Long-term statistics are only generated for entities that declare a state_class, and usually a unit_of_measurement alongside it. Add those and the entity starts being written to the statistics tables; the gap before you added them can't be recovered."
  - q: "What state_class should I use?"
    a: "Use measurement for a value that goes up and down, such as temperature, humidity or instantaneous power. Use total_increasing for a counter that only rises and resets to zero, such as an energy meter reading. Getting this wrong is worse than leaving it out, because a rising counter declared as measurement produces statistics that are meaningless for the energy dashboard."
  - q: "Do long-term statistics keep my actual readings?"
    a: "No, and this is the part that surprises people. Long-term statistics store hourly aggregates — roughly 24 entries per day per entity, each with min, max and mean — not the individual readings. So a sensor sampling every thirty seconds keeps five-minute and hourly summaries forever and the raw values only until the recorder purge. If you need the raw series, the recorder isn't where it can live."
  - q: "Why is my Home Assistant database so large?"
    a: "Recording many entities at a high rate grows it quickly, and databases well past twenty gigabytes are documented. Two things compound it: you can't selectively purge entities that have long-term statistics, and without a repack the file may not shrink after a purge at all. Excluding noisy entities from the recorder up front is far easier than reclaiming space later."
  - q: "How do I keep years of sensor data?"
    a: "Decide first whether you need hourly aggregates or raw readings. For aggregates, long-term statistics already do this once state_class is set, and cost almost nothing. For raw data at full resolution over years, it has to go somewhere that isn't the recorder, because the recorder is designed to forget. That means exporting to a time-series database or having the device report to a second destination in parallel."
  - q: "Can I backfill statistics I already lost?"
    a: "Not from within Home Assistant in any straightforward way. The statistics tables are generated going forward from the point the entity is correctly configured. If you have the original data elsewhere, importing it into an external store is possible, but recovering it into HA's own statistics isn't a supported path. This is the strongest argument for setting state_class on day one."
related:
  - href: "/guides/home-assistant-vs-nodrix"
    label: "Home Assistant and nodrix"
    desc: "Where each one fits, honestly."
  - href: "/guides/esphome-without-home-assistant"
    label: "ESPHome without Home Assistant"
    desc: "Running ESPHome devices with a different backend."
  - href: "/guides/nodrix-vs-grafana-influxdb"
    label: "Compared with Grafana and InfluxDB"
    desc: "The other common answer to long-term storage."
  - href: "/guides/open-source-iot-dashboard"
    label: "Open-source IoT dashboards"
    desc: "The wider set of options."
---

You add a REST sensor, it works, and a fortnight later the history only goes back a week. Nothing
is broken and nothing was deleted by mistake. The recorder is doing exactly what it is configured
to do, and the entity was never eligible for the thing that would have kept it.

It's a common enough confusion to have generated the same thread repeatedly, including
["Rest sensors don't keep long-term statistics"](https://community.home-assistant.io/t/rest-sensors-dont-keep-long-term-statistics/689348),
["Understanding longterm statistics of RESTful sensors"](https://community.home-assistant.io/t/understanding-longterm-statistics-of-restful-sensors/760465)
and ["No long term statistics for sensor"](https://community.home-assistant.io/t/no-long-term-statistics-for-sensor/746663).

## The free fix first

Home Assistant keeps two different things. The **recorder** stores raw state changes and purges
them on a schedule, ten days by default. **Long-term statistics** are a separate, permanent set of
tables — but an entity is only written to them if it declares a `state_class`.

A REST sensor doesn't get one automatically. Add it, with a unit:

```yaml
# configuration.yaml — the two lines that decide whether history survives.
#
#   state_class: measurement       value rises and falls (temperature, power, humidity)
#   state_class: total_increasing  counter that only climbs and resets (energy, rainfall)
#
# Without state_class the entity is recorder-only, and the recorder is designed to forget.

sensor:
  - platform: rest
    name: "Shed temperature"
    resource: "https://your-deployment.example.workers.dev/api/latest"
    method: GET
    headers:
      Authorization: !secret shed_token
    value_template: "{{ value_json.temperature }}"
    unit_of_measurement: "°C"        # required alongside state_class
    device_class: temperature
    state_class: measurement         # <- this is the line that was missing
    scan_interval: 60

  - platform: rest
    name: "Shed energy"
    resource: "https://your-deployment.example.workers.dev/api/latest"
    method: GET
    headers:
      Authorization: !secret shed_token
    value_template: "{{ value_json.energy_kwh }}"
    unit_of_measurement: "kWh"
    device_class: energy
    state_class: total_increasing    # a counter, not a measurement
    scan_interval: 60

# Keep the recorder small by excluding what you will never look back at.
recorder:
  purge_keep_days: 10
  exclude:
    entity_globs:
      - sensor.*_rssi
      - sensor.*_uptime
```

Restart, wait for the top of the hour, and statistics begin accumulating. The history before that
point is gone and can't be recovered — which is why this is worth setting on the day you add a
sensor rather than the day you first want a year-on-year comparison.

**Be careful with the choice.** `measurement` is for values that rise and fall. `total_increasing` is
for counters that only climb and reset to zero. An energy counter declared as `measurement`
produces statistics the energy dashboard can't use, and that mistake is harder to spot than a
missing `state_class` because the entity does appear in the statistics tables.

## What long-term statistics actually keep

Here is the part that catches people who did everything right.

Long-term statistics are **hourly aggregates, not your readings**. Each hour produces a small
number of rows — roughly [24 entries per day per entity](https://smarthomescene.com/blog/understanding-home-assistants-database-and-statistics-model/),
carrying min, max and mean — and that's what persists forever.

So a sensor sampling every thirty seconds keeps, permanently: 24 hourly summaries a day. The two
thousand eight hundred and eighty individual readings behind them live in the recorder until the
purge and then vanish.

For most home automation that's the right trade. "What was the average temperature in the shed
last March" is answered perfectly by hourly means, and storing a year of thirty-second samples for
every entity would be absurd. But it is a different answer from "keep my data", and the difference
only shows up when you go looking for a short spike that the hourly mean smoothed away.

This is also where the parallel-reporting option earns its place. A nodrix deployment doesn't touch
the recorder, doesn't add entities and doesn't change any automation — it just receives the same
readings a second time, at full resolution, and keeps them under your own retention rules.

## The database problem behind it

Two constraints make this awkward to fix after the fact.

You [can't selectively purge entities that have long-term statistics](https://community.home-assistant.io/t/reduce-recorder-days-keep-long-term-statistics/653963),
which is tracked upstream in [core#105925](https://github.com/home-assistant/core/issues/105925).
The entities you most want to trim are often the ones you have made permanent.

And a purge doesn't necessarily reclaim disk. The [recorder documentation](https://www.home-assistant.io/integrations/recorder/)
covers the repack option, and without it the file can stay large after data is removed. Instances
growing [past twenty-four gigabytes](https://www.koskila.net/taming-my-home-assistant-database-growth/)
are documented, at which point Home Assistant itself slows down.

**The cheap defence is the `exclude` block above.** Signal strength, uptime and diagnostic counters are
usually recorded by default and almost never looked at.

## When you genuinely need the raw series

Three situations where hourly aggregates aren't enough:

- **Debugging transients.** A brownout, a pump cycling short, a compressor drawing a surge. An
  hourly mean hides all of them by construction.
- **Regulatory or billing arithmetic** where someone will ask how a number was derived.
- **Any analysis where the shape within the hour is the point** — settling curves, drift,
  duty-cycle behaviour.

For those, the data has to live somewhere that isn't the recorder, because the recorder's job is
to forget. The two normal answers are exporting to a time-series database such as InfluxDB, which
is capable and is another service to run and back up, or having the device report to a second
destination in parallel with Home Assistant.

The parallel-reporting option is worth considering precisely because it doesn't disturb anything.
Home Assistant carries on doing automations and local control, which it is very good at; a second
POST from the same device keeps the full-resolution series somewhere with its own retention rules.
If the HA database is later rebuilt, or an entity is renamed, or a purge goes further than intended,
that copy is unaffected.

The device side of parallel reporting is a few lines, because it is the same readings going to a
second place:

```cpp
#include <Nodrix.h>

void setup() {
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();

  static unsigned long last = 0;
  if (millis() - last < 30000) return;       // full resolution, not hourly means
  last = millis();

  Nodrix.send("temperature", readTemp());
  Nodrix.send("energy_kwh", readEnergy());
}
```

Home Assistant carries on polling its REST sensor and running the automations; this keeps the raw
series somewhere with its own retention rules. Neither disturbs the other.

That's the shape nodrix fits: the device posts its readings to a deployment in your own Cloudflare
account alongside whatever it already reports to Home Assistant, and the raw series stays at full
resolution for as long as you decide. It isn't a replacement for Home Assistant and doesn't try
to be one — HA keeps the automations, and the history stops being the recorder's problem.
