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
