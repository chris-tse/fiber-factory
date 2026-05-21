#!/usr/bin/env node

// PROTOTYPE - throwaway simulator/renderer model check.
// Question: can the simulator stand alone, emit domain events, and let the
// renderer derive visual state without owning simulation rules?

type OrderId = string
type Step = "cut" | "assemble"
type WorkflowStep = Step | "ship"
type OrderState = "raw" | "cut" | "assembled"
type Workflow = "backlog" | "active" | "shipped"
type Location = "dock" | "shipping" | string

type Instruction =
  | { readonly type: "takeOrder" }
  | { readonly type: "cut"; readonly orderId: OrderId }
  | { readonly type: "assemble"; readonly orderId: OrderId }
  | { readonly type: "ship"; readonly orderId: OrderId }
  | { readonly type: "dispatchConcurrently"; readonly count: number }

type MachineConfig = {
  readonly id: string
  readonly step: Step
  readonly processTime: number
  readonly fromState: OrderState
  readonly toState: OrderState
  readonly mandatory: boolean
}

type Scenario = {
  readonly description?: string
  readonly level?: LevelConfig
  readonly orders: readonly OrderId[]
  readonly failures?: Partial<Record<OrderId, readonly { readonly reason: string }[]>>
  readonly instructions: readonly Instruction[]
}

type LevelConfig = {
  readonly passObjective: { readonly shippedOrders: number; readonly within: number }
  readonly requiredWorkflow: readonly WorkflowStep[]
  readonly machines: Partial<Record<Step, MachineConfig>>
}

type RuntimeOrder = {
  readonly id: OrderId
  workflow: Workflow
  orderState: OrderState
  readonly attemptsByStep: Partial<Record<Step, number>>
}

type SimEvent =
  | { readonly type: "OrderCreated"; readonly orderId: OrderId; readonly time: number }
  | { readonly type: "OrderTaken"; readonly orderId: OrderId; readonly time: number }
  | {
      readonly type: "StepQueued"
      readonly orderId: OrderId
      readonly step: Step
      readonly machineId: string
      readonly queueTime: number
      readonly time: number
    }
  | {
      readonly type: "StepStarted"
      readonly orderId: OrderId
      readonly step: Step
      readonly machineId: string
      readonly attempt: number
      readonly time: number
    }
  | {
      readonly type: "StepFailed"
      readonly orderId: OrderId
      readonly step: Step
      readonly machineId: string
      readonly attempt: number
      readonly recoverable: true
      readonly reason: string
      readonly time: number
    }
  | {
      readonly type: "StepCompleted"
      readonly orderId: OrderId
      readonly step: Step
      readonly machineId: string
      readonly attempt: number
      readonly fromState: OrderState
      readonly toState: OrderState
      readonly time: number
    }
  | { readonly type: "OrderShipped"; readonly orderId: OrderId; readonly time: number }
  | {
      readonly type: "InvalidStepRequest"
      readonly orderId?: OrderId
      readonly requestedStep?: string
      readonly currentState?: OrderState | "missing"
      readonly reason: string
      readonly time: number
    }

type VisualOrder = {
  readonly id: OrderId
  readonly location: Location
  readonly workflow: Workflow
  readonly orderState: OrderState
  readonly attempts: number
  readonly lastFailure?: {
    readonly reason: string
    readonly recoverable: true
    readonly attempt: number
  }
}

type MachineVisualState = {
  readonly state: "idle" | "working"
  readonly orderId: OrderId | null
}

type VisualState = {
  readonly time: number
  readonly pass: boolean
  readonly machines: Record<string, MachineVisualState>
  readonly orders: readonly VisualOrder[]
  readonly failedAttempts: readonly Extract<SimEvent, { type: "StepFailed" }>[]
  readonly invalidRequests: readonly Extract<SimEvent, { type: "InvalidStepRequest" }>[]
  readonly metrics: {
    readonly shipped: number
    readonly active: number
    readonly backlog: number
  }
}

const machines: Partial<Record<Step, MachineConfig>> = {
  cut: { id: "cutter-1", step: "cut", processTime: 5, fromState: "raw", toState: "cut", mandatory: true },
}

export const level = {
  passObjective: { shippedOrders: 2, within: 30 },
  requiredWorkflow: deriveRequiredWorkflow(machines),
  machines,
} as const satisfies LevelConfig

const scenarios: Record<string, Scenario> = {
  happy: {
    description: "Two orders ship cleanly.",
    orders: ["A", "B"],
    instructions: [
      { type: "takeOrder" },
      { type: "cut", orderId: "A" },
      { type: "ship", orderId: "A" },
      { type: "takeOrder" },
      { type: "cut", orderId: "B" },
      { type: "ship", orderId: "B" },
    ],
  },
  dispatch: {
    description: "Five Orders are dispatched at once and wait on one Cutter Station Queue.",
    orders: ["A", "B", "C", "D", "E"],
    instructions: [{ type: "dispatchConcurrently", count: 5 }],
  },
  retry: {
    description: "Order A has one recoverable cutter failure, then ships.",
    orders: ["A", "B"],
    failures: { A: [{ reason: "blade-jam" }] },
    instructions: [
      { type: "takeOrder" },
      { type: "cut", orderId: "A" },
      { type: "cut", orderId: "A" },
      { type: "ship", orderId: "A" },
      { type: "takeOrder" },
      { type: "cut", orderId: "B" },
      { type: "ship", orderId: "B" },
    ],
  },
}

export function simulateRun(scenario: Scenario): SimEvent[] {
  const scenarioLevel = scenario.level ?? level
  const events: SimEvent[] = []
  let time = 0
  const orders = new Map<OrderId, RuntimeOrder>()
  const machineAvailableAt = new Map<string, number>()

  for (const orderId of scenario.orders) {
    events.push({ type: "OrderCreated", orderId, time })
    orders.set(orderId, {
      id: orderId,
      workflow: "backlog",
      orderState: "raw",
      attemptsByStep: {},
    })
  }

  for (const instruction of scenario.instructions) {
    if (instruction.type === "dispatchConcurrently") {
      const dispatchStart = time
      const dispatchedOrders = Array.from(orders.values())
        .filter((candidate) => candidate.workflow === "backlog")
        .slice(0, instruction.count)

      for (const order of dispatchedOrders) {
        order.workflow = "active"
        events.push({ type: "OrderTaken", orderId: order.id, time: dispatchStart })
      }

      for (const order of dispatchedOrders) {
        scheduleRequiredWorkflow({
          events,
          failures: scenario.failures,
          level: scenarioLevel,
          machineAvailableAt,
          order,
          readyAt: dispatchStart,
        })
      }

      time = Math.max(time, ...dispatchedOrders.map((order) => lastOrderEventTime(events, order.id)))
      continue
    }

    if (instruction.type === "takeOrder") {
      const order = Array.from(orders.values()).find((candidate) => candidate.workflow === "backlog")
      if (!order) {
        events.push({ type: "InvalidStepRequest", reason: "no-order-in-backlog", time })
        continue
      }

      order.workflow = "active"
      events.push({ type: "OrderTaken", orderId: order.id, time })
      continue
    }

    if (instruction.type === "ship") {
      const order = orders.get(instruction.orderId)
      const requiredShipState = getRequiredShipState(scenarioLevel)
      if (!order || order.workflow !== "active" || order.orderState !== requiredShipState) {
        events.push({
          type: "InvalidStepRequest",
          orderId: instruction.orderId,
          requestedStep: "ship",
          currentState: order?.orderState ?? "missing",
          reason: "order-not-ready-to-ship",
          time,
        })
        continue
      }

      order.workflow = "shipped"
      events.push({ type: "OrderShipped", orderId: order.id, time })
      continue
    }

    const machine = scenarioLevel.machines[instruction.type]
    if (!machine) {
      events.push({ type: "InvalidStepRequest", requestedStep: instruction.type, reason: "unknown-step", time })
      continue
    }

    const order = orders.get(instruction.orderId)
    if (!order || order.workflow !== "active" || order.orderState !== machine.fromState) {
      events.push({
        type: "InvalidStepRequest",
        orderId: instruction.orderId,
        requestedStep: instruction.type,
        currentState: order?.orderState ?? "missing",
        reason: "invalid-state-for-step",
        time,
      })
      continue
    }

    const attempt = (order.attemptsByStep[instruction.type] ?? 0) + 1
    order.attemptsByStep[instruction.type] = attempt
    const startTime = Math.max(time, machineAvailableAt.get(machine.id) ?? time)
    if (startTime > time) {
      events.push({
        type: "StepQueued",
        orderId: order.id,
        step: instruction.type,
        machineId: machine.id,
        queueTime: startTime - time,
        time,
      })
    }
    events.push({
      type: "StepStarted",
      orderId: order.id,
      step: instruction.type,
      machineId: machine.id,
      attempt,
      time: startTime,
    })
    time = startTime + machine.processTime
    machineAvailableAt.set(machine.id, time)

    const failures = scenario.failures?.[order.id] ?? []
    const failure = failures[attempt - 1]
    if (failure) {
      events.push({
        type: "StepFailed",
        orderId: order.id,
        step: instruction.type,
        machineId: machine.id,
        attempt,
        recoverable: true,
        reason: failure.reason,
        time,
      })
      continue
    }

      order.orderState = machine.toState
    events.push({
      type: "StepCompleted",
      orderId: order.id,
      step: instruction.type,
      machineId: machine.id,
      attempt,
      fromState: machine.fromState,
      toState: machine.toState,
      time,
    })
  }

  return sortEvents(events)
}

function scheduleRequiredWorkflow(input: {
  readonly events: SimEvent[]
  readonly failures?: Partial<Record<OrderId, readonly { readonly reason: string }[]>>
  readonly level: LevelConfig
  readonly machineAvailableAt: Map<string, number>
  readonly order: RuntimeOrder
  readonly readyAt: number
}): void {
  let readyAt = input.readyAt

  for (const requiredStep of input.level.requiredWorkflow) {
    if (requiredStep === "ship") {
      const requiredShipState = getRequiredShipState(input.level)
      if (input.order.orderState === requiredShipState) {
        input.order.workflow = "shipped"
        input.events.push({ type: "OrderShipped", orderId: input.order.id, time: readyAt })
      }
      return
    }

    const machine = input.level.machines[requiredStep]
    if (!machine) throw new Error(`No machine found for required step: ${requiredStep}`)
    if (input.order.orderState !== machine.fromState) {
      input.events.push({
        type: "InvalidStepRequest",
        orderId: input.order.id,
        requestedStep: requiredStep,
        currentState: input.order.orderState,
        reason: "invalid-state-for-step",
        time: readyAt,
      })
      return
    }

    const attempt = (input.order.attemptsByStep[requiredStep] ?? 0) + 1
    input.order.attemptsByStep[requiredStep] = attempt
    const startTime = Math.max(readyAt, input.machineAvailableAt.get(machine.id) ?? readyAt)
    if (startTime > readyAt) {
      input.events.push({
        type: "StepQueued",
        orderId: input.order.id,
        step: requiredStep,
        machineId: machine.id,
        queueTime: startTime - readyAt,
        time: readyAt,
      })
    }

    input.events.push({
      type: "StepStarted",
      orderId: input.order.id,
      step: requiredStep,
      machineId: machine.id,
      attempt,
      time: startTime,
    })
    const completedAt = startTime + machine.processTime
    input.machineAvailableAt.set(machine.id, completedAt)

    const failures = input.failures?.[input.order.id] ?? []
    const failure = failures[attempt - 1]
    if (failure) {
      input.events.push({
        type: "StepFailed",
        orderId: input.order.id,
        step: requiredStep,
        machineId: machine.id,
        attempt,
        recoverable: true,
        reason: failure.reason,
        time: completedAt,
      })
      return
    }

    input.order.orderState = machine.toState
    input.events.push({
      type: "StepCompleted",
      orderId: input.order.id,
      step: requiredStep,
      machineId: machine.id,
      attempt,
      fromState: machine.fromState,
      toState: machine.toState,
      time: completedAt,
    })
    readyAt = completedAt
  }
}

function lastOrderEventTime(events: readonly SimEvent[], orderId: OrderId): number {
  return events.reduce((latest, event) => ("orderId" in event && event.orderId === orderId ? Math.max(latest, event.time) : latest), 0)
}

function sortEvents(events: readonly SimEvent[]): SimEvent[] {
  return Array.from(events).sort((left, right) => left.time - right.time)
}

export function deriveRequiredWorkflow(machineConfigs: Partial<Record<Step, MachineConfig>>): WorkflowStep[] {
  const steps: WorkflowStep[] = []
  let currentState: OrderState = "raw"

  while (true) {
    const nextMachine = Object.values(machineConfigs).find(
      (machine) => machine.mandatory && machine.fromState === currentState,
    )

    if (!nextMachine) return [...steps, "ship"]

    steps.push(nextMachine.step)
    currentState = nextMachine.toState
  }
}

function getRequiredShipState(levelConfig: LevelConfig): OrderState {
  const lastRequiredProcessingStep = Array.from(levelConfig.requiredWorkflow)
    .reverse()
    .find((step): step is Step => step !== "ship")

  if (!lastRequiredProcessingStep) return "raw"

  const machine = levelConfig.machines[lastRequiredProcessingStep]
  if (!machine) throw new Error(`No machine found for required step: ${lastRequiredProcessingStep}`)
  return machine.toState
}

export function deriveVisualState(events: readonly SimEvent[], currentTime: number): VisualState {
  const visibleEvents = events.filter((event) => event.time <= currentTime)
  const orders = new Map<OrderId, VisualOrder>()
  const machines = new Map<string, MachineVisualState>(
    Object.values(level.machines).map((machine) => [machine.id, { state: "idle", orderId: null }]),
  )
  const failedAttempts: Extract<SimEvent, { type: "StepFailed" }>[] = []
  const invalidRequests: Extract<SimEvent, { type: "InvalidStepRequest" }>[] = []
  const metrics = { shipped: 0, active: 0, backlog: 0 }

  for (const event of visibleEvents) {
    if (event.type === "OrderCreated") {
      orders.set(event.orderId, {
        id: event.orderId,
        location: "dock",
        workflow: "backlog",
        orderState: "raw",
        attempts: 0,
      })
    }

    if (event.type === "InvalidStepRequest") {
      invalidRequests.push(event)
    }

    if (event.type === "OrderTaken") {
      patchOrder(orders, event.orderId, { workflow: "active" })
    }

    if (event.type === "StepQueued") {
      patchOrder(orders, event.orderId, { location: `${event.machineId}-queue` })
    }

    if (event.type === "StepStarted") {
      machines.set(event.machineId, { state: "working", orderId: event.orderId })
      patchOrder(orders, event.orderId, {
        location: event.machineId,
        attempts: event.attempt,
      })
    }

    if (event.type === "StepFailed") {
      machines.set(event.machineId, { state: "idle", orderId: null })
      failedAttempts.push(event)
      patchOrder(orders, event.orderId, {
        attempts: event.attempt,
        lastFailure: {
          reason: event.reason,
          recoverable: event.recoverable,
          attempt: event.attempt,
        },
      })
    }

    if (event.type === "StepCompleted") {
      machines.set(event.machineId, { state: "idle", orderId: null })
      patchOrder(orders, event.orderId, {
        orderState: event.toState,
        attempts: event.attempt,
        lastFailure: undefined,
      })
    }

    if (event.type === "OrderShipped") {
      patchOrder(orders, event.orderId, {
        location: "shipping",
        workflow: "shipped",
      })
    }
  }

  for (const order of orders.values()) {
    if (order.workflow === "backlog") metrics.backlog += 1
    if (order.workflow === "active") metrics.active += 1
    if (order.workflow === "shipped") metrics.shipped += 1
  }

  return {
    time: currentTime,
    pass: metrics.shipped >= level.passObjective.shippedOrders && currentTime <= level.passObjective.within,
    machines: Object.fromEntries(machines),
    orders: Array.from(orders.values()),
    failedAttempts,
    invalidRequests,
    metrics,
  }
}

function patchOrder(orders: Map<OrderId, VisualOrder>, orderId: OrderId, patch: Partial<VisualOrder>): void {
  const current = orders.get(orderId)
  if (!current) throw new Error(`Unknown order: ${orderId}`)
  orders.set(orderId, { ...current, ...patch })
}

function printScenario(name: string, scenario: Scenario): void {
  const events = simulateRun(scenario)
  const times = Array.from(new Set(events.map((event) => event.time))).sort((a, b) => a - b)

  console.log(`\n=== ${name}: ${scenario.description} ===`)
  console.log("\nEvents:")
  for (const event of events) console.log(`  ${event.time.toString().padStart(2, "0")} ${formatEvent(event)}`)

  console.log("\nProjected VisualState snapshots:")
  for (const time of times) {
    const state = deriveVisualState(events, time)
    console.log(`\n  t=${time} pass=${state.pass}`)
    console.log(`  metrics=${JSON.stringify(state.metrics)}`)
    console.log(`  machines=${JSON.stringify(state.machines)}`)
    console.log(`  orders=${JSON.stringify(state.orders)}`)
    if (state.failedAttempts.length > 0) {
      console.log(`  failedAttempts=${JSON.stringify(state.failedAttempts)}`)
    }
  }
}

function formatEvent(event: SimEvent): string {
  if (event.type === "StepFailed") {
    return `${event.type} order=${event.orderId} step=${event.step} machine=${event.machineId} attempt=${event.attempt} recoverable=${event.recoverable} reason=${event.reason}`
  }
  if (event.type === "StepQueued") {
    return `${event.type} order=${event.orderId} step=${event.step} machine=${event.machineId} wait=${event.queueTime}`
  }
  if (event.type === "StepStarted" || event.type === "StepCompleted") {
    return `${event.type} order=${event.orderId} step=${event.step} machine=${event.machineId} attempt=${event.attempt}`
  }
  if (event.type === "InvalidStepRequest") {
    return `${event.type} order=${event.orderId ?? "n/a"} step=${event.requestedStep ?? "n/a"} reason=${event.reason}`
  }
  return `${event.type} order=${event.orderId}`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const requestedScenario = process.argv[2]

  if (requestedScenario) {
    const scenario = scenarios[requestedScenario]
    if (!scenario) {
      console.error(`Unknown scenario "${requestedScenario}". Choose: ${Object.keys(scenarios).join(", ")}`)
      process.exit(1)
    }
    printScenario(requestedScenario, scenario)
  } else {
    for (const [name, scenario] of Object.entries(scenarios)) {
      printScenario(name, scenario)
    }
  }
}
