---
'@tikka/sdk': patch
---

Pin the published tarball to an explicit allowlist and expose `@tikka/sdk/testing`.

`npm pack` previously fell back to `.gitignore` (which ignores `/dist`), so the
published package could ship without its build output. `sdk/package.json` now
declares a `files` allowlist, adds a `./testing` sub-path export with a barrel
module, and a `pack:check` script that fails when the tarball contains anything
outside the allowlist or is missing expected artifacts.
