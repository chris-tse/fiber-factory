# Handoff: Fiber Factory Real Effect Prototype

Repo path:

- `/Users/ctse/code/fiber-factory`

Use this after the user commits/pushes from the current machine, then pulls the repo on another machine with working package registry access.

## Current State

Fiber Factory is a Bun + TypeScript WIP for a programming game where the player writes Effect TS code against a Factory API.

Important durable context is in:

- `CONTEXT.md` - canonical domain language, Machine Failure semantics, and a new Project Notes section about the real Effect prototype/network blocker.
- `prototypes/effect-shaped-api-prototype.ts` - throwaway local Effect-shaped prototype using a tiny stand-in `Effect`.
- `prototypes/NOTES.md` - existing prototype notes and commands.
- `repos/effect` - Effect source subtree for reference only. Do not import from it for the prototype.

The latest domain decisions are already captured in `CONTEXT.md`; do not re-litigate them unless the real Effect prototype exposes a concrete contradiction.

## Worktree Notes

Before this handoff, the visible worktree status included:

```sh
 M AGENTS.md
 M CONTEXT.md
 D bun.lock
```

Only `CONTEXT.md` was intentionally edited for this final handoff step. `AGENTS.md` and `bun.lock` were pre-existing/unresolved worktree changes from this session or user context; do not assume they should be reverted. The user said they will commit/push before resuming elsewhere.

## Network / Install Blocker

The user paused because corporate network blocks appear to be temporarily interfering with package registry TLS.

Observed attempts:

```sh
bun add effect@beta
bun add effect@4.0.0-beta.65 --exact
bun add effect@4.0.0-beta.31 --exact
bun --use-system-ca info effect
```

Failures included:

```text
UNABLE_TO_GET_ISSUER_CERT_LOCALLY
```

`npm view effect@beta version` succeeded and reported:

```text
4.0.0-beta.65
```

`~/code/fb-delete` was inspected as a reference. It is a Bun repo using:

- `effect@4.0.0-beta.31`
- `@effect/platform-bun@4.0.0-beta.31`
- `@effect/vitest@4.0.0-beta.31`

That repo had no obvious project-level `.npmrc` or `bunfig.toml`.

Treat the failed install as an environment/network issue, not a design finding.

## Recommended Next Session

Use `/prototype`.

Goal: build a real Effect integration pressure test, installing the latest beta package instead of importing from `repos/effect`.

Suggested first command on the new machine:

```sh
bun add effect@4.0.0-beta.65 --exact
```

If the latest beta has changed, check first with:

```sh
npm view effect@beta version
```

Then add a prototype, likely:

- `prototypes/real-effect-api-prototype.ts`
- `package.json` script such as `prototype:real-effect-api`
- `prototypes/NOTES.md` entry with the question, run command, and current read

Pressure-test these real Effect APIs:

- `Effect.gen`
- `Effect.all`
- `Effect.retry`
- `Schedule.recurs`
- typed recoverable errors
- defects via `Effect.die` or a diagnostic channel
- service construction/layer ergonomics if cheap enough for a prototype

The key program shape to exercise is:

```ts
const cutOrder = yield* factory.cut(order).pipe(
  Effect.retry(Schedule.recurs(2)),
)
```

Expected semantics to preserve:

- Machine Failure is a typed recoverable Factory API Failure in the Effect error channel.
- Machine Failure also emits Simulation facts: Step start plus Failed Step Attempt.
- Failed attempts consume Virtual Simulation Time and Machine capacity.
- Failed attempts do not advance Order State.
- Failed attempts do not invalidate the current public Active Order by default.
- Factory Program defects such as stale/forged Active Order use should surface as diagnostics/defects, not recoverable Factory API Failures.

## Suggested Verification

Run with Bun:

```sh
bun run prototype:real-effect-api
bun run typecheck
bun test
```

Also keep the older prototype runnable unless intentionally replacing it:

```sh
bun run prototype:effect-api
```

## Avoid For Now

- UI/renderer work
- Monaco/editor/sandbox
- Full level-scoped API generation
- Re-litigating Backlog vs Station Queue semantics
- Re-litigating Machine Failure semantics unless actual Effect exposes a concrete contradiction
- Importing directly from `repos/effect` for the prototype
