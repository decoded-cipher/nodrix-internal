---
title: "ESP32-S3 edge AI: run inference on the board, send only the answer"
description: "Build a person-detecting ESP32-S3 camera that never uploads an image: on-device TensorFlow Lite inference at roughly 200 ms, the vector-instruction speedup that isn't automatic, and a dashboard that receives conclusions instead of frames."
category: project
board: ESP32-S3
difficulty: advanced
datePublished: 2026-08-20
dateUpdated: 2026-08-20
faqs:
  - q: "How much faster is the ESP32-S3 than a classic ESP32 for this?"
    a: "Around 4.5× on 16-bit detection models, which is the difference between a demo and something usable. The S3's Xtensa LX7 cores carry SIMD vector instructions that the original ESP32 simply doesn't have, and neural network inference is exactly the workload they were added for. A person-detection model at 96×96 lands near 200 ms per frame on an S3."
  - q: "Do I get that speedup automatically by using an S3?"
    a: "No, and this catches people out. The compiler does not emit those vector instructions — they're reachable through hand-written assembly, which in practice means through libraries built to use them, like Espressif's ESP-DL and the esp-nn kernels behind their TensorFlow Lite port. Write your own naive inference loop in plain C on an S3 and you'll get classic-ESP32 performance on faster silicon."
  - q: "Do I need PSRAM?"
    a: "For anything involving a camera, yes. The model itself wants a couple hundred kilobytes of tensor arena, the framework wants its own, and a camera frame buffer sits on top of that — against 512 KB of internal SRAM that also has to hold Wi-Fi and TLS buffers. Boards sold for AI work pair the S3 with 8 MB of PSRAM for this reason, and a board without it will run out of memory in ways that look like random crashes."
  - q: "Can I send the camera image to my dashboard?"
    a: "Not as telemetry, and it's worth understanding why that's the right design rather than a limitation. Telemetry carries numbers, strings, and booleans — the conclusions a device reaches. Streaming frames to a cloud is the architecture edge AI exists to replace: you'd be paying bandwidth continuously to send images so that something else can decide what this board already knows."
  - q: "What can an ESP32-S3 realistically recognise?"
    a: "Narrow, well-defined things: is there a person in frame, was a wake word spoken, does this vibration signature match a fault, which of a handful of gestures was that. It is not a general vision system, and models that classify hundreds of categories won't fit. The constraint is genuinely productive — a sensor that reliably answers one question is more useful than one that answers many badly."
related:
  - href: "/guides/control-esp32-with-claude-mcp"
    label: "Control your ESP32 with Claude"
    desc: "The other half of AI on your own hardware."
  - href: "/guides/esp32-c6-for-makers"
    label: "ESP32-C6 for makers"
    desc: "The variant optimised for radios rather than compute."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "The Wi-Fi and TLS foundation this build stands on."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The dashboard this reports to."
---

Most "AI camera" projects are not doing AI on the camera. They stream frames to a server, the server
runs a model, and the board is a webcam with extra steps. That works, and it costs you bandwidth
forever, a round trip of latency per decision, and the privacy of every frame.

The ESP32-S3 can genuinely run the model itself. This build detects a person in frame on-device and
sends a single boolean to a dashboard — the image never leaves the board.

## Why the S3 specifically

The S3 is the variant with dual Xtensa LX7 cores at 240 MHz, 512 KB of internal SRAM, support for
octal PSRAM, and — the part that matters here — **SIMD vector instructions built into the CPU cores**.
The classic ESP32 has no vector hardware at all.

The gap that opens is large. Benchmarks put the S3 at roughly **4.5× the original ESP32 on 16-bit
detection models**, and a person-detection model at 96×96 input runs in about **200 ms** per frame.
Five frames a second, deciding locally, on a board that costs a few dollars.

## The speedup is not automatic

Here is the thing that isn't in the marketing, and it will quietly cost you the entire advantage.

**The compiler does not emit those vector instructions.** They're reachable through hand-written
assembly, not through the optimiser noticing your loops. You get the acceleration by using libraries
that were built to exploit them — Espressif's **ESP-DL**, and the **esp-nn** kernels that back their
TensorFlow Lite Micro port.

Write your own straightforward inference loop in C, or pull in a generic TFLite build that isn't
using the accelerated kernels, and an S3 performs like a classic ESP32 with a bigger price tag. Use
Espressif's `esp-tflite-micro` rather than a generic port, and check that the accelerated kernels are
actually enabled.

## What's realistic, honestly

An S3 is not a small GPU. What fits is narrow and well-defined:

- **Is there a person in frame?** The canonical example, ~250 KB model, ~200 KB arena.
- **Was a wake word spoken?** Audio models are small and this is a mature use case.
- **Does this vibration signature match a known fault?** Sensor classification is cheap compared to vision.
- **Which of a few gestures was that?**

What doesn't fit is general object recognition across many categories, anything at high resolution,
or anything you'd describe as "understanding" a scene. The constraint is productive: one question
answered reliably beats many answered badly.

## The architecture: send conclusions, not frames

This is the design point, and it's the reason edge AI matters beyond being clever.

A 96×96 grayscale frame is about 9 KB. Streaming a few of those per second is a continuous upload,
forever, so that something elsewhere can decide what the board already determined locally. The
inference result — `person_detected: true` — is a handful of bytes, sent only when it changes.

So the board runs the model and reports the answer. Bandwidth collapses to nothing, the decision has
no round trip, and no image ever leaves the room. Your dashboard stores what happened, not what it
looked like.

## What you'll need

- An **ESP32-S3 board with PSRAM and a camera** — an ESP32-S3-EYE, XIAO ESP32S3 Sense, or a Freenove
  S3 camera board.
- **PSRAM enabled** in your build settings. This is not optional here.
- Espressif's **esp-tflite-micro**, the **esp32-camera** driver, and the **Nodrix** library.
- A **nodrix instance** with a project and a project token.

## The firmware

The loop is: grab a frame, run it through the interpreter, and report only when the answer changes.
Camera pin mappings differ between boards, so take those from your board's own camera example rather
than from here — getting them wrong is the usual reason `esp_camera_init` fails.

```cpp
#include <Nodrix.h>
#include <esp_camera.h>
#include <TensorFlowLite_ESP32.h>
#include <tensorflow/lite/micro/micro_interpreter.h>
#include <tensorflow/lite/micro/micro_mutable_op_resolver.h>
#include "person_detect_model_data.h"

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* HOST      = "nodrix.you.workers.dev";
const char* TOKEN     = "tok_your_project_token";

constexpr int kArenaSize = 200 * 1024;
static uint8_t* tensor_arena = nullptr;
tflite::MicroInterpreter* interpreter = nullptr;
TfLiteTensor* input = nullptr;

bool lastState = false;

void setupModel() {
  tensor_arena = (uint8_t*)heap_caps_malloc(kArenaSize, MALLOC_CAP_SPIRAM);

  const tflite::Model* model = tflite::GetModel(g_person_detect_model_data);
  static tflite::MicroMutableOpResolver<5> resolver;
  resolver.AddConv2D();
  resolver.AddDepthwiseConv2D();
  resolver.AddAveragePool2D();
  resolver.AddReshape();
  resolver.AddSoftmax();

  static tflite::MicroInterpreter it(model, resolver, tensor_arena, kArenaSize);
  interpreter = &it;
  interpreter->AllocateTensors();
  input = interpreter->input(0);
}

void setup() {
  camera_config_t config = { /* board-specific pins */ };
  config.pixel_format = PIXFORMAT_GRAYSCALE;
  config.frame_size   = FRAMESIZE_96X96;
  config.fb_location  = CAMERA_FB_IN_PSRAM;
  esp_camera_init(&config);

  setupModel();
  Nodrix.begin(WIFI_SSID, WIFI_PASS, HOST, TOKEN);
}

void loop() {
  Nodrix.run();

  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) return;

  for (size_t i = 0; i < fb->len && i < (size_t)input->bytes; i++) {
    input->data.int8[i] = (int8_t)(fb->buf[i] - 128);   // uint8 -> int8 quantised
  }
  esp_camera_fb_return(fb);                             // return it immediately

  unsigned long t0 = millis();
  if (interpreter->Invoke() != kTfLiteOk) return;
  unsigned long ms = millis() - t0;

  TfLiteTensor* out = interpreter->output(0);
  bool person = out->data.int8[1] > out->data.int8[0];

  if (person != lastState) {                            // report changes only
    lastState = person;
    Nodrix.send("person_detected", person);
    Nodrix.send("inference_ms", (int)ms);
    Nodrix.event(person ? "person_arrived" : "person_left");
  }
}
```

Three lines are doing quiet work. `MALLOC_CAP_SPIRAM` puts the tensor arena in PSRAM rather than
competing with Wi-Fi and TLS for internal SRAM. Returning the frame buffer immediately after copying
matters because the camera driver only holds a small number of them and forgetting to return one
stalls capture within seconds. And the `- 128` converts the camera's unsigned bytes into the signed
range the quantised model expects — skip it and inference runs happily and returns nonsense.

Reporting `inference_ms` costs nothing and tells you whether the accelerated kernels are actually in
use. If that number sits near 200 you're getting the S3's vector path; if it's closer to a second,
you're not.

## Build the dashboard

`person_detected` on a **value** widget answers the question. The more interesting widget is a
**chart** of the same variable over time — because the board only reports transitions, that trace is
an occupancy log, and it costs a few bytes per event rather than a video stream.

`inference_ms` on a **value** widget is your health check for the model path.

The sketch also emits `person_arrived` and `person_left` events, which **event** triggers can hang
automations off — lights, notifications, a webhook — without polling anything.

## Going further

Swap the model and the same structure holds. Espressif's speech recognition stack gives you wake-word
detection with no camera at all, and audio models are far smaller than vision ones — a good first
edge-AI project if you don't have a camera board, and one path among the three in the
[voice control guide](/guides/voice-control-esp32).

For a custom classifier, Edge Impulse is the shortest path from your own recorded data to a deployed,
quantised model, and it targets the S3 directly. Training on your own sensor data is where this gets
genuinely useful: a [vibration classifier](/guides/esp32-vibration-monitor) trained on *your* machine
beats a generic model easily.

Pairing this with [Claude over MCP](/guides/control-esp32-with-claude-mcp) closes an interesting
loop — a board that decides locally and a language model that can query those decisions and act on
them, with neither one streaming video anywhere.

## Notes

Quantisation is what makes any of this fit. These models run in 8-bit integers rather than floats,
which is both what shrinks them to a couple hundred kilobytes and what the vector instructions
accelerate. A float model of the same architecture will not fit and would not be fast if it did.

The tensor arena size is found by experiment. Too small and `AllocateTensors` fails; oversized and
you're wasting PSRAM you may want for frame buffers. Start at the model's documented figure and trim.

PSRAM is slower than internal SRAM. Putting the arena there is the right call because it's large, but
performance-critical scratch buffers are better left internal — which is the balancing act every
TinyML build on this chip ends up doing.
