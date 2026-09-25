#!/usr/bin/env node

/**
 * Hardcoded JSX Text Checker
 *
 * Scans .tsx files under client/src/pages/ and client/src/components/
 * for hardcoded visible text strings that should come from locale files.
 *
 * What it flags:
 *   - JSX text nodes with ≥ 3 words that are plain English (no {}, no HTML entities)
 *   - Strings in common UI attributes: placeholder=, title=, aria-label=
 *     that are not already t(...) calls
 *
 * What it ignores:
 *   - Lines containing useTranslation, t(, {t(
 *   - Comment lines (//)
 *   - Import / type / interface lines
 *   - Test / spec / snapshot files
 *   - Lines that are pure JSX structure with no visible text
 *   - Single words and short labels (< 3 words) that are commonly technical
 *
 * Exit codes:
 *   0  — no findings
 *   15 — findings detected (consistent with check-locales.js)
 *
 * Usage:
 *   node scripts/check-hardcoded-strings.js
 *   pnpm run check:strings
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLIENT_ROOT = join(__dirname, '..');
const SCAN_DIRS = [
  join(CLIENT_ROOT, 'src', 'pages'),
  join(CLIENT_ROOT, 'src', 'components'),
];

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  reset: useColor ? '\x1b[0m' : '',
  red: useColor ? '\x1b[31m' : '',
  yellow: useColor ? '\x1b[33m' : '',
  green: useColor ? '\x1b[32m' : '',
  cyan: useColor ? '\x1b[36m' : '',
  bold: useColor ? '\x1b[1m' : '',
  dim: useColor ? '\x1b[2m' : '',
};

// ── Patterns ──────────────────────────────────────────────────────────────────

// JSX text node: content between > and <, ≥ 3 whitespace-separated tokens,
// no curly braces (which indicate a JS expression), not just whitespace
const JSX_TEXT = />\s*([A-Za-z][^<>{}"'`\n]{8,})\s*</g;

// Attribute string values that look like prose (≥ 3 words)
// Matches: placeholder="...", aria-label="...", title="..."
// but NOT t("...") — those are already i18n
const ATTR_STRING = /(?:placeholder|aria-label|title|aria-description)=\{\s*["']([A-Za-z][^"']{8,})["']\s*\}|(?:placeholder|aria-label|title|aria-description)=["']([A-Za-z][^"']{8,})["']/g;

// Lines that are safe to skip entirely
const SKIP_LINE = /^\s*(?:\/\/|import |export |interface |type |const |let |\/\*|\*)/;
// Lines already using i18n
const ALREADY_TRANSLATED = /useTranslation|[^a-z]t\s*\(|{t\(|Trans\s+/;
// Test / snapshot files
const TEST_FILE = /\.(spec|test|stories)\.[tj]sx?$|__snapshots__|\.md$/;

// Words that are universally fine to leave as-is (technical tokens, nav arrows, etc.)
const TRIVIAL = /^[#$%@→←↑↓✓✗×+\-–—0-9.,:;!?/\\|(){}\[\]"'`~^_=<>*&@]+$|^[A-Z]{2,6}$|^(XLM|VRF|PRNG|ID|OK|RTL|LTR|PDF|CSV|URL|API|SDK|Tx|Proof)$/;

function wordCount(s) {
  return s.trim().split(/\s+/).length;
}

function collectFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full));
    } else if (entry.isFile() && extname(entry.name) === '.tsx' && !TEST_FILE.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function checkFile(filePath) {
  const src = readFileSync(filePath, 'utf-8');
  const lines = src.split('\n');
  const findings = [];

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    if (SKIP_LINE.test(line)) return;
    if (ALREADY_TRANSLATED.test(line)) return;

    // Check JSX text nodes
    let m;
    JSX_TEXT.lastIndex = 0;
    while ((m = JSX_TEXT.exec(line)) !== null) {
      const text = m[1].trim();
      if (wordCount(text) >= 3 && !TRIVIAL.test(text)) {
        findings.push({ line: lineNo, kind: 'JSX text', text });
      }
    }

    // Check attribute strings
    ATTR_STRING.lastIndex = 0;
    while ((m = ATTR_STRING.exec(line)) !== null) {
      const text = (m[1] || m[2]).trim();
      if (wordCount(text) >= 3 && !TRIVIAL.test(text)) {
        findings.push({ line: lineNo, kind: 'attribute string', text });
      }
    }
  });

  return findings;
}

function main() {
  console.log(`${c.cyan}╔════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.cyan}║      Tikka Hardcoded String Checker            ║${c.reset}`);
  console.log(`${c.cyan}╚════════════════════════════════════════════════╝${c.reset}`);
  console.log();

  let allFiles = [];
  for (const dir of SCAN_DIRS) {
    allFiles = allFiles.concat(collectFiles(dir));
  }

  console.log(`${c.dim}Scanning ${allFiles.length} .tsx file(s)…${c.reset}`);
  console.log();

  let totalFindings = 0;
  const fileResults = [];

  for (const file of allFiles) {
    const findings = checkFile(file);
    if (findings.length > 0) {
      fileResults.push({ file, findings });
      totalFindings += findings.length;
    }
  }

  if (fileResults.length === 0) {
    console.log(`${c.green}✅ No hardcoded JSX strings found in pages/ or components/.${c.reset}`);
    process.exit(0);
  }

  for (const { file, findings } of fileResults) {
    console.log(`${c.bold}${c.red}${relative(CLIENT_ROOT, file)}${c.reset} — ${findings.length} finding(s)`);
    for (const f of findings) {
      const snippet = f.text.length > 60 ? f.text.slice(0, 57) + '…' : f.text;
      console.log(`  ${c.yellow}line ${String(f.line).padStart(4)}${c.reset}  [${f.kind}]  ${snippet}`);
    }
    console.log();
  }

  console.log('─'.repeat(56));
  console.log(`${c.red}❌ ${totalFindings} hardcoded string(s) found across ${fileResults.length} file(s).${c.reset}`);
  console.log(`${c.yellow}   Wrap each string with t("namespace.key") and add the key to the matching locale file.${c.reset}`);
  process.exit(15);
}

main();
