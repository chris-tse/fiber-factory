# Prototype Notes

## simulator-renderer-prototype.mjs

Status: throwaway.

Question: can the simulator stand alone, emit domain events, and let the renderer derive visual state without owning simulation rules?

Run:

```sh
bun run prototype
```

Run checks:

```sh
bun test
```

Useful focused runs:

```sh
bun prototypes/simulator-renderer-prototype.ts happy
bun prototypes/simulator-renderer-prototype.ts dispatch
bun prototypes/simulator-renderer-prototype.ts retry
```

Current read:

- The simulator can be modeled as an isolated event producer.
- A plain instruction sequence is enough to stand in for the future Factory Program while Effect is out of scope.
- `deriveVisualState(events, currentTime)` is enough to reconstruct Backlog, active workflow, Machine state, shipped Orders, and Failed Step Attempts.
- For the prototype scope, all Machine Failures are recoverable Failed Step Attempts.
- `StepFailed` needs an explicit `attempt` field and a recoverability marker if the UI or Factory Program will listen for or query failed attempts later.
- Early levels can use a Level-defined `requiredWorkflow` shared by all Orders.
- Early Level `requiredWorkflow` can be derived from mandatory processing Machines while still staying owned by the Level.
- Optional Machines do not automatically become required workflow steps.
- Busy Machine requests queue internally at the Station Queue and the workflow continues only when the Step completes.
- `StepQueued` is useful once queue behavior is exercised because it lets the renderer show waiting Orders without exposing Station Queue management to the Factory Program.
- A small scheduler using Virtual Simulation Time is enough to model throughput pressure without a tick loop.
- Terminal Failed Orders are intentionally out of scope for this prototype.

Current checks:

- Happy path: `takeOrder -> cut -> ship` for two Orders passes the Pass Objective.
- Invalid instruction: `ship` before `cut` emits `InvalidStepRequest` and does not advance Order State.
- Recoverable failure: first `cut` attempt emits `StepFailed`, leaves the Order active/raw, then retrying `cut` can ship.
- Level workflow: Orders all follow the Level's `requiredWorkflow` for now; per-Order workflows are deferred.
- Workflow derivation: cutter-only derives `cut -> ship`; cutter-plus-assembler derives `cut -> assemble -> ship`; optional machines are excluded.
- Multi-step workflow: a mandatory assembler makes `cut -> assemble -> ship` valid.
- Invalid multi-step ordering: `assemble` before `cut` and `ship` before `assemble` are rejected.
- Busy Machine queueing: dispatching five Orders concurrently against one Cutter queues four Orders, starts cuts at `0, 5, 10, 15, 20`, and ships them at `5, 10, 15, 20, 25`.

Delete or replace this once the real simulator/renderer slice exists.

## effect-shaped-api-prototype.ts

Status: throwaway.

Question: does the Factory API still read cleanly when public methods return Effect-shaped values, recoverable Factory API Failures use the Effect error channel, and Factory Program Defects surface as diagnostics/defects?

Run:

```sh
bun run prototype:effect-api
```

Useful focused runs:

```sh
bun prototypes/effect-shaped-api-prototype.ts happy
bun prototypes/effect-shaped-api-prototype.ts race
bun prototypes/effect-shaped-api-prototype.ts stale
bun prototypes/effect-shaped-api-prototype.ts concurrent
bun prototypes/effect-shaped-api-prototype.ts machine
```

Current read:

- Public API methods read naturally as `Effect`-shaped values: `availableOrders`, `takeOrder`, `cut`, and `ship`.
- Duplicate `takeOrder(summary)` stays a recoverable error-channel failure.
- Stale `ActiveOrder` use reads better as a defect than a recoverable API failure.
- A public freshness token on `ActiveOrder` makes the stale-value check explicit without adding rejected calls to the Simulation Event stream.
- `ship(activeOrder)` returning `Effect<void>` still reads cleanly; shipped state is visible through `OrderShipped` and projections.
- `Effect.all`-style concurrent cuts still preserve Station Queue behavior when requests enter at the same Virtual Simulation Time.
- Machine failure is a recoverable API failure for the Factory Program and also emits `StepStarted` plus `StepFailed` facts because the failed attempt happened in the Factory.
- A failed Machine attempt consumes Virtual Simulation Time and Machine capacity, but does not advance Order State or invalidate the current `ActiveOrder` by default.

Delete or replace this once a real Effect bridge slice exists.

## real-effect-api-prototype.ts

Status: throwaway.

Question: does the Factory API still feel production-shaped with actual Effect APIs, including `Effect.gen`, `Effect.all`, `Effect.retry`, typed errors, defects, and service construction?

Run:

```sh
bun run prototype:real-effect-api
```

Useful focused runs:

```sh
bun prototypes/real-effect-api-prototype.ts happy
bun prototypes/real-effect-api-prototype.ts retry
bun prototypes/real-effect-api-prototype.ts concurrent
bun prototypes/real-effect-api-prototype.ts stale
```

Current read:

- Uses installed `effect@4.0.0-beta.70`; `repos/effect` is reference material only.
- Real Effect keeps the flat, domain-only Factory API shape viable.
- `Effect.retry(Schedule.recurs(2))` cleanly models retrying a recoverable Machine Failure without Factory-specific retry helpers.
- `Schema.TaggedErrorClass` works for typed Factory API Failures, though production can still decide whether schema-backed classes are worth the ceremony.
- `Effect.die` works for stale Active Order / Factory Program Defect cases when paired with a Run diagnostic sink.
- `Context.Service` and `Layer` are a plausible service construction shape for the Factory API bridge.
- Remaining integration risk is no longer Effect ergonomics; it is bridging a Run's Simulation Event list into visual playback and player feedback.

Next useful prototype:

```text
Simulation Events -> Playback Projection / VisualState -> visual feedback
```

Use one or more event lists from the existing simulator/API prototypes before adding Monaco, sandboxing, or a full app shell.

## visual-renderer

Status: throwaway.

Question: can a browser renderer replay Simulation Events into visual feedback while keeping `VisualState` a pure projection and animation interpolation downstream?

Run:

```sh
bun run prototype:visual-renderer
```

Then open:

```text
http://localhost:3000
```

Current read:

- The prototype uses a hardcoded Simulation Event timeline: `OrderCreated`, `OrderTaken`, `StepStarted`, `StepCompleted`, and `OrderShipped`.
- `deriveVisualState(events, currentTime)` reconstructs Work Token workflow, Order State, station location, Machine state, and simple metrics from domain facts.
- `derivePlaybackFrame(events, currentTime)` adds renderer-facing movement spans without making interpolation authoritative for Factory state.
- The Dock acts as the Entry Station / Backlog home; Shipping acts as the Output Station; Cutter is the only Machine.
- State Visuals are derived from Order State: the same Work Token changes from raw to cut after `StepCompleted`.
- `OrderTaken` marks the Order active but leaves the Work Token at Dock; the first visible move happens when processing starts.
- Connection movement is playback-only. It does not add Virtual Simulation Time, affect metrics, or delay Machine processing.
- `StepStarted` can mark the Cutter working while playback animates the token from Dock to Cutter; that overlap is acceptable for this prototype.
- `StepCompleted` and `OrderShipped` can share the same timestamp when Shipping is not a timed Machine. Playback still animates the token to Shipping after the event.
- Playback supports play, pause, scrub, and reset over Virtual Simulation Time.

Next useful read:

- Use generated Simulation Events from the existing simulator/API prototypes as the next input source without changing the renderer contract.
- Keep Station Queue, Monaco, sandboxing, and full level UI out until this event-to-feedback loop feels clear.
- The next prototype should probably replace the hardcoded event list with generated events or introduce a minimal Run result shell before broadening the UI.

## factory-api-bridge-prototype.ts

Status: throwaway.

Question: can a public Factory API bridge drive simulator-owned Run state while preserving immutable `OrderSummary` / `ActiveOrder` values, typed failures, and domain Simulation Events?

Run:

```sh
bun run prototype:bridge
```

Useful focused runs:

```sh
bun prototypes/factory-api-bridge-prototype.ts race
bun prototypes/factory-api-bridge-prototype.ts stale
bun prototypes/factory-api-bridge-prototype.ts concurrent
bun prototypes/factory-api-bridge-prototype.ts empty
```

Current read:

- `availableOrders()` can expose immutable `OrderSummary` snapshots without giving the Factory Program mutable internal Run state.
- `takeOrder(summary)` should validate against current simulator-owned Backlog state; a stale or duplicate summary fails with a typed `OrderUnavailable`.
- `takeOrder()` can keep an immediate contract: return an Active Order when the Backlog has one, otherwise fail with typed `NoOrdersAvailable`.
- Step methods can accept immutable `ActiveOrder<State>` values and return new immutable `ActiveOrder<NextState>` values.
- The bridge needs a public value freshness check, not just an order id check, or stale `ActiveOrder` values can be reused after a successful transition.
- Concurrent Step requests can enter the simulator at the same Virtual Simulation Time and still resolve on Step completion with `StepQueued`, `StepStarted`, and `StepCompleted` events.
- The prototype now separates accepted `SimulationEvent`s, recoverable `FactoryApiFailure`s, and `FactoryProgramDefect` diagnostics.
- Empty Backlog and selected-Order-unavailable cases read cleanly as recoverable API failures outside the Simulation Event stream.
- Stale `ActiveOrder` use reads cleanly as a Run diagnostic outside both recoverable API failures and Simulation Events.
- Early `ship(activeOrder)` should return `void`; the durable shipped result is `OrderShipped` plus projections unless a later mechanic needs a receipt-like value.
