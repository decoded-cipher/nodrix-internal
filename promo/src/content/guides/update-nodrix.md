---
title: "How to update a nodrix instance: one rebuild, nothing to migrate"
description: "Updating a self-hosted nodrix deployment is one button, not a migration project: the app tells you when a release is out, one rebuild pulls it in, and schema changes apply themselves. Here's exactly how the update path works, how to check your version, and how to roll back."
category: concept
datePublished: 2026-07-10
dateUpdated: 2026-07-10
faqs:
  - q: "Will updating nodrix wipe my dashboards or telemetry?"
    a: "No. An update replaces only the code — the Worker and the web app. Your data lives in your account's D1 database, R2 bucket, and Durable Objects, none of which a rebuild touches, and your wrangler.toml with its resource IDs is preserved across every build by design. Schema changes ship inside the new Worker and apply themselves without dropping data."
  - q: "How do I check which version my instance is running?"
    a: "Open Settings inside your instance — the Version & updates panel shows the running version, the commit it was built from, when it was built, and whether the upstream project has published something newer. It's the same check the update prompt uses, so what you see there is the answer."
  - q: "Do I need to run database migrations when I update?"
    a: "No. Migrations are bundled into the Worker at build time and a runtime auto-migrator applies any pending ones — there's no wrangler command to run and no step to forget. This is deliberate: an update path with a manual migration step is an update path people skip."
  - q: "Why is my instance still on the old version right after a release?"
    a: "Because deployments pull the latest release at build time, not continuously — a new release doesn't push itself into your account. Your instance keeps running exactly what it has until you trigger a rebuild, which then picks up the newest published release. That's a feature: nothing about your deployment changes without you pressing the button."
  - q: "Can I roll back if an update misbehaves?"
    a: "Yes, from Cloudflare's side: the Worker keeps its deployment history in the dashboard, and you can roll back to the previous deployment there. Schema migrations are additive, so a rolled-back Worker runs happily against the newer schema. If you ever hit a release that needs more than that, its release notes will say so."
related:
  - href: "/guides/deploy-nodrix-cloudflare"
    label: "Deploy nodrix to Cloudflare"
    desc: "The one-click setup this guide picks up from."
  - href: "/changelog"
    label: "Changelog"
    desc: "Every release, with what changed and why."
  - href: "/docs"
    label: "Docs"
    desc: "The platform reference, protocol to API."
  - href: "/guides/best-free-iot-platforms"
    label: "Best free IoT platforms"
    desc: "Where a self-updating deploy fits in the field."
---

The quiet fear of self-hosting is the second year: the update you postpone because it might mean
migrations, config drift, or an evening of reading upgrade notes. nodrix's update path is built to
delete that fear. Your instance tells you when a release is out, one rebuild brings it in, schema
changes apply themselves, and your data never enters the blast radius.

This guide covers the whole loop: how your deployment relates to the upstream project, how to know
an update exists, how to apply it, and what to do in the rare case one misbehaves.

## How your deployment actually relates to upstream

When you used the Deploy to Cloudflare button, it didn't fork the nodrix codebase into your GitHub
account. It created a small **deploy carrier** — a repo holding little more than your
`wrangler.toml`, the file with your D1, R2, KV, and Durable Object resource IDs. The code isn't in
there at all.

Instead, every time Cloudflare's Workers Builds runs a build for your instance, the build step
pulls the **latest published nodrix release** from the upstream repository, lays it over the
carrier, preserves your `wrangler.toml`, and builds that. Your clone is configuration; the code is
always a released version of upstream.

Two properties fall out of this design, and they're the whole update story:

- **Updating is just rebuilding.** There is no fork to sync, no upstream remote to merge, no
  conflict to resolve. Any new build of your Worker is, by construction, the newest release.
- **Nothing updates without you.** A release on our side changes nothing in your account. Your
  instance runs exactly what it ran until you trigger a build — the update is always your action,
  on your schedule.

## Knowing an update exists

You have three signals, in decreasing order of convenience:

- **The app tells you.** Open **Settings** in your instance: the **Version & updates** panel shows
  the running version, the commit and build time behind it, and checks upstream for the latest
  published release. If there's something newer, it says **Update available** and shows you what
  it is. The check is polite by design — results are cached in your instance's KV for a few
  minutes and revalidated conditionally, so it stays well inside GitHub's rate limits without any
  token.
- **Watch the repository.** On GitHub, watch the nodrix repo with **Watch → Custom → Releases**
  and you'll get a notification (or an entry in the releases Atom feed, if you're an RSS person)
  the moment a version is published — no code noise, releases only.
- **Check the changelog.** [The changelog](/changelog) lists every release with what changed.
  Worth a skim before updating anyway: it's how you find out an update includes something you've
  been waiting for.

Releases are versioned semantically — features bump the minor version, fixes bump the patch — so
the version string itself tells you roughly how much changed.

## Applying the update

From the **Version & updates** panel, the update button takes you straight to your Worker's
**Builds** page in the Cloudflare dashboard — sign in, hit **Retry build** on the latest build,
and Cloudflare rebuilds your instance. The rebuild pulls the newest release, and a few minutes
later the deploy goes live. Back in Settings, your instance rechecks itself and the panel flips
from **Update available** to **Up to date** on its own — if it's still showing stale after the
build finishes, that's your cue to look at the build log.

That's the entire procedure for a button-deployed instance: no terminal, no git, no downtime
beyond the atomic swap of Worker versions.

If you deployed manually from a full clone instead — some people prefer owning the whole pipeline —
updating is the git-native version of the same thing:

```bash
git pull                     # bring your clone up to the release you want
bun install
bun run deploy:platform      # build + deploy the worker with your wrangler.toml
```

Same result, different trigger. Everything else in this guide — migrations, data safety,
rollback — applies identically.

## What happens during an update

Knowing the anatomy makes the button easier to trust:

- **Your configuration survives.** The build preserves your `wrangler.toml` — the resource IDs
  written on day one — before overlaying the new source, and restores it after. Your bindings
  never drift.
- **Schema changes apply themselves.** Database migrations ship bundled inside the Worker, and an
  auto-migrator applies any pending ones at runtime. There's no `wrangler d1 migrations` step, no
  ordering to think about, and migrations are additive — they extend the schema rather than
  destroying data.
- **Your data isn't part of the build.** Telemetry, dashboards, users, tokens, automations — all
  of it lives in D1, R2, and Durable Object storage in your account. A build produces a new Worker
  and web bundle; it doesn't read or write any of that.
- **The swap is atomic.** Cloudflare cuts traffic over to the new Worker version when the deploy
  completes. Devices reconnect their WebSockets automatically — the same reconnect logic they use
  for any network blip — and HTTP-polling devices never notice at all.

## If an update misbehaves

The honest section, because "rarely" isn't "never":

- **Roll back from Cloudflare.** Your Worker's deployment history lives in the dashboard; rolling
  back to the previous deployment restores the prior version in one action. Because migrations are
  additive, the older Worker runs fine against the newer schema.
- **Read the build log.** A failed build never replaces your running instance — the old version
  keeps serving. The log on the Builds page says what went wrong, and retrying after a transient
  failure (a network hiccup during the upstream fetch, say) usually resolves it.
- **Check the release notes.** If a release ever needs something from you — which the design works
  hard to avoid — its notes on the releases page and [the changelog](/changelog) are where that
  would be said plainly.

## The cadence worth adopting

There's no forced pace — an instance that runs untouched for six months keeps working, and the
update prompt just waits. But the design rewards a simple habit: when Settings says **Update
available**, take the two minutes. Small, frequent updates mean each one carries little change,
release notes stay skimmable, and a rollback — should you ever need one — steps back over one
release instead of ten. The update path was built to be boring; using it often keeps it that way.
