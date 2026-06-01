import { describe, expect, test } from "bun:test"
import { derivePlaybackFrame, deriveVisualState, maxPlaybackTime, prototypeTimeline } from "./projection"

describe("visual renderer projection", () => {
  test("OrderCreated shows a raw Work Token at the Dock", () => {
    const state = deriveVisualState(prototypeTimeline, 0)

    expect(state.metrics).toEqual({ backlog: 1, active: 0, shipped: 0 })
    expect(state.orders[0]).toMatchObject({
      id: "A",
      workflow: "backlog",
      orderState: "raw",
      stationId: "dock",
    })
  })

  test("StepStarted moves the Work Token to the Cutter and marks the Machine working", () => {
    const state = deriveVisualState(prototypeTimeline, 2)

    expect(state.metrics).toEqual({ backlog: 0, active: 1, shipped: 0 })
    expect(state.orders[0]).toMatchObject({ stationId: "cutter-1", orderState: "raw" })
    expect(state.machines["cutter-1"]).toEqual({ state: "working", orderId: "A" })
  })

  test("StepCompleted and immediate OrderShipped leave the authoritative state at Shipping", () => {
    const state = deriveVisualState(prototypeTimeline, 7)

    expect(state.orders[0]).toMatchObject({ stationId: "shipping", workflow: "shipped", orderState: "cut" })
    expect(state.machines["cutter-1"]).toEqual({ state: "idle", orderId: null })
  })

  test("OrderShipped moves the Work Token to Shipping and updates metrics", () => {
    const state = deriveVisualState(prototypeTimeline, 7)

    expect(state.metrics).toEqual({ backlog: 0, active: 0, shipped: 1 })
    expect(state.orders[0]).toMatchObject({ stationId: "shipping", workflow: "shipped", orderState: "cut" })
  })

  test("playback segments keep interpolation separate from VisualState facts", () => {
    const frame = derivePlaybackFrame(prototypeTimeline, 2.4)

    expect(frame.state.orders[0]).toMatchObject({ stationId: "cutter-1" })
    expect(frame.segments[0]).toMatchObject({
      orderId: "A",
      fromStationId: "dock",
      toStationId: "cutter-1",
      startedAt: 2,
    })
    expect(frame.segments[0]?.progress).toBeGreaterThan(0)
    expect(frame.segments[0]?.progress).toBeLessThan(1)
  })

  test("OrderShipped has a readable Cutter to Shipping playback segment after the event time", () => {
    const frame = derivePlaybackFrame(prototypeTimeline, 7.7)

    expect(frame.state.orders[0]).toMatchObject({ stationId: "shipping", workflow: "shipped" })
    expect(frame.segments[0]).toMatchObject({
      orderId: "A",
      fromStationId: "cutter-1",
      toStationId: "shipping",
      startedAt: 7,
      duration: 1.4,
    })
    expect(frame.segments[0]?.progress).toBeGreaterThan(0)
    expect(frame.segments[0]?.progress).toBeLessThan(1)
  })

  test("playback continues long enough to animate the last Simulation Event", () => {
    expect(maxPlaybackTime(prototypeTimeline)).toBe(8.4)
  })
})
