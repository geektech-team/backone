# Controller decorators Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline, task by task. Preserve the current checkout and leave changes uncommitted.

**Goal:** Deliver an optional, zero-dependency Controller API and a usable REST scaffold.

**Architecture:** Decorators record metadata in WeakMaps. Explicit registration validates a complete batch, binds instance methods once, and delegates to the existing server. A separate package entry keeps this optional.

**Tech Stack:** Bun, strict TypeScript standard decorators, bun:test.

**Spec:** `docs/superpowers/specs/2026-11-02-controller-decorators-design.md`

## Global Constraints

- Zero runtime dependencies; no reflect-metadata or TSone in published packages.
- Standard decorators; Controller source consumers require Bun >=1.3.10.
- Existing functional APIs and safe initialization behavior remain supported.
- Work in the current checkout. No commits or publication in this task.

## Review Focus

- Inherited routes must not leak metadata between sibling controllers.
- Failed registration batches must not partially register routes.
- Prefix and dynamic-parameter aliases must not bypass duplicate detection.
- Package subpath and main exports must share error/runtime identity.
- Generated applications must execute requests against built package exports.

### Task 1: Controller registration and package entry

**Files:** `packages/backone/lib/decorators/{index,metadata,register}.ts`,
`packages/backone/tests/decorators.test.ts`, package manifest/build, root tsconfig.

**Interfaces:** Produces Controller, HTTP method decorators, Use,
`registerControllers(app: BackOneServer, controllers: readonly object[]): readonly ControllerRoute[]`.

- [x] Write and run failing request tests: methods, params, this/private fields,
      async responses/errors, Use order/short-circuit, independent apps, inheritance,
      batch atomicity, repeated registrations, prefix/param duplicate aliases.
- [x] Implement metadata collection and validation before delegating to app.add.
- [x] Add `/decorators` exports, build entry and TypeScript paths mapping.
- [x] Verify unit tests and consumer import/error identity against built exports.

### Task 2: Controller REST scaffold

**Files:** CLI types, parser, initializer, controller template module, CLI tests.

**Interfaces:** `InitOptions.style?: 'functional' | 'controller'`, optional CLI
`--style`, rest-api controller source generation with a testable app factory.

- [x] Write/run failing tests for controller generation, invalid combinations
      before writes, missing style value, default selection and overwrite retention.
- [x] Implement style handling and runnable CRUD template with explicit services.
- [x] Exercise generated CRUD/validation/middleware against built package exports.

### Task 3: Examples, documentation and verification

**Files:** framework EN/ZH README, CLI README, docs pages/navigation, playground.

- [x] Add a Controller REST playground and bilingual usage/lifecycle/version docs.
- [x] Run all tests, root/docs typechecks, build, relevant lint and diff checks.
- [x] Review the full change for spec coverage and fix material findings.

## Execution record

- User approval: chat, “好的，开始首版优化”.
- Implementation proceeds in this checkout; no additional approval gate or commit.

- Task 1 complete: real Request tests and built-export error identity checks pass.
- Task 2 complete: generated CRUD app passes its own tsc check using built exports;
  invalid style/template combinations and overwrite retention pass.
- Task 3 complete: root/docs typechecks, full build, docs build, formatting and
  diff checks pass. Final suite: 204 pass, 0 fail (19 files).
- Final review: independent read-only review completed. Constructor binding route
  loss was reproduced, fixed, and regression-tested; non-callable/accessor instance
  shadows remain hidden. Chinese version-floor Markdown was corrected.
- Decision: a callable instance replacement keeps the visible prototype method's
  route declaration. Prototype-method overrides still hide inherited declarations.
- Runtime limitation: Bun 1.4.0 fails to transpile direct #private field assignment
  in decorated methods; independently reproduced and documented. The examples use
  service methods and the private dependency binding test passes.
- Environment: sandboxed socket integration tests could not bind port 0; the full
  suite passes with local socket access. No failing tests remain.
- Lint: zero errors. Existing backone-utils warnings (18) and unchanged docs
  parameter warnings remain; the new implementation introduces no warnings.
- Changes remain uncommitted and unpublished.
