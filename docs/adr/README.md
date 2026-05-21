# Architecture Decision Records

This directory captures the reasoning behind significant architectural choices in PumpKit. Each ADR documents *what* we decided, *why* we decided it, and *what we considered and rejected*. New ADRs go through review like code.

## Why ADRs?

- **Decisions outlive the people who made them.** "Why is this a monorepo?" is a recurring question; the answer should be findable.
- **Constraints get forgotten.** An ADR records the constraints that drove the decision so future contributors can tell whether a constraint still applies.
- **PR discussion is ephemeral.** GitHub PR comments are hard to find six months later. ADRs are part of the canonical docs tree.

## Status lifecycle

| Status | Meaning |
|---|---|
| `Proposed` | Drafted, in review |
| `Accepted` | Merged, in effect |
| `Deprecated` | Superseded by a later ADR; preserved for history |
| `Rejected` | Considered, decided against |

A `Deprecated` or `Rejected` ADR is **not deleted** — it stays in the tree with a pointer to the ADR that replaced it. The history of rejected ideas is as valuable as the history of accepted ones.

## Format

Each ADR is a markdown file named `NNNN-short-kebab-title.md`. Use the next available 4-digit number. Sections:

1. **Status** — one of the lifecycle values above
2. **Context** — the situation that prompted the decision; constraints; stakeholders
3. **Decision** — what we're doing
4. **Consequences** — both positive and negative effects, including future obligations
5. **Considered alternatives** — what we looked at and why we didn't pick it

Keep ADRs short. Aim for 1–3 pages. If you need more, you're probably writing a design doc, not an ADR — link to it.

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-typed-sdk-decoders.md) | Use typed SDK decoders over hand-rolled byte parsing | Accepted |
| [0002](0002-monorepo-layout.md) | Turborepo monorepo with workspace packages | Accepted |
| [0003](0003-tmp-scratch-policy.md) | `tmp/` for ephemeral scratch work | Accepted |

## See also

- [docs/architecture.md](../architecture.md) — current-state architecture overview
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — contribution workflow
