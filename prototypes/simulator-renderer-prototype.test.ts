#!/usr/bin/env node

// PROTOTYPE TESTS - Bun checks for the throwaway simulator model.

import { describe, expect, test } from "bun:test"
import { deriveRequiredWorkflow, deriveVisualState, level, simulateRun } from "./simulator-renderer-prototype"

describe("simulator renderer prototype", () => {
  test("happy path: level workflow cut -> ship passes", () => {
    const events = simulateRun({
      orders: ["A", "B"],
      instructions: [
        { type: "takeOrder" },
        { type: "cut", orderId: "A" },
        { type: "ship", orderId: "A" },
        { type: "takeOrder" },
        { type: "cut", orderId: "B" },
        { type: "ship", orderId: "B" },
      ],
    })

    expect(events.map((event) => event.type)).toEqual([
      "OrderCreated",
      "OrderCreated",
      "OrderTaken",
      "StepStarted",
      "StepCompleted",
      "OrderShipped",
      "OrderTaken",
      "StepStarted",
      "StepCompleted",
      "OrderShipped",
    ])

    const finalState = deriveVisualState(events, lastTime(events))
    expect(finalState.pass).toBe(true)
    expect(finalState.metrics).toEqual({ shipped: 2, active: 0, backlog: 0 })
  })

  test("invalid instruction: ship before cut is rejected", () => {
    const events = simulateRun({
      orders: ["A"],
      instructions: [{ type: "takeOrder" }, { type: "ship", orderId: "A" }],
    })

    expect(events.map((event) => event.type)).toEqual(["OrderCreated", "OrderTaken", "InvalidStepRequest"])
    const invalid = events[2]
    expect(invalid?.type).toBe("InvalidStepRequest")
    if (invalid?.type !== "InvalidStepRequest") throw new Error("Expected InvalidStepRequest")
    expect(invalid.requestedStep).toBe("ship")
    expect(invalid.currentState).toBe("raw")
    expect(invalid.reason).toBe("order-not-ready-to-ship")

    const finalState = deriveVisualState(events, lastTime(events))
    expect(finalState.pass).toBe(false)
    expect(finalState.invalidRequests).toHaveLength(1)
    expect(finalState.orders[0]?.workflow).toBe("active")
    expect(finalState.orders[0]?.orderState).toBe("raw")
  })

  test("recoverable machine failure: failed attempt does not advance order state", () => {
    const events = simulateRun({
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
    })

    const failed = events.find((event) => event.type === "StepFailed")
    expect(failed).toBeDefined()
    if (failed?.type !== "StepFailed") throw new Error("Expected StepFailed")
    expect(failed.orderId).toBe("A")
    expect(failed.attempt).toBe(1)
    expect(failed.recoverable).toBe(true)

    const afterFailure = deriveVisualState(events, failed.time)
    const orderA = getOrder(afterFailure, "A")
    expect(orderA.orderState).toBe("raw")
    expect(orderA.workflow).toBe("active")
    expect(orderA.lastFailure?.reason).toBe("blade-jam")
    expect(afterFailure.failedAttempts).toHaveLength(1)

    const finalState = deriveVisualState(events, lastTime(events))
    expect(finalState.pass).toBe(true)
    expect(getOrder(finalState, "A").orderState).toBe("cut")
    expect(getOrder(finalState, "A").workflow).toBe("shipped")
  })

  test("busy machine: concurrent dispatch queues orders and resolves each workflow on completion", () => {
    const events = simulateRun({
      orders: ["A", "B", "C", "D", "E"],
      instructions: [{ type: "dispatchConcurrently", count: 5 }],
    })

    expect(events.filter((event) => event.type === "OrderTaken").map((event) => event.orderId)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ])

    const queued = events.filter((event) => event.type === "StepQueued")
    expect(queued.map((event) => event.orderId)).toEqual(["B", "C", "D", "E"])
    expect(queued.map((event) => event.queueTime)).toEqual([5, 10, 15, 20])

    const started = events.filter((event) => event.type === "StepStarted")
    expect(started.map((event) => event.time)).toEqual([0, 5, 10, 15, 20])

    const shipped = events.filter((event) => event.type === "OrderShipped")
    expect(shipped.map((event) => event.time)).toEqual([5, 10, 15, 20, 25])

    const queuedState = deriveVisualState(events, 0)
    expect(getOrder(queuedState, "A").location).toBe("cutter-1")
    expect(getOrder(queuedState, "B").location).toBe("cutter-1-queue")
    expect(queuedState.machines["cutter-1"]).toEqual({ state: "working", orderId: "A" })

    const finalState = deriveVisualState(events, lastTime(events))
    expect(finalState.metrics).toEqual({ shipped: 5, active: 0, backlog: 0 })
  })

  test("level-defined workflow: all orders follow the same required steps for now", () => {
    const events = simulateRun({
      orders: ["A", "B"],
      instructions: [
        { type: "takeOrder" },
        { type: "cut", orderId: "A" },
        { type: "ship", orderId: "A" },
        { type: "takeOrder" },
        { type: "ship", orderId: "B" },
      ],
    })

    expect(level.requiredWorkflow).toEqual(["cut", "ship"])
    const invalid = events.find((event) => event.type === "InvalidStepRequest")
    expect(invalid).toBeDefined()
    if (invalid?.type !== "InvalidStepRequest") throw new Error("Expected InvalidStepRequest")
    expect(invalid.orderId).toBe("B")
    expect(invalid.requestedStep).toBe("ship")
    expect(invalid.currentState).toBe("raw")
  })

  test("required workflow can be derived from mandatory machines in early levels", () => {
    expect(
      deriveRequiredWorkflow({
        cut: { id: "cutter-1", step: "cut", processTime: 5, fromState: "raw", toState: "cut", mandatory: true },
      }),
    ).toEqual(["cut", "ship"])

    expect(
      deriveRequiredWorkflow({
        cut: { id: "cutter-1", step: "cut", processTime: 5, fromState: "raw", toState: "cut", mandatory: true },
        assemble: {
          id: "assembler-1",
          step: "assemble",
          processTime: 8,
          fromState: "cut",
          toState: "assembled",
          mandatory: true,
        },
      }),
    ).toEqual(["cut", "assemble", "ship"])
  })

  test("optional machines do not automatically become required workflow steps", () => {
    expect(
      deriveRequiredWorkflow({
        cut: { id: "cutter-1", step: "cut", processTime: 5, fromState: "raw", toState: "cut", mandatory: true },
        assemble: {
          id: "repair-bench-1",
          step: "assemble",
          processTime: 8,
          fromState: "cut",
          toState: "assembled",
          mandatory: false,
        },
      }),
    ).toEqual(["cut", "ship"])
  })

  test("multi-step workflow: cut -> assemble -> ship passes when assembler is mandatory", () => {
    const assemblerLevel = createAssemblerLevel()
    const events = simulateRun({
      level: assemblerLevel,
      orders: ["A"],
      instructions: [
        { type: "takeOrder" },
        { type: "cut", orderId: "A" },
        { type: "assemble", orderId: "A" },
        { type: "ship", orderId: "A" },
      ],
    })

    expect(assemblerLevel.requiredWorkflow).toEqual(["cut", "assemble", "ship"])
    expect(events.map((event) => event.type)).toEqual([
      "OrderCreated",
      "OrderTaken",
      "StepStarted",
      "StepCompleted",
      "StepStarted",
      "StepCompleted",
      "OrderShipped",
    ])

    const finalState = deriveVisualState(events, lastTime(events))
    expect(finalState.orders[0]?.orderState).toBe("assembled")
    expect(finalState.orders[0]?.workflow).toBe("shipped")
  })

  test("multi-step workflow: assemble before cut is rejected", () => {
    const events = simulateRun({
      level: createAssemblerLevel(),
      orders: ["A"],
      instructions: [{ type: "takeOrder" }, { type: "assemble", orderId: "A" }],
    })

    const invalid = events.find((event) => event.type === "InvalidStepRequest")
    expect(invalid).toBeDefined()
    if (invalid?.type !== "InvalidStepRequest") throw new Error("Expected InvalidStepRequest")
    expect(invalid.orderId).toBe("A")
    expect(invalid.requestedStep).toBe("assemble")
    expect(invalid.currentState).toBe("raw")
    expect(invalid.reason).toBe("invalid-state-for-step")
  })

  test("multi-step workflow: ship before assemble is rejected when assembler is mandatory", () => {
    const events = simulateRun({
      level: createAssemblerLevel(),
      orders: ["A"],
      instructions: [{ type: "takeOrder" }, { type: "cut", orderId: "A" }, { type: "ship", orderId: "A" }],
    })

    const invalid = events.find((event) => event.type === "InvalidStepRequest")
    expect(invalid).toBeDefined()
    if (invalid?.type !== "InvalidStepRequest") throw new Error("Expected InvalidStepRequest")
    expect(invalid.orderId).toBe("A")
    expect(invalid.requestedStep).toBe("ship")
    expect(invalid.currentState).toBe("cut")
    expect(invalid.reason).toBe("order-not-ready-to-ship")
  })
})

function lastTime(events: ReturnType<typeof simulateRun>): number {
  return events.at(-1)?.time ?? 0
}

function getOrder(state: ReturnType<typeof deriveVisualState>, orderId: string) {
  const order = state.orders.find((candidate) => candidate.id === orderId)
  expect(order).toBeDefined()
  if (!order) throw new Error(`Expected order ${orderId}`)
  return order
}

function createAssemblerLevel() {
  const machines = {
    cut: { id: "cutter-1", step: "cut", processTime: 5, fromState: "raw", toState: "cut", mandatory: true },
    assemble: {
      id: "assembler-1",
      step: "assemble",
      processTime: 8,
      fromState: "cut",
      toState: "assembled",
      mandatory: true,
    },
  } as const

  return {
    passObjective: { shippedOrders: 1, within: 30 },
    requiredWorkflow: deriveRequiredWorkflow(machines),
    machines,
  }
}
