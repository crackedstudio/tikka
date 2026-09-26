#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Dependency Vulnerability Audit Gate
 *
 * Runs `pnpm audit` and compares the findings with the accepted list in
 * `scripts/dependency-audit-config.js`. A high-severity advisory that is not
 * accepted fails the run.
 *
 * The tree already carries a backlog of advisories it inherited (see
 * scripts/DEPENDENCY_AUDIT.md), so the gate compares against that backlog
 * instead of blocking every pull request on it. What it stops is a *new*
 * advisory, or an accepted one whose severity got worse.
 *
 * Usage:
 *   node scripts/check-dependency-audit.js               # runs pnpm audit itself
 *   node scripts/check-dependency-audit.js report.json   # reads a saved report
 *
 * Exit codes:
 *   0  every finding at or above the threshold is accepted
 *   1  at least one finding is new or escalated
 *   2  the report could not be read, or looks like the audit never ran
 */

const ROOT_DIR = path.resolve(__dirname, '..');

const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const SEVERITY_ORDER = ['info', 'low', 'moderate', 'high', 'critical'];

function loadConfig() {
  const configPath = path.join(__dirname, 'dependency-audit-config.js');
  if (!fs.existsSync(configPath)) {
    return { threshold: 'high', accepted: [] };
  }
  return require(configPath);
}

function fail(code, message) {
  console.error(`\n\u2716 ${message}\n`);
  process.exit(code);
}

function runPnpmAudit() {
  try {
    return execFileSync('pnpm', ['audit', '--json'], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // `pnpm audit` exits non-zero as soon as it reports anything; the JSON on
    // stdout is still the report we want. Only a genuinely empty stdout means
    // the audit itself failed.
    if (error.stdout && error.stdout.trim().length > 0) return error.stdout;
    throw error;
  }
}

function readReport(reportPath) {
  const raw = reportPath ? fs.readFileSync(reportPath, 'utf8') : runPnpmAudit();
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(2, `Could not parse the audit report as JSON: ${error.message}`);
  }
}

/** Flatten pnpm's advisories map into a list of findings. */
function collectFindings(report) {
  const advisories = report.advisories || {};
  return Object.values(advisories).map((advisory) => {
    const paths = new Set();
    for (const finding of advisory.findings || []) {
      for (const findingPath of finding.paths || []) paths.add(findingPath);
    }
    return {
      id: advisory.github_advisory_id || String(advisory.id),
      module: advisory.module_name,
      severity: advisory.severity,
      patched: (advisory.patched_versions || '').trim(),
      title: (advisory.title || '').trim(),
      paths: [...paths].sort(),
    };
  });
}

function severityRank(severity) {
  return Object.prototype.hasOwnProperty.call(SEVERITY_RANK, severity)
    ? SEVERITY_RANK[severity]
    : 0;
}

function describe(finding) {
  const where = finding.paths.length > 0 ? finding.paths[0] : 'no path reported';
  return `${finding.id} in ${finding.module} (${finding.severity}) - ${where}`;
}

function printSummary(counts, dependencies) {
  const parts = SEVERITY_ORDER.filter((s) => (counts[s] || 0) > 0).map((s) => `${counts[s]} ${s}`);
  console.log(
    `Scanned ${dependencies} dependencies: ${parts.length > 0 ? parts.join(', ') : 'no advisories'}`,
  );
}

function main() {
  const reportPath = process.argv[2];
  const config = loadConfig();
  const threshold = process.env.AUDIT_SEVERITY || config.threshold || 'high';
  const thresholdRank = severityRank(threshold);
  const accepted = new Map(
    (config.accepted || []).map((entry) => [`${entry.id}|${entry.module}`, entry]),
  );

  const report = readReport(reportPath);
  const dependencies = (report.metadata && report.metadata.dependencies) || 0;
  const advisories = report.advisories || {};

  if (dependencies === 0 && Object.keys(advisories).length === 0) {
    fail(
      2,
      'The audit report contains no dependencies and no advisories. That is not a clean tree, ' +
        'it means `pnpm audit` did not run (missing lockfile, no network, or a broken command) - ' +
        'treating it as a failure rather than passing silently.',
    );
  }

  const counts = (report.metadata && report.metadata.vulnerabilities) || {};
  printSummary(counts, dependencies);
  console.log(`Threshold: ${threshold} (set in scripts/dependency-audit-config.js)\n`);

  const findings = collectFindings(report);
  const atThreshold = findings.filter((finding) => severityRank(finding.severity) >= thresholdRank);

  const newFindings = [];
  const escalated = [];
  const matchedKeys = new Set();

  for (const finding of atThreshold.sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  )) {
    const key = `${finding.id}|${finding.module}`;
    const acceptedEntry = accepted.get(key);
    if (!acceptedEntry) {
      newFindings.push(finding);
      continue;
    }
    matchedKeys.add(key);
    if (severityRank(finding.severity) > severityRank(acceptedEntry.severity)) {
      escalated.push({ finding, acceptedSeverity: acceptedEntry.severity });
    }
  }

  const stale = [...accepted.keys()].filter((key) => !matchedKeys.has(key));
  const notAtThreshold = findings.length - atThreshold.length;
  const acceptedAndStillPresent = atThreshold.length - newFindings.length - escalated.length;

  console.log(
    `\u2713 ${acceptedAndStillPresent} accepted finding(s) still present` +
      (notAtThreshold > 0 ? `, ${notAtThreshold} below the threshold` : ''),
  );

  if (stale.length > 0) {
    console.log(
      `\nNote: ${stale.length} accepted entr${stale.length === 1 ? 'y is' : 'ies are'} no longer reported ` +
        'by pnpm audit. Remove them from accepted in scripts/dependency-audit-config.js:',
    );
    for (const key of stale) console.log(`  - ${key}`);
  }

  if (escalated.length === 0 && newFindings.length === 0) {
    console.log('\nNo unaccepted advisories at or above the threshold. OK');
    return;
  }

  console.error('');
  for (const { finding, acceptedSeverity } of escalated) {
    console.error(
      `\u2716 Severity escalated: ${describe(finding)} - accepted as ${acceptedSeverity}`,
    );
  }
  for (const finding of newFindings) {
    console.error(`\u2716 Unaccepted advisory: ${describe(finding)}`);
    if (finding.patched && finding.patched !== '<0.0.0') {
      console.error(`   fixed in: ${finding.patched}`);
    } else {
      console.error('   no patched release published yet');
    }
  }

  fail(
    1,
    `${newFindings.length} new and ${escalated.length} escalated advisory(ies) at or above ` +
      `"${threshold}". Fix them, or add each to accepted in scripts/dependency-audit-config.js ` +
      'with the reason it cannot be fixed yet (scripts/DEPENDENCY_AUDIT.md explains the criteria).',
  );
}

main();
