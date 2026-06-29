#!/usr/bin/env node

/**
 * Locale Completeness Checker
 *
 * Compares the key tree of every locale under `client/public/locales/<lng>/`
 * against the reference locale (`en`) and fails fast when keys drift.
 *
 * Detects:
 *   - missing keys   (present in reference, absent from a locale)
 *   - extra keys     (present in a locale, absent from reference)
 *   - type mismatches (e.g. reference has an object, locale has a string)
 *
 * Exits with code 15 on any finding. The script is intentionally lightweight:
 * no external deps, runs under plain Node ≥ 18.
 *
 * Usage:
 *   node scripts/check-locales.js
 *   pnpm run check:locales
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLIENT_ROOT = join(__dirname, '..');
const LOCALES_DIR = join(CLIENT_ROOT, 'public', 'locales');
const REFERENCE_LOCALE = 'en'; // matches i18n.ts fallbackLng

// ANSI color codes (only used when output is a TTY)
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const colors = {
    reset: useColor ? '\x1b[0m' : '',
    red: useColor ? '\x1b[31m' : '',
    green: useColor ? '\x1b[32m' : '',
    yellow: useColor ? '\x1b[33m' : '',
    blue: useColor ? '\x1b[34m' : '',
    cyan: useColor ? '\x1b[36m' : '',
    bold: useColor ? '\x1b[1m' : '',
    dim: useColor ? '\x1b[2m' : '',
};

const log = (msg, color = 'reset') =>
    console.log(`${colors[color]}${msg}${colors.reset}`);
const newline = () => console.log();

/**
 * Recursively flatten a nested object into a map of `dotted.key` → leaf value.
 * Arrays and primitives are treated as leaf values, so arrays are flagged as
 * type mismatches only when a non-array value exists at the same path.
 *
 * @param {object} obj
 * @param {string} prefix
 * @returns {Map<string, { kind: 'object' | 'leaf', value?: unknown }>}
 */
function flatten(obj, prefix = '') {
    const out = new Map();
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        out.set(prefix || '', { kind: 'leaf', value: obj });
        return out;
    }
    for (const [key, value] of Object.entries(obj)) {
        const next = prefix ? `${prefix}.${key}` : key;
        if (
            value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value)
        ) {
            out.set(next, { kind: 'object' });
            for (const [k, v] of flatten(value, next)) {
                out.set(k, v);
            }
        } else {
            out.set(next, { kind: 'leaf', value });
        }
    }
    return out;
}

/**
 * Load every namespace file (`*.json`) for a locale.
 * @param {string} localeDir
 * @returns {Record<string, unknown>}
 */
function loadLocale(localeDir) {
    const namespaces = {};
    const files = readdirSync(localeDir).filter((f) => f.endsWith('.json'));
    if (files.length === 0) {
        throw new Error(`No .json namespace files found in ${localeDir}`);
    }
    for (const file of files) {
        const ns = file.replace(/\.json$/, '');
        const raw = readFileSync(join(localeDir, file), 'utf-8');
        try {
            namespaces[ns] = JSON.parse(raw);
        } catch (err) {
            throw new Error(
                `Invalid JSON in ${relative(CLIENT_ROOT, join(localeDir, file))}: ${err.message}`,
            );
        }
    }
    return namespaces;
}

/**
 * Compare a non-reference locale against the reference and return a list of
 * findings annotated with the namespace the offending key belongs to.
 *
 * @param {string} locale
 * @param {Record<string, Map<string, {kind: string, value?: unknown}>>} refByNs
 * @param {Record<string, object>} otherNamespaces
 * @returns {Array<{ns: string, kind: 'missing'|'extra'|'mismatch', key: string, refType?: string, otherType?: string}>}
 */
function diff(locale, refByNs, otherNamespaces) {
    const findings = [];
    const seenNamespaces = new Set();

    // Iterate over namespaces present in the reference locale.
    for (const ns of Object.keys(refByNs)) {
        seenNamespaces.add(ns);
        const ref = refByNs[ns];
        const otherRaw = otherNamespaces[ns];
        if (otherRaw === undefined) {
            findings.push({
                ns,
                kind: 'missing',
                key: '<entire-namespace>',
            });
            continue;
        }
        const other = flatten(otherRaw);
        for (const [key, info] of ref) {
            if (!other.has(key)) {
                findings.push({ ns, kind: 'missing', key });
                continue;
            }
            const o = other.get(key);
            if (info.kind !== o.kind) {
                findings.push({
                    ns,
                    kind: 'mismatch',
                    key,
                    refType: info.kind,
                    otherType: o.kind,
                });
            } else if (info.kind === 'leaf' && o.kind === 'leaf') {
                const refIsEmpty = info.value === '';
                const otherIsEmpty = o.value === '';
                if (!refIsEmpty && otherIsEmpty) {
                    findings.push({
                        ns,
                        kind: 'missing',
                        key,
                    });
                }
            }
        }
        for (const key of other.keys()) {
            if (!ref.has(key)) {
                findings.push({ ns, kind: 'extra', key });
            }
        }
    }

    // Catch namespaces that exist in this locale but not in the reference.
    for (const ns of Object.keys(otherNamespaces)) {
        if (!seenNamespaces.has(ns)) {
            findings.push({
                ns,
                kind: 'extra',
                key: '<entire-namespace>',
            });
        }
    }

    return findings;
}

function main() {
    log('╔════════════════════════════════════════════════╗', 'cyan');
    log('║      Tikka Locale Completeness Checker         ║', 'cyan');
    log('╚════════════════════════════════════════════════╝', 'cyan');
    newline();

    if (!existsSync(LOCALES_DIR)) {
        log(
            `❌ Locales directory not found: ${relative(CLIENT_ROOT, LOCALES_DIR)}`,
            'red',
        );
        process.exit(15);
    }

    const localeCodes = readdirSync(LOCALES_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();

    if (localeCodes.length === 0) {
        log('❌ No locales found in public/locales', 'red');
        process.exit(15);
    }

    if (!localeCodes.includes(REFERENCE_LOCALE)) {
        log(
            `❌ Reference locale "${REFERENCE_LOCALE}" is missing from ${relative(CLIENT_ROOT, LOCALES_DIR)}`,
            'red',
        );
        process.exit(15);
    }

    // Load reference (en) up-front. Wrap in try/catch so a malformed
    // reference locale produces the same clean red banner as a per-locale
    // parse error instead of an unstyled stack trace.
    let refNamespaces;
    try {
        refNamespaces = loadLocale(join(LOCALES_DIR, REFERENCE_LOCALE));
    } catch (err) {
        log(
            `❌ Reference locale "${REFERENCE_LOCALE}" is unreadable: ${err.message}`,
            'red',
        );
        process.exit(15);
    }
    const refByNs = Object.fromEntries(
        Object.entries(refNamespaces).map(([ns, obj]) => [ns, flatten(obj)]),
    );
    const refKeyCount = Object.values(refByNs).reduce(
        (acc, m) => acc + m.size,
        0,
    );
    log(
        `📖 Reference locale: ${colors.bold}${REFERENCE_LOCALE}${colors.reset} (${refKeyCount} keys across ${Object.keys(refByNs).length} namespace(s))`,
        'blue',
    );

    const others = localeCodes.filter((c) => c !== REFERENCE_LOCALE);
    if (others.length === 0) {
        log(
            '⚠️  No secondary locales to compare. Add at least one additional locale under public/locales/<code>/',
            'yellow',
        );
        process.exit(15);
    }

    let totalFindings = 0;
    const summary = [];

    for (const locale of others) {
        newline();
        const localeDir = join(LOCALES_DIR, locale);
        let otherNamespaces;
        try {
            otherNamespaces = loadLocale(localeDir);
        } catch (err) {
            log(`❌ ${locale}: ${err.message}`, 'red');
            totalFindings += 1;
            summary.push({ locale, ok: false, findings: 1 });
            continue;
        }

        const findings = diff(locale, refByNs, otherNamespaces);
        const otherKeyCount = Object.values(otherNamespaces).reduce(
            (acc, obj) => acc + flatten(obj).size,
            0,
        );

        if (findings.length === 0) {
            log(
                `✅ ${colors.bold}${locale}${colors.reset} — 100% complete (${otherKeyCount} keys)`,
                'green',
            );
            summary.push({ locale, ok: true, findings: 0 });
            continue;
        }

        log(
            `❌ ${colors.bold}${locale}${colors.reset} — ${findings.length} finding(s) (${otherKeyCount} keys)`,
            'red',
        );
        const byNs = new Map();
        for (const f of findings) {
            if (!byNs.has(f.ns)) byNs.set(f.ns, []);
            byNs.get(f.ns).push(f);
        }
        for (const [ns, list] of byNs) {
            log(`   ${colors.dim}namespace:${colors.reset} ${ns}`, 'dim');
            for (const f of list) {
                let label;
                if (f.kind === 'missing') {
                    label = `   ${colors.red}MISSING${colors.reset}  ${f.key}`;
                } else if (f.kind === 'extra') {
                    label = `   ${colors.yellow}EXTRA${colors.reset}    ${f.key}`;
                } else {
                    label =
                        `   ${colors.red}MISMATCH${colors.reset} ${f.key}` +
                        ` (ref: ${f.refType}, other: ${f.otherType})`;
                }
                log(label);
            }
        }
        log(
            `   ${colors.dim}Hint: add the missing key to public/locales/${locale}/<ns>.json or restore parity with ${REFERENCE_LOCALE}.${colors.reset}`,
            'dim',
        );
        totalFindings += findings.length;
        summary.push({ locale, ok: false, findings: findings.length });
    }

    newline();
    log('─'.repeat(56), 'cyan');
    log('Summary', 'cyan');
    log('─'.repeat(56), 'cyan');
    for (const row of summary) {
        const status = row.ok
            ? `${colors.green}OK${colors.reset}`
            : `${colors.red}FAIL${colors.reset}`;
        log(`  ${status}  ${row.locale.padEnd(6)} (${row.findings} finding(s))`);
    }
    newline();

    if (totalFindings === 0) {
        log(
            `✅ All locales are complete and structurally compatible with ${REFERENCE_LOCALE}.`,
            'green',
        );
        process.exit(0);
    }
    log(
        `❌ ${totalFindings} difference(s) detected — locale parity check FAILED.`,
        'red',
    );
    log(
        '   See client/docs/I18N.md for instructions on adding new translatable strings.',
        'yellow',
    );
    // Use exit code 15 so it is distinct from generic failures (1) and from
    // ESLint/vitest codes commonly used in the same workflow.
    process.exit(15);
}

try {
    main();
} catch (err) {
    log(`❌ Unexpected error: ${err.message}`, 'red');
    if (process.env.DEBUG) {
        console.error(err);
    }
    process.exit(15);
}
