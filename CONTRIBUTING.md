# Contributing to ContainerFlow

Thanks for your interest in ContainerFlow! This document explains how to participate **right now**.

## Current status: Pull requests are open

ContainerFlow is still `v0.x` and evolving fast, but **we accept pull requests as of October 5, 2026**.

### Ways to contribute

✅ **Open issues** — bug reports, feature requests, questions, ideas
✅ **Send pull requests** — fixes and features (see below)
✅ **Star the repo** — helps visibility and motivates updates
✅ **Share feedback** — what works, what doesn't, what's missing
✅ **Try it in your setup** — and tell us what you broke

### Sending a pull request

- **For anything non-trivial, open (or comment on) an issue first** so we can agree on scope and approach before you build — it avoids wasted work.
- Keep `bun run typecheck` and `bun run test` green.
- Route any new UI strings through the i18n dictionaries (EN + ES) — see `src/client/i18n.tsx`. Don't hardcode UI strings.
- Add tests for new behavior where it makes sense.
- We prioritize changes that align with the [roadmap](docs/roadmap.md).

Since the architecture is still moving, large or speculative PRs without a prior issue may be asked to wait or scope down.

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md). Please include:

- ContainerFlow version (the `v0.0.X` tag you're on)
- OS + Docker version
- Reproduction steps
- Expected vs actual behavior
- Logs if relevant: `docker logs alteonx-dockerflow-containerflow-1`

## Requesting features

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md). Tell us:

- The problem you're trying to solve (not just the solution)
- Why existing functionality doesn't work
- A rough sketch of how you'd want it to work in the UI

We prioritize features that align with the [roadmap](docs/roadmap.md).

## Reporting security vulnerabilities

**Do not open public issues for security problems.** See [SECURITY.md](SECURITY.md) for the private reporting process.

## Asking questions

Open an issue with the label `question`. No silly questions.

## Local development

If you want to read the code, debug, or experiment locally:

```bash
git clone https://github.com/RGJorge/containerflow.git
cd containerflow
bun install
bun run dev        # frontend + backend with hot reload
bun run typecheck  # TypeScript check
bun run test       # unit tests
bun run build      # production build
```

Read the [README](README.md) for full setup details and architecture.

## Code of Conduct

By participating in any way (issues, comments, future PRs), you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md). TL;DR: be kind, be patient, no harassment.

## Commercial use / partnerships

ContainerFlow is licensed under AGPL-3.0. For commercial use with closed source, partnerships, or sponsored features, contact:

📧 **alteonx.servicios@gmail.com**
