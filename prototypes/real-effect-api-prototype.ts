#!/usr/bin/env node

// PROTOTYPE - throwaway real Effect Factory API pressure test.
// Question: does the bridge still feel production-shaped with actual Effect APIs:
// Effect.gen, Effect.all, Effect.retry, typed errors, defects, and service layers?

import { Cause, Context, Effect, Exit, Layer, Result, Schedule, Schema } from "effect"

type OrderId = string
type OrderState = "raw" | "cut"
type Workflow = "backlog" | "active" | "shipped"

type ActiveOrder<State extends OrderState = OrderState> = Readonly<{
  kind: "ActiveOrder"
  orderId: OrderId
  state: State
  snapshotVersion: number
  freshnessToken: string
}>

type RuntimeOrder = {
  readonly id: OrderId
  workflow: Workflow
  state: OrderState
  version: number
}

type SimEvent =
  | { readonly type: "OrderCreated"; readonly orderId: OrderId; readonly time: number }
  | { readonly type: "OrderTaken"; readonly orderId: OrderId; readonly time: number }
  | { readonly type: "StepQueued"; readonly orderId: OrderId; readonly queueTime: number; readonly time: number }
  | { readonly type: "StepStarted"; readonly orderId: OrderId; readonly time: number }
  | { readonly type: "StepFailed"; readonly orderId: OrderId; readonly reason: "jammed"; readonly time: number }
  | { readonly type: "StepCompleted"; readonly orderId: OrderId; readonly time: number }
  | { readonly type: "OrderShipped"; readonly orderId: OrderId; readonly time: number }

type FactoryProgramDefect = Readonly<{
  type: "InvalidActiveOrder"
  orderId: OrderId
  expectedState: OrderState
  actualState: OrderState | "missing"
  actualWorkflow: Workflow | "missing"
  expectedFreshnessToken: string | "missing"
  actualFreshnessToken: string
}>

class NoOrdersAvailable extends Schema.TaggedErrorClass<NoOrdersAvailable>()("NoOrdersAvailable", {}) {}

class OrderUnavailable extends Schema.TaggedErrorClass<OrderUnavailable>()("OrderUnavailable", {
  orderId: Schema.String,
}) {}

class MachineFailure extends Schema.TaggedErrorClass<MachineFailure>()("MachineFailure", {
  machineId: Schema.String,
  orderId: Schema.String,
}) {}

type FactoryApiFailure = NoOrdersAvailable | OrderUnavailable | MachineFailure

type BridgeSnapshot = Readonly<{
  time: number
  machineAvailableAt: number
  orders: readonly Readonly<RuntimeOrder>[]
  events: readonly SimEvent[]
  apiFailures: readonly FactoryApiFailure[]
  diagnostics: readonly FactoryProgramDefect[]
}>

class FactoryApi extends Context.Service<FactoryApi, {
  readonly availableOrders: Effect.Effect<readonly ActiveOrder<"raw">[]>
  readonly takeOrder: Effect.Effect<ActiveOrder<"raw">, NoOrdersAvailable>
  readonly cut: (order: ActiveOrder<"raw">) => Effect.Effect<ActiveOrder<"cut">, MachineFailure>
  readonly ship: (order: ActiveOrder<"cut">) => Effect.Effect<void>
  readonly makeNextCutFail: Effect.Effect<void>
  readonly snapshot: Effect.Effect<BridgeSnapshot>
}>()("fiber-factory/prototypes/FactoryApi") {
  static readonly layer = Layer.sync(FactoryApi, () => FactoryApi.of(makeFactoryApiBridge([{ id: "A" }, { id: "B" }, { id: "C" }])))
}

function makeFactoryApiBridge(seedOrders: readonly { readonly id: OrderId }[]): FactoryApi["Service"] {
  let time = 0
  let machineAvailableAt = 0
  let failNextCut = false
  const orders = new Map<OrderId, RuntimeOrder>()
  const events: SimEvent[] = []
  const apiFailures: FactoryApiFailure[] = []
  const diagnostics: FactoryProgramDefect[] = []

  for (const seedOrder of seedOrders) {
    const order: RuntimeOrder = { id: seedOrder.id, workflow: "backlog", state: "raw", version: 0 }
    orders.set(order.id, order)
    events.push({ type: "OrderCreated", orderId: order.id, time })
  }

  const reject = <Error extends FactoryApiFailure>(error: Error): Effect.Effect<never, Error> => {
    apiFailures.push(error)
    return Effect.fail(error)
  }

  const defect = (reason: FactoryProgramDefect): Effect.Effect<never> => {
    diagnostics.push(reason)
    return Effect.die(reason)
  }

  const validateActiveOrder = <State extends OrderState>(
    activeOrder: ActiveOrder<State>,
    expectedState: State,
  ): Effect.Effect<RuntimeOrder> =>
    Effect.gen(function*() {
      const order = orders.get(activeOrder.orderId)
      const expectedFreshnessToken = order ? freshnessToken(order) : "missing"
      if (
        !order ||
        order.workflow !== "active" ||
        order.state !== expectedState ||
        order.version !== activeOrder.snapshotVersion ||
        expectedFreshnessToken !== activeOrder.freshnessToken
      ) {
        return yield* defect({
          type: "InvalidActiveOrder",
          orderId: activeOrder.orderId,
          expectedState,
          actualState: order?.state ?? "missing",
          actualWorkflow: order?.workflow ?? "missing",
          expectedFreshnessToken,
          actualFreshnessToken: activeOrder.freshnessToken,
        })
      }
      return order
    })

  return FactoryApi.of({
    availableOrders: Effect.sync(() =>
      Array.from(orders.values())
        .filter((order) => order.workflow === "backlog")
        .map((order) => toActiveOrder(order, "raw")),
    ),

    takeOrder: Effect.gen(function*() {
      const order = Array.from(orders.values()).find((candidate) => candidate.workflow === "backlog")
      if (!order) return yield* reject(new NoOrdersAvailable())

      order.workflow = "active"
      order.version += 1
      events.push({ type: "OrderTaken", orderId: order.id, time })
      return toActiveOrder(order, "raw")
    }),

    cut: Effect.fn("FactoryApi.cut")(function*(activeOrder) {
      const order = yield* validateActiveOrder(activeOrder, "raw")
      const startTime = Math.max(time, machineAvailableAt)
      if (startTime > time) events.push({ type: "StepQueued", orderId: order.id, queueTime: startTime - time, time })

      events.push({ type: "StepStarted", orderId: order.id, time: startTime })
      const completedAt = startTime + 5
      machineAvailableAt = completedAt
      time = completedAt

      if (failNextCut) {
        failNextCut = false
        events.push({ type: "StepFailed", orderId: order.id, reason: "jammed", time: completedAt })
        return yield* reject(new MachineFailure({ machineId: "cutter-1", orderId: order.id }))
      }

      order.state = "cut"
      order.version += 1
      events.push({ type: "StepCompleted", orderId: order.id, time: completedAt })
      return toActiveOrder(order, "cut")
    }),

    ship: Effect.fn("FactoryApi.ship")(function*(activeOrder) {
      const order = yield* validateActiveOrder(activeOrder, "cut")
      order.workflow = "shipped"
      order.version += 1
      events.push({ type: "OrderShipped", orderId: order.id, time })
    }),

    makeNextCutFail: Effect.sync(() => {
      failNextCut = true
    }),

    snapshot: Effect.sync(() => ({
      time,
      machineAvailableAt,
      orders: Array.from(orders.values()).map((order) => ({ ...order })),
      events: [...events].sort((left, right) => left.time - right.time),
      apiFailures: [...apiFailures],
      diagnostics: [...diagnostics],
    })),
  })
}

const happyProgram = Effect.gen(function*() {
  const factory = yield* FactoryApi
  const order = yield* factory.takeOrder
  const cutOrder = yield* factory.cut(order)
  yield* factory.ship(cutOrder)
})

const retryProgram = Effect.gen(function*() {
  const factory = yield* FactoryApi
  const order = yield* factory.takeOrder
  yield* factory.makeNextCutFail
  const cutOrder = yield* factory.cut(order).pipe(
    Effect.retry(Schedule.recurs(2)),
  )
  yield* factory.ship(cutOrder)
})

const concurrentProgram = Effect.gen(function*() {
  const factory = yield* FactoryApi
  const orders = yield* Effect.all([factory.takeOrder, factory.takeOrder, factory.takeOrder])
  const requestTime = (yield* factory.snapshot).time
  const cuts = yield* Effect.all(
    orders.map((order) =>
      Effect.sync(() => {
        // Simulate all cut requests entering the Station Queue at one virtual instant.
        void requestTime
      }).pipe(Effect.flatMap(() => factory.cut(order))),
    ),
  )
  yield* Effect.all(cuts.map((order) => factory.ship(order)))
})

const staleDefectProgram = Effect.gen(function*() {
  const factory = yield* FactoryApi
  const order = yield* factory.takeOrder
  yield* factory.cut(order)
  yield* factory.cut(order)
})

const programs = {
  happy: happyProgram,
  retry: retryProgram,
  concurrent: concurrentProgram,
  stale: staleDefectProgram,
} as const

function toActiveOrder<State extends OrderState>(order: RuntimeOrder, state: State): ActiveOrder<State> {
  return Object.freeze({
    kind: "ActiveOrder",
    orderId: order.id,
    state,
    snapshotVersion: order.version,
    freshnessToken: freshnessToken(order),
  })
}

function freshnessToken(order: RuntimeOrder): string {
  return `${order.id}:${order.workflow}:${order.state}:${order.version}`
}

function runScenario(name: keyof typeof programs): void {
  const bridge = makeFactoryApiBridge([{ id: "A" }, { id: "B" }, { id: "C" }])
  const layer = Layer.succeed(FactoryApi, bridge)
  const exit = Effect.runSyncExit(programs[name].pipe(Effect.provide(layer)))
  const snapshot = Effect.runSync(bridge.snapshot)

  console.log(`\n=== ${name} ===`)
  console.log(`exit: ${formatExit(exit)}`)
  printState(snapshot)
}

function formatExit(exit: Exit.Exit<unknown, FactoryApiFailure>): string {
  if (Exit.isSuccess(exit)) return "Success void"
  const error = Result.getOrUndefined(Cause.findError(exit.cause))
  if (error) return `Failure ${formatFailure(error as FactoryApiFailure)}`
  const defect = Result.getOrUndefined(Cause.findDefect(exit.cause))
  if (defect) return `Defect ${formatDefect(defect as FactoryProgramDefect)}`
  return Cause.pretty(exit.cause)
}

function printState(snapshot: BridgeSnapshot): void {
  console.log(`time=${snapshot.time} machineAvailableAt=${snapshot.machineAvailableAt}`)
  console.log("orders:")
  for (const order of snapshot.orders) console.log(`  ${order.id} workflow=${order.workflow} state=${order.state} version=${order.version}`)
  console.log("events:")
  for (const event of snapshot.events) console.log(`  ${event.time.toString().padStart(2, "0")} ${formatEvent(event)}`)
  console.log("apiFailures:")
  if (snapshot.apiFailures.length === 0) console.log("  none")
  for (const failure of snapshot.apiFailures) console.log(`  ${formatFailure(failure)}`)
  console.log("diagnostics:")
  if (snapshot.diagnostics.length === 0) console.log("  none")
  for (const diagnostic of snapshot.diagnostics) console.log(`  ${formatDefect(diagnostic)}`)
}

function formatFailure(error: FactoryApiFailure): string {
  switch (error._tag) {
    case "NoOrdersAvailable":
      return "NoOrdersAvailable"
    case "OrderUnavailable":
      return `OrderUnavailable order=${error.orderId}`
    case "MachineFailure":
      return `MachineFailure machine=${error.machineId} order=${error.orderId}`
  }
}

function formatDefect(defect: FactoryProgramDefect): string {
  return `InvalidActiveOrder order=${defect.orderId} expected=${defect.expectedState} actual=${defect.actualWorkflow}/${defect.actualState}`
}

function formatEvent(event: SimEvent): string {
  switch (event.type) {
    case "OrderCreated":
    case "OrderTaken":
    case "OrderShipped":
      return `${event.type} order=${event.orderId}`
    case "StepQueued":
      return `${event.type} order=${event.orderId} wait=${event.queueTime}`
    case "StepStarted":
    case "StepCompleted":
      return `${event.type} order=${event.orderId}`
    case "StepFailed":
      return `${event.type} order=${event.orderId} reason=${event.reason}`
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const requestedScenario = process.argv[2] as keyof typeof programs | undefined
  if (requestedScenario) {
    if (!programs[requestedScenario]) {
      console.error(`Unknown scenario "${requestedScenario}". Choose: ${Object.keys(programs).join(", ")}`)
      process.exit(1)
    }
    runScenario(requestedScenario)
  } else {
    for (const name of Object.keys(programs) as (keyof typeof programs)[]) runScenario(name)
  }
}
