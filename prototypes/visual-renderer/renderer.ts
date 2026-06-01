import {
  derivePlaybackFrame,
  maxPlaybackTime,
  prototypeTimeline,
  type OrderId,
  type StationId,
  type VisualOrder,
} from "./projection"

type Point = {
  readonly x: number
  readonly y: number
}

const tokenLayer = requiredElement<HTMLElement>("[data-token-layer]")
const playToggle = requiredElement<HTMLButtonElement>("[data-play-toggle]")
const reset = requiredElement<HTMLButtonElement>("[data-reset]")
const scrubber = requiredElement<HTMLInputElement>("[data-scrubber]")
const timeLabel = requiredElement<HTMLElement>("[data-time-label]")
const eventList = requiredElement<HTMLElement>("[data-event-list]")
const maxTime = maxPlaybackTime(prototypeTimeline)

let currentTime = 0
let playing = false
let lastFrameAt = performance.now()

scrubber.max = String(maxTime)

playToggle.addEventListener("click", () => {
  playing = !playing
  lastFrameAt = performance.now()
  render()
})

reset.addEventListener("click", () => {
  playing = false
  currentTime = 0
  render()
})

scrubber.addEventListener("input", () => {
  playing = false
  currentTime = Number(scrubber.value)
  render()
})

renderEventList()
render()
requestAnimationFrame(tick)

function tick(now: number): void {
  if (playing) {
    const elapsedSeconds = (now - lastFrameAt) / 1000
    currentTime = Math.min(maxTime, currentTime + elapsedSeconds * 1.25)
    if (currentTime >= maxTime) playing = false
    render()
  }

  lastFrameAt = now
  requestAnimationFrame(tick)
}

function render(): void {
  const frame = derivePlaybackFrame(prototypeTimeline, currentTime)
  const tokens = new Map<OrderId, VisualOrder>(frame.state.orders.map((order) => [order.id, order]))
  const stationPoints = getStationPoints()

  tokenLayer.replaceChildren(
    ...frame.state.orders.map((order) => {
      const segment = frame.segments.find((candidate) => candidate.orderId === order.id)
      const point = segment
        ? interpolate(stationPoints[segment.fromStationId], stationPoints[segment.toStationId], segment.progress)
        : stationPoints[order.stationId]

      return renderToken(order, point)
    }),
  )

  for (const [machineId, machine] of Object.entries(frame.state.machines)) {
    const light = document.querySelector<HTMLElement>(`[data-machine-light="${machineId}"]`)
    const label = document.querySelector<HTMLElement>(`[data-machine-label="${machineId}"]`)
    light?.classList.toggle("is-working", machine.state === "working")
    if (label) label.textContent = machine.state === "working" ? `Cutting ${machine.orderId ?? ""}` : "Idle"
  }

  for (const key of ["backlog", "active", "shipped"] as const) {
    const metric = document.querySelector<HTMLElement>(`[data-metric="${key}"]`)
    if (metric) metric.textContent = String(frame.state.metrics[key])
  }

  for (const item of Array.from(eventList.querySelectorAll<HTMLElement>("[data-event-time]"))) {
    const eventTime = Number(item.dataset.eventTime)
    item.classList.toggle("is-past", eventTime <= currentTime)
  }

  playToggle.textContent = playing ? "Ⅱ" : "▶"
  playToggle.setAttribute("aria-label", playing ? "Pause" : "Play")
  scrubber.value = String(currentTime)
  timeLabel.textContent = `t=${currentTime.toFixed(1)}`

  for (const station of Array.from(document.querySelectorAll<HTMLElement>("[data-station]"))) {
    const stationId = station.dataset.station as StationId
    const hasToken = Array.from(tokens.values()).some((order) => order.stationId === stationId)
    station.classList.toggle("has-token", hasToken)
  }
}

function renderToken(order: VisualOrder, point: Point): HTMLElement {
  const token = document.createElement("div")
  token.className = `work-token is-${order.orderState} is-${order.workflow}`
  token.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`
  token.dataset.orderId = order.id
  token.innerHTML = `<span>${order.id}</span><small>${order.orderState}</small>`
  return token
}

function renderEventList(): void {
  eventList.replaceChildren(
    ...prototypeTimeline.map((event) => {
      const item = document.createElement("button")
      item.type = "button"
      item.className = "event-item"
      item.dataset.eventTime = String(event.time)
      item.innerHTML = `<strong>${event.time.toFixed(0)}</strong><span>${formatEvent(event)}</span>`
      item.addEventListener("click", () => {
        playing = false
        currentTime = event.time
        render()
      })
      return item
    }),
  )
}

function formatEvent(event: (typeof prototypeTimeline)[number]): string {
  if (event.type === "StepStarted") return `StepStarted ${event.orderId} -> Cutter`
  if (event.type === "StepCompleted") return `StepCompleted ${event.orderId}: ${event.toState}`
  return `${event.type} ${event.orderId}`
}

function interpolate(from: Point, to: Point, progress: number): Point {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  }
}

function getStationPoints(): Record<StationId, Point> {
  const layerRect = tokenLayer.getBoundingClientRect()

  return {
    dock: stationAnchor("dock", layerRect),
    "cutter-1": stationAnchor("cutter-1", layerRect),
    shipping: stationAnchor("shipping", layerRect),
  }
}

function stationAnchor(stationId: StationId, layerRect: DOMRect): Point {
  const station = requiredElement<HTMLElement>(`[data-station="${stationId}"]`)
  const rect = station.getBoundingClientRect()

  return {
    x: rect.left - layerRect.left + rect.width / 2,
    y: rect.top - layerRect.top - 48,
  }
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing required element: ${selector}`)
  return element
}
