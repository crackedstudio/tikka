#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Dashboard / metrics-registry consistency check (issue #1480)
 *
 * A Grafana panel querying a metric the code stopped emitting renders an empty
 * graph and gives no hint why — the failure is silent, and it surfaces during an
 * incident rather than at review time. This script closes that loop by checking
 * three things against each other:
 *
 *   1. Every metric referenced by a dashboard panel or alert rule in
 *      docs/observability/ appears in METRICS_MAP.md, the registry.
 *   2. Every referenced metric is one the registry marks as **Emitted** — a panel
 *      pointing at a planned-but-unimplemented metric is just as blank.
 *   3. Every metric the registry marks as **Emitted** is actually created
 *      somewhere in the service source, so the map cannot quietly go stale.
 *
 * Exits non-zero with a per-problem report if any of those fail.
 */

const REPO_ROOT = path.resolve(__dirname, '..');
const OBS_DIR = path.join(REPO_ROOT, 'docs', 'observability');
const METRICS_MAP = path.join(OBS_DIR, 'METRICS_MAP.md');
const SOURCE_DIRS = ['indexer/src', 'oracle/src', 'backend/src'];

// PromQL identifiers that are never metric names. Anything immediately followed
// by "(" is treated as a function call and dropped, so this only needs to cover
// bare keywords and operators.
const PROMQL_KEYWORDS = new Set([
  'by', 'without', 'on', 'ignoring', 'group_left', 'group_right', 'offset',
  'and', 'or', 'unless', 'bool', 'start', 'end', 'atan2',
]);

// Histogram and summary series are exposed with these suffixes; they resolve
// back to the base metric that the registry actually lists.
const SERIES_SUFFIXES = ['_bucket', '_sum', '_count'];

function fail(msg) {
  console.error(msg);
}

/**
 * Parse METRICS_MAP.md into { name -> { type, status } }.
 *
 * The registry is the set of "Prometheus Metrics" tables, in
 * `| Name | Type | Status | Labels | Description |` form.
 */
function parseRegistry() {
  if (!fs.existsSync(METRICS_MAP)) {
    fail(`✗ Registry not found: ${path.relative(REPO_ROOT, METRICS_MAP)}`);
    process.exit(1);
  }
  const TYPES = new Set(['Counter', 'Gauge', 'Histogram', 'ObservableGauge', 'Summary']);
  const registry = new Map();
  let inRegistrySection = false;

  for (const line of fs.readFileSync(METRICS_MAP, 'utf8').split('\n')) {
    // Only the "Prometheus Metrics" tables are the registry. The endpoint,
    // in-process, log-field, and alert tables in this file are documentation of
    // other things and must not be checked against the Prometheus source.
    if (line.startsWith('#')) {
      inRegistrySection = /^#+\s*Prometheus Metrics\s*$/.test(line.trim());
      continue;
    }
    if (!inRegistrySection) continue;
    if (!line.trim().startsWith('|')) continue;

    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;

    const nameMatch = /^`([a-zA-Z_:][a-zA-Z0-9_:]*)`$/.exec(cells[0]);
    if (!nameMatch) continue;
    if (!TYPES.has(cells[1])) continue;

    const status = /planned/i.test(cells[2]) ? 'Planned' : 'Emitted';
    registry.set(nameMatch[1], { type: cells[1], status });
  }
  return registry;
}

/** Every metric name referenced by a PromQL expression. */
function metricsInExpr(expr) {
  const cleaned = expr
    .replace(/\$__[a-zA-Z_]+/g, ' ')      // Grafana interval macros
    .replace(/\$\{[^}]*\}/g, ' ')          // ${datasource}
    .replace(/\$[a-zA-Z_][a-zA-Z0-9_]*/g, ' ') // $event_type
    .replace(/"[^"]*"|'[^']*'/g, ' ')      // string literals
    .replace(/\{[^}]*\}/g, ' ')            // label matchers
    .replace(/\[[^\]]*\]/g, ' ')           // range selectors
    .replace(/\b(?:by|without|on|ignoring|group_left|group_right)\s*\([^)]*\)/g, ' ');

  const found = new Set();
  const identifier = /[a-zA-Z_:][a-zA-Z0-9_:]*/g;
  let match;
  while ((match = identifier.exec(cleaned)) !== null) {
    const name = match[0];
    if (PROMQL_KEYWORDS.has(name)) continue;
    // A "(" straight after the identifier makes it a function call, not a metric.
    if (/^\s*\(/.test(cleaned.slice(identifier.lastIndex))) continue;
    if (!name.includes('_')) continue; // bare words like `time` are not our metrics
    found.add(name);
  }
  return found;
}

/** Resolve a referenced series back to the registry entry it belongs to. */
function baseMetric(name, registry) {
  if (registry.has(name)) return name;
  for (const suffix of SERIES_SUFFIXES) {
    if (!name.endsWith(suffix)) continue;
    const base = name.slice(0, -suffix.length);
    const entry = registry.get(base);
    if (entry && (entry.type === 'Histogram' || entry.type === 'Summary')) return base;
  }
  return name;
}

/** Collect { expr, source } for every panel target in a dashboard JSON file. */
function exprsFromDashboard(file) {
  const dashboard = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = [];
  for (const panel of dashboard.panels || []) {
    for (const target of panel.targets || []) {
      if (!target.expr) continue;
      out.push({ expr: target.expr, source: `${path.basename(file)} → "${panel.title}"` });
    }
  }
  return out;
}

/** Collect { expr, source } for every alert rule expression. */
function exprsFromAlerts(file) {
  const text = fs.readFileSync(file, 'utf8');
  const out = [];
  let alert = '(unnamed)';
  // A dependency-free reader for the one shape this file has: `- alert: Name`
  // followed by `expr:` as either a scalar or a `|`/`>` block.
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const alertMatch = /^\s*-?\s*alert:\s*(\S+)/.exec(lines[i]);
    if (alertMatch) {
      [, alert] = alertMatch;
      continue;
    }
    const exprMatch = /^(\s*)expr:\s*(.*)$/.exec(lines[i]);
    if (!exprMatch) continue;
    const [, indent, inline] = exprMatch;
    let expr = inline.trim();
    if (expr === '|' || expr === '>' || expr === '|-' || expr === '>-') {
      expr = '';
      for (let j = i + 1; j < lines.length; j += 1) {
        if (lines[j].trim() && !lines[j].startsWith(`${indent} `)) break;
        expr += ` ${lines[j].trim()}`;
      }
    }
    out.push({ expr, source: `${path.basename(file)} → alert ${alert}` });
  }
  return out;
}

/** Every metric-name string literal that appears in the service source. */
function metricsInSource() {
  const found = new Set();
  const literal = /['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g;

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(full);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        const text = fs.readFileSync(full, 'utf8');
        let match;
        while ((match = literal.exec(text)) !== null) found.add(match[1]);
      }
    }
  };

  for (const dir of SOURCE_DIRS) {
    const full = path.join(REPO_ROOT, dir);
    if (fs.existsSync(full)) walk(full);
  }
  return found;
}

function main() {
  const registry = parseRegistry();
  const problems = [];

  const references = [];
  for (const entry of fs.readdirSync(OBS_DIR)) {
    const full = path.join(OBS_DIR, entry);
    if (entry.endsWith('-dashboard.json')) references.push(...exprsFromDashboard(full));
    else if (entry.endsWith('.rules.yml')) references.push(...exprsFromAlerts(full));
  }

  if (references.length === 0) {
    fail('✗ No dashboard or alert-rule expressions found — is docs/observability/ intact?');
    process.exit(1);
  }

  const referenced = new Set();
  for (const { expr, source } of references) {
    for (const raw of metricsInExpr(expr)) {
      const name = baseMetric(raw, registry);
      referenced.add(name);
      const entry = registry.get(name);
      if (!entry) {
        problems.push(
          `${source}\n    queries \`${raw}\`, which is not in METRICS_MAP.md.\n`
          + '    Add it to the registry, or fix the panel if the metric was renamed.',
        );
      } else if (entry.status === 'Planned') {
        problems.push(
          `${source}\n    queries \`${raw}\`, which METRICS_MAP.md marks as Planned.\n`
          + '    A panel on an unimplemented metric renders empty — implement it or drop the panel.',
        );
      }
    }
  }

  const inSource = metricsInSource();
  for (const [name, entry] of registry) {
    if (entry.status !== 'Emitted') continue;
    if (inSource.has(name)) continue;
    problems.push(
      `METRICS_MAP.md lists \`${name}\` as Emitted, but no service source creates it.\n`
      + '    Mark it Planned, remove it, or fix the name if the metric was renamed.',
    );
  }

  console.log(
    `Checked ${references.length} expressions across docs/observability/ `
    + `(${referenced.size} distinct metrics) against ${registry.size} registry entries.`,
  );

  if (problems.length > 0) {
    console.error(`\n✗ ${problems.length} problem(s):\n`);
    for (const problem of problems) console.error(`  - ${problem}\n`);
    process.exit(1);
  }

  console.log('✓ Every dashboard and alert expression resolves to an emitted metric.');
}

main();
