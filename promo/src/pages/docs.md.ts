import type { APIRoute } from 'astro';

// Markdown mirror of the docs page.
export const GET: APIRoute = ({ site }) => {
  const u = (p = '') => new URL(p, site).href;
  const body = `# nodrix documentation

Deploy, claim, and connect: the nodrix device protocol, read API, and automation model.

## Deploy & claim
1. Hit "Deploy to Cloudflare" — it provisions D1, R2, KV, and the Worker into your account.
2. Open the worker URL and create the first account; it becomes the owner.
3. Create your first project.

## Tokens
Mint a project token (a bearer token) to authenticate device telemetry and read-API calls.

## Device protocol
Send telemetry:

\`\`\`
POST /v1/telemetry
Authorization: Bearer <project-token>

{ "metrics": { "temperature": 23.4, "humidity": 61 } }

→ 204 No Content   # variables auto-created
\`\`\`

Or hold one WebSocket — it carries telemetry up, control writes down, events up, and acks on a single connection (HTTP stays available for devices that just wake, send, and sleep):

\`\`\`
WSS /v1/control/ws?token=<project-token>

up   → { "type": "telemetry", "metrics": { "temperature": 23.4 } }
up   → { "type": "event", "event": "door_opened" }
down ← { "type": "control", "id": "ctl_x", "variable": "relay", "value": "on" }
up   → { "type": "ack", "ids": ["ctl_x"] }
\`\`\`

## Dashboards
Compose dashboards in a full-page drag-and-drop editor: drop widgets onto a grid and bind each to a variable. Readings stream in live over a hibernating WebSocket, and control widgets (toggle/slider/push) write back as control writes your hardware receives over its control socket (or its next poll). Seven framework-agnostic widgets ship in the box — value, gauge, chart, map, toggle, slider, push — with a separate mobile layout. Any dashboard can be published read-only at a secret share link: viewers need no account, live values arrive by polling, and nothing outside that dashboard's own widgets is exposed.

## Read API
Read the latest state:

\`\`\`
GET /v1/projects/:proj/state

→ { "temperature": { "value": 23.4, "received_at": 171590… } }
\`\`\`

Edge-cached latest state, recent time-series, and variable listings sit behind one bearer token.

## Automations
Built in a visual flow editor: each automation is a graph where one or more triggers flow into optional conditions and actions, all evaluated at the edge.
- Triggers: variable condition (threshold/equality/change), schedule, sunrise/sunset, custom event, manual run.
- Conditions: if-variable comparison (branches yes/no), time window (within hours, by weekday).
- Actions: set a variable, call an integration (HTTP, email, or chat like Slack/Telegram/Discord), emit another event.

The HTTP service integration can HMAC-sign its request body with a shared secret, so the receiver can verify it came from your instance.

## MCP (AI clients)
Optional Model Context Protocol server. Off by default — the owner flips it on from Settings → MCP server.

Two transports on the same worker:
- \`/v1/mcp\` — bearer-token, for CLI and IDE clients (Claude Code, Cursor). Authenticate with a user token from Settings → Tokens.
- \`/v1/mcp/oauth\` — OAuth 2.1, for browser-based clients (claude.ai connectors). The user signs in and approves a consent screen; no token to manage.

Read tools (browse projects, read state and time-series, view automations) are exposed when MCP is on. Management tools (create/update of projects, variables, dashboards, automations, integrations; run automations; set variable values for hardware) require a second deployment toggle AND an explicit \`mcp:manage\` grant at consent time. No delete operations are ever exposed. Every MCP-driven write is recorded in the audit log when enabled, tagged as MCP-sourced.

## Links
- Home: ${u()}
- Widgets: ${u('widgets')}
- Source: https://github.com/decoded-cipher/nodrix
`;
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
