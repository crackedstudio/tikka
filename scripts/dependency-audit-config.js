/**
 * Accepted findings for the dependency audit gate.
 *
 * `scripts/check-dependency-audit.js` fails on any advisory at or above
 * `threshold` that is not listed here. Everything below was already present in
 * the tree when the gate was introduced (issue #1510), which is why it is
 * listed rather than fixed in that pull request: a gate that red-lights every
 * pull request on the inherited backlog would just get ignored. Each entry is
 * still a real problem — the remediation list lives in
 * `scripts/DEPENDENCY_AUDIT.md`.
 *
 * Adding an entry is a deliberate decision, not a formality. The criteria are
 * in `scripts/DEPENDENCY_AUDIT.md`; in short: the fix has to be blocked by
 * something outside this repository, and the advisory has to be unreachable
 * from the code paths we actually run.
 *
 * An entry that no longer shows up in `pnpm audit` should be deleted — the gate
 * prints a note listing those.
 */
module.exports = {
  /** Minimum severity that fails the run: info | low | moderate | high | critical */
  threshold: 'high',

  /** Advisories that do not fail the run, keyed by `id` + `module`. */
  accepted: [
    {
      id: 'GHSA-72c6-fx6q-fr5w',
      module: '@fastify/middie',
      severity: 'critical',
      patched: '>=9.3.2',
      title: '@fastify/middie vulnerable to middleware authentication bypass in child plu...',
    },
    {
      id: 'GHSA-5xrq-8626-4rwp',
      module: 'vitest',
      severity: 'critical',
      patched: '>=3.2.6',
      title: 'When Vitest UI server is listening, arbitrary file can be read and executed',
    },
    {
      id: 'GHSA-cxrg-g7r8-w69p',
      module: '@fastify/middie',
      severity: 'high',
      patched: '>=9.1.0',
      title: 'Fastify Middie Middleware Path Bypass',
    },
    {
      id: 'GHSA-8p85-9qpw-fwgw',
      module: '@fastify/middie',
      severity: 'high',
      patched: '>=9.2.0',
      title: '@fastify/middie has Improper Path Normalization when Using Path-Scoped Midd...',
    },
    {
      id: 'GHSA-v9ww-2j6r-98q6',
      module: '@fastify/middie',
      severity: 'high',
      patched: '>=9.3.2',
      title: '@fastify/middie vulnerable to middleware bypass via deprecated ignoreDuplic...',
    },
    {
      id: 'GHSA-r4wm-x892-vjmx',
      module: '@nestjs/platform-fastify',
      severity: 'high',
      patched: '>=11.1.14',
      title: 'Nest has a Fastify URL Encoding Middleware Bypass',
    },
    {
      id: 'GHSA-wf42-42fg-fg84',
      module: '@nestjs/platform-fastify',
      severity: 'high',
      patched: '>=11.1.16',
      title: 'Nest Fastify HEAD Request Middleware Bypass',
    },
    {
      id: 'GHSA-6v32-fjc9-9qf6',
      module: '@nestjs/platform-fastify',
      severity: 'high',
      patched: '>=11.1.24',
      title: 'Nest: Middleware Bypass on Fastify via Trailing Slash',
    },
    {
      id: 'GHSA-q7rr-3cgh-j5r3',
      module: '@opentelemetry/exporter-prometheus',
      severity: 'high',
      patched: '>=0.217.0',
      title: 'Prometheus exporter process crash via malformed HTTP request',
    },
    {
      id: 'GHSA-jr5f-v2jv-69x6',
      module: 'axios',
      severity: 'high',
      patched: '>=0.30.0',
      title: 'axios Requests Vulnerable To Possible SSRF and Credential Leakage via Absol...',
    },
    {
      id: 'GHSA-pmwg-cvhr-8vh7',
      module: 'axios',
      severity: 'high',
      patched: '>=0.31.1',
      title: 'Axios: Incomplete Fix for CVE-2025-62718 — NO_PROXY Protection Bypassed via...',
    },
    {
      id: 'GHSA-pf86-5x62-jrwf',
      module: 'axios',
      severity: 'high',
      patched: '>=0.31.1',
      title: 'Axios: Prototype Pollution Gadgets - Response Tampering, Data Exfiltration,...',
    },
    {
      id: 'GHSA-6chq-wfr3-2hj9',
      module: 'axios',
      severity: 'high',
      patched: '>=0.31.1',
      title: 'Axios: Header Injection via Prototype Pollution',
    },
    {
      id: 'GHSA-43fc-jf86-j433',
      module: 'axios',
      severity: 'high',
      patched: '>=0.30.3',
      title: 'Axios is Vulnerable to Denial of Service via __proto__ Key in mergeConfig',
    },
    {
      id: 'GHSA-hfxv-24rg-xrqf',
      module: 'axios',
      severity: 'high',
      patched: '>=0.32.0',
      title: 'Axios: Regular Expression Denial of Service (ReDoS) via Cookie Name Injection',
    },
    {
      id: 'GHSA-p92q-9vqr-4j8v',
      module: 'axios',
      severity: 'high',
      patched: '>=0.32.0',
      title: 'Axios: Proxy-Authorization Credential Leak to Origin Server Across HTTP-to-...',
    },
    {
      id: 'GHSA-j5f8-grm9-p9fc',
      module: 'axios',
      severity: 'high',
      patched: '>=0.32.0',
      title: 'Axios: Proxy-Authorization header leaks to redirect target when proxy is re...',
    },
    {
      id: 'GHSA-3g43-6gmg-66jw',
      module: 'axios',
      severity: 'high',
      patched: '>=0.31.1',
      title: 'axios Vulnerable to Credential Theft and Response Hijacking via Prototype P...',
    },
    {
      id: 'GHSA-pjwm-pj3p-43mv',
      module: 'axios',
      severity: 'high',
      patched: '>=0.32.0',
      title: "axios's shouldBypassProxy does not recognize IPv4-mapped IPv6 addresses, a...",
    },
    {
      id: 'GHSA-jmr9-qjv8-65gv',
      module: 'extract-zip',
      severity: 'high',
      patched: '<0.0.0',
      title: 'extract-zip unvalidated symlink path traversal',
    },
    {
      id: 'GHSA-7pqw-9j4j-h8q3',
      module: 'extract-zip',
      severity: 'high',
      patched: '<0.0.0',
      title: 'extract-zip allows arbitrary file writes through symlink archive entries',
    },
    {
      id: 'GHSA-jx2c-rxcm-jvmq',
      module: 'fastify',
      severity: 'high',
      patched: '>=5.7.2',
      title: "Fastify's Content-Type header tab character allows body validation bypass",
    },
    {
      id: 'GHSA-c96f-x56v-gq3h',
      module: 'find-my-way',
      severity: 'high',
      patched: '>=9.7.0',
      title: 'find-my-way: DDoS with HTTP2',
    },
    {
      id: 'GHSA-5j98-mcp5-4vw2',
      module: 'glob',
      severity: 'high',
      patched: '>=10.5.0',
      title: 'glob CLI: Command injection via -c/--cmd executes matches with shell:true',
    },
    {
      id: 'GHSA-52cp-r559-cp3m',
      module: 'js-yaml',
      severity: 'high',
      patched: '>=4.3.0',
      title: 'js-yaml: YAML merge-key chains can force quadratic CPU consumption',
    },
    {
      id: 'GHSA-5p4m-2wfm-xmqj',
      module: 'js-yaml',
      severity: 'high',
      patched: '>=4.3.1',
      title: 'JS-YAML: Quadratic CPU consumption in !!omap resolution (3.x and 4.x) — CVE...',
    },
    {
      id: 'GHSA-2883-xcg3-v3hh',
      module: 'js-yaml',
      severity: 'high',
      patched: '>=4.3.2',
      title: 'js-yaml: maxTotalMergeKeys does not limit CPU use for empty merge sources',
    },
    {
      id: 'GHSA-r5fr-rjxr-66jc',
      module: 'lodash',
      severity: 'high',
      patched: '>=4.18.0',
      title: 'lodash vulnerable to Code Injection via `_.template` imports key names',
    },
    {
      id: 'GHSA-xf7r-hgr6-v32p',
      module: 'multer',
      severity: 'high',
      patched: '>=2.1.0',
      title: 'Multer vulnerable to Denial of Service via incomplete cleanup',
    },
    {
      id: 'GHSA-v52c-386h-88mc',
      module: 'multer',
      severity: 'high',
      patched: '>=2.1.0',
      title: 'Multer vulnerable to Denial of Service via resource exhaustion',
    },
    {
      id: 'GHSA-5528-5vmv-3xc2',
      module: 'multer',
      severity: 'high',
      patched: '>=2.1.1',
      title: 'Multer Vulnerable to Denial of Service via Uncontrolled Recursion',
    },
    {
      id: 'GHSA-72gw-mp4g-v24j',
      module: 'multer',
      severity: 'high',
      patched: '>=2.2.0',
      title: 'Multer vulnerable to Denial of Service via deeply nested field names',
    },
    {
      id: 'GHSA-wc9g-mqfw-jrwm',
      module: 'multer',
      severity: 'high',
      patched: '>=2.3.0',
      title: 'multer vulnerable to Denial of Service via crafted multipart field names',
    },
    {
      id: 'GHSA-535w-7cp7-47q4',
      module: 'multer',
      severity: 'high',
      patched: '>=2.3.0',
      title: 'multer vulnerable to Denial of Service via oversized array index in field n...',
    },
    {
      id: 'GHSA-c2c7-rcm5-vvqj',
      module: 'picomatch',
      severity: 'high',
      patched: '>=4.0.4',
      title: 'Picomatch has a ReDoS vulnerability via extglob quantifiers',
    },
    {
      id: 'GHSA-qwww-vcr4-c8h2',
      module: 'react-router',
      severity: 'high',
      patched: '>=7.18.2',
      title: 'React Router: RSC Mode CSRF Bypass Allows Action Execution Before 400 Response',
    },
    {
      id: 'GHSA-rgj7-g3m4-5g8c',
      module: 'sharp',
      severity: 'high',
      patched: '>=0.35.4',
      title: 'sharp: Vulnerabilities in libheif: GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545',
    },
    {
      id: 'GHSA-ph9p-34f9-6g65',
      module: 'tmp',
      severity: 'high',
      patched: '>=0.2.6',
      title: 'tmp has Path Traversal via unsanitized prefix/postfix that enables director...',
    },
    {
      id: 'GHSA-vrm6-8vpv-qv8q',
      module: 'undici',
      severity: 'high',
      patched: '>=6.24.0',
      title: 'Undici has Unbounded Memory Consumption in WebSocket permessage-deflate Dec...',
    },
    {
      id: 'GHSA-v9p9-hfj2-hcw8',
      module: 'undici',
      severity: 'high',
      patched: '>=6.24.0',
      title: 'Undici has Unhandled Exception in WebSocket Client Due to Invalid server_ma...',
    },
    {
      id: 'GHSA-vxpw-j846-p89q',
      module: 'undici',
      severity: 'high',
      patched: '>=6.27.0',
      title: 'undici WebSocket client vulnerable to denial of service via fragment count...',
    },
    {
      id: 'GHSA-fx2h-pf6j-xcff',
      module: 'vite',
      severity: 'high',
      patched: '>=6.4.3',
      title: 'vite: `server.fs.deny` bypass on Windows alternate paths',
    },
  ],
};
