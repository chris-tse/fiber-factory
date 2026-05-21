# Keep the Factory API Domain-Only

The Factory API should expose flat named factory capabilities such as `takeOrder`, `cut`, `assemble`, `inspect`, and `ship`, while orchestration remains normal Effect code written in the Factory Program. We intentionally avoid game-provided orchestration helpers such as `processForever`, `takeAndFork`, `withRetry`, or `processConcurrently` because the game should teach transferable Effect patterns rather than hide them behind simulator convenience APIs.

Station Selection may appear as method options in early levels, such as `factory.cut(order, { station: "fast-cutter" })`, while Machine Handles are reserved for later levels where specific machine identity or parallel machine choice is a meaningful mechanic.

The player-facing Factory API should be level-scoped: a Level's Stations, Machines, Output Station, and active mechanics determine which Factory API Methods are available, and the TypeScript type presented to the player should expose only those methods.
