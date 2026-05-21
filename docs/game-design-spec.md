# Fiber Factory - Game Design Spec

## 1. High-Level Concept

Fiber Factory is a browser-based programming game where players write TypeScript / Effect TS code to control a fixed visual factory.

The game is inspired by Elevator Saga: the player is given a live simulated system and must write code that makes it behave efficiently.

The player does not manually place machines, belts, buildings, or factory layouts. Instead, each level provides a prebuilt factory with known constraints, and the player writes the controller logic that runs it.

### One-line pitch

Fiber Factory is an Elevator Saga-like programming game where players use Effect TS to orchestrate a fixed visual factory under real-world constraints like queues, failures, retries, timeouts, concurrency, deadlines, and limited resources.

### Core fantasy

"I wrote code, and now this little automated factory runs better."

---

## 2. Product Direction

### What the game is

Fiber Factory is a game about orchestration under constraints.

Each level gives the player:

- A fixed factory
- A set of order types
- Machine capabilities
- Failure modes
- Timing constraints
- Objectives
- A player-facing API

The player writes:

- Scheduling logic
- Routing logic
- Concurrency logic
- Retry logic
- Failure handling
- Timeout handling
- Backpressure handling
- Resource management

The player's code controls how work flows through the factory.

### What the game is not

Fiber Factory is not primarily a Factorio-style factory builder.

The player should not initially control:

- machine placement
- belt placement
- factory layout
- power networks
- spatial optimization
- inventory networks
- inserters
- walls
- terrain

Those things could appear much later as optional advanced mechanics, but they are not part of the core game.

### Better comparison

Fiber Factory is closer to:

> Elevator Saga + Effect TS + visible factory orchestration

than:

> Factorio, but coded

Factorio is mostly about:

> spatial factory design + resource flow optimization

Fiber Factory is about:

> programmatic workflow design + failure/concurrency optimization

---

## 3. Design Goals

### Primary goals

1. Make Effect TS feel naturally useful
   - The game should create problems where Effect concepts are the right tools, not arbitrary requirements.
2. Keep the factory visual and concrete
   - Players should see boxes moving, queues growing, machines idling, retries looping, failures flashing, and bottlenecks forming.
3. Preserve open-ended problem solving
   - The game should not simply say "use Effect.retry here." It should present factory problems and let the player discover or request the relevant tools.
4. Teach transferable Effect patterns
   - Code written in the game should resemble real Effect TS patterns used in production systems.
5. Avoid becoming only a tutorial
   - The game should feel like a programming puzzle first, with a curriculum underneath.
6. Separate simulation from visuals
   - Player code should influence the simulation through a controlled API.
   - The simulation should emit events.
   - The renderer should replay those events.

---

## 4. Target Audience

### Primary audience

Developers who know TypeScript and want to learn or practice Effect TS.

### Secondary audience

Developers who enjoy programming games and systems puzzles, such as:

- Elevator Saga
- Screeps
- Zachtronics games
- Human Resource Machine
- Advent of Code-style optimization puzzles

### Assumed knowledge

Players should know:

- basic TypeScript
- functions
- objects
- arrays
- async concepts
- basic error handling

Players should not need to know Effect TS before starting.

---

## 5. Core Gameplay Loop

The loop is:

```text
Read level objective
    ↓
Inspect fixed factory layout and rules
    ↓
Write or edit Effect TS controller code
    ↓
Run simulation
    ↓
Watch visual factory behavior
    ↓
Inspect metrics and event log
    ↓
Improve code
    ↓
Pass level / optimize score
```

The most important feel is:

> "My code changed how the factory behaves."

---

## 6. Core Player Role

The player is the automation/control system engineer.

They are not the factory architect. The physical system already exists.

The player's job is to make the fixed factory run well.

Example level framing:

> This factory has one fast but unreliable cutter, one slow but reliable cutter,
> two assemblers, one inspector, and a shipping station.
> Urgent orders expire quickly.
> Fragile orders fail inspection more often.
> The fast cutter sometimes jams.
> The slow cutter never jams but creates a bottleneck.
> Write a controller that maximizes shipped orders while keeping urgent failures low.

---

## 7. Visual Design

### Main screen layout

A practical layout:

```text
┌────────────────────────────────────────────────────────────┐
│ Level Title / Objectives / Metrics                         │
├──────────────────────────────┬─────────────────────────────┤
│                              │                             │
│      Factory Simulation      │        Code Editor          │
│                              │                             │
│  Orders, queues, machines    │  TypeScript + Effect code   │
│                              │                             │
├──────────────────────────────┴─────────────────────────────┤
│ Event Log / Trace Timeline / Hints / Results               │
└────────────────────────────────────────────────────────────┘
```

### Factory view

The factory should be simple and readable.

Example:

```text
Incoming Orders → Cutter → Assembler → Inspector → Shipping
```

Or:

```text
                ┌──────────────┐
Incoming Queue →│ Fast Cutter  │─┐
                └──────────────┘ │
                                  ├→ Assembler → Inspector → Shipping
                ┌──────────────┐ │
Incoming Queue →│ Safe Cutter  │─┘
                └──────────────┘
```

### Visual entities

#### Orders

Orders appear as small boxes moving through the factory.

Possible order types:

| Order Type | Visual Meaning |
| --- | --- |
| Standard | Normal order |
| Urgent | Deadline-sensitive order |
| Fragile | Higher chance of quality rejection |
| Bulk | Takes longer to process |
| Rework | Previously failed/rejected order |

Possible visual indicators:

- color
- icon
- deadline bar
- attempt count badge
- priority marker

#### Machines

Machines are visible stations with state.

Machine states:

| State | Visual |
| --- | --- |
| Idle | Dim or neutral |
| Working | Animated/progress bar |
| Failed | Warning icon |
| Offline | Darkened |
| Cooling down | Timer overlay |
| Overloaded | Red queue indicator |
| Rate-limited | Gate/lock indicator |

#### Queues

Queues should be visually obvious.

A player should be able to see:

- orders piling up
- orders starving
- machine bottlenecks
- idle machines
- retry loops
- urgent orders expiring

Queues are central to the visual feedback.

---

## 8. Core Game Systems

### 8.1 Orders

An order is the main unit of work.

Conceptual shape:

```ts
interface Order {
  readonly id: string
  readonly type: "standard" | "urgent" | "fragile" | "bulk"
  readonly createdAt: SimTime
  readonly deadline?: SimTime
  readonly requiredSteps: ReadonlyArray<Step>
  readonly attempts: number
}
```

Steps may include:

```ts
type Step =
  | "cut"
  | "assemble"
  | "inspect"
  | "package"
  | "ship"
```

### 8.2 Machines

Machines perform work on orders.

Conceptual shape:

```ts
interface Machine {
  readonly id: string
  readonly kind: MachineKind
  readonly capacity: number
  readonly processTime: Duration
  readonly failureRate: number
}
```

Machine kinds:

```ts
type MachineKind =
  | "cutter"
  | "assembler"
  | "inspector"
  | "packager"
  | "shipper"
```

Machines may have different behavior:

- fast but unreliable
- slow but reliable
- limited capacity
- cooldown after failure
- only accepts certain order types
- requires exclusive access
- rate-limited

### 8.3 Machine Errors

Errors should be typed and meaningful.

Example:

```ts
type MachineError =
  | { readonly _tag: "MachineFailure"; readonly machineId: string }
  | { readonly _tag: "MachineOffline"; readonly machineId: string }
  | { readonly _tag: "InvalidOrderStep"; readonly step: Step }
  | { readonly _tag: "QualityRejected"; readonly orderId: string }
  | { readonly _tag: "Overloaded"; readonly machineId: string }
```

This supports Effect-style error handling:

```ts
Effect.catchTag("MachineFailure", ...)
Effect.catchTag("QualityRejected", ...)
```

---

## 9. Player-Facing API

### Principle

The player should interact with a small, controlled API.

Good:

```ts
factory.takeOrder
factory.processStep(order, "cut")
factory.ship(order)
```

Avoid exposing large internal machinery:

```ts
factory.internal.scheduler.machineController.assignOrderToMachine(...)
```

The game should teach Effect, not a huge fake game framework.

### Factory service

Conceptual API:

```ts
interface Factory {
  readonly takeOrder: Effect.Effect<Order>
  readonly processStep: (
    order: Order,
    step: Step
  ) => Effect.Effect<Order, MachineError>
  readonly ship: (
    order: Order
  ) => Effect.Effect<void, ShippingError>
  readonly sendToRepair: (
    order: Order
  ) => Effect.Effect<Order, RepairError>
  readonly fail: (
    order: Order,
    reason: string
  ) => Effect.Effect<void>
}
```

### More advanced APIs

Later levels may expose:

```ts
factory.orders.takeHighestPriority
factory.orders.takeUrgent
factory.orders.takeStandard
factory.machines.fastCutter.process(order)
factory.machines.safeCutter.process(order)
factory.metrics.currentQueueDepth
factory.clock.now
factory.log.info(...)
```

But the early API should remain narrow.

---

## 10. Effect Concepts Mapped to Game Mechanics

| Effect Concept | Factory Mechanic |
| --- | --- |
| Effect | Unit of factory work |
| Effect.gen | Workflow for processing an order |
| typed errors | Known machine/order failures |
| catchTag | Handle specific failures |
| retry | Retry transient machine failures |
| Schedule | Retry limits, backoff, pacing |
| timeout | Deadlines / stuck operations |
| fork | Process multiple orders concurrently |
| fibers | Active independent order workflows |
| Queue | Incoming orders / station backlog |
| Semaphore | Limited machines/workers |
| Ref | Shared mutable controller state |
| Layer | Swappable factory configurations |
| Scope | Acquire/release resources safely |
| interruption | Cancel expired or obsolete work |
| logging | Event feed |
| tracing/spans | Per-order timeline |

---

## 11. Guidance Model

This is a central design decision.

The game should not be purely:

> "Here is a full API spec. Figure everything out."

And it should not be purely:

> "Use retry here. Fill in the blank."

### Recommended approach

Use:

- Guided onboarding
- Open-ended main levels
- Optional hints
- Post-level explanations

### Level prompt style

Prefer problem statements in factory terms.

Good:

> The cutter sometimes fails temporarily. Giving up immediately wastes orders,
> but retrying too quickly can overload the machine.
> Ship 40 orders.
> Keep failed orders below 8.
> Keep overload events below 5.

Less good:

> Use Effect.retry with Schedule.exponential.

### Hint structure

Hints progressively reveal the Effect concept.

Example:

Hint 1:
Some failures are transient. Giving up immediately may be too pessimistic.

Hint 2:
Retrying can help, but immediate retries can overload the cutter.

Hint 3:
Effect.retry lets you retry a failing Effect. Schedule.exponential can space out retries.

### Post-level explanation

After the player passes, explain the production pattern.

Example:

> This level rewarded bounded retry with backoff.
> In Effect, retry behavior is controlled by Schedules. This is useful for transient failures,
> but production systems usually cap retries and avoid retry storms.

---

## 12. Level Progression

### Chapter 0: Guided Intro

Very explicit onboarding.

#### Level 1: First Shipment

Factory:

```text
Order Dock → Cutter → Shipping
```

Objective:

Ship 1 order.

Concepts:

- Effect
- Effect.gen
- yielding an effect
- factory.processStep
- factory.ship

Naive passing solution:

```ts
import { Effect } from "effect"
import { Factory } from "game"

export const program = Effect.gen(function* () {
  const factory = yield* Factory
  const order = yield* factory.takeOrder
  const cut = yield* factory.processStep(order, "cut")
  yield* factory.ship(cut)
})
```

### Chapter 1: The Factory as a Stream

#### Level 2: Keep Working

Factory:

```text
Order Dock → Cutter → Shipping
```

Objective:

Ship 10 orders.

New lesson:

A factory controller must keep running.

Effect concept:

Effect.forever

Naive insufficient solution:

```ts
export const program = Effect.gen(function* () {
  const factory = yield* Factory
  const order = yield* factory.takeOrder
  const cut = yield* factory.processStep(order, "cut")
  yield* factory.ship(cut)
})
```

Why it fails:

It ships one order, then the program exits.
Orders continue arriving, but the factory becomes idle.

Visual symptom:

- Dock queue grows.
- Cutter is idle.
- Shipping is idle.

Sufficient solution:

```ts
export const program = Effect.gen(function* () {
  const factory = yield* Factory
  yield* Effect.forever(
    Effect.gen(function* () {
      const order = yield* factory.takeOrder
      const cut = yield* factory.processStep(order, "cut")
      yield* factory.ship(cut)
    })
  )
})
```

#### Level 3: Use the Whole Line

Factory:

```text
Order Dock → Cutter → Assembler → Shipping
```

Objective:

Ship 10 orders within 45 seconds.

New lesson:

Sequential processing underutilizes the factory.

Effect concept:

Effect.fork

Naive but insufficient solution:

```ts
const processOrder = (order: Order) =>
  Effect.gen(function* () {
    const factory = yield* Factory
    const cut = yield* factory.processStep(order, "cut")
    const assembled = yield* factory.processStep(cut, "assemble")
    yield* factory.ship(assembled)
  })

export const program = Effect.gen(function* () {
  const factory = yield* Factory
  yield* Effect.forever(
    Effect.gen(function* () {
      const order = yield* factory.takeOrder
      yield* processOrder(order)
    })
  )
})
```

Why it fails:

Only one order is active at a time.
Cutter, assembler, and shipping are idle at different times.

Visual symptom:

```text
Order #1 at cutter
then Order #1 at assembler while cutter sits idle
then Order #1 at shipping while cutter and assembler sit idle
```

Improved solution:

```ts
const processOrder = (order: Order) =>
  Effect.gen(function* () {
    const factory = yield* Factory
    const cut = yield* factory.processStep(order, "cut")
    const assembled = yield* factory.processStep(cut, "assemble")
    yield* factory.ship(assembled)
  })

export const program = Effect.gen(function* () {
  const factory = yield* Factory
  yield* Effect.forever(
    Effect.gen(function* () {
      const order = yield* factory.takeOrder
      yield* Effect.fork(processOrder(order))
    })
  )
})
```

This is intentionally incomplete as a long-term pattern. Later, unbounded fork becomes dangerous.

### Chapter 2: Failures

#### Level 4: Flaky Cutter

Factory:

```text
Order Dock → Cutter → Assembler → Shipping
```

Rules:

- Cutter has a transient failure rate.
- Assembler is stable.
- Shipping is stable.

Objective:

- Ship 30 orders.
- Fail fewer than 5.

Concepts:

- typed errors
- Effect.catchTag
- Effect.retry
- Schedule.recurs

Naive solution fails because machine errors fail the order or the whole workflow.

Player needs to decide:

- retry transient failures
- send unrecoverable failures to repair
- explicitly mark failed orders

#### Level 5: Quality Control

Factory:

```text
Order Dock → Cutter → Assembler → Inspector → Shipping
                         ↓
                      Repair
```

Rules:

- Fragile orders may be rejected by inspection.
- Rejected orders can be repaired and re-inspected.

Objective:

- Recover at least 80% of rejected fragile orders.
- Keep average processing time below a limit.

Concepts:

- domain-specific typed errors
- catchTag
- alternate workflow branches

### Chapter 3: Retry and Backoff

#### Level 6: Retry Storm

Factory:

```text
Order Dock → Cutter → Assembler → Shipping
```

Rules:

- Cutter has a 20% transient failure rate.
- Too many immediate retries overload the cutter.

Objectives:

- Ship at least 40 orders.
- Keep failed orders below 8.
- Keep cutter overload events below 5.

Concepts:

- Effect.retry
- Schedule.exponential
- bounded retries
- retry budget

Naive insufficient solution:

```ts
factory.processStep(order, "cut").pipe(
  Effect.retry(Schedule.recurs(5))
)
```

Why it may fail:

- Retries happen too aggressively.
- Retry queue clogs the cutter.
- Overload events spike.

Better pattern:

```ts
const retryPolicy = Schedule.exponential("100 millis").pipe(
  Schedule.compose(Schedule.recurs(3))
)

const cut = yield* factory.processStep(order, "cut").pipe(
  Effect.retry(retryPolicy),
  Effect.catchTag("MachineFailure", () =>
    factory.sendToRepair(order)
  )
)
```

The level should describe the cutter behavior, not directly say "use exponential backoff" unless the player opens hints.

### Chapter 4: Timeouts and Deadlines

#### Level 7: Stuck Assembler

Rules:

- The assembler sometimes hangs.
- A hung order occupies the assembler until interrupted.

Objective:

- No order may spend more than 15 seconds at the assembler.
- Ship 25 orders.

Concepts:

- Effect.timeout
- interruption
- fallbacks

Naive failure:

One stuck order blocks the assembler.
Queue grows forever.

#### Level 8: Urgent Orders

Rules:

- Urgent orders expire quickly.
- Standard orders do not expire.

Objective:

- Ship 90% of urgent orders before deadline.
- Maintain total throughput above threshold.

Concepts:

- priority
- deadline-aware scheduling
- timeouts
- separate workflows

Naive failure:

Urgent orders sit behind standard orders and expire.

### Chapter 5: Bounded Concurrency

#### Level 9: Too Much Parallelism

Rules:

Unbounded order processing creates huge queues and overloads machines.

Objective:

- Ship 100 orders.
- Keep max queue size below 30.
- Keep failure rate below 10%.

Concepts:

- bounded concurrency
- backpressure
- worker pools
- Queue
- Semaphore

This level punishes the earlier pattern:

```ts
yield* Effect.fork(processOrder(order))
```

The player needs bounded processing.

#### Level 10: Limited Inspectors

Rules:

- Only two inspectors may run at once.
- Sending too many orders to inspection causes overload.

Objective:

- Use inspectors efficiently.
- No more than 2 inspections may run at once.

Concepts:

- Semaphore
- resource constraints

### Chapter 6: Resource Safety

#### Level 11: Maintenance Window

Rules:

- Machines must be acquired before use.
- Failures can occur while a machine is locked.
- Incorrect cleanup leaves machines unavailable.

Objective:

- Complete 50 orders.
- No machine may remain locked after failure.

Concepts:

- Scope
- acquire/release
- ensuring/finalizers

Visual symptom of bad code:

A machine remains locked forever after a failed order.

### Chapter 7: Services and Layers

#### Level 12: Swappable Factory Layouts

Rules:

The same controller must pass across multiple factory configurations.

Objective:

Pass the level on three different factory layouts.

Concepts:

- Context
- Layer
- service abstraction
- dependency injection

This is later-game material, not MVP material.

### Chapter 8: Observability

#### Level 13: Debug the Bottleneck

Rules:

The factory fails in a non-obvious way.
Metrics alone are insufficient.

Objective:

Identify and fix the bottleneck using logs/traces.

Concepts:

- logging
- spans
- annotations
- trace timeline

Player tools:

- event log
- per-order timeline
- machine utilization
- queue history

### Final Challenge: Production Day

Everything is active:

- failures
- retries
- urgent orders
- fragile orders
- limited machines
- rate limits
- timeouts
- maintenance windows
- hidden bottlenecks

Objective example:

- Ship 200 orders.
- Urgent success rate >= 90%.
- Failed orders <= 10.
- Average wait time <= 20 seconds.
- Retry budget <= 300.

This should feel open-ended and optimization-heavy.

---

## 13. Scoring and Metrics

### Core metrics

```ts
interface Metrics {
  readonly shippedOrders: number
  readonly failedOrders: number
  readonly averageWaitTime: number
  readonly urgentSuccessRate: number
  readonly retryCount: number
  readonly machineUtilization: Record<string, number>
  readonly maxQueueDepth: number
  readonly overloadEvents: number
}
```

### Ratings

- Bronze: Pass core objective
- Silver: Pass efficiently
- Gold: Strong optimization
- Platinum: Near-optimal solution

### Example score formula

```text
Score =
  shippedOrders * 100
  - failedOrders * 250
  - averageWaitTime * 10
  - retryCount * 5
  - maxQueueDepth * 3
  - overloadEvents * 100
  + urgentOrdersOnTime * 150
```

Scoring should reinforce good systems behavior, not just raw throughput.

---

## 14. Player Feedback

### During simulation

The player sees:

- orders moving
- machine state changes
- queue depth
- machine utilization
- errors
- retry attempts
- deadline bars
- throughput
- event log

### Event log example

```text
[00:04.120] Order #12 started cutting
[00:05.900] Cutter failed for Order #12
[00:06.000] Retrying Order #12 in 500ms
[00:06.500] Order #12 restarted cutting
[00:08.200] Order #12 completed cutting
```

### After simulation

Example failure feedback:

```text
Result: Failed
Reason:
Urgent success rate was 72%.
Required: 90%.
Observation:
Urgent orders are waiting behind standard orders.
Suggestion:
Consider changing how orders are selected from the queue.
```

Feedback should point to the problem, not immediately give the exact solution.

---

## 15. Technical Architecture

### Core principle

The architecture should enforce this invariant:

> The simulation is authoritative. The renderer is a replay of simulation events. The player only influences the simulation through the provided Effect API.

High-level architecture:

```text
Player Code
   ↓ calls
Game API / Effect Services
   ↓ emits
Simulation Events
   ↓ consumed by
Simulation State + Visual Renderer
```

Do not allow:

```text
Player Code → directly moves boxes on screen
```

### Browser architecture

```text
┌──────────────────────────────────────┐
│ Browser UI                           │
│                                      │
│  Code Editor                         │
│  Factory Renderer                    │
│  Metrics Panel                       │
│  Event Log                           │
└───────────────────┬──────────────────┘
                    │ run code
                    ▼
┌──────────────────────────────────────┐
│ Sandbox Worker                       │
│                                      │
│  Player Program                      │
│  Effect Runtime                      │
│  Game API Services                   │
│  Simulation Engine                   │
└───────────────────┬──────────────────┘
                    │ posts events
                    ▼
┌──────────────────────────────────────┐
│ Main Thread Renderer                 │
│                                      │
│  Applies SimEvents                   │
│  Animates orders/machines/queues     │
│  Updates metrics                     │
└──────────────────────────────────────┘
```

---

## 16. Simulation Events

The simulation should emit typed events.

Example MVP event model:

```ts
export type SimEvent =
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
      readonly type: "StepQueued"
      readonly orderId: string
      readonly step: Step
      readonly queueId: string
      readonly time: number
    }
  | {
      readonly type: "StepStarted"
      readonly orderId: string
      readonly step: Step
      readonly machineId: string
      readonly time: number
    }
  | {
      readonly type: "StepCompleted"
      readonly orderId: string
      readonly step: Step
      readonly machineId: string
      readonly fromState: OrderState
      readonly toState: OrderState
      readonly time: number
    }
  | {
      readonly type: "StepFailed"
      readonly orderId: string
      readonly step: Step
      readonly machineId: string
      readonly error: MachineError
      readonly attempt: number
      readonly recoverable: boolean
      readonly time: number
    }
  | {
      readonly type: "OrderShipped"
      readonly orderId: string
      readonly time: number
    }
  | {
      readonly type: "OrderFailed"
      readonly orderId: string
      readonly reason: string
      readonly time: number
    }
```

The renderer should only need this event stream. Metrics should be derived from the event stream rather than emitted as authoritative `MetricChanged` events.

---

## 17. Timing Model

### Recommended long-term model

Use virtual simulation time.

The game owns the clock.

Example:

```text
Cutter process time: 2 simulated seconds
```

The renderer can replay at:

- 0.5x
- 1x
- 2x
- 5x
- instant

### Why virtual time

Virtual time makes runs:

- deterministic
- replayable
- fast-forwardable
- testable
- scoreable

### Recommended execution style

The cleanest model is:

```text
Run player program against virtual simulation
       ↓
Produce event timeline
       ↓
Calculate metrics
       ↓
Replay event timeline visually
```

The UI may still stream events as they are generated, but the renderer should treat them as timestamped playback data.

---

## 18. Player Code Execution

### Player code export

The player writes:

```ts
export const program = Effect.gen(function* () {
  const factory = yield* Factory
  yield* Effect.forever(
    Effect.gen(function* () {
      const order = yield* factory.takeOrder
      const cut = yield* factory.processStep(order, "cut")
      yield* factory.ship(cut)
    })
  )
})
```

The game expects:

```ts
export const program: Effect.Effect<void, unknown, Factory>
```

The level runner provides the actual Factory implementation.

### Game API service

Conceptual Effect service:

```ts
import { Context, Effect } from "effect"

export class Factory extends Context.Tag("Factory")<
  Factory,
  {
    readonly takeOrder: Effect.Effect<Order>
    readonly processStep: (
      order: Order,
      step: Step
    ) => Effect.Effect<Order, MachineError>
    readonly ship: (
      order: Order
    ) => Effect.Effect<void, ShippingError>
  }
>() {}
```

### Runtime execution

Conceptual:

```ts
Effect.runPromise(
  program.pipe(
    Effect.provide(levelLayer)
  )
)
```

The levelLayer contains the simulation-backed implementation of the game API.

---

## 19. Simulation-to-Visual Bridge

When player code calls:

```ts
yield* factory.processStep(order, "cut")
```

The simulation implementation should:

- reserve a cutter
- emit StepQueued if needed
- emit StepStarted
- advance virtual time
- possibly fail
- emit StepFailed or StepCompleted
- release the machine
- return updated order or fail with typed error

Example conceptual implementation:

```ts
const processStep = (order: Order, step: Step) =>
  Effect.gen(function* () {
    const machine = yield* reserveMachine(step)
    yield* emit({
      type: "StepStarted",
      orderId: order.id,
      step,
      machineId: machine.id,
      time: yield* currentSimTime
    })
    yield* sleepSim(machine.processTime)
    const result = yield* maybeFail(machine, order, step)
    if (result._tag === "Failure") {
      yield* emit({
        type: "StepFailed",
        orderId: order.id,
        step,
        machineId: machine.id,
        error: result.error,
        attempt: result.attempt,
        recoverable: result.recoverable,
        time: yield* currentSimTime
      })
      return yield* Effect.fail(result.error)
    }
    yield* emit({
      type: "StepCompleted",
      orderId: order.id,
      step,
      machineId: machine.id,
      time: yield* currentSimTime
    })
    return updateOrderProgress(order, step)
  }).pipe(
    Effect.ensuring(releaseMachine(machine))
  )
```

The renderer does not know or care why the event happened.

---

## 20. Renderer Design

The renderer maintains derived visual state.

Example:

```ts
interface VisualState {
  readonly orders: Record<string, VisualOrder>
  readonly machines: Record<string, VisualMachine>
  readonly queues: Record<string, VisualQueue>
  readonly metrics: Metrics
}
```

It applies events:

```ts
function applyEvent(state: VisualState, event: SimEvent): VisualState {
  switch (event.type) {
    case "OrderCreated":
      return addOrderAtDock(state, event.orderId)
    case "StepStarted":
      return moveOrderToMachine(state, event.orderId, event.machineId)
    case "StepCompleted":
      return markMachineComplete(state, event.machineId)
    case "OrderShipped":
      return moveOrderToShipping(state, event.orderId)
  }
}
```

The renderer should not validate simulation rules. It simply visualizes authoritative events.

---

## 21. Sandbox and Security

Player code is untrusted.

Assume it may try to:

- access DOM
- access network
- run infinite loops
- allocate huge memory
- spam events
- escape imports
- block execution

### MVP sandbox

Use:

- Web Worker
- restricted imports
- execution timeout
- event count limit
- simulated time limit
- worker termination

### Limits

Example:

```ts
const limits = {
  maxWallClockMs: 5000,
  maxSimTimeMs: 180_000,
  maxEvents: 50_000,
  maxOrders: 1_000,
  maxActiveFibers: 500
}
```

### Bad code examples to test

```ts
while (true) {}
export const program = Effect.forever(Effect.succeed(undefined))
```

Both should fail safely.

---

## 22. Code Compilation Strategy

Player TypeScript needs to be compiled and executed.

Possible stack:

- Monaco editor
- esbuild-wasm or swc-wasm
- Web Worker runtime
- virtual imports for "effect" and "game"

### Import control

Player code may write:

```ts
import { Effect, Schedule } from "effect"
import { Factory } from "game"
```

The game should control these imports.

### Possible approaches

#### Approach A: Virtual imports

Rewrite imports during compilation.

```ts
import { Effect } from "effect"
import { Factory } from "game"
```

becomes controlled access to runtime-provided modules.

#### Approach B: Worker import map / bundled runtime

Bundle Effect and the game API into the worker and resolve imports there.

#### Approach C: Function wrapper

Useful for early prototypes, less ideal long-term.

```ts
new Function("Effect", "Schedule", "Factory", compiledCode)
```

For MVP, function wrapping may be fastest. For a real product, virtual imports or a bundled worker are better.

---

## 23. Determinism

Runs should be deterministic.

Use:

- seeded random number generator
- virtual time
- fixed level config
- deterministic machine queue ordering
- deterministic event ordering

Avoid simulation usage of:

```ts
Math.random()
Date.now()
performance.now()
```

Expose game-controlled alternatives if needed:

```ts
factory.random
factory.clock.now
```

---

## 24. MVP Scope

### MVP goal

Prove the core loop:

- write code
- run simulation
- watch factory
- read metrics
- improve code

### MVP should include

- simple factory renderer
- event timeline playback
- basic level UI
- Monaco editor
- trusted or semi-sandboxed code execution
- Effect-powered game API
- first 3-5 levels
- basic pass/fail metrics

### MVP levels

1. First Shipment
   - Process one order.
2. Keep Working
   - Use a long-running controller.
   - Effect.forever.
3. Use the Whole Line
   - Sequential processing is too slow.
   - Effect.fork.
4. Flaky Cutter
   - Machine failures.
   - catchTag / retry.
5. Retry Storm
   - Naive retry overloads machine.
   - bounded retry / backoff.

### MVP non-goals

Do not build early:

- accounts
- leaderboards
- custom level editor
- complex art
- Factorio-like placement
- large factory layouts
- advanced traces
- Layer-heavy challenges
- multiplayer

---

## 25. Recommended Prototype Order

### Prototype 1: Hardcoded event renderer

Goal:

events -> visual state -> animated factory

Build:

Order Dock -> Cutter -> Shipping

Acceptance criteria:

- A box moves from dock to cutter to shipping.
- The cutter changes idle/working state.
- Playback can play, pause, and reset.

### Prototype 2: Simulation generates events

Goal:

simulation -> events -> renderer

No user code yet.

Hardcode an internal controller that processes two orders.

Acceptance criteria:

- The renderer does not care whether events are hardcoded or generated.
- Metrics can be calculated from generated events.

### Prototype 3: Effect internally

Goal:

Effect controller -> game API -> simulation events

Still no editor.

Use hardcoded Effect program:

```ts
const program = Effect.gen(function* () {
  const factory = yield* Factory
  const order = yield* factory.takeOrder
  const cut = yield* factory.processStep(order, "cut")
  yield* factory.ship(cut)
})
```

Acceptance criteria:

Effect service calls emit the same visual events.

### Prototype 4: Monaco editor, trusted code

Goal:

editor code -> run -> factory changes

No robust sandbox yet.

Acceptance criteria:

- Player edits code.
- Presses Run.
- Factory responds to exported program.

### Prototype 5: Worker sandbox

Goal:

untrusted code runs safely

Add:

- Web Worker
- timeout
- event limits
- simulated time limits
- restricted imports
- worker termination

Acceptance criteria:

- Infinite loops are stopped.
- Valid code still runs.

### Prototype 6: First playable level

Goal:

objective + starter code + pass/fail

Level:

First Shipment
Ship 1 order.

Acceptance criteria:

A user can understand the objective, run code, pass, fail, and reset.

### Prototype 7: Stream level

Goal:

player learns the controller must keep running

Level:

Keep Working
Ship 10 orders.

Acceptance criteria:

- One-order solution fails visibly.
- Effect.forever-style solution passes.

### Prototype 8: Concurrency level

Goal:

player sees sequential vs concurrent throughput

Level:

Use the Whole Line
Ship 10 orders within 45 seconds.

Acceptance criteria:

- Sequential solution is correct but too slow.
- Forked solution improves throughput visibly.

### Prototype 9: Failure/retry level

Goal:

typed failures become meaningful

Level:

Flaky Cutter
Ship enough orders despite failures.

Acceptance criteria:

- Unhandled errors fail.
- Retry/catch logic improves result.

### Prototype 10: Retry storm level

Goal:

naive retry is insufficient

Acceptance criteria:

- Aggressive retry creates visual overload.
- Backoff/bounded retry performs better.

---

## 26. Suggested Initial Repository Structure

If starting fresh:

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

But for the first prototype, avoid over-structuring.

---

## 27. First Codex Task

The first implementation task should be intentionally narrow:

Build the first Fiber Factory vertical slice.

Goal:

Create a hardcoded event timeline and a simple visual factory renderer.

Do not add user code, Monaco, sandboxing, or Effect yet.

Factory:

Order Dock -> Cutter -> Shipping

Requirements:

- Define a typed SimEvent model.
- Create a demoTimeline.
- Create visual state derived from events.
- Render Dock, Cutter, Shipping, and order boxes.
- Add play/pause/reset controls.
- Cutter should visibly switch between idle and working.
- Orders should visibly move or at least change location/status.
- Keep the renderer event-driven so the hardcoded timeline can later be replaced by a real simulation.

---

## 28. Key Risks

### Risk 1: Effect complexity overwhelms players

Mitigation:

- guided onboarding
- limited API per level
- optional hints
- post-level explanations

### Risk 2: It feels like a tutorial, not a game

Mitigation:

- open-ended objectives
- visual feedback
- multiple possible strategies
- score optimization
- challenge levels

### Risk 3: Player code execution becomes too complex too early

Mitigation:

- prototype renderer first
- simulation second
- Effect third
- editor fourth
- sandbox fifth

### Risk 4: Visuals and simulation get coupled

Mitigation:

- event stream as the contract
- simulation authoritative
- renderer as replay

### Risk 5: Unbounded concurrency makes results unstable

Mitigation:

- virtual time
- deterministic queues
- active fiber limits
- event count limits
- clear scoring constraints

---

## 29. Core Design Rule

The most important rule for the entire project:

> The player writes the controller. The simulation owns the world. The renderer replays what happened.

Everything should serve that structure.

That keeps the game close to Elevator Saga, makes the visual system meaningful, and gives Effect TS a natural reason to exist inside the design.
