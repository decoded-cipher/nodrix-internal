# Default device adoption

Status: built (not committed).

## Problem

Every project has a Default device. It catches requests that name no device (a `curl` with only a token, older clients, integrations), and most of the code treats "no device given" as "the Default":

- dashboards with no device pinned
- variables created by hand on the Variables page
- automation condition reads (`defaultGetVariable`)
- MCP / API `set_variable` with no device

A real board never lands on the Default. It registers as its own device on its first hello. So in a project with one board, everything above points at an empty device: unpinned dashboards open blank, hand-made variables sit on a device the board never reads, and MCP writes need an explicit device or fail with `variable_not_in_project`.

## The model

The first board to connect **becomes** the Default device.

- One board: there are no devices in the UI. Variables are `temp`, dashboards need no pin, and every "no device given" path above reaches the board.
- A second board gets its own device as today. Only then does the UI show devices: `kitchen.temp` (the Default, carrying the first board's name) and `garage.temp`.

Anything bound before the second board arrived points at the Default, which is still the first board, so adding hardware changes what is displayed, never what an existing binding means.

## Behaviour

| Situation | Today | With adoption |
|---|---|---|
| First board says hello | New device row; Default stays empty | Board claims the Default row |
| Second board says hello | New device row | New device row (unchanged) |
| Keyless request (`curl` with only a token) | Lands on the Default | Lands on the Default, which is the first board |
| Unpinned dashboard | Shows the empty Default | Shows the first board |
| Variable created by hand | Goes to the Default | Goes to the Default, which is the first board |
| Forget the Default | Not allowed | Resets it to unclaimed and wipes its variables |
| Board hardware replaced | New device; everything must be re-bound | "Use as main board" on the new board moves the Default to it |

## Mechanics

**Claim.** In `resolveDevice`, when a key has no row:

```sql
UPDATE devices
   SET device_key = ?, name = CASE WHEN name = 'Default' THEN ? ELSE name END,
       first_seen = ?, last_seen = ?
 WHERE project_id = ? AND is_default = 1 AND device_key IS NULL
```

One affected row means this board is now the Default. Otherwise fall through to today's insert. The single conditional `UPDATE` makes two boards connecting at once safe: one claims the Default, the other gets a new row.

**When a claim is allowed.** Only when the project has no real board yet. An existing multi-board project with an empty Default is never surprised by a new board inheriting the Default's data.

**Storage id.** The adopted Default keeps `is_default = 1`, so its storage id stays `''`. No telemetry, ring buffer, latest state or pending control moves.

**Resolve cache.** The module cache maps a key to an id and assumes the storage id equals the id (`resolved.get(...)` returns `{ id, storageId: id }`). For the adopted Default the storage id is `''`, so the cache must store the whole `{ id, storageId }`. If it doesn't, a cache hit splits the Default's data across two storage ids. This is the main correctness trap.

**Forget the Default.** Reset rather than delete: clear the key, chip, firmware version, update assignment, and first/last seen; set the name back to `Default`; close its socket. Its variables and recent history are wiped, as for any forgotten device; archived telemetry is kept.

**Use as main board.** The replacement connects as an ordinary second device; "Use as main board" on it moves its key onto the Default and drops its own row and data. The Default keeps its name, variables, dashboards and automations. There is no "released" state: a keyless request already sets the Default's `first_seen`, so it couldn't mark a release reliably. This is also the adoption path for an existing project whose board registered next to an unclaimed Default.

**Keyed.** The resolver says whether the request named a device that owns the row (`keyed`). The hello handler used `storageId` truthiness for that, which an adopted Default (`''`) would fail.

**UI.**
- Devices page: one board means the list shows just that board, with no Default badge. The Default row is labelled Default only while unclaimed, and is hidden then unless it holds keyless data (today's rule).
- Dashboard device picker: hidden while the project has one device, as today.

## Existing projects

Nothing migrates automatically. A project whose board registered next to an unclaimed Default adopts it with "Use as main board" on that board; the board takes over the Default, including any hand-made variables there.

## Out of scope

The multi-board work, for when a project has a second board:

- device shown on the Variables page, so two boards' `temp` aren't identical rows
- each dashboard widget bound to its own device, with live updates and controls following it (today the pin only filters the first load, and controls broadcast to every board)
- device choice on automation `set_variable`, with "all boards" as an explicit option
- device on REST series and variable lists
- public share links honouring the dashboard's device

Adoption makes single-board projects consistent everywhere without touching any of these.

## Decisions

1. **Claim only when the project has no real board yet, or the Default was released by Replace board.** An existing multi-board project never has a new board silently inherit the Default's data.
2. **Forgetting the Default wipes its variables and history**, as forgetting any board does. Replace board is the way to keep them, so each action means one thing.
3. **Keyless traffic merges with the first board.** It's what a one-board project wants. The docs say that a script that should stay separate sends its own `X-Nodrix-Device`.
4. **Replacement ships in the first version**, as "Use as main board" on the new board. It's the main payoff of the model, and small.

## Size

About 60 lines on the server: the claim, the cache change, forget-as-reset, and the replace route. About 20 in the web app: the replace action and the badge rule. One test file covering the claim race, the cache hit and the reset. No migration.
