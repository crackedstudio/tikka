---
'@tikka/sdk': minor
---

Guard the wallet layer for SSR and non-browser runtimes.

`WalletAdapter.checkAvailability()` is a new non-throwing runtime check that
returns a typed `WalletAvailability` (`available` / `unsupported-environment` /
`extension-not-installed`) instead of making callers catch a throw to discover
that a wallet cannot work here. `isAvailable()` is unchanged and the two always
agree on `available`.

Every read of `window`, `document`, or an injected extension global now goes
through `sdk/src/utils/environment.ts` and happens _inside_ a method, never at
module scope. `LobstrAdapter` no longer statically imports
`@lobstrco/signer-extension-api` — a browser-only package that reads
`window.postMessage` while it is being evaluated — so importing `@tikka/sdk`,
`@tikka/sdk/read`, `@tikka/sdk/write`, or `@tikka/sdk/light` in Node or during
an SSR pass no longer throws.

Closes #1563.
