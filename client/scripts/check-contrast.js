#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CSS_PATH = join(__dirname, '..', 'src', 'index.css');

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = (s) => c('31', s);
const green = (s) => c('32', s);
const yellow = (s) => c('33', s);
const dim = (s) => c('2', s);

function parseHex(hex) {
  hex = hex.replace(/^#/, '');
  let r, g, b;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  }
  return { r, g, b, a: 1 };
}

function parseRgba(str) {
  const m = str.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/,
  );
  if (!m) return null;
  return {
    r: parseInt(m[1], 10),
    g: parseInt(m[2], 10),
    b: parseInt(m[3], 10),
    a: m[4] !== undefined ? parseFloat(m[4]) : 1,
  };
}

function parseColor(raw) {
  raw = raw.trim();
  if (raw.startsWith('#')) return parseHex(raw);
  const rgba = parseRgba(raw);
  if (rgba) return rgba;
  throw new Error(`Cannot parse colour value: ${raw}`);
}

function srgbToLinear(v) {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }) {
  return (
    0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
  );
}

function contrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function alphaBlend(fg, bg) {
  const a = fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
  };
}

function extractVars(css, selectorPattern) {
  const combined = {};
  const re = new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`, 'gs');
  let match;
  while ((match = re.exec(css)) !== null) {
    const declRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let d;
    while ((d = declRe.exec(match[1])) !== null) {
      combined[d[1].trim()] = d[2].trim();
    }
  }
  return combined;
}

function resolveColorValue(key, vars) {
  const raw = vars[key];
  if (!raw) throw new Error(`Missing CSS variable: ${key}`);
  return parseColor(raw);
}

function blendChain(keys, vars) {
  const colors = keys.map((k) => resolveColorValue(k, vars));
  let result = {
    r: colors[colors.length - 1].r,
    g: colors[colors.length - 1].g,
    b: colors[colors.length - 1].b,
  };
  for (let i = colors.length - 2; i >= 0; i--) {
    result = alphaBlend(colors[i], result);
  }
  return result;
}

function main() {
  let css;
  try {
    css = readFileSync(CSS_PATH, 'utf-8');
  } catch (err) {
    console.error(`${red('✖')} Cannot read ${CSS_PATH}: ${err.message}`);
    process.exit(1);
  }

  const themeVars = extractVars(css, '@theme');
  const rootVars = extractVars(css, ':root');
  const darkVars = extractVars(css, '\\.dark');

  const light = { ...themeVars, ...rootVars };
  const dark = { ...themeVars, ...darkVars };

  const pairs = [
    {
      mode: 'light', label: 'Body text on page background',
      chain: ['--color-text-body', '--color-bg'],
      threshold: 4.5,
    },
    {
      mode: 'light', label: 'Icon on button surface',
      chain: ['--color-icon', '--color-surface'],
      threshold: 4.5,
    },
    {
      mode: 'light', label: 'Icon hover on button hover surface',
      chain: ['--color-icon-hover', '--color-surface-hover'],
      threshold: 4.5,
    },
    {
      mode: 'light', label: 'Border on button surface',
      chain: ['--color-border', '--color-surface'],
      threshold: 3.0,
    },
    {
      mode: 'dark', label: 'Body text on page background',
      chain: ['--color-text-body', '--color-bg'],
      threshold: 4.5,
    },
    {
      mode: 'dark', label: 'Icon on button surface',
      chain: ['--color-icon', '--color-surface', '--color-bg'],
      threshold: 4.5,
    },
    {
      mode: 'dark', label: 'Icon hover on button hover surface',
      chain: ['--color-icon-hover', '--color-surface-hover'],
      threshold: 4.5,
    },
    {
      mode: 'dark', label: 'Border on button surface',
      chain: ['--color-border', '--color-surface', '--color-bg'],
      threshold: 3.0,
    },
  ];

  const env = { light, dark };
  let failures = 0;

  console.log(`\n  ${dim('Colour Contrast Checker')}\n`);

  for (const pair of pairs) {
    const vars = env[pair.mode];

    let fgColor, bgColor;
    try {
      fgColor = blendChain(pair.chain, vars);
      bgColor = blendChain(pair.chain.slice(1), vars);
    } catch (err) {
      console.log(`  ${red('✖')} ${pair.label} (${pair.mode}): ${err.message}`);
      failures++;
      continue;
    }

    const lFg = relativeLuminance(fgColor);
    const lBg = relativeLuminance(bgColor);
    const ratio = contrastRatio(lFg, lBg);
    const pass = ratio >= pair.threshold;

    if (!pass) {
      console.log(
        `  ${red('✖')} ${pair.label} (${pair.mode}): ${ratio.toFixed(2)}:1 — ` +
        `requires ≥ ${pair.threshold}:1`,
      );
      failures++;
    } else {
      console.log(
        `  ${green('✔')} ${pair.label} (${pair.mode}): ${ratio.toFixed(2)}:1`,
      );
    }
  }

  if (failures === 0) {
    console.log(`\n  ${green('All colour pairs pass WCAG AA contrast.')}\n`);
    process.exit(0);
  }

  console.log(
    `\n  ${red(`${failures} colour pair(s) failed WCAG AA contrast check.`)}\n`,
  );
  process.exit(1);
}

try {
  main();
} catch (err) {
  console.error(`${red('✖')} Unexpected error: ${err.message}`);
  process.exit(1);
}
