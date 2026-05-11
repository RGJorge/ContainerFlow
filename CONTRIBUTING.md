# Contributing to ContainerFlow

Thanks for your interest in ContainerFlow! This document explains how to participate **right now**.

## Current status: Issues only

ContainerFlow is in early development (`v0.x`). Until the architecture stabilizes and there's an active community, **we're not accepting pull requests yet**.

### What you can do today

✅ **Open issues** — bug reports, feature requests, questions, ideas
✅ **Star the repo** — helps visibility and motivates updates
✅ **Share feedback** — what works, what doesn't, what's missing
✅ **Try it in your setup** — and tell us what you broke

### What's coming

Once the project has a stable foundation, we'll open pull requests with:
- A `CODE_OF_CONDUCT.md` to set community expectations (already in repo)
- Coding standards / linting rules
- A "good first issue" label for easy entry points
- Review SLAs

Estimated timeline: when version reaches `v0.1.0` or earlier if there's clear demand.

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
