import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// llms.txt — a concise, LLM-friendly map of the site.
// Convention: https://llmstxt.org
export const GET: APIRoute = async ({ site }) => {
  const u = (p = '') => new URL(p, site).href;
  const repo = 'https://github.com/decoded-cipher/nodrix';

  // Complete guide index, grouped by type and generated from the collection so
  // it never drifts as guides are added or removed. Full text lives in llms-full.txt.
  const guides = (await getCollection('guides'))
    .filter((g) => !g.data.draft)
    .sort((a, b) => b.data.datePublished.getTime() - a.data.datePublished.getTime());
  const GUIDE_GROUPS: [string, string][] = [
    ['project', 'Project builds (ESP32/ESP8266/Pico hardware)'],
    ['comparison', 'Comparisons & platform alternatives'],
    ['hardware', 'Hardware & board guides'],
    ['concept', 'Concepts & how-tos'],
  ];
  const guideIndex = GUIDE_GROUPS.map(([cat, label]) => {
    const items = guides.filter((g) => g.data.category === cat);
    if (!items.length) return '';
    const lines = items.map((g) => `- [${g.data.title}](${u('guides/' + g.id)}): ${g.data.description}`);
    return `### ${label}\n${lines.join('\n')}`;
  })
    .filter(Boolean)
    .join('\n\n');

  const body = `# nodrix

> nodrix is an open-source, single-tenant IoT cloud that deploys to your own Cloudflare account. Hardware speaks plain HTTPS or WebSocket, telemetry streams to realtime drag-and-drop dashboards, automations run at the edge, and a clean read API exposes the data — with no broker, no servers, and your data never leaving your account.

## What it is
- Open-source (MIT) IoT backend for Cloudflare; first stable release (v1.0).
- Single-tenant: every deployment lives in the user's own Cloudflare account.
- One-click "Deploy to Cloudflare" — provisions Workers, Durable Objects, D1, R2, and KV.
- Devices send telemetry over plain HTTPS (POST /v1/telemetry) or a WebSocket (/v1/control/ws); variables auto-create on first sight. No MQTT broker and no SDK required — with an optional Arduino/ESP library that wraps the protocol.
- Realtime dashboards built from drag-and-drop widgets over hibernating WebSockets.
- Two-way control: toggles/sliders/buttons write values back to hardware.
- Edge automations: a visual flow builder — one or more triggers (variable thresholds, schedules, sunrise/sunset, custom events) branch through conditions into actions (set variables, call an integration over HTTP/email/chat like Slack/Telegram/Discord, or emit events).
- Clean read API: edge-cached latest state, time-series, and variable listings behind one bearer token.
- Optional MCP (Model Context Protocol) server — owner-gated, off by default. Lets Claude, Claude Code, ChatGPT, and any MCP-aware client read projects and (with an explicit toggle) drive automations. Bearer transport at /v1/mcp; OAuth at /v1/mcp/oauth.

## Pages
- [Home](${u()}): Product overview, features, and how it works.
- [Documentation](${u('docs')}): Device protocol, read API, automation model, and MCP.
- [Products](${u('products')}): Libraries to connect hardware — the Arduino library, dashboard widgets, and the open device protocol.
- [Arduino library](${u('products/arduino-library')}): Reference for the optional ESP32/ESP8266 library — NODRIX_WRITE control handlers, telemetry, WebSocket/HTTP transports, and TLS pinning.
- [Widgets](${u('widgets')}): Built-in, framework-agnostic Web Component widgets.
- [Guides](${u('guides')}): Hands-on IoT guides — connect an ESP32 to the cloud over HTTPS (no MQTT broker), receive commands back, deep-sleep battery builds, and more.
- [Blog](${u('blog')}): Release notes, build-in-public engineering stories, and case studies.
- [Roadmap](${u('roadmap')}): What's planned next for nodrix.
- [Changelog](${u('changelog')}): Release history.

## Guides
${guideIndex}

## Markdown & full text (for machines)
- [Full text](${u('llms-full.txt')}): The entire site in one document.
- [Home (markdown)](${u('index.md')})
- [Docs (markdown)](${u('docs.md')})
- [Widgets (markdown)](${u('widgets.md')})

## Tech stack
- Cloudflare Workers, Durable Objects, D1, R2, KV.

## Source
- [GitHub repository](${repo})
- [Arduino/ESP library](https://github.com/decoded-cipher/nodrix-sdk)
- License: MIT
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
