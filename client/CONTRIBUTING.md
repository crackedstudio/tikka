# Contributing

Thanks for your interest in contributing to Tikka! This guide explains the
expected workflow for pull requests.

## How to Contribute

1. Fork the repo and create a feature branch:

```bash
git checkout -b feat/your-change
```

2. Make your changes with focused commits.
3. Run checks before submitting:

```bash
pnpm lint
pnpm build
```

4. Open a pull request with a clear description of the change.

## Pull Request Checklist

- Provide a concise summary of the change and motivation.
- Keep the scope focused; avoid unrelated refactors.
- Include screenshots or recordings for UI changes.
- Ensure `pnpm lint` and `pnpm build` pass.
- Link related issues if applicable.

## Reporting Issues

Use GitHub Issues to report bugs or propose improvements. Provide clear steps
to reproduce and expected vs actual behavior.

