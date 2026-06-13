# Governance

How decisions get made on PumpKit. Lightweight — there are no committees, no votes, no quorums. We optimise for shipping good code.

## Roles

### Maintainers

Maintainers have write access and merge authority. Today the maintainer set is:

- [@nirholas](https://github.com/nirholas) — project lead

A maintainer can:

- Merge PRs after review
- Cut releases (see [.github/workflows/release.yml](.github/workflows/release.yml))
- Update CODEOWNERS, settings, secrets
- Add or remove maintainers (with sign-off from another maintainer if more than one exists)

A maintainer is **expected to**:

- Follow [CONTRIBUTING.md](CONTRIBUTING.md) for their own changes
- Run the security audits ([tools/audit-dependencies.sh](tools/audit-dependencies.sh)) before each release
- Respond to PR/issue triage within ~7 days on average
- Honour the responsible-disclosure policy in [SECURITY.md](SECURITY.md)

### Contributors

Anyone who opens a PR or issue. No formal onboarding. Add yourself to [AUTHORS.md](AUTHORS.md) in your first PR.

### Reviewers

Any maintainer or invited contributor with reviewer-level access. The set of reviewers is intentionally a superset of maintainers — non-maintainers can leave non-blocking review comments.

## Decision-making

### Code changes

1. **Trivial** (typo, doc edit, single-file fix): PR + 1 maintainer review → merge.
2. **Non-trivial** (new feature, refactor, API change): PR + 1 maintainer review + green CI → merge. Reviewer is expected to actually run the change locally if it's load-bearing.
3. **Breaking change**: PR + 2 maintainer reviews (or 1 maintainer + ack from a known consumer) + changeset marking major bump. Open an issue first to discuss scope when possible.
4. **Security fix**: see [SECURITY.md](SECURITY.md). Private disclosure path; do not open public issues for vulnerabilities.

### Architectural changes

For anything that affects the public API of `@pumpkit/core`, the on-chain assumptions, or the framework's shape:

1. Open a discussion or issue describing the change + rationale.
2. Write a short ADR — see [docs/adr/](docs/adr/) for the format. Reuse the template at [docs/adr/README.md](docs/adr/README.md).
3. Get 1 maintainer agreement before merging the ADR PR.
4. Implementation PRs can land separately, but reference the ADR.

ADRs that have shipped don't get edited; they get superseded by a new ADR that says "this replaces N".

### Roadmap changes

The [ROADMAP.md](ROADMAP.md) is curated by maintainers but PRs are welcome. Suggested format: open a PR to ROADMAP.md with rationale. Maintainers merge, edit, or close.

## Conflicts

If two maintainers disagree:

1. **Discuss in writing** on the PR or issue.
2. If unresolved after a reasonable back-and-forth (say, a few rounds), **status quo wins** — the change doesn't merge.
3. If the disagreement is recurring or structural, escalate by opening an issue with the `governance` label and inviting more voices.

We don't vote because we're small. If we grow, we'll add voting and revise this section.

## Removal

A maintainer can be removed by:

- Voluntarily stepping down (open a PR to update this doc).
- Mutual agreement among remaining maintainers.
- Code of Conduct violation per [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Forking + downstream

PumpKit is MIT-licensed. You are free to fork and ship a derivative. We ask only:

- Don't claim affiliation with the upstream maintainers.
- Don't reuse the `@pumpkit/*` npm scope.
- Respect the trademarks of pump.fun itself — that's separate from PumpKit's license.

## Funding

PumpKit is built without funding from pump.fun, validators, or any other commercial entity. Maintainers may accept sponsorships ([.github/FUNDING.yml](.github/FUNDING.yml)). Funding does **not** confer roadmap influence.

## Changes to this document

Open a PR. Same review rules as any other code change. This document is not sacred — when reality diverges from it, edit it.
