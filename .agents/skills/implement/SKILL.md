---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
---

# Proportional implementation

Implement the requested work with the lightest workflow that credibly manages
its risk. Do not expand scope beyond the request.

## Hard rules

- Classify the work before implementation.
- For mixed requests, split the work into independently classified slices.
- Do not invoke another skill automatically unless the selected route genuinely
  requires it.
- Do not commit or push unless the user explicitly requests it.
- If the engineering workflow would cost more than the task itself, choose a
  simpler workflow.
- Skipping TDD does not mean skipping verification.

## 1. Classify each slice

| Category | Use when | Default route |
|---|---|---|
| Cosmetic UI | Copy, spacing, color, typography, icons, layout, or responsive presentation without meaningful behavior changes | Direct implementation, visual/manual verification, self-review |
| Small Feature | Clear, bounded new behavior with limited blast radius | Direct implementation; use selective TDD only for non-trivial durable behavior |
| Bug | Existing behavior differs from intended behavior | Reproduce, diagnose proportionally, fix, add a regression test when valuable |
| Experiment | Work primarily intended to test a product or technical hypothesis | Define the hypothesis and success signal, time-box, build the smallest prototype, avoid production abstractions |
| Architecture | New boundaries, data models, pipelines, infrastructure, or cross-cutting contracts | Resolve important constraints, prototype uncertain assumptions, define contracts, implement vertical slices |
| Refactor | Internal structural change intended to preserve behavior | Establish a behavior baseline, make incremental changes, verify preservation |

## 2. Assess proportionality

Before choosing tools, assess:

| Factor | Values / question |
|---|---|
| Risk | **Low:** local and safe to reverse. **Medium:** shared behavior or important user flow. **High:** auth, billing, privacy, destructive operations, migrations, concurrency, external side effects, or difficult rollback. |
| Ambiguity | **None:** requirements are actionable. **Narrow:** one or two material decisions remain. **Broad and consequential:** several coupled decisions could materially change behavior, architecture, cost, or safety. |
| Blast radius | How many modules, users, contracts, or workflows can the change affect? |
| Expected lifespan | Disposable experiment, short-lived iteration, or durable product behavior? |
| Reversibility | Can the change be cheaply reverted without data loss or external consequences? |

Escalate workflow depth for risk and blast radius, not merely for file count.
Prefer lighter workflows for disposable, reversible work.

## 3. Resolve ambiguity

- Explicit, internally consistent requirements bypass `grill-me`.
- Do not invoke `grill-me` merely because work involves UX or product judgment.
- For Narrow ambiguity, ask targeted questions about only the unresolved
  decisions.
- Use `grill-me` only for Broad and consequential ambiguity: several unresolved,
  coupled decisions that would materially change product behavior, architecture,
  cost, or safety.

## 4. Route the work

### Cosmetic UI

Implement directly. Verify visually or manually and self-review the diff. Add or
run tests only when behavior, accessibility, or a durable contract changed.

### Small Feature

Implement directly by default. Use TDD selectively for non-trivial logic, stable
public contracts, persistence behavior, important state transitions, or
high-risk logic.

### Bug

First reproduce the reported behavior with the cheapest reliable signal. Use a
focused diagnosis for obvious, local causes; invoke the full diagnosing workflow
only for hard, intermittent, unclear, performance-related, or high-risk bugs.
Fix the cause and add a regression test when it protects durable behavior at a
stable seam.

### Experiment

State the hypothesis and observable success signal. Time-box the work and build
the smallest reversible prototype. Avoid generalized abstractions and broad
test coverage. Before shipping an experiment as product code, reclassify it as a
Small Feature or Architecture slice.

### Architecture

Resolve consequential constraints, prototype uncertain technical assumptions,
and define the smallest stable contracts. Implement and validate vertical
slices. Prefer contract tests over speculative comprehensive coverage.

### Refactor

Establish a behavior baseline using existing tests or focused characterization
tests where valuable. Preserve behavior, make incremental structural changes,
and verify after each meaningful slice.

## 5. Apply TDD selectively

TDD is not the default. Use it for:

- Non-trivial logic
- Stable public contracts
- Persistence behavior
- Important state transitions
- High-risk logic
- Explicit test-first requests

Do not require formal TDD for cosmetic work, simple wiring, obvious bounded
changes, or disposable experiments. When TDD is selected, use a stable public
seam and work in small red-green slices.

## 6. Choose the lowest credible validation level

1. Visual/manual inspection
2. Affected-file static check
3. Focused existing test
4. New focused behavior test
5. Relevant subsystem suite
6. Full typecheck
7. Full test suite and build

Choose the lowest level that credibly covers the change. Escalate for shared,
cross-cutting, high-risk, or release-level work. Do not repeatedly typecheck or
run the full suite for a small local change without a concrete reason.

## 7. Choose review depth

| Review | Use when |
|---|---|
| Self-review | Cosmetic UI, disposable experiments, and low-risk local changes |
| Lightweight review | Bounded features, ordinary bugs, and medium-risk changes; check the diff against the request and nearby conventions |
| Full review | Architecture, broad refactors, high-risk changes, release candidates, or explicit review requests |

Invoke the full code-review workflow only when Full review is selected.

## 8. Finish

Report:

- Classification and risk level
- What changed
- Validation performed
- Any remaining uncertainty

Leave changes uncommitted unless the user explicitly asks for a commit or push.
