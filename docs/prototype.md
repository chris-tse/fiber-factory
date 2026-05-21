# Fiber Factory - Prototype Plan

This document is the implementation brief for the first playable slices of Fiber Factory. The full design lives in [game-design-spec.md](./game-design-spec.md); canonical project language lives in [../CONTEXT.md](../CONTEXT.md).

## Prototype Principles

The first prototypes should prove the core architecture before adding player code. The renderer should replay domain events; it should not own simulation rules or receive visual commands.

Core rules:

- Use Simulation Events as timestamped domain facts.
- Use Virtual Simulation Time from the first hardcoded timeline.
- Treat Connections as infinitely fast in simulation; Station-to-Station movement is playback animation only.
- Keep Work Token identity persistent while allowing State Visuals to change with Order State.
- Derive metrics from Simulation Events rather than emitting `MetricChanged` events.
- Keep the Factory Program, Factory API, Effect runtime, editor, and sandbox out of Prototype 1.

## MVP Scope

The MVP should prove this loop:

```text
write code -> run simulation -> watch factory -> read metrics -> improve code
```

MVP should eventually include:

- simple factory renderer
- event timeline playback
- basic level UI
- Monaco editor
- trusted or semi-sandboxed code execution
- Effect-powered, level-scoped Factory API
- first 3-5 levels
- basic Pass Objective evaluation

MVP non-goals:

- accounts
- leaderboards
- custom level editor
- complex art
- Factorio-like placement
- large factory layouts
- advanced traces
- Layer-heavy challenges
- multiplayer

## MVP Level Path

Early MVP levels use a Level-defined shared workflow for all Orders. The workflow may be derived from the Level's mandatory processing Machines: a cutter-only level requires `cut`, while a cutter-plus-assembler level requires `cut` then `assemble`. Later levels may introduce optional Machines or per-Order workflow requirements as explicit mechanics.

1. **First Shipment**
   - Process one Order.
   - No timing pressure.

2. **Keep Working**
   - Use a long-running Factory Program.
   - Introduce `Effect.forever`.

3. **Keep Dispatching**
   - Waiting for each Order to finish before taking another underutilizes the Factory.
   - Introduce the first Throughput Objective.
   - Introduce `Effect.fork` as a way to keep Dispatching while earlier Orders are active.

4. **Flaky Cutter**
   - Machine Failures become meaningful.
   - Introduce typed errors, `catchTag`, and retry.

5. **Retry Storm**
   - Naive retry overloads the cutter.
   - Introduce bounded retry and backoff.

Order Deadlines and Stage SLAs should come after the initial MVP path. The first timing mechanic should be a Throughput Objective.

## Prototype 1: Hardcoded Event Renderer

### Goal

Build the first visual slice:

```text
hardcoded Simulation Events -> VisualState -> animated Factory Layout
```

Factory Layout:

```text
Order Dock -> Cutter -> Shipping
```

The Order Dock is the Entry Station and visually hosts the Backlog. Shipping is the Output Station. The Cutter is a Machine.

### Do Not Include

- Factory Program execution
- Effect runtime integration
- Factory API implementation
- code editor
- sandbox
- generated simulation
- Station Queue behavior
- belt or transport timing

### Event Set

Keep the initial `SimEvent` model limited to:

- `OrderCreated`
- `OrderTaken`
- `StepStarted`
- `StepCompleted`
- `OrderShipped`

Do not include `StepQueued` until queue behavior is exercised by a later prototype or level.

`OrderTaken` is a real Simulation Event, not a renderer convenience. It records an Order leaving the Backlog and entering an active Factory Program workflow. For Prototype 1, it may be mostly semantic and can mark the Work Token active; the first required visible movement still happens on `StepStarted`.

Example event shape:

```ts
type SimEvent =
  | {
      readonly type: "OrderCreated"
      readonly orderId: string
      readonly time: number
    }
  | {
      readonly type: "OrderTaken"
      readonly orderId: string
      readonly time: number
    }
  | {
      readonly type: "StepStarted"
      readonly orderId: string
      readonly step: "cut"
      readonly machineId: "cutter-1"
      readonly time: number
    }
  | {
      readonly type: "StepCompleted"
      readonly orderId: string
      readonly step: "cut"
      readonly machineId: "cutter-1"
      readonly fromState: "raw"
      readonly toState: "cut"
      readonly time: number
    }
  | {
      readonly type: "OrderShipped"
      readonly orderId: string
      readonly time: number
    }
```

### Visual Requirements

- Render Dock, Cutter, Shipping, Connections, and Work Tokens.
- Treat Dock as the Entry Station / visual Backlog home, not as a separate Backlog panel.
- Show the Cutter switching between idle and working.
- Show the Work Token moving or changing Station as events replay.
- Show minimal State Visuals: the same Work Token should visibly change from raw to cut after `StepCompleted`.
- Keep State Visual changes derived from Order State, not from sprite-specific events.
- Keep Connections infinitely fast in simulation; any movement along them is playback animation only.

### VisualState Requirements

- Derive `VisualState` as a pure projection of Simulation Events up to the current Virtual Simulation Time.
- Prefer a shape like `deriveVisualState(events, currentTime): VisualState` for Prototype 1.
- Do not make the renderer's mutable playback state authoritative for Order location, Machine state, Order State, or fulfillment.
- Keep animation interpolation separate from the domain facts in `VisualState`.

### Playback Requirements

- Use Virtual Simulation Time in the hardcoded timeline.
- Support play, pause, and reset.
- Reset should reset playback to the start of the current timeline; it should not imply a new Run.
- The playback system should map virtual timestamps to animation time so future speed controls are straightforward.

### Acceptance Criteria

- A Work Token appears at Dock when `OrderCreated` is applied.
- `OrderTaken` can mark the Work Token active without adding a separate dispatch area.
- `StepStarted` moves the Work Token to Cutter and marks Cutter working.
- `StepCompleted` marks Cutter idle and changes the Work Token from raw to cut.
- `OrderShipped` moves the Work Token to Shipping or removes it as fulfilled.
- The renderer is event-driven enough that the hardcoded timeline can later be replaced by generated simulation events.

## Later Prototype Sequence

### Prototype 2: Simulation Generates Events

Goal:

```text
simulation -> Simulation Events -> renderer
```

No user code yet. Hardcode an internal simulation driver that processes two Orders.

Acceptance criteria:

- The renderer does not care whether events are hardcoded or generated.
- Metric Projections can be calculated from generated events.

### Prototype 3: Effect Internally

Goal:

```text
hardcoded Effect program -> Factory API -> simulation events
```

Still no editor.

Use a hardcoded Effect program with the target flat Factory API style:

```ts
const program = Effect.gen(function* () {
  const factory = yield* Factory
  const order = yield* factory.takeOrder
  const cut = yield* factory.cut(order)
  yield* factory.ship(cut)
})
```

Acceptance criteria:

- Effect service calls emit the same domain events as Prototype 2.
- The player-facing API shape remains domain-only and flat.

### Prototype 4: Monaco Editor, Trusted Code

Goal:

```text
editor code -> run -> factory changes
```

No robust sandbox yet.

Acceptance criteria:

- Player edits code.
- Presses Run.
- The Factory responds to the exported Factory Program.

### Prototype 5: Worker Sandbox

Goal:

```text
untrusted code -> safe execution limits -> Run result
```

Add:

- Web Worker
- wall-clock timeout
- event limits
- simulated time limits
- restricted imports
- worker termination

Acceptance criteria:

- Infinite loops are stopped.
- Valid Factory Programs still run.

### Prototype 6: First Playable Level

Goal:

```text
objective + starter code + pass/fail
```

Level:

First Shipment. Ship 1 Order.

Acceptance criteria:

- A user can understand the Pass Objective, run code, pass, fail, and reset playback.
- Prototype levels expose only a Pass Objective; ratings and numeric optimization scores are deferred.

### Prototype 7: Keep Working

Goal:

Teach that a Factory Program must keep Dispatching over time.

Level:

Keep Working. Ship 10 Orders.

Acceptance criteria:

- One-order solution fails visibly because the Factory Program exits.
- `Effect.forever` style solution passes.

### Prototype 8: Keep Dispatching

Goal:

Teach that the Factory Program must keep Dispatching Orders while earlier Orders are still active.

Level:

Keep Dispatching. Ship 10 Orders within 45 simulated seconds.

Acceptance criteria:

- Sequential solution is correct but waits for each Order to finish before taking another.
- Forked solution lets the Factory Program keep Dispatching and improves throughput visibly.
- The level uses a Throughput Objective as the first timing constraint.

### Prototype 9: Failure and Retry

Goal:

Make typed failures meaningful.

Level:

Flaky Cutter. Ship enough Orders despite Machine Failures.

Acceptance criteria:

- Unhandled errors fail the relevant workflow or Run.
- Prototype Machine Failures are recoverable Failed Step Attempts; terminal Failed Orders are out of scope.
- Failed Step Attempts are marked in Simulation Events with enough detail to listen for or query them later, including the Order, Step, Machine, attempt count, and recoverability.
- Retry/catch logic improves the result.

### Prototype 10: Retry Storm

Goal:

Show that naive retry is insufficient under overload pressure.

Acceptance criteria:

- Aggressive retry creates visible overload.
- Backoff and bounded retry perform better.

## Suggested Initial Repository Structure

For the first prototype, avoid over-structuring:

```text
src/
  game/
    events.ts
    demoTimeline.ts
    visualState.ts
    playback.ts
    levels.ts
    metrics.ts
  simulation/
    engine.ts
    machines.ts
    orders.ts
    factoryService.ts
  runtime/
    runProgram.ts
    virtualClock.ts
    limits.ts
  sandbox/
    worker.ts
    compile.ts
    imports.ts
  components/
    FactoryRenderer.tsx
    PlaybackControls.tsx
    CodeEditor.tsx
    MetricsPanel.tsx
    EventLog.tsx
    LevelBriefing.tsx
```

A larger monorepo could eventually become:

```text
/apps/web
/packages/core
/packages/api
/packages/runtime
/packages/sandbox
```

## First Codex Task

Build the first Fiber Factory vertical slice.

Create a hardcoded event timeline and a simple visual Factory renderer.

Do not add:

- user code
- Monaco
- sandboxing
- Effect
- Factory Program execution
- Factory API implementation

Requirements:

- Define the minimal typed `SimEvent` model.
- Create `demoTimeline`.
- Create `VisualState` as a pure projection derived from events and current Virtual Simulation Time.
- Render Dock, Cutter, Shipping, Connections, and Work Tokens.
- Treat Dock as the Entry Station / visual Backlog home.
- Treat `OrderTaken` as an active-state change; do not add a separate dispatch area yet.
- Include minimal State Visuals so a Work Token visibly changes from raw to cut.
- Keep Simulation Events as domain facts, not visual commands.
- Use Virtual Simulation Time in `demoTimeline`.
- Treat Station-to-Station movement as instantaneous in simulation.
- Add play/pause/reset controls.
- Keep the renderer event-driven so the hardcoded timeline can later be replaced by real simulation events.
