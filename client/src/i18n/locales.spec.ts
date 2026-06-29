/**
 * Locale Completeness — vitest spec
 *
 * Enforces parity between the reference locale (`en`) and every other locale
 * under `client/public/locales`. Mirrors the standalone `check-locales.js`
 * script so the guideline runs in the `pnpm test` flow as well as in CI via the
 * `pretest` hook.
 *
 * Issue: https://github.com/crackedstudio/tikka/issues/525
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// client/src/i18n/locales.spec.ts  →  client/public/locales
const LOCALES_DIR = join(
    __dirname,
    '..',
    '..',
    'public',
    'locales',
);

const REFERENCE_LOCALE = 'en';

type LeafKind = 'object' | 'leaf';

interface FlatEntry {
    kind: LeafKind;
    value?: unknown;
}

type FlatMap = Map<string, FlatEntry>;

type Finding =
    | { ns: string; kind: 'missing'; key: string }
    | { ns: string; kind: 'extra'; key: string }
    | {
          ns: string;
          kind: 'mismatch';
          key: string;
          refType: LeafKind;
          otherType: LeafKind;
      };

/** Recursively flatten an object into a `dotted.key → leaf-info` map. */
function flatten(obj: unknown, prefix = ''): FlatMap {
    const out: FlatMap = new Map();
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        out.set(prefix || '', { kind: 'leaf', value: obj });
        return out;
    }
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
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

/** Load every `*.json` namespace file for a locale. */
function loadLocale(localeDir: string): Record<string, unknown> {
    const namespaces: Record<string, unknown> = {};
    const files = readdirSync(localeDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
        const ns = file.replace(/\.json$/, '');
        const raw = readFileSync(join(localeDir, file), 'utf-8');
        namespaces[ns] = JSON.parse(raw);
    }
    return namespaces;
}

function listLocales(): string[] {
    return readdirSync(LOCALES_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
}

function diff(
    refByNs: Record<string, FlatMap>,
    otherNamespaces: Record<string, unknown>,
): Finding[] {
    const findings: Finding[] = [];
    const seenNamespaces = new Set<string>();
    for (const ns of Object.keys(refByNs)) {
        seenNamespaces.add(ns);
        const ref = refByNs[ns];
        const otherRaw = otherNamespaces[ns];
        if (otherRaw === undefined) {
            findings.push({ ns, kind: 'missing', key: '<entire-namespace>' });
            continue;
        }
        const other = flatten(otherRaw);
        for (const [key, info] of ref) {
            const o = other.get(key);
            if (!o) {
                findings.push({ ns, kind: 'missing', key });
                continue;
            }
            if (info.kind !== o.kind) {
                findings.push({
                    ns,
                    kind: 'mismatch',
                    key,
                    refType: info.kind,
                    otherType: o.kind,
                });
            } else if (
                info.kind === 'leaf' &&
                o.kind === 'leaf' &&
                info.value !== '' &&
                o.value === ''
            ) {
                // Reference locale has content but this locale has an empty
                // placeholder — treat as missing so it is filled in.
                findings.push({ ns, kind: 'missing', key });
            }
        }
        for (const key of other.keys()) {
            if (!ref.has(key)) {
                findings.push({ ns, kind: 'extra', key });
            }
        }
    }
    // Flag namespaces that exist in the locale but not in the reference.
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

function describeFindings(findings: Finding[]): string {
    return findings
        .map((f) => {
            if (f.kind === 'missing') return `missing[${f.ns}]: ${f.key}`;
            if (f.kind === 'extra') return `extra[${f.ns}]: ${f.key}`;
            return (
                `mismatch[${f.ns}]: ${f.key} ` +
                `(ref=${f.refType}, other=${f.otherType})`
            );
        })
        .join('\n  ');
}

describe('Locale completeness (client/public/locales)', () => {
    const locales = listLocales();
    const reference = locales.includes(REFERENCE_LOCALE)
        ? REFERENCE_LOCALE
        : null;

    it('exposes the reference locale (en)', () => {
        expect(reference).toBe(REFERENCE_LOCALE);
    });

    it('has at least one secondary locale to compare against', () => {
        expect(locales.length).toBeGreaterThan(1);
    });

    if (reference) {
        const refNamespaces = loadLocale(join(LOCALES_DIR, reference));
        const refByNs: Record<string, FlatMap> = Object.fromEntries(
            Object.entries(refNamespaces).map(([ns, obj]) => [
                ns,
                flatten(obj),
            ]),
        );

        for (const locale of locales.filter((l) => l !== reference)) {
            it(`keeps "${locale}" in sync with reference "${reference}"`, () => {
                const otherNamespaces = loadLocale(
                    join(LOCALES_DIR, locale),
                );
                const findings = diff(refByNs, otherNamespaces);
                expect(findings, describeFindings(findings)).toEqual([]);
            });
        }
    }
});
