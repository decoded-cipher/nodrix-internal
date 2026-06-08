# Releasing

The runtime version is the root [`package.json`](package.json) `version` field —
the single source of truth. `scripts/gen-version.ts` reads it at build time and
writes `worker/src/version.gen.ts` (gitignored) with three values:

- `VERSION` — semver, from root `package.json`
- `COMMIT` — git HEAD locally, or the CI commit SHA on Cloudflare Workers Builds
- `CHANNEL` — `release` (default) or `edge`, from `NODRIX_DEPLOY_CHANNEL`
- `BUILT_AT` — unix seconds at build time

`worker/src/version.gen.ts` is **never committed**. It's regenerated on
`bun install` (root `postinstall`) and as the first step of `bun run build`, so
fresh clones and CI both produce a current file. The Settings → version endpoint
([`worker/src/domains/settings/version.ts`](worker/src/domains/settings/version.ts))
surfaces these.

> The `version` fields in `worker/`, `web/`, and `promo/` package.json are
> cosmetic — `gen-version.ts` only reads root. Bump root.

## Cutting a release

Deployment is **pull-based**, not pushed from a terminal. On the default
`release` channel, Cloudflare Workers Builds builds the **latest published GitHub
Release** via [`build-from-upstream.sh`](scripts/build-from-upstream.sh) — so a
release means actually publishing one, not just moving `master`:

```sh
# 1. Bump root package.json "version" (pre-1.0: breaking changes may ride a
#    minor bump), e.g. 0.1.0 -> 0.2.0
# 2. Commit + push to GitHub
git commit -am "release: v0.2.0"
git push
# 3. Publish a GitHub Release. This is the step that actually ships — the build
#    pulls releases/latest. Must be non-draft and non-prerelease.
gh release create v0.2.0 --generate-notes
```

Each instance picks up the new release on its **next Cloudflare build** —
triggered by the owner, not by you:

- New installs: the **Deploy to Cloudflare** button (clones the `deploy/` subdir).
- Existing installs: **Retry build** (or any new build) in the Cloudflare
  dashboard.

The version endpoint compares the deployed `VERSION` against the latest release
tag, so instances show "behind" until their owner re-runs the build. A pushed
commit with no published Release does **not** ship and does **not** flip
instances to "behind".

### Edge channel (dev/staging)

Set `NODRIX_DEPLOY_CHANNEL=edge` in a Cloudflare project's **build variables** to
track default-branch (`master`) HEAD instead of releases — for the maintainer's
own dev/staging instance. On `edge`, the build clones `master` HEAD (no Release
needed) and the version endpoint compares the deployed `COMMIT` against `master`
HEAD, exactly as before. Real installs leave this unset and get release-pinning.
