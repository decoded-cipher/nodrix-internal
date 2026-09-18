---
title: "Does the EU Cyber Resilience Act apply to you?"
description: "Reporting obligations began in September 2026. A decision tree for hobbyists, open-source maintainers, and anyone selling a small batch of boards into the EU."
category: concept
difficulty: beginner
datePublished: 2026-09-18
faqs:
  - q: "Does the Cyber Resilience Act apply to hobby projects?"
    a: "A personal project published as open source, with no money changing hands, is outside the scope. The regulation attaches to economic operators placing products on the EU market, not to individuals sharing code. Publishing firmware on GitHub for free does not make you a manufacturer, and contributors to such a project have no obligations under it."
  - q: "What changed on 11 September 2026?"
    a: "Reporting obligations came into force. Manufacturers must report actively exploited vulnerabilities and severe incidents through ENISA's CRA Single Reporting Platform, with an early warning within 24 hours, a full notification within 72 hours, and a final report within 14 days of a fix being available. The wider product requirements follow on 11 December 2027."
  - q: "When do open source stewards have to report?"
    a: "From 11 December 2027, not September 2026. This is a distinction a lot of coverage gets wrong. An open source steward is a legal entity providing sustained support to software intended for commercial use without monetising it, which typically means a foundation rather than an individual maintainer."
  - q: "If I sell a few ESP32 boards on Tindie, am I a manufacturer?"
    a: "If you are placing them on the EU market, then for those products yes, regardless of quantity or of the software being open source. There is no small-seller exemption. There is support for smaller businesses in the form of guidance, helpdesks and simplified technical documentation, but the obligation categories are the same ones larger companies face."
  - q: "What class does a typical ESP32 sensor fall into?"
    a: "The default category, which is self-assessed rather than requiring a third-party body. The stricter classes cover things like password managers, VPNs, operating systems, firewalls and smart meters. A sensor or an actuator that is not performing a security function generally sits in the default class, where you assess conformity yourself and keep the documentation."
related:
  - href: "/guides/esp32-ota-updates"
    label: "Over-the-air updates"
    desc: "The update path an obligation implies."
  - href: "/guides/esp32-certificate-verification-failed"
    label: "TLS pinning and rotation"
    desc: "Secure-by-default in practice."
  - href: "/guides/esp32-https-cloud"
    label: "Connect an ESP32 over HTTPS"
    desc: "Transport security as a starting point."
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "Who operates the backend, and why it matters."
---

The [Cyber Resilience Act](https://digital-strategy.ec.europa.eu/en/policies/cyber-resilience-act) has generated a great deal of writing, almost all of it produced by
compliance vendors for enterprises. If you are one person who publishes firmware, or who sells fifty
boards a year, none of it answers your question.

This is the decision tree. It is not legal advice, and if you are selling at any scale you should
take some — but you should not have to read a law firm's lead-generation piece to work out whether
you are in scope at all.

## The dates

| Date | What applies |
|---|---|
| 10 Dec 2024 | Regulation entered into force |
| **11 Sep 2026** | [Reporting obligations](https://digital-strategy.ec.europa.eu/en/policies/cra-reporting) live for manufacturers |
| 11 Dec 2027 | Full application: essential requirements, CE marking, conformity |
| 11 Dec 2027 | Open source stewards' reporting obligations begin |

The September 2026 date is narrower than most headlines implied. It brought in **reporting**, not the
whole regime, and it applies to manufacturers rather than to everyone.

## Are you in scope?

Work down. The first match is your answer.

**You publish a project as open source and no money changes hands.**
Out of scope. The regulation attaches to economic operators placing products on the EU market, not
to individuals sharing code. Contributors to such a project carry no obligations either. Publishing
firmware on GitHub does not make you a manufacturer.

**You maintain open source that businesses build on, as a legal entity, without monetising it.**
You may be an open source steward — a lighter regime than manufacturer, and the reporting duty does
not begin until **11 December 2027**. In practice this describes foundations rather than individuals.

**You sell hardware into the EU. Any quantity.**
You are a manufacturer for those products. The software being open source does not change this, and
there is no small-seller exemption. Fifty boards on Tindie counts.

**You sell a paid service around the product.**
Same answer. Commercial activity is what triggers it, not volume.

> **The genuinely unsettled part**
>
> Where "commercial activity" begins is not precisely defined. Donations, sponsorships and dual
> licensing sit in a grey area that the EU has acknowledged rather than resolved. If your project
> lives there, that is a real question and not one a guide can close for you.

## If you are not selling into the EU

The CRA follows the market, not your address: what matters is whether the product is placed on the
EU market. If it is not, this regulation does not reach you — but two others may.

**United Kingdom.** The [PSTI regime](https://www.legislation.gov.uk/ukdsi/2023/9780348249767) has
been in force since **29 April 2024** and applies to consumer connectable products sold in the UK.
It is much shorter than the CRA, with three requirements: passwords must be unique per product or
set by the user, you must publish a contact for reporting security vulnerabilities, and you must
state the minimum period for which the product will receive security updates. If you sell a
connected device to UK consumers, these already apply.

**United States.** The FCC's [Cyber Trust Mark](https://www.fcc.gov/CyberTrustMark) is a voluntary
labelling programme rather than a mandatory regime, and its rollout has been slow — check its
current status before assuming a label is obtainable. There is no federal equivalent of the CRA.

**Elsewhere.** Several markets have consumer IoT security baselines in progress or in force. The
common core across all of them is the same three things the UK asks for, which is a reasonable
standard to build to regardless of where you sell.

## If you are a manufacturer

Most maker hardware — a sensor, an actuator, something that reports a reading — sits in the
**default category**, which is self-assessed. You do not need a notified body. The stricter classes
cover password managers, VPNs, operating systems, firewalls, and smart meters; a temperature sensor
is not one of those.

Self-assessed still means real obligations by December 2027:

- **Secure by default**, and no known exploitable vulnerabilities at the point of sale.
- **A documented vulnerability handling process** — how someone reports a problem and how you
  respond.
- **Security updates for the support period**, five years by default unless the expected lifetime is
  genuinely shorter.
- **A machine-readable SBOM** covering the top-level dependencies.
- **Technical documentation**, retained for ten years.
- **An EU Declaration of Conformity** and CE marking.

The one with real engineering consequences is the update obligation. Committing to five years of
security updates means committing to a mechanism for delivering them, which is a design decision
made long before the first sale.

## What that means in practice

Three things follow, and they are worth doing regardless of whether the regulation applies to you:

**Ship an update path from the first release.** A board with no way to receive new firmware cannot
receive a security fix, and retrieving deployed hardware by hand is not a plan. Building
[over-the-air updates](/guides/esp32-ota-updates) in from the start costs little; retrofitting them
to devices already in the field costs a great deal.

**Use per-device credentials, not one shared key.** A single token across a fleet means one extracted
device compromises all of them. Espressif's own guidance on physical attacks makes the same point:
per-device uniqueness is what stops one compromised board from scaling. This is cheap at design time
and impossible to fix later without touching every unit.

**Know what is in your firmware.** The SBOM requirement is only painful if you have never tracked
your dependencies. Every library you pull in is something you are undertaking to patch.

## A note on where your backend runs

One distinction is worth being aware of, and it is genuinely under-discussed: the regulation's scope
can extend to remote data processing that the manufacturer provides and the product depends on. A
backend you operate on behalf of your customers is a different posture from software your customer
deploys into their own infrastructure and runs themselves.

nodrix falls on the second side — it deploys into the buyer's own Cloudflare account, and the
operator of that deployment is the person who owns it. Whether and how that changes any particular
obligation is a question for someone qualified to answer it about your specific product, and the
detailed scope here is an area where good public guidance is still thin. It is raised because it is
a design decision with regulatory consequences, and those are easier to make early.

## What to do now

1. **Work down the tree.** Most people reading this are in the first branch and have nothing to do.
2. **If you sell into the EU, put a dated note in your repository** covering your support period and
   how to report a vulnerability. That is the cheapest concrete step and it is genuinely useful to
   your users.
3. **Make sure you can ship an update.** Everything else is documentation; this one is architecture.
4. **Revisit before December 2027.** Harmonised standards are still being finalised, so the detailed
   picture will be clearer — and specific — closer to the date.
