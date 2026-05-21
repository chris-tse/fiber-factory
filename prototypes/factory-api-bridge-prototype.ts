#!/usr/bin/env node

// PROTOTYPE - throwaway Factory API bridge model check.
// Question: can a public Factory API bridge drive simulator-owned Run state
// while preserving immutable OrderSummary / ActiveOrder values, typed failures,
// and domain Simulation Events?

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
}>

type BridgeError =
  | { readonly type: "NoOrdersAvailable" }
  | { readonly type: "OrderUnavailable"; readonly orderId: OrderId }

type FactoryProgramDefect =
  | {
      readonly type: "InvalidActiveOrder"
      readonly orderId: OrderId
      readonly expectedState: OrderState
      readonly actualState: OrderState | "missing"
      readonly actualWorkflow: Workflow | "missing"
    }

type SimEvent =
  | { readonly type: "OrderCreated"; readonly orderId: OrderId; readonly traits: readonly OrderTrait[]; readonly time: number }
  | { readonly type: "OrderTaken"; readonly orderId: OrderId; readonly time: number }
  | { readonly type: "StepQueued"; readonly orderId: OrderId; readonly step: "cut"; readonly machineId: string; readonly queueTime: number; readonly time: number }
  | { readonly type: "StepStarted"; readonly orderId: OrderId; readonly step: "cut"; readonly machineId: string; readonly time: number }
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
type ApiFailureRecord = { readonly type: "FactoryApiFailure"; readonly error: BridgeError; readonly time: number }

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

type Result<Value> = { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: BridgeError }
type DefectResult<Value> = Result<Value> | { readonly ok: false; readonly defect: FactoryProgramDefect }

class FactoryApiBridge {
  private time = 0
  private machineAvailableAt = 0
  private readonly orders = new Map<OrderId, RuntimeOrder>()
  private readonly events: SimEvent[] = []
  private readonly apiFailures: ApiFailureRecord[] = []
  private readonly diagnostics: RunDiagnostic[] = []

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

  availableOrders(): readonly OrderSummary[] {
    return Array.from(this.orders.values())
      .filter((order) => order.workflow === "backlog")
      .map(toSummary)
  }

  takeOrder(summary?: OrderSummary): Result<ActiveOrder<"raw">> {
    const order = summary ? this.orders.get(summary.orderId) : this.firstBacklogOrder()
    if (!order) return this.reject(summary ? { type: "OrderUnavailable", orderId: summary.orderId } : { type: "NoOrdersAvailable" })

    if (order.workflow !== "backlog") {
      return this.reject({ type: "OrderUnavailable", orderId: order.id })
    }

    order.workflow = "active"
    order.version += 1
    this.events.push({ type: "OrderTaken", orderId: order.id, time: this.time })
    return { ok: true, value: toActiveOrder(order, "raw") }
  }

  cut(activeOrder: ActiveOrder<"raw">): DefectResult<ActiveOrder<"cut">> {
    const order = this.orders.get(activeOrder.orderId)
    if (!order || order.workflow !== "active" || order.state !== "raw" || order.version !== activeOrder.snapshotVersion) {
      return this.defect({
        type: "InvalidActiveOrder",
        orderId: activeOrder.orderId,
        expectedState: "raw",
        actualState: order?.state ?? "missing",
        actualWorkflow: order?.workflow ?? "missing",
      })
    }

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
    return { ok: true, value: toActiveOrder(order, "cut") }
  }

  ship(activeOrder: ActiveOrder<"cut">): DefectResult<void> {
    const order = this.orders.get(activeOrder.orderId)
    if (!order || order.workflow !== "active" || order.state !== "cut" || order.version !== activeOrder.snapshotVersion) {
      return this.defect({
        type: "InvalidActiveOrder",
        orderId: activeOrder.orderId,
        expectedState: "cut",
        actualState: order?.state ?? "missing",
        actualWorkflow: order?.workflow ?? "missing",
      })
    }

    order.workflow = "shipped"
    order.version += 1
    this.events.push({ type: "OrderShipped", orderId: order.id, time: this.time })
    return { ok: true, value: undefined }
  }

  dispatchCutRequests(activeOrders: readonly ActiveOrder<"raw">[]): readonly DefectResult<ActiveOrder<"cut">>[] {
    const requestTime = this.time
    return activeOrders.map((activeOrder) => {
      this.time = requestTime
      return this.cut(activeOrder)
    })
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

  private reject(error: BridgeError): Result<never> {
    this.apiFailures.push({ type: "FactoryApiFailure", error, time: this.time })
    return { ok: false, error }
  }

  private defect(defect: FactoryProgramDefect): DefectResult<never> {
    this.diagnostics.push({ type: "FactoryProgramDefect", reason: defect, time: this.time })
    return { ok: false, defect }
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
  })
}

function runSelectionRace(): BridgeState {
  const factory = new FactoryApiBridge([
    { id: "A", traits: ["urgent"] },
    { id: "B", traits: ["bulk"] },
  ])
  const [summary] = factory.availableOrders()
  if (!summary) throw new Error("Expected summary")

  const first = factory.takeOrder(summary)
  const second = factory.takeOrder(summary)
  if (!first.ok) throw new Error("Expected first take to succeed")
  if (second.ok) throw new Error("Expected duplicate take to fail")

  return factory.snapshot()
}

function runActiveOrderImmutability(): BridgeState {
  const factory = new FactoryApiBridge([{ id: "A", traits: ["fragile"] }])
  const taken = factory.takeOrder()
  if (!taken.ok) throw new Error("Expected take to succeed")

  const cut = factory.cut(taken.value)
  if (!cut.ok) throw new Error("Expected cut to succeed")
  factory.cut(taken.value)
  factory.ship(cut.value)
  factory.ship(cut.value)

  return factory.snapshot()
}

function runConcurrentCuts(): BridgeState {
  const factory = new FactoryApiBridge([{ id: "A" }, { id: "B" }, { id: "C" }])
  const activeOrders = [factory.takeOrder(), factory.takeOrder(), factory.takeOrder()].map((result) => {
    if (!result.ok) throw new Error("Expected take to succeed")
    return result.value
  })
  const cutOrders = factory.dispatchCutRequests(activeOrders).map((result) => {
    if (!result.ok) throw new Error("Expected cut to succeed")
    return result.value
  })
  for (const order of cutOrders) factory.ship(order)

  return factory.snapshot()
}

function runEmptyBacklog(): BridgeState {
  const factory = new FactoryApiBridge([{ id: "A" }])
  factory.takeOrder()
  factory.takeOrder()
  return factory.snapshot()
}

function printState(name: string, state: BridgeState): void {
  console.log(`\n=== ${name} ===`)
  console.log(`time=${state.time} machineAvailableAt=${state.machineAvailableAt}`)
  console.log("orders:")
  for (const order of state.orders) {
    console.log(`  ${order.id} workflow=${order.workflow} state=${order.state} version=${order.version} traits=${order.traits.join(",") || "standard"}`)
  }
  console.log("events:")
  for (const event of state.events) console.log(`  ${event.time.toString().padStart(2, "0")} ${formatEvent(event)}`)
  console.log("apiFailures:")
  if (state.apiFailures.length === 0) {
    console.log("  none")
  } else {
    for (const failure of state.apiFailures) {
      console.log(`  ${failure.time.toString().padStart(2, "0")} ${failure.type} ${formatError(failure.error)}`)
    }
  }
  console.log("diagnostics:")
  if (state.diagnostics.length === 0) {
    console.log("  none")
  } else {
    for (const diagnostic of state.diagnostics) {
      console.log(`  ${diagnostic.time.toString().padStart(2, "0")} ${formatDiagnostic(diagnostic)}`)
    }
  }
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
    case "StepCompleted":
      return `${event.type} order=${event.orderId} ${event.fromState}->${event.toState}`
    case "OrderShipped":
      return `${event.type} order=${event.orderId}`
    default:
      return assertNever(event)
  }
}

function formatError(error: BridgeError): string {
  if (error.type === "NoOrdersAvailable") return "reason=no-orders-available"
  if (error.type === "OrderUnavailable") return `reason=order-unavailable order=${error.orderId}`
  return assertNever(error)
}

function formatDiagnostic(diagnostic: RunDiagnostic): string {
  const defect = diagnostic.reason
  const actual = defect.actualWorkflow === "active" ? defect.actualState : defect.actualWorkflow
  return `${diagnostic.type} reason=invalid-active-order order=${defect.orderId} expected=${defect.expectedState} actual=${actual}`
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`)
}

const scenarios = {
  race: runSelectionRace,
  stale: runActiveOrderImmutability,
  concurrent: runConcurrentCuts,
  empty: runEmptyBacklog,
} as const

if (import.meta.url === `file://${process.argv[1]}`) {
  const requestedScenario = process.argv[2] as keyof typeof scenarios | undefined
  if (requestedScenario) {
    const scenario = scenarios[requestedScenario]
    if (!scenario) {
      console.error(`Unknown scenario "${requestedScenario}". Choose: ${Object.keys(scenarios).join(", ")}`)
      process.exit(1)
    }
    printState(requestedScenario, scenario())
  } else {
    for (const [name, scenario] of Object.entries(scenarios)) printState(name, scenario())
  }
}
