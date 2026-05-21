#!/usr/bin/env node

// PROTOTYPE - throwaway Effect-shaped Factory API bridge model check.
// Question: does the Factory API still read cleanly when public methods return
// Effect-shaped values, recoverable API failures use the error channel, and
// Factory Program defects are surfaced through Run diagnostics?

type OrderId = string
type OrderState = "raw" | "cut"
type OrderTrait = "urgent" | "fragile" | "bulk"
type Workflow = "backlog" | "active" | "shipped"

type OrderSummary = Readonly<{
  kind: "OrderSummary"
  orderId: OrderId
  traits: readonly OrderTrait[]
  snapshotVersion: number
}>

type ActiveOrder<State extends OrderState = OrderState> = Readonly<{
  kind: "ActiveOrder"
  orderId: OrderId
  state: State
  traits: readonly OrderTrait[]
  snapshotVersion: number
  freshnessToken: string
}>

type FactoryApiFailure =
  | { readonly type: "NoOrdersAvailable" }
  | { readonly type: "OrderUnavailable"; readonly orderId: OrderId }
  | { readonly type: "MachineFailure"; readonly machineId: string; readonly orderId: OrderId }

type FactoryProgramDefect =
  | {
      readonly type: "InvalidActiveOrder"
      readonly orderId: OrderId
      readonly expectedState: OrderState
      readonly actualState: OrderState | "missing"
      readonly actualWorkflow: Workflow | "missing"
      readonly expectedFreshnessToken: string | "missing"
      readonly actualFreshnessToken: string
    }

type SimEvent =
  | { readonly type: "OrderCreated"; readonly orderId: OrderId; readonly traits: readonly OrderTrait[]; readonly time: number }
  | { readonly type: "OrderTaken"; readonly orderId: OrderId; readonly time: number }
  | { readonly type: "StepQueued"; readonly orderId: OrderId; readonly step: "cut"; readonly machineId: string; readonly queueTime: number; readonly time: number }
  | { readonly type: "StepStarted"; readonly orderId: OrderId; readonly step: "cut"; readonly machineId: string; readonly time: number }
  | { readonly type: "StepFailed"; readonly orderId: OrderId; readonly step: "cut"; readonly machineId: string; readonly reason: "jammed"; readonly time: number }
  | {
      readonly type: "StepCompleted"
      readonly orderId: OrderId
      readonly step: "cut"
      readonly machineId: string
      readonly fromState: "raw"
      readonly toState: "cut"
      readonly time: number
    }
  | { readonly type: "OrderShipped"; readonly orderId: OrderId; readonly time: number }

type RunDiagnostic = { readonly type: "FactoryProgramDefect"; readonly reason: FactoryProgramDefect; readonly time: number }
type ApiFailureRecord = { readonly type: "FactoryApiFailure"; readonly error: FactoryApiFailure; readonly time: number }

type RuntimeOrder = {
  readonly id: OrderId
  readonly traits: readonly OrderTrait[]
  workflow: Workflow
  state: OrderState
  version: number
}

type BridgeState = Readonly<{
  time: number
  machineAvailableAt: number
  orders: readonly Readonly<RuntimeOrder>[]
  events: readonly SimEvent[]
  apiFailures: readonly ApiFailureRecord[]
  diagnostics: readonly RunDiagnostic[]
}>

type Exit<Value, Error> =
  | { readonly type: "Success"; readonly value: Value }
  | { readonly type: "Failure"; readonly error: Error }
  | { readonly type: "Defect"; readonly defect: FactoryProgramDefect }

class Effect<Value, Error = never> {
  private constructor(private readonly runEffect: () => Exit<Value, Error>) {}

  static succeed<Value>(value: Value): Effect<Value, never> {
    return new Effect(() => ({ type: "Success", value }))
  }

  static fail<Error>(error: Error): Effect<never, Error> {
    return new Effect(() => ({ type: "Failure", error }))
  }

  static defect(defect: FactoryProgramDefect): Effect<never, never> {
    return new Effect(() => ({ type: "Defect", defect }))
  }

  static sync<Value>(operation: () => Value): Effect<Value, never> {
    return new Effect(() => ({ type: "Success", value: operation() }))
  }

  static all<Effects extends readonly Effect<unknown, unknown>[]>(
    effects: Effects,
  ): Effect<
    { readonly [Index in keyof Effects]: Effects[Index] extends Effect<infer Value, unknown> ? Value : never },
    Effects[number] extends Effect<unknown, infer Error> ? Error : never
  > {
    type Values = { readonly [Index in keyof Effects]: Effects[Index] extends Effect<infer Value, unknown> ? Value : never }
    type Errors = Effects[number] extends Effect<unknown, infer Error> ? Error : never

    return new Effect<Values, Errors>(() => {
      const values: unknown[] = []
      for (const effect of effects) {
        const exit = effect.run()
        if (exit.type !== "Success") return exit as Exit<Values, Errors>
        values.push(exit.value)
      }
      return { type: "Success", value: values as Values }
    })
  }

  flatMap<NextValue, NextError>(next: (value: Value) => Effect<NextValue, NextError>): Effect<NextValue, Error | NextError> {
    return new Effect<NextValue, Error | NextError>(() => {
      const exit = this.run()
      if (exit.type !== "Success") return exit as Exit<NextValue, Error | NextError>
      return next(exit.value).run()
    })
  }

  map<NextValue>(next: (value: Value) => NextValue): Effect<NextValue, Error> {
    return this.flatMap((value) => Effect.succeed(next(value)))
  }

  run(): Exit<Value, Error> {
    return this.runEffect()
  }
}

class FactoryApiBridge {
  private time = 0
  private machineAvailableAt = 0
  private readonly orders = new Map<OrderId, RuntimeOrder>()
  private readonly events: SimEvent[] = []
  private readonly apiFailures: ApiFailureRecord[] = []
  private readonly diagnostics: RunDiagnostic[] = []
  private failNextCut = false

  constructor(seedOrders: readonly { readonly id: OrderId; readonly traits?: readonly OrderTrait[] }[]) {
    for (const seedOrder of seedOrders) {
      const order: RuntimeOrder = {
        id: seedOrder.id,
        traits: seedOrder.traits ?? [],
        workflow: "backlog",
        state: "raw",
        version: 0,
      }
      this.orders.set(order.id, order)
      this.events.push({ type: "OrderCreated", orderId: order.id, traits: order.traits, time: this.time })
    }
  }

  availableOrders(): Effect<readonly OrderSummary[]> {
    return Effect.sync(() =>
      Array.from(this.orders.values())
        .filter((order) => order.workflow === "backlog")
        .map(toSummary),
    )
  }

  takeOrder(): Effect<ActiveOrder<"raw">, { readonly type: "NoOrdersAvailable" }>
  takeOrder(summary: OrderSummary): Effect<ActiveOrder<"raw">, { readonly type: "OrderUnavailable"; readonly orderId: OrderId }>
  takeOrder(summary?: OrderSummary): Effect<ActiveOrder<"raw">, FactoryApiFailure> {
    return Effect.sync(() => summary ? this.orders.get(summary.orderId) : this.firstBacklogOrder()).flatMap((order) => {
      if (!order) return this.reject(summary ? { type: "OrderUnavailable", orderId: summary.orderId } : { type: "NoOrdersAvailable" })
      if (order.workflow !== "backlog") return this.reject({ type: "OrderUnavailable", orderId: order.id })

      order.workflow = "active"
      order.version += 1
      this.events.push({ type: "OrderTaken", orderId: order.id, time: this.time })
      return Effect.succeed(toActiveOrder(order, "raw"))
    })
  }

  cut(activeOrder: ActiveOrder<"raw">): Effect<ActiveOrder<"cut">, { readonly type: "MachineFailure"; readonly machineId: string; readonly orderId: OrderId }> {
    return this.validateActiveOrder(activeOrder, "raw").flatMap((order) => {
      const startTime = Math.max(this.time, this.machineAvailableAt)
      if (startTime > this.time) {
        this.events.push({
          type: "StepQueued",
          orderId: order.id,
          step: "cut",
          machineId: "cutter-1",
          queueTime: startTime - this.time,
          time: this.time,
        })
      }
      this.events.push({ type: "StepStarted", orderId: order.id, step: "cut", machineId: "cutter-1", time: startTime })

      const completedAt = startTime + 5
      this.machineAvailableAt = completedAt
      this.time = completedAt

      if (this.failNextCut) {
        this.failNextCut = false
        this.events.push({ type: "StepFailed", orderId: order.id, step: "cut", machineId: "cutter-1", reason: "jammed", time: completedAt })
        return this.reject({ type: "MachineFailure", machineId: "cutter-1", orderId: order.id })
      }

      order.state = "cut"
      order.version += 1
      this.events.push({
        type: "StepCompleted",
        orderId: order.id,
        step: "cut",
        machineId: "cutter-1",
        fromState: "raw",
        toState: "cut",
        time: completedAt,
      })
      return Effect.succeed(toActiveOrder(order, "cut"))
    })
  }

  ship(activeOrder: ActiveOrder<"cut">): Effect<void> {
    return this.validateActiveOrder(activeOrder, "cut").map((order) => {
      order.workflow = "shipped"
      order.version += 1
      this.events.push({ type: "OrderShipped", orderId: order.id, time: this.time })
    })
  }

  forkAll<Effects extends readonly Effect<unknown, unknown>[]>(effects: Effects): ReturnType<typeof Effect.all<Effects>> {
    const requestTime = this.time
    return Effect.all(
      effects.map((effect) =>
        Effect.sync(() => {
          this.time = requestTime
          return undefined
        }).flatMap(() => effect),
      ) as unknown as Effects,
    )
  }

  makeNextCutFail(): void {
    this.failNextCut = true
  }

  snapshot(): BridgeState {
    return {
      time: this.time,
      machineAvailableAt: this.machineAvailableAt,
      orders: Array.from(this.orders.values()).map((order) => ({ ...order })),
      events: [...this.events].sort((left, right) => left.time - right.time),
      apiFailures: [...this.apiFailures].sort((left, right) => left.time - right.time),
      diagnostics: [...this.diagnostics].sort((left, right) => left.time - right.time),
    }
  }

  private firstBacklogOrder(): RuntimeOrder | undefined {
    return Array.from(this.orders.values()).find((order) => order.workflow === "backlog")
  }

  private validateActiveOrder<State extends OrderState>(activeOrder: ActiveOrder<State>, expectedState: State): Effect<RuntimeOrder> {
    const order = this.orders.get(activeOrder.orderId)
    const expectedFreshnessToken = order ? freshnessToken(order) : "missing"
    if (
      !order ||
      order.workflow !== "active" ||
      order.state !== expectedState ||
      order.version !== activeOrder.snapshotVersion ||
      expectedFreshnessToken !== activeOrder.freshnessToken
    ) {
      return this.defect({
        type: "InvalidActiveOrder",
        orderId: activeOrder.orderId,
        expectedState,
        actualState: order?.state ?? "missing",
        actualWorkflow: order?.workflow ?? "missing",
        expectedFreshnessToken,
        actualFreshnessToken: activeOrder.freshnessToken,
      })
    }
    return Effect.succeed(order)
  }

  private reject<Error extends FactoryApiFailure>(error: Error): Effect<never, Error> {
    this.apiFailures.push({ type: "FactoryApiFailure", error, time: this.time })
    return Effect.fail(error)
  }

  private defect(defect: FactoryProgramDefect): Effect<never> {
    this.diagnostics.push({ type: "FactoryProgramDefect", reason: defect, time: this.time })
    return Effect.defect(defect)
  }
}

function toSummary(order: RuntimeOrder): OrderSummary {
  return Object.freeze({
    kind: "OrderSummary",
    orderId: order.id,
    traits: order.traits,
    snapshotVersion: order.version,
  })
}

function toActiveOrder<State extends OrderState>(order: RuntimeOrder, state: State): ActiveOrder<State> {
  return Object.freeze({
    kind: "ActiveOrder",
    orderId: order.id,
    state,
    traits: order.traits,
    snapshotVersion: order.version,
    freshnessToken: freshnessToken(order),
  })
}

function freshnessToken(order: RuntimeOrder): string {
  return `${order.id}:${order.workflow}:${order.state}:${order.version}`
}

function runHappyPath(): { readonly exits: readonly Exit<unknown, unknown>[]; readonly state: BridgeState } {
  const factory = new FactoryApiBridge([{ id: "A", traits: ["urgent"] }])
  const program = factory
    .takeOrder()
    .flatMap((order) => factory.cut(order))
    .flatMap((order) => factory.ship(order))
  return { exits: [program.run()], state: factory.snapshot() }
}

function runSelectionRace(): { readonly exits: readonly Exit<unknown, unknown>[]; readonly state: BridgeState } {
  const factory = new FactoryApiBridge([{ id: "A" }, { id: "B" }])
  const summaries = expectSuccess(factory.availableOrders().run())
  const summary = summaries[0]
  if (!summary) throw new Error("Expected at least one summary")
  const first = factory.takeOrder(summary).run()
  const second = factory.takeOrder(summary).run()
  return { exits: [first, second], state: factory.snapshot() }
}

function runStaleActiveOrder(): { readonly exits: readonly Exit<unknown, unknown>[]; readonly state: BridgeState } {
  const factory = new FactoryApiBridge([{ id: "A", traits: ["fragile"] }])
  const raw = expectSuccess(factory.takeOrder().run())
  const cut = expectSuccess(factory.cut(raw).run())
  const staleCut = factory.cut(raw).run()
  const shipped = factory.ship(cut).run()
  const staleShip = factory.ship(cut).run()
  return { exits: [staleCut, shipped, staleShip], state: factory.snapshot() }
}

function runConcurrentCuts(): { readonly exits: readonly Exit<unknown, unknown>[]; readonly state: BridgeState } {
  const factory = new FactoryApiBridge([{ id: "A" }, { id: "B" }, { id: "C" }])
  const activeOrders = [factory.takeOrder(), factory.takeOrder(), factory.takeOrder()].map((effect) => expectSuccess(effect.run()))
  const concurrentCuts = factory.forkAll(activeOrders.map((order) => factory.cut(order))).run()
  if (concurrentCuts.type === "Success") {
    for (const cutOrder of concurrentCuts.value as readonly ActiveOrder<"cut">[]) factory.ship(cutOrder).run()
  }
  return { exits: [concurrentCuts], state: factory.snapshot() }
}

function runRecoverableMachineFailure(): { readonly exits: readonly Exit<unknown, unknown>[]; readonly state: BridgeState } {
  const factory = new FactoryApiBridge([{ id: "A" }])
  const raw = expectSuccess(factory.takeOrder().run())
  factory.makeNextCutFail()
  const failedCut = factory.cut(raw).run()
  const retryCut = factory.cut(raw).run()
  if (retryCut.type === "Success") factory.ship(retryCut.value).run()
  return { exits: [failedCut, retryCut], state: factory.snapshot() }
}

function expectSuccess<Value, Error>(exit: Exit<Value, Error>): Value {
  if (exit.type !== "Success") throw new Error(`Expected success, got ${formatExit(exit)}`)
  return exit.value
}

function printScenario(name: string, result: { readonly exits: readonly Exit<unknown, unknown>[]; readonly state: BridgeState }): void {
  console.log(`\n=== ${name} ===`)
  console.log("exits:")
  for (const exit of result.exits) console.log(`  ${formatExit(exit)}`)
  printState(result.state)
}

function printState(state: BridgeState): void {
  console.log(`time=${state.time} machineAvailableAt=${state.machineAvailableAt}`)
  console.log("orders:")
  for (const order of state.orders) {
    console.log(`  ${order.id} workflow=${order.workflow} state=${order.state} version=${order.version} freshness=${freshnessToken(order)}`)
  }
  console.log("events:")
  for (const event of state.events) console.log(`  ${event.time.toString().padStart(2, "0")} ${formatEvent(event)}`)
  console.log("apiFailures:")
  if (state.apiFailures.length === 0) {
    console.log("  none")
  } else {
    for (const failure of state.apiFailures) console.log(`  ${failure.time.toString().padStart(2, "0")} ${formatApiFailure(failure.error)}`)
  }
  console.log("diagnostics:")
  if (state.diagnostics.length === 0) {
    console.log("  none")
  } else {
    for (const diagnostic of state.diagnostics) console.log(`  ${diagnostic.time.toString().padStart(2, "0")} ${formatDiagnostic(diagnostic.reason)}`)
  }
}

function formatExit(exit: Exit<unknown, unknown>): string {
  switch (exit.type) {
    case "Success":
      return `Success ${formatValue(exit.value)}`
    case "Failure":
      return `Failure ${formatApiFailure(exit.error as FactoryApiFailure)}`
    case "Defect":
      return `Defect ${formatDiagnostic(exit.defect)}`
    default:
      return assertNever(exit)
  }
}

function formatValue(value: unknown): string {
  if (value === undefined) return "void"
  if (Array.isArray(value)) return `[${value.map(formatValue).join(", ")}]`
  if (isActiveOrder(value)) return `ActiveOrder order=${value.orderId} state=${value.state} token=${value.freshnessToken}`
  return JSON.stringify(value)
}

function isActiveOrder(value: unknown): value is ActiveOrder {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "ActiveOrder"
}

function formatEvent(event: SimEvent): string {
  switch (event.type) {
    case "OrderCreated":
      return `${event.type} order=${event.orderId} traits=${event.traits.join(",") || "standard"}`
    case "OrderTaken":
      return `${event.type} order=${event.orderId}`
    case "StepQueued":
      return `${event.type} order=${event.orderId} machine=${event.machineId} wait=${event.queueTime}`
    case "StepStarted":
      return `${event.type} order=${event.orderId} machine=${event.machineId}`
    case "StepFailed":
      return `${event.type} order=${event.orderId} machine=${event.machineId} reason=${event.reason}`
    case "StepCompleted":
      return `${event.type} order=${event.orderId} ${event.fromState}->${event.toState}`
    case "OrderShipped":
      return `${event.type} order=${event.orderId}`
    default:
      return assertNever(event)
  }
}

function formatApiFailure(error: FactoryApiFailure): string {
  switch (error.type) {
    case "NoOrdersAvailable":
      return "NoOrdersAvailable"
    case "OrderUnavailable":
      return `OrderUnavailable order=${error.orderId}`
    case "MachineFailure":
      return `MachineFailure machine=${error.machineId} order=${error.orderId}`
    default:
      return assertNever(error)
  }
}

function formatDiagnostic(defect: FactoryProgramDefect): string {
  const actual = defect.actualWorkflow === "active" ? defect.actualState : defect.actualWorkflow
  return `InvalidActiveOrder order=${defect.orderId} expected=${defect.expectedState} actual=${actual} expectedToken=${defect.expectedFreshnessToken} actualToken=${defect.actualFreshnessToken}`
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`)
}

const scenarios = {
  happy: runHappyPath,
  race: runSelectionRace,
  stale: runStaleActiveOrder,
  concurrent: runConcurrentCuts,
  machine: runRecoverableMachineFailure,
} as const

if (import.meta.url === `file://${process.argv[1]}`) {
  const requestedScenario = process.argv[2] as keyof typeof scenarios | undefined
  if (requestedScenario) {
    const scenario = scenarios[requestedScenario]
    if (!scenario) {
      console.error(`Unknown scenario "${requestedScenario}". Choose: ${Object.keys(scenarios).join(", ")}`)
      process.exit(1)
    }
    printScenario(requestedScenario, scenario())
  } else {
    for (const [name, scenario] of Object.entries(scenarios)) printScenario(name, scenario())
  }
}
