# Contributing to Tikka

Thank you for contributing! Please read this guide before opening a PR.

## Getting started

1. Fork the repo and create a branch from `master`.
2. Install dependencies per package: `cd <package> && pnpm install`.
3. Make your changes, add tests, and ensure CI passes locally.
4. Open a pull request — all checks must be green before merging.

## Secret scanning policy

Tikka uses TruffleHog in CI to prevent real credentials from being
committed to the repository. Every PR and push to `master` is scanned
automatically in --only-verified mode.

### What is blocked

Any verified secret detected by TruffleHog will fail the security-scan
CI job and block the PR from merging. This includes:

- AWS access keys and secret keys
- Private keys (RSA, Ed25519, etc.)
- JWT secrets and signing keys
- Database connection strings with embedded credentials
- API tokens (GitHub, Stripe, SendGrid, etc.)
- OAuth client secrets

### What is NOT blocked

- .env.exame files with placeholder values
- Test fixture strings and mock tokens
- Documentation examples
- Stripe test keys (sk_test_ / pk_test_)

See .trufflehog-exclude for the full exclusion list.

### If you get a false positive

1. Confirm the flagged string is not a real credential.
2. Add a pattern to .trufflehog-exclude and explain it in your PR.
3. Never disable the security-scan job without maintainer approval.

### If you accidentally commit a real secret

1. Rotate the secret immediately — assume it is compromised.
2. Notify the maintainers via a private security disclosure.
3. Coordinate history purge with maintainers — do not act alone.

### Running TruffleHog locally
docker run --rm -it 

-v "$(pwd):/repo" 

trufflesecurity/trufflehog:latest 

git file:///repo 

--only-verified 

--exclude-paths /repo/.trufflehog-exclude

## Code style

- TypeScript everywhere; no `any` without justification.
- Run `pnpm run lint` and `pnpm run test` before pushing.
- Keep PRs focused — one concern per PR.

## Cmessages

Follow Conventional Commits (https://www.conventionalcommits.org/):
feat(sdk): add batch purchase support

fix(backend): handle null oracle response

docs: update secret scanning policy

## Opening a PR

- Link the issue your PR resolves (Closes #NNN).
- Fill in the PR template with description and testing notes.
- All CI jobs including security-scan must pass before requesting review.
