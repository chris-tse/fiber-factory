# Fiber Factory

Fiber Factory is a programming game about writing Effect TS code to orchestrate work through a fixed visual factory. This context defines the game-domain language used in specs, UI copy, and implementation discussions.

## Language

**Factory Program**:
The player-authored Effect TS entrypoint that orchestrates factory work through the Factory API.
_Avoid_: Controller, script, bot, automation code, player code

**Factory**:
The simulated production system for a level, including machines, queues, orders, timing rules, and failure rules.
_Avoid_: Map, renderer, visual factory

**Factory Layout**:
The fixed visual arrangement of stations and paths shown to the player.
_Avoid_: Factory, map, level

**Factory API**:
The player-facing Effect service exposed to the Factory Program.
_Avoid_: Internal simulation API, renderer API, game engine

**Order**:
A customer request represented by one moving work token as it progresses through the Factory.
_Avoid_: Job, ticket, package, work item

**Order Summary**:
A read-only player-visible snapshot/reference for an Order, used when the Factory Program needs to inspect or select Orders without accessing authoritative Factory state.
_Avoid_: Mutable order object, simulator order, internal order state

**Active Order**:
A Factory Program-held Order value returned by `takeOrder`, typed by current Order State and accepted by Factory API Methods that process or ship Orders.
_Avoid_: Order summary, backlog order, mutable order object

**Work Token**:
The visual representation of an Order in the Factory Layout.
_Avoid_: Part, ingredient, inventory item, component

**State Visual**:
The visual form of a Work Token that communicates its current Order State while preserving the Order's identity.
_Avoid_: Separate item, new order, unrelated sprite

**Station**:
A node in the Factory Layout graph where Work Tokens can wait, be processed, or leave the factory.
_Avoid_: Machine, building, component

**Machine**:
A Station that performs a timed processing step and may have capacity, failure, cooldown, or rate-limit behavior.
_Avoid_: Station, node, worker

**Output Station**:
The Station that attempts to submit or fulfill an Order as completed.
_Avoid_: Shipper, sink, exit

**Entry Station**:
The Station that visually hosts the Backlog and where untaken Orders appear.
_Avoid_: Separate backlog UI, source, spawner

**Connection**:
A directed edge in the Factory Layout graph that shows a valid movement path between Stations.
_Avoid_: Belt, route, transport lane, conveyor

**Step**:
A required kind of work an Order must complete, such as cut, assemble, inspect, package, or ship.
_Avoid_: Task, operation, job

**Station Selection**:
A Factory Program decision to choose a specific Station or Machine instead of asking the Factory API to choose one by Step.
_Avoid_: Routing, pathfinding, layout control

**Machine Handle**:
A first-class reference to a specific Machine used only when machine identity or parallel machine choice is an intentional mechanic.
_Avoid_: Default machine API, station selection option

**Dispatching**:
The Factory Program act of taking Orders from the Backlog and starting their processing workflows.
_Avoid_: Machine parallelism, routing, scheduling

**Backlog**:
The selectable pool of Orders waiting to be taken by the Factory Program.
_Avoid_: Queue, FIFO queue, dock queue, order queue

**Station Queue**:
Orders waiting at a Station or Machine because that Station cannot process them immediately.
_Avoid_: Backlog, Effect Queue, queue

**Order State**:
The current workflow state of an Order, used to determine which Steps are valid next.
_Avoid_: Status, progress, completed steps

**Order Trait**:
A stable property of an Order that affects priority, timing, processing, or failure behavior.
_Avoid_: Order type, order state, workflow state, rework

**Invalid Step Request**:
A Factory Program contract violation where it asks the Factory API to perform a Step that is not valid for the Order's current Order State.
_Avoid_: Machine failure, failed order, quality rejection

**Factory API Failure**:
A typed, recoverable game-logic outcome returned by a Factory API Method through the Effect error channel, such as no Orders being available or a selected Order no longer being in the Backlog.
_Avoid_: runtime exception, contract violation, simulation event

**Factory Program Defect**:
A player-authored Factory Program bug or public value contract violation surfaced as Run diagnostics, such as using a stale Active Order value or a forged public value.
_Avoid_: Factory API failure, machine failure, simulation event

**Factory API Method**:
A flat named Factory API capability that performs one domain transition or action and returns an Effect.
_Avoid_: Nested service command, generic processStep, simulator command

**Production-Shaped API**:
A Factory API surface that resembles transferable Effect application code without adding unnecessary nesting or game-specific scripting ceremony.
_Avoid_: Toy command API, deeply nested fake service API

**Domain-Only Factory API**:
A Factory API boundary that exposes factory actions and observations while leaving orchestration to normal Effect primitives in the Factory Program.
_Avoid_: Orchestration helper API, simulator convenience API

**Level-Scoped Factory API**:
The available Factory API Methods for a Level, determined by the Factory's Stations, Machines, Output Station, and active mechanics.
_Avoid_: Arbitrary unlock, global API surface, tutorial gate

**Starter Pattern**:
Example Factory Program code provided by a level to demonstrate normal Effect composition without adding hidden game helper APIs.
_Avoid_: Imported game helper, canned solution, orchestration shortcut

**Simulation Event**:
A timestamped domain fact emitted by the Factory and consumed by the renderer to derive visuals and metrics.
_Avoid_: Visual command, renderer instruction, animation command

**Metric Projection**:
A derived measurement calculated from Simulation Events.
_Avoid_: MetricChanged event, authoritative metric state

**Playback Projection**:
A renderer-facing interpretation of Simulation Events that derives visual state, animation spans, or timeline segments for playback without becoming authoritative Factory state.
_Avoid_: simulation event, renderer command, game rule

**Machine Failure**:
A recoverable Machine-level failure produced while attempting a valid Step.
_Avoid_: Invalid step request, quality rejection, failed order

**Failed Step Attempt**:
A recorded unsuccessful attempt to perform a Step for an Order without changing that Order's identity or advancing its Order State.
_Avoid_: Failed order, new order, silent retry

**Quality Rejection**:
An inspection outcome where an Order does not pass quality checks but may be eligible for repair or rework.
_Avoid_: Machine failure, failed order

**Overload**:
A Factory condition caused by excessive demand on a Machine or Station Queue.
_Avoid_: Machine failure, failed order

**Expired Order**:
An Order that missed its deadline.
_Avoid_: Failed order, timed-out operation

**Failed Order**:
A terminal Order outcome where the Order can no longer be shipped for Pass Objective evaluation.
_Avoid_: Machine failure, quality rejection, expired order

**Pass Objective**:
The required condition a Run must satisfy for the player to pass a Level.
_Avoid_: Rating, optimization score, scoring formula

**Throughput Objective**:
A level objective requiring a number of Orders to ship within a simulation time limit.
_Avoid_: Order deadline, stage SLA

**Order Deadline**:
A per-Order time by which that Order must be shipped to count as on time.
_Avoid_: Throughput objective, operation timeout

**Stage SLA**:
A per-Step or per-Station maximum time an Order may spend before the Factory Program should interrupt, retry, or reroute it.
_Avoid_: Order deadline, level time limit

**Virtual Simulation Time**:
Game-owned time used to timestamp Simulation Events and calculate durations, scores, playback, and objectives independently of browser wall-clock time.
_Avoid_: Wall-clock time, animation time, real time

**Run**:
One execution of a Factory Program against a Level, producing a Simulation Event timeline and Metric Projections.
_Avoid_: Playback, replay, animation, attempt when referring only to visuals

**Level**:
A playable challenge that defines the Factory, Factory Layout, available Factory API, objectives, starter Factory Program, hints, and scoring rules for a Run.
_Avoid_: Factory, layout, map, scenario

## Relationships

- A **Factory Program** can affect the factory only through the Factory API.
- A **Level** provides the challenge configuration for a **Run**.
- A **Level** contains a **Factory** and **Factory Layout**, but is not the same thing as either one.
- A **Level** may restrict which **Factory API Methods** are available.
- A **Level-Scoped Factory API** should be derived from the **Level's** available **Stations**, **Machines**, **Output Station**, and mechanics.
- A **Level** should not hide or reveal **Factory API Methods** as arbitrary unlocks.
- Player-facing Factory API types should be level-scoped so autocomplete and type-checking show only the **Factory API Methods** available in the current **Level**.
- A **Level** defines a **Pass Objective** and may later define ratings or scoring rules.
- A **Level** may provide **Starter Patterns** and hints.
- A **Factory** owns the authoritative rules and state for a level.
- A **Factory Layout** visualizes the available stations and paths but does not define behavior by itself.
- A **Factory API** is the only way a **Factory Program** can influence a **Factory**.
- An **Order** is represented by exactly one **Work Token** in the MVP and core game.
- An **Order Summary** may expose visible facts such as Order identity, Order Traits, and visible timing constraints, but should not expose hidden or mutable Factory state.
- The **Factory** resolves an **Order Summary** back to authoritative **Order** state internally, usually by Order identity, and validates that the requested action is still legal.
- `takeOrder()` or `takeOrder(orderSummary)` should return an **Active Order**, not another **Order Summary**.
- Early `ship(activeOrder)` should complete the active workflow and return `void`; the shipped outcome is recorded by an `OrderShipped` **Simulation Event** and projected metrics.
- A later shipped-order or receipt value should be introduced only if downstream mechanics need the **Factory Program** to compose with the shipped result.
- **Order Summaries** and **Active Orders** may both expose stable visible **Order Traits**.
- Public **Order Summary** and **Active Order** values should be immutable snapshots/references; successful **Step** methods return new typed **Active Order** values rather than mutating the previous public value.
- **Factory API Methods** such as `cut`, `assemble`, and `ship` should accept **Active Orders** typed by valid **Order State**, so invalid Step ordering can be represented in TypeScript where practical.
- A **Work Token** may show badges for Order Traits, completed steps, next step, attempts, or deadline.
- A **Work Token** may change **State Visuals** as its **Order State** changes, as long as the player can still recognize it as the same Order.
- A **Factory Layout** is a graph of **Stations**.
- A **Machine** is a kind of **Station**.
- An **Entry Station** is a **Station** that represents where **Backlog** Orders appear in the **Factory Layout**.
- An **Output Station** is a **Station**, but does not have to be a **Machine** unless the level gives fulfillment timing, capacity, or failure behavior.
- A **Connection** determines valid visual movement between **Stations**.
- A **Connection** does not have transport time, capacity, or congestion behavior unless a level intentionally introduces those as explicit mechanics.
- **Connections** are infinitely fast for MVP/core simulation timing; visual movement along a **Connection** is playback animation, not simulated transport duration.
- In early levels, a **Level** defines the shared required **Steps** for every **Order**.
- Early levels may derive shared required **Steps** from the **Level's** mandatory processing **Machines**; for example, a cutter-only level requires `cut`, while a cutter-plus-assembler level requires `cut` then `assemble`.
- A **Level** owns the required workflow; the mere presence of a **Machine** should not automatically make its **Step** required once optional or recovery **Machines** exist.
- Early levels should let the **Factory Program** request processing by **Step** and let the **Factory** choose an eligible **Machine**.
- Later levels may introduce **Station Selection** when multiple **Machines** can perform the same **Step** with meaningful tradeoffs.
- Prototype and early-level **Station Selection** should use method options, such as `factory.cut(order, { station: "fast-cutter" })`.
- **Machine Handles** may be introduced later when multiple machines, machine identity, or parallelism make them worth modeling explicitly.
- **Dispatching** is how the **Factory Program** starts enough active Order workflows to keep the **Factory** busy.
- `Effect.fork` should be taught as a way for the **Factory Program** to continue **Dispatching** while existing Orders are still being processed, not as the thing that makes Machines capable of parallel work.
- **Dispatching** is explanatory domain language, not a dedicated Factory API helper; the **Factory Program** dispatches by taking Orders and composing normal Effect primitives.
- The **Backlog** contains Orders not yet taken by the **Factory Program**.
- The **Backlog** is a selectable pool, not a FIFO queue; the **Factory Program** may choose which available **Order** to take when order choice is an active mechanic.
- The **Backlog** may be shown visually at the **Entry Station** rather than as a separate UI element.
- In early levels where **Order** choice is not meaningful, `takeOrder()` may take an unspecified available **Order** without promising FIFO semantics.
- Later levels may allow `takeOrder` to specify a particular **Order** when selection from the **Backlog** is an intentional mechanic.
- Levels that make **Backlog** selection meaningful should expose available **Orders** as data through a deliberate **Factory API** observation before requiring the **Factory Program** to choose which **Order** to take.
- Backlog selection observations should return player-visible **Order Summaries**, not mutable internal simulator objects or hidden Factory state.
- A later-level `takeOrder(order)` request should take exactly the specified **Order** or fail with a typed unavailable/not-in-Backlog error; it should not silently substitute another **Order**.
- `takeOrder()` should have a stable immediate contract: take an available **Order** or fail with a typed no-Orders-available error.
- Empty Backlog and selected-Order-unavailable outcomes are recoverable **Factory API Failures**, not **Factory Program Defects**.
- Some **Factory API Failures** reject the requested API action before a Factory attempt begins, such as empty **Backlog** or unavailable selected **Order**.
- Some **Factory API Failures** are valid accepted Factory calls whose requested operation fails during Factory execution, such as a **Machine Failure** during a valid **Step** attempt.
- Continuous arrival levels should model **Orders** entering the **Backlog** over **Virtual Simulation Time** rather than changing `takeOrder()` to wait implicitly.
- Waiting for future **Orders** should be expressed through normal Effect retry/scheduling or an explicit later-level observation/wait API when that mechanic is intentionally taught.
- A **Station Queue** contains Orders waiting for a specific **Station** or **Machine**.
- "Queue" should be reserved for the Effect data structure unless the context clearly refers to a visual **Station Queue**.
- In early levels, a **Factory API Method** requested against a busy **Machine** waits through the **Station Queue** and resolves when the requested **Step** completes.
- A **Factory API Method** that performs a **Step** resolves on completed domain transition, returning the **Order** in its next valid **Order State**, not when the Order merely enters a **Station Queue**.
- The **Factory** owns busy-Machine queueing; the **Factory Program** should keep the **Factory** busy through **Dispatching** with normal Effect primitives rather than by manually managing **Station Queues**.
- **Station Queue** details should not be visible through the baseline **Factory API**; queue observation may become a later-Level or endgame mechanic when queue-aware scheduling is the intended challenge.
- A **Machine** transforms an **Order** from one **Order State** to another.
- A **Machine Failure** can occur only after a **Factory API Method** has accepted a valid **Step** request and the **Machine** attempts that **Step**.
- A **Machine Failure** should fail the corresponding **Factory API Method** through the Effect error channel because the requested **Order State** transition did not complete.
- A **Machine Failure** should also produce a **Failed Step Attempt** in the **Simulation Event** stream because the failed attempt happened inside the **Factory** and may affect visuals, metrics, attempts, time, or later retry decisions.
- A **Failed Step Attempt** preserves the **Order's** identity and leaves the **Order** in its prior **Order State** unless a Level explicitly introduces a different recovery mechanic.
- A **Failed Step Attempt** consumes **Virtual Simulation Time** and Machine capacity like a real processing attempt, so retries are not free.
- A failed Machine attempt should emit both a **Step** start fact and a **Failed Step Attempt** fact so playback can show the Machine beginning work and then failing.
- A **Failed Step Attempt** does not invalidate the current public **Active Order** by default; the **Factory Program** may retry the same **Active Order** value because the requested successful state transition did not occur.
- A **Machine Failure** does not need to return a replacement **Active Order** unless a later mechanic makes failed attempts mutate player-visible **Order** data that the **Factory Program** must compose with.
- Failed attempt counts should not be part of baseline **Active Order** data; attempts are visible through **Simulation Events**, projections, diagnostics, or later Level-specific observation APIs when attempt-aware behavior is the intended mechanic.
- **Machine Failure** should start as a generic recoverable error category with Machine- or Level-defined reason metadata rather than a top-level union of every specific failure reason.
- Specific typed Machine failure reasons should become first-class API types only when a Level expects the **Factory Program** to branch on them as an intentional mechanic.
- **Machine Failures** should be retryable with normal Effect retry and scheduling primitives rather than a Factory-specific retry helper.
- **Machine Failure** is not a catch-all for negative outcomes; **Invalid Step Requests**, **Quality Rejections**, **Expired Orders**, **Overload**, and terminal **Failed Orders** remain separate concepts.
- Valid **Order State** transitions should be represented in TypeScript types where practical.
- An **Order Trait** stays with an **Order** across state transitions.
- `urgent`, `fragile`, and `bulk` are **Order Traits**; `standard` means the absence of special **Order Traits**.
- `raw`, `cut`, `assembled`, `inspected`, and `rework` are **Order States**.
- `repair` is a **Step** and **Factory API Method** that transforms a rework **Order State** back into a processable **Order State**.
- An **Invalid Step Request** should be reported as a **Factory Program** contract violation rather than a normal recoverable domain failure.
- Stale or forged **Active Order** values are **Factory Program Defects** surfaced through Run diagnostics, not recoverable **Factory API Failures**.
- Baseline **Simulation Events** should record accepted Factory domain facts; **Factory API Failures** and **Factory Program Defects** should be surfaced through player-facing API results or Run diagnostics rather than metric/renderer event projections.
- A **Factory API Method** should usually be a flat named method such as `factory.cut(order)` or `factory.inspect(order)`.
- Generic step processing such as `processStep(order, "cut")` may exist internally, but should not be the default player-facing API.
- A **Production-Shaped API** should make Factory Programs look like real Effect orchestration code while avoiding noisy nesting like `factory.cutting.cut(order)` unless that structure becomes meaningfully useful.
- A **Domain-Only Factory API** should not include helpers such as `processForever`, `takeAndFork`, `withRetry`, or `processConcurrently`; those patterns should be expressed with Effect primitives.
- If a mechanic is absent from a **Level**, its **Factory API Methods** should be absent too.
- A **Starter Pattern** may define local helper functions, but should not rely on orchestration helpers imported from the game.
- A **Simulation Event** describes what happened in the **Factory**; it should not tell the renderer which sprite, animation, or CSS state to use.
- A **Playback Projection** may translate **Simulation Events** into renderer-friendly visual state or animation spans.
- A **Playback Projection** is downstream of **Simulation Events** and should not decide Factory rules, Step validity, timing, or objective results.
- `OrderCreated` means an **Order** became available in the **Backlog** at a **Virtual Simulation Time**; initial batch levels emit these events at `t=0`, while continuous arrival levels may emit later `OrderCreated` events.
- `OrderTaken` is a **Simulation Event** because it records an **Order** leaving the **Backlog** and entering an active Factory Program workflow.
- A `StepQueued` **Simulation Event** should be introduced when Station Queue behavior is exercised by a prototype or Level, not before.
- A **Metric Projection** should be derived from **Simulation Events** rather than emitted as authoritative metric changes.
- **Throughput Objectives** should be evaluated from timestamped **Simulation Events** in **Virtual Simulation Time**, such as counting `OrderShipped` events before a Level time limit.
- Visual playback should derive from the same **Simulation Event** timestamps used by **Metric Projections**, without making renderer timing authoritative for throughput.
- A completed **Step** is the normal **Simulation Event** that changes **Order State**.
- A **Failed Step Attempt** should be queryable and listenable through emitted **Simulation Events** so the Factory Program and UI can react to attempts, recoverability, and failure details.
- A **Failed Step Attempt** keeps the same **Order** identity and does not advance **Order State**.
- A separate Order State change event should exist only when **Order State** changes outside normal **Step** completion.
- **Machine Failure**, **Quality Rejection**, **Overload**, and **Expired Order** are events or conditions; a **Failed Order** is a terminal outcome.
- Prototype and early MVP **Machine Failures** should be recoverable **Failed Step Attempts**; terminal **Failed Orders** are deferred.
- A **Quality Rejection** should carry the rejected **Order** in a rework **Order State** so the **Factory Program** can choose a repair workflow.
- Prototype levels should expose only a **Pass Objective**, not ratings or numeric optimization scores.
- A **Throughput Objective** is about aggregate output for a level.
- An **Order Deadline** is about prioritizing a specific **Order**.
- A **Stage SLA** is about controlling the duration of a specific operation or wait.
- MVP timing pressure should start with **Throughput Objectives** before introducing **Order Deadlines** or **Stage SLAs**.
- **Virtual Simulation Time** advances according to Factory rules such as processing durations, waits, retry delays, cooldowns, and rate limits, not browser animation time.
- Prototype timelines should use **Virtual Simulation Time** from the start, even when events are hardcoded.
- A **Run** has one **Factory Program**, one level configuration, and eventually one deterministic seed.
- A **Run** executes one **Factory Program** against one **Level**.
- A **Run** produces one **Simulation Event** timeline and associated **Metric Projections**.
- Playback replays a **Run**; it does not create a new **Run**.

## Example dialogue

> **Dev:** "Can the **Factory Program** move an order directly to shipping?"
> **Domain expert:** "No. The **Factory Program** asks the Factory API to process or ship the order, and the simulation emits the resulting events."
>
> **Dev:** "When a fragile order fails inspection, do we create replacement parts?"
> **Domain expert:** "No. The same **Order** remains one **Work Token**; it may move to repair, gain an attempt badge, and return to inspection."
>
> **Dev:** "Can the token change from sheet metal to cut strips to an approved item?"
> **Domain expert:** "Yes. Those are **State Visuals** for the same **Work Token**, not separate domain entities."
>
> **Dev:** "Is Shipping a machine?"
> **Domain expert:** "Not by default. Shipping is an **Output Station** unless a level gives it timed, capacity-limited, or failing behavior."
>
> **Dev:** "Where do untaken Orders appear?"
> **Domain expert:** "At the **Entry Station**. It visually hosts the **Backlog**."
>
> **Dev:** "Can a slow connection become the bottleneck?"
> **Domain expert:** "Not in the core game. A **Connection** is a valid movement path, not a transport resource, unless a specific level introduces that mechanic."
>
> **Dev:** "Does a Work Token spend simulated time moving between Stations?"
> **Domain expert:** "No. **Connections** are infinitely fast in the core model; movement is visual playback, while simulated duration comes from processing, waits, retries, and other Factory rules."
>
> **Dev:** "Should the player pick the fast cutter directly?"
> **Domain expert:** "Not in early levels. The **Factory Program** starts by requesting a **Step** like `cut`; later levels may introduce **Station Selection** for fast-versus-safe machine tradeoffs."
>
> **Dev:** "Should station choice require fetching a machine object?"
> **Domain expert:** "Not in the prototype. Use method options for **Station Selection**. Introduce **Machine Handles** later only if specific machine identity becomes part of the puzzle."
>
> **Dev:** "Does `Effect.fork` make the factory parallel?"
> **Domain expert:** "No. The **Factory** can already run multiple Machines. `Effect.fork` lets the **Factory Program** keep **Dispatching** instead of waiting for one Order to finish."
>
> **Dev:** "Should the API have `factory.dispatch(...)`?"
> **Domain expert:** "No. **Dispatching** describes what the **Factory Program** is doing with normal Effect code; it is not a simulator helper method."
>
> **Dev:** "Can the Factory API provide `factory.processConcurrently(...)`?"
> **Domain expert:** "No. The **Factory API** should expose domain actions; concurrency belongs in the **Factory Program** as normal Effect code."
>
> **Dev:** "Can a level starter include `processOrder`?"
> **Domain expert:** "Yes, if it is a local **Starter Pattern** using normal Effect code. It should not be imported as a hidden game helper."
>
> **Dev:** "Should the simulation emit `SetTokenSprite`?"
> **Domain expert:** "No. It should emit a **Simulation Event** such as an Order State change; the renderer derives the State Visual."
>
> **Dev:** "Should the simulation emit `MetricChanged`?"
> **Domain expert:** "No. Metrics are **Metric Projections** calculated from **Simulation Events**."
>
> **Dev:** "Should every state change emit `OrderStateChanged`?"
> **Domain expert:** "Not by default. A completed **Step** usually carries the **Order State** transition; separate state-change events are only for transitions outside normal processing."
>
> **Dev:** "The queue is growing. Which one?"
> **Domain expert:** "If Orders were never taken, the **Backlog** is growing. If Orders are waiting at the cutter, the **Station Queue** is growing."
>
> **Dev:** "Can the **Factory Program** assemble an Order before it is cut and catch the error?"
> **Domain expert:** "No. That is an **Invalid Step Request**. Valid transitions should be represented by **Order State** types where practical; Effect errors are for real factory conditions."
>
> **Dev:** "Is a rework order a different type of Order?"
> **Domain expert:** "No. Rework is an **Order State**. A fragile urgent Order remains fragile and urgent while it moves into rework."
>
> **Dev:** "How does the **Factory Program** recover a rejected Order?"
> **Domain expert:** "A **Quality Rejection** carries the rejected Order in the `rework` **Order State**. The **Factory Program** may call the `repair` **Factory API Method** and inspect it again."
>
> **Dev:** "Is 'ship 10 Orders in 45 seconds' an Order deadline?"
> **Domain expert:** "No. That is a **Throughput Objective**. An **Order Deadline** belongs to one Order, while a **Stage SLA** belongs to a Step or Station."
>
> **Dev:** "Does the browser animation clock determine how long cutting takes?"
> **Domain expert:** "No. Cutting duration is measured in **Virtual Simulation Time**. The browser clock only controls playback."
>
> **Dev:** "Does pressing reset rerun the Factory Program?"
> **Domain expert:** "Not necessarily. Resetting playback returns to the beginning of the current **Run**; starting a new **Run** executes the **Factory Program** again."
>
> **Dev:** "Is the Factory Layout the level?"
> **Domain expert:** "No. The **Level** includes the **Factory Layout**, but also defines objectives, scoring, available API, starter code, and hints."
>
> **Dev:** "Why does this level not have `factory.inspect`?"
> **Domain expert:** "Because this **Level** has no Inspector or quality mechanic. The **Level-Scoped Factory API** comes from the Factory capabilities."
>
> **Dev:** "Should the player call `factory.cutting.cut(order)`?"
> **Domain expert:** "Usually no. Prefer flat **Factory API Methods** like `factory.cut(order)` unless nesting carries real gameplay or Effect-learning value."

## Flagged ambiguities

- "controller" was considered for the player-authored code, but rejected because it conflicts with common UI, MVC, and server terminology. Resolved: use **Factory Program**.
- "factory" was used to mean the simulated system, the visual layout, and the player-facing service. Resolved: use **Factory**, **Factory Layout**, and **Factory API** respectively.
- "order" could imply either a business request or a collection of physical parts. Resolved for MVP/core semantics: an **Order** is one request represented by one **Work Token**, not a recipe that expands into parts or inventory items.
- "work token" could imply an unchanging box. Resolved: a **Work Token** has persistent identity, but may use different **State Visuals** as the **Order State** changes.
- "machine" and "station" were blurred. Resolved: **Station** is the graph node; **Machine** is the subset of stations that perform timed and possibly failing processing.
- "backlog" could imply a separate UI list. Resolved: the **Entry Station** can visually host the **Backlog** in the Factory Layout.
- "connection" could imply a conveyor or transport resource. Resolved for MVP/core semantics: a **Connection** is only a valid visual movement edge unless a level explicitly makes transport a mechanic.
- "routing" could mean step choice, machine choice, or pathfinding. Resolved: early gameplay uses **Step** requests; later explicit machine choice is **Station Selection**; pathfinding is not a core mechanic.
- "machine handle" could make station choice feel like simulator object manipulation. Resolved: avoid **Machine Handles** in the prototype, but allow them later for meaningful parallel-machine mechanics.
- "parallelism" could imply Machines are sequential unless the player forks. Resolved: Machines may be physically parallel; `Effect.fork` controls whether the **Factory Program** keeps **Dispatching** new Order workflows while previous ones are active.
- "queue" was overloaded between visual waiting areas and Effect's `Queue`. Resolved: use **Backlog** for untaken Orders, **Station Queue** for visual waiting at Stations, and `Queue` for the Effect concept.
- "failure" was overloaded between machine errors, inspection outcomes, overload, missed deadlines, invalid API use, and terminal order outcomes. Resolved: use specific terms and reserve **Failed Order** for terminal scoring outcomes.
- "production-shaped" could imply deeply nested service hierarchy. Resolved: use flat named **Factory API Methods** that compose like real Effect code without unnecessary nesting.
- "Factory API" could grow orchestration helpers that hide Effect. Resolved: keep a **Domain-Only Factory API** and require orchestration to be expressed with Effect primitives.
- "starter code" could become hidden tutorial infrastructure. Resolved: use **Starter Patterns** as ordinary local Factory Program code, not imported game helpers.
- "event" could mean a domain fact or a renderer command. Resolved: **Simulation Events** are domain facts, not visual commands.
- "metrics" could become a second source of truth. Resolved: metrics are **Metric Projections** derived from **Simulation Events**.
- "deadline" could mean level time pressure, per-order urgency, or operation duration control. Resolved: use **Throughput Objective**, **Order Deadline**, and **Stage SLA** respectively.
- "time" could mean simulation time, wall-clock runtime, or animation playback. Resolved: gameplay durations use **Virtual Simulation Time**; browser time only controls playback and execution limits.
- "run" and "replay" could be confused. Resolved: a **Run** executes the **Factory Program** and produces events; playback only replays those events.
- "level" could mean the layout or the simulated factory. Resolved: a **Level** is the whole challenge package.
- "API unlock" could imply arbitrary tutorial gating. Resolved: use a **Level-Scoped Factory API** derived from actual Factory capabilities.
- "order type" mixed stable traits with workflow states. Resolved: use **Order Trait** for stable properties and **Order State** for workflow progress; rework is an **Order State**.
- "standard" was listed like a type. Resolved: standard means an **Order** has no special **Order Traits**.

## Project Notes

- The real Effect integration pressure test now exists as `prototypes/real-effect-api-prototype.ts` and runs through `bun run prototype:real-effect-api`.
- The prototype uses installed `effect@4.0.0-beta.70` and exercises `Effect.gen`, `Effect.all`, `Effect.retry`, typed errors, defects, and service construction against the Factory API shape.
- The real Effect API direction remains viable: recoverable **Machine Failures** compose with normal Effect retry/scheduling, stale **Active Order** use can surface as an Effect defect plus Run diagnostic, and a flat domain-only **Factory API** still reads production-shaped.
- The initial visual renderer prototype now exists under `prototypes/visual-renderer` and runs through `bun run prototype:visual-renderer`.
- The visual renderer direction is viable: a pure `VisualState` projection can reconstruct Work Tokens, Machine state, simple metrics, and renderer-facing movement spans from Simulation Events.
- Movement between Stations remains playback-only for the current prototype scope. It should not add Virtual Simulation Time, affect Pass Objective evaluation, or require Factory API changes unless a later Level intentionally makes transport a mechanic.
- The next major bridge to prove is replacing the hardcoded event list with generated Simulation Events while preserving the renderer contract.
- Do not add Monaco, sandboxing, or a full playable level before generated events can feed the visual renderer clearly enough to support playback, metrics, and debugging feedback.
- `repos/effect` is reference material only. Do not import directly from the subtree for Fiber Factory runtime or prototype code.
- Because `repos/effect` is a subtreed upstream source checkout, project verification should avoid treating it as Fiber Factory source or tests; `tsconfig.json` excludes `repos`, and the default test script targets Fiber Factory prototype tests.
