---
title: "Fine-tuning without writing code: a weekend with Unsloth Studio"
description: "A weekend spent learning fine-tuning without writing a training loop — three LoRA runs on a MacBook, in a browser tab. What Unsloth Studio actually handles, what 246 examples could buy, what they couldn't, and the two failure modes that look identical but need different cures."
type: engineering
author:
  name: Arjun Krishna
  role: Maintainer
  url: https://github.com/decoded-cipher
datePublished: 2026-08-04
tags:
  - llm
  - fine-tuning
  - engineering
faqs:
  - q: "Can you fine-tune an LLM without writing code?"
    a: "Largely, yes. Unsloth Studio runs as a local web app: you pick a base model, choose LoRA or QLoRA from a dropdown, set the hyperparameters in a form, upload a dataset, and watch the loss graph live. It handles the training loop, the adapter export, and a side-by-side comparison harness. The one piece of code still worth writing is the script that assembles your dataset — which is also the part that determines whether the run is any good, so it is the right place for the effort to land."
  - q: "Can you fine-tune a 7B model on a MacBook?"
    a: "Yes. All three runs here trained on an M4 Pro with 24GB of unified memory, no Nvidia GPU anywhere. Unsloth Studio installs natively on Apple Silicon and trains through MLX, and a 7B fits comfortably under QLoRA 4-bit — the longest run was fifty steps and finished while making coffee. Cloud rentals only become necessary when the model itself exceeds the memory, not because a laptop can't train."
  - q: "Does fine-tuning teach a model new facts?"
    a: "Not reliably, and that was the central lesson of this project. Fine-tuning moves a model's propensities — its voice, its output format, which pattern it reaches for first — and it does that quickly and well. Installing specific facts like an exact function signature is much harder, and roughly 250 examples at 7B could not fully suppress invented ones. If your goal is factual accuracy about a specific API, retrieval belongs in the design; fine-tuning owns the form."
  - q: "How many examples do you need to fine-tune?"
    a: "Far fewer than people expect for form, and more than you'd like for facts. 246 examples were enough to fix voice, teach prose-versus-code routing by question type, and install a specific macro pattern that the base model actively resisted. The same 246 were not enough to stop the model inventing constant names or mixing ESP8266 calls into an ESP32 sketch. Budget by what you're trying to change, not by a headline number."
  - q: "Fine-tuning or RAG?"
    a: "They fix different problems, which becomes obvious once you've hit the wall on one of them. RAG grounds facts — the API surface, per-board specifics, anything that must be exactly right and changes over time. Fine-tuning grounds form — the voice, the output shape, the house patterns a retrieved document won't enforce. The residual hallucination floor described in this post is precisely the seam where retrieval belongs."
  - q: "How do you know a fine-tune actually worked?"
    a: "Hold out a test set before you start and never look at it while curating, then compare base and tuned on the same prompts with the same system prompt. Training loss alone will lie to you — it falls happily while the model learns nothing generalizable. The eval curve is the only overfitting detector, and side-by-side generation on held-out prompts is the only proof the behaviour actually changed."
related:
  - href: "/blog/announcing-nodrix-arduino-library"
    label: "The Nodrix Arduino library"
    desc: "The API this model was taught to write."
  - href: "/guides/control-esp32-with-claude-mcp"
    label: "Control an ESP32 from Claude"
    desc: "The other half of the AI story — MCP, not fine-tuning."
  - href: "/products/arduino-library"
    label: "Arduino library reference"
    desc: "The real API surface, for humans."
---

I wanted to learn fine-tuning, and I wanted to do it without writing a training loop.
[Unsloth Studio](https://unsloth.ai/docs/new/studio) installs natively on Apple Silicon, so the whole
thing ran on a MacBook over a weekend — three [LoRA](https://arxiv.org/abs/2106.09685) runs, no
Python beyond the script that built the dataset.

The target was small enough to judge honestly: turn a small model into an assistant that writes
correct [Nodrix sketches](/products/arduino-library). What the weekend taught me was not what I expected. The assistant works,
and it failed in ways specific enough to name.

## The result, in one prompt

Ask the base model to control an LED from a dashboard toggle and it produces something that looks
entirely reasonable and is entirely invented:

```cpp
#include <Nodrix.h>

bool led = false;
Toggle toggle(0, led, "LED Control");

void setup() {
  Nodrix.begin();
  Nodrix.addWidget(&toggle);
}

void loop() {
  Nodrix.handle();
}
```

There is no `Toggle` class, no `addWidget`, no `handle()`. The model has never heard of Nodrix, so
it pattern-matched the shape of every other IoT library it has read and confidently produced a
plausible fiction. This is the normal failure and it is worse than a refusal, because it compiles in
the reader's head.

After three runs, the same prompt:

```cpp
NODRIX_WRITE("led") {
  digitalWrite(LED_BUILTIN, value.asBool());
}
```

That is the [real API](/blog/announcing-nodrix-arduino-library). The interesting part is what
happened in between.

## What "without writing code" actually means

Worth being precise about, because the claim is easy to overstate.

Unsloth Studio runs as a local web app — `unsloth studio -p 8888` and a browser tab. It owns the
whole training path: the base model picker, a dropdown for LoRA /
[QLoRA](https://arxiv.org/abs/2305.14314) / full / CPT, the
hyperparameters as a form, the dataset upload, the live loss graph, run history, adapter export to
GGUF or safetensors, and a Model Arena that loads base and tuned together so you can toggle the
adapter on one prompt. There is no training script in this project because there did not need to be
one.

What I did write is [`build.py`](https://github.com/decoded-cipher/nodrix-llm/blob/master/build.py),
which assembles the dataset from the Nodrix docs corpus. That is the
honest split, and it is the right one: the tool absorbs the loop, and the effort lands on the data,
which is the part that actually determines whether the run is any good.

Three things about the tool that mattered more than the UI:

**It sets `train_on_completions: true` by default**, so loss lands on assistant turns only. This was
the single largest silent-failure risk in the whole setup — if loss covers the prompt tokens too,
you spend your entire budget teaching the model to write the questions rather than the answers.
Studio got it right without being asked, which is exactly the kind of default that makes a no-code
tool trustworthy or dangerous depending on which way it went.

**The run config and metrics are in a plain SQLite file** at `~/.unsloth/studio/studio.db`. Every
loss number in this post came out of a query against it rather than off a screenshot, which is what
made comparing three runs possible at all.

**Name your runs properly.** I called all of them `nodrix-lora` and then spent real time working out
which adapter in `~/.unsloth/studio/outputs/` belonged to which experiment. `nodrix-v3-2ep` costs
nothing at creation time and saves an afternoon later.

The genuinely low-code part is not that it's easy. It's that the whole weekend was spent on data and
diagnosis instead of on a training harness.

## Buy capability, spend data on propensity

The governing principle, which every result here turned out to be a corollary of:
**fine-tuning adjusts propensities; it cannot install capabilities.**

So capability gets bought with the base model and the small dataset gets spent entirely on
propensity. That made the model choice easy:
[`Qwen2.5-Coder-7B-Instruct`](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct), which already
writes competent embedded C++. I was never going to teach a general-purpose 0.5B model to write
Arduino with 246 examples, and trying is the most common way this kind of project fails.

One licensing trap worth flagging, because it is easy to walk into: Qwen2.5-Coder ships
[**3B**](https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct) under `qwen-research`, which is
non-commercial, while the **1.5B** and **7B** are Apache-2.0. A LoRA
adapter is a derivative of its base, so training on the 3B would have permanently bound the
assistant to a non-commercial licence. The convenient middle size was the one to avoid.

## The dataset is the project

246 chat examples, assembled from the [Nodrix guides corpus](/guides) by a build script rather than
written by hand:

| source | count |
|---|---|
| FAQ pairs from guide frontmatter | 163 |
| curated code tasks from guide code blocks | 24 |
| API Q&A written from `Nodrix.h` | 20 |
| downlink examples (`NODRIX_WRITE`, `NodrixValue`) | 20 |
| failure-targeted examples from observed v2 errors | 14 |
| SDK sketches | 5 |

Split 193 train / 22 valid / 31 test, stratified by kind with a fixed seed so the splits regenerate
byte-for-byte. The test set was sealed — never opened during curation — which is the only reason its
number means anything. It is very easy to curate your way into a test set you have effectively
memorised, and the resulting score feels great and measures nothing.

Training was LoRA at r=16, α=16, all seven linear modules, sequence length 512 (the longest example
is 473 tokens), batch 2 with gradient accumulation 4, LR 2e-4 on a linear schedule — all of it typed
into a form rather than a config file.

## Training loss will lie to you

Run two used three epochs. Here is what that bought:

![Training and eval loss across three runs](/blog/finetune-overfitting.png)

Train loss fell from 1.79 to 1.20. Eval loss reached 2.18 by step 24 and then, across forty-two more
steps, improved to 2.04. That is the whole picture of overfitting in two numbers: the model spent
two-thirds of its training memorising the training set and buying nothing.

Run one had no eval set at all. Its train loss looked fine. That number was worth nothing, and I
would have had no way to know.

Run three cut to two epochs — fifty steps — and its eval curve descended the whole way, 2.75 to
1.83, still falling when it stopped. Stopping before the curve turns is not a compromise; it is the
result.

Two more things about loss that cost me time:

**Loss measures predictability, not competence.** Baseline perplexity on plain English was 91, and
on boilerplate Arduino it was 3.4. The code is not better understood, it is more predictable.
Ranking texts by loss to decide what to train on is close to noise.

**Loss is only comparable on identical text.** Run three's eval floor of 1.83 looked better than run
two's 2.04, but the validation set had grown from 20 to 22 examples between them. The comparison is
confounded. Trust the shape of a curve, never a cross-run number.

## Two diseases that look identical

Both runs produced wrong API calls. It took a while to see that "wrong API call" was two different
illnesses wearing the same symptom, and that only one of them responds to more data.

**Prior-conflict.** `NODRIX_WRITE("x") { }` is a file-scope macro. The base model's prior insists
that libraries expose method calls, so run two produced this:

```cpp
if (Nodrix.wasWrite("led")) {
  digitalWrite(LED_BUILTIN, Nodrix.valueAsBool("led") ? HIGH : LOW);
}
```

Correct in structure, invented in every symbol. The model wasn't confused about what to do — it was
fighting a structural habit about how libraries look.

This one **cured**. Seven examples mapping the exact user phrasing ("widget bound to variable X") to
the macro, plus explicit corrections stating there is no `addWidget`, fixed it in run three. The
useful part: those examples used `pump`, `fan`, and `speed` — never `led`. It generalised to the
held-out `led` prompt, which means the model learned the mapping rather than the string.

**Minority-class, or decision-against-default.** A
[sleeping battery sensor](/guides/esp32-deep-sleep-battery) should use `beginHTTP` and `poll` rather
than `begin` and `run`. But `begin`/`run` dominates the entire corpus,
because most sketches are mains-powered. The model has to *infer* a choice that fights the house
style.

This one **did not cure**. Rebalancing from 4:1 to 2.3:1 didn't move it. The battery sketch still
defaults to `begin`/`run`.

The rule of thumb I'd take to the next project: **targeted data fixes phrasal mappings well and
decisions-against-a-default poorly.** If the model needs to reach for a rare pattern because of
something it inferred rather than something it was told, mild rebalancing is not going to be enough.
The run-by-run evidence for both diagnoses is in
[`FINDINGS.md`](https://github.com/decoded-cipher/nodrix-llm/blob/master/FINDINGS.md).

## Two phenomena worth naming

**Over-application.** Having learned `NODRIX_WRITE` strongly, run three started using it where it
didn't belong — stuffing an entire deep-sleep loop inside a write handler. Strengthening a pattern
has blast radius. You can over-move a propensity into neighbouring contexts, and the fix for one
prompt becomes the bug in another.

**The residual hallucination floor.** Run three still invented a `WAKEUP_RTD_DEEP` constant, mixed
`ESP.deepSleep` (an ESP8266 call) into an ESP32 sketch, and typo'd `NODRIX.send`. Even the good LED
answer carried a comment describing the host as "your Vercel hostname," which is from nowhere.

The form was fixed. The facts still leaked. Roughly 250 examples at 7B cannot reliably suppress
specific invented facts at any epoch count, and no amount of additional training on this dataset
was going to change that.

## The adapter that silently did nothing

One practical trap, because it cost real hours and produces no error message.

Unsloth Studio on Apple Silicon saves LoRA weights in
[MLX](https://github.com/ml-explore/mlx)'s layout — `lora_a`/`lora_b` with transposed shapes.
[`peft`](https://huggingface.co/docs/peft) and `transformers` expect
`base_model.model.….lora_A.weight` and a real `LoraConfig`. Load the MLX adapter directly into
`peft` and it applies **nothing**, cheerfully, with no warning.

The giveaway is that greedy decoding with the adapter on and off is byte-identical. An adapter that
loads without erroring is not proof it is applied — verify by generating, every time.

## Where this leaves retrieval

The boundary came out of the runs rather than out of a plan. Fine-tuning reliably buys form, voice,
output-format routing, and crisply-cued patterns. It does not reliably buy fact suppression or
architectural decisions against a dominant prior.

That residual floor is exactly where retrieval belongs: ground the facts — the API surface, the
per-board specifics — in RAG, and let the fine-tune own the form. Which is not the conclusion I
expected to reach by learning fine-tuning, but it is a more useful one than "it worked."

It also explains why the shipped answer to "let an AI drive Nodrix" is
[MCP](/guides/control-esp32-with-claude-mcp) rather than a fine-tune. A capable general model holding
real tools beats a small model holding memorised facts, for exactly the reasons above — the tools
are the retrieval, and the capability was never mine to install.

## Try it

The base and tuned models are loaded side by side in a Model Arena — same weights in memory, adapter
toggled, one prompt at a time. Ask it something about Nodrix and watch the invented API appear on
the left.

- **Live demo:** [nodrix-build-assistant](https://huggingface.co/spaces/decoded-cipher/nodrix-build-assistant)
- **Adapters:** [v1 1.5B](https://huggingface.co/decoded-cipher/nodrix-coder-1.5b-lora-v1) ·
  [v2 7B](https://huggingface.co/decoded-cipher/nodrix-coder-7b-lora-v2) ·
  [v3 7B](https://huggingface.co/decoded-cipher/nodrix-coder-7b-lora-v3)
- **Data pipeline, eval harness, and full findings:**
  [github.com/decoded-cipher/nodrix-llm](https://github.com/decoded-cipher/nodrix-llm)

The dataset regenerates from the Nodrix corpus with one command, and the splits are deterministic,
so the whole thing is reproducible if you want to run the experiment with different data and see
where your own floor sits.
