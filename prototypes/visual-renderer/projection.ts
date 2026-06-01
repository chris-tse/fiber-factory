export type OrderId = string
export type Step = "cut"
export type OrderState = "raw" | "cut"
export type Workflow = "backlog" | "active" | "shipped"
export type StationId = "dock" | "cutter-1" | "shipping"

export type SimulationEvent =
  | { readonly type: "OrderCreated"; readonly orderId: OrderId; readonly time: number }
  | { readonly type: "OrderTaken"; readonly orderId: OrderId; readonly time: number }
  | {
      readonly type: "StepStarted"
      readonly orderId: OrderId
      readonly step: Step
      readonly machineId: "cutter-1"
      readonly time: number
    }
  | {
      readonly type: "StepCompleted"
      readonly orderId: OrderId
      readonly step: Step
      readonly machineId: "cutter-1"
      readonly fromState: "raw"
      readonly toState: "cut"
      readonly time: number
    }
  | { readonly type: "OrderShipped"; readonly orderId: OrderId; readonly time: number }

export type VisualOrder = {
  readonly id: OrderId
  readonly workflow: Workflow
  readonly orderState: OrderState
  readonly stationId: StationId
  readonly active: boolean
}

export type MachineVisualState = {
  readonly state: "idle" | "working"
  readonly orderId: OrderId | null
}

export type VisualState = {
  readonly time: number
  readonly orders: readonly VisualOrder[]
  readonly machines: Record<"cutter-1", MachineVisualState>
  readonly metrics: {
    readonly backlog: number
    readonly active: number
    readonly shipped: number
  }
}

export type PlaybackSegment = {
  readonly orderId: OrderId
  readonly fromStationId: StationId
  readonly toStationId: StationId
  readonly startedAt: number
  readonly duration: number
  readonly progress: number
}

export type PlaybackFrame = {
  readonly state: VisualState
  readonly segments: readonly PlaybackSegment[]
}

export const prototypeTimeline = [
  { type: "OrderCreated", orderId: "A", time: 0 },
  { type: "OrderTaken", orderId: "A", time: 1 },
  { type: "StepStarted", orderId: "A", step: "cut", machineId: "cutter-1", time: 2 },
  {
    type: "StepCompleted",
    orderId: "A",
    step: "cut",
    machineId: "cutter-1",
    fromState: "raw",
    toState: "cut",
    time: 7,
  },
  { type: "OrderShipped", orderId: "A", time: 7 },
] as const satisfies readonly SimulationEvent[]

const defaultMovementDuration = 0.8
const shippingMovementDuration = 1.4

export function deriveVisualState(events: readonly SimulationEvent[], currentTime: number): VisualState {
  const orders = new Map<OrderId, VisualOrder>()
  const machines: VisualState["machines"] = {
    "cutter-1": { state: "idle", orderId: null },
  }

  for (const event of events) {
    if (event.time > currentTime) continue

    if (event.type === "OrderCreated") {
      orders.set(event.orderId, {
        id: event.orderId,
        workflow: "backlog",
        orderState: "raw",
        stationId: "dock",
        active: false,
      })
      continue
    }

    if (event.type === "OrderTaken") {
      patchOrder(orders, event.orderId, { workflow: "active", active: true })
      continue
    }

    if (event.type === "StepStarted") {
      machines[event.machineId] = { state: "working", orderId: event.orderId }
      patchOrder(orders, event.orderId, { stationId: event.machineId })
      continue
    }

    if (event.type === "StepCompleted") {
      machines[event.machineId] = { state: "idle", orderId: null }
      patchOrder(orders, event.orderId, { orderState: event.toState })
      continue
    }

    if (event.type === "OrderShipped") {
      patchOrder(orders, event.orderId, { workflow: "shipped", stationId: "shipping", active: false })
    }
  }

  const orderList = Array.from(orders.values())

  return {
    time: currentTime,
    orders: orderList,
    machines,
    metrics: {
      backlog: orderList.filter((order) => order.workflow === "backlog").length,
      active: orderList.filter((order) => order.workflow === "active").length,
      shipped: orderList.filter((order) => order.workflow === "shipped").length,
    },
  }
}

export function derivePlaybackFrame(events: readonly SimulationEvent[], currentTime: number): PlaybackFrame {
  const state = deriveVisualState(events, currentTime)
  const segments: PlaybackSegment[] = []

  for (const event of events) {
    const duration = movementDuration(event)
    if (event.time > currentTime || currentTime - event.time > duration) continue

    const movement = movementForEvent(events, event)
    if (!movement) continue

    segments.push({
      ...movement,
      startedAt: event.time,
      duration,
      progress: Math.min(1, Math.max(0, (currentTime - event.time) / duration)),
    })
  }

  return { state, segments }
}

export function maxEventTime(events: readonly SimulationEvent[]): number {
  return events.reduce((max, event) => Math.max(max, event.time), 0)
}

export function maxPlaybackTime(events: readonly SimulationEvent[]): number {
  return events.reduce((max, event) => Math.max(max, event.time + movementDuration(event)), 0)
}

function movementDuration(event: SimulationEvent): number {
  if (event.type === "OrderShipped") return shippingMovementDuration
  if (event.type === "StepStarted") return defaultMovementDuration
  return 0
}

function movementForEvent(
  events: readonly SimulationEvent[],
  event: SimulationEvent,
): Pick<PlaybackSegment, "orderId" | "fromStationId" | "toStationId"> | null {
  if (event.type === "StepStarted") {
    const prior = deriveVisualStateBefore(events, event)
    const order = prior.orders.find((candidate) => candidate.id === event.orderId)
    return { orderId: event.orderId, fromStationId: order?.stationId ?? "dock", toStationId: event.machineId }
  }

  if (event.type === "OrderShipped") {
    const prior = deriveVisualStateBefore(events, event)
    const order = prior.orders.find((candidate) => candidate.id === event.orderId)
    return { orderId: event.orderId, fromStationId: order?.stationId ?? "cutter-1", toStationId: "shipping" }
  }

  return null
}

function deriveVisualStateBefore(events: readonly SimulationEvent[], event: SimulationEvent): VisualState {
  return deriveVisualState(
    events.filter((candidate) => candidate.time < event.time),
    event.time,
  )
}

function patchOrder(orders: Map<OrderId, VisualOrder>, orderId: OrderId, patch: Partial<VisualOrder>): void {
  const current = orders.get(orderId)
  if (!current) throw new Error(`Unknown order: ${orderId}`)
  orders.set(orderId, { ...current, ...patch })
}
