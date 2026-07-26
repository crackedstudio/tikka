#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Dependency Version Checker
 * 
 * Reports key dependency versions across package.json files.
 * Flags major-version mismatches for shared frameworks.
 * Documents accepted exceptions in DEPENDENCY_EXCEPTIONS.md
 */

// Key frameworks to check across packages
const SHARED_FRAMEWORKS = [
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/cli',
  '@nestjs/testing',
  '@nestjs/config',
  'jest',
  'ts-jest',
  '@types/jest',
  'eslint',
  '@eslint/js',
  'typescript',
  '@stellar/stellar-sdk',
  'fast-check',
  'rxjs',
  'reflect-metadata',
];

// Root packages to analyze
const PACKAGES = [
  'backend',
  'client',
  'indexer',
  'oracle',
  'sdk',
];

const ROOT_DIR = path.resolve(__dirname, '..');
const exceptions = loadExceptions();

/**
 * Load accepted exceptions from config
 */
function loadExceptions() {
  try {
    const configPath = path.join(__dirname, 'dependency-config.js');
    if (fs.existsSync(configPath)) {
      return require(configPath);
    }
  } catch (e) {
    // Config not found, that's okay
  }
  return { allowed: {} };
}

/**
 * Parse version string to major.minor.patch
 */
function parseVersion(versionStr) {
  if (!versionStr) return null;
  
  // Remove common prefixes
  const cleaned = versionStr.replace(/^[\^~>=<]+/, '').trim();
  const parts = cleaned.split('.');
  
  return {
    full: cleaned,
    major: parseInt(parts[0], 10),
    minor: parseInt(parts[1], 10) || 0,
    patch: parseInt(parts[2], 10) || 0,
    raw: versionStr,
  };
}

/**
 * Get major.minor version key
 */
function getVersionKey(version) {
  if (!version) return null;
  return `${version.major}.${version.minor}`;
}

/**
 * Read package.json and extract relevant dependencies
 */
function readPackageJson(pkgPath) {
  try {
    const content = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.optionalDependencies,
    };
    
    const relevant = {};
    SHARED_FRAMEWORKS.forEach(framework => {
      if (deps[framework]) {
        relevant[framework] = parseVersion(deps[framework]);
      }
    });
    
    return relevant;
  } catch (e) {
    console.error(`Error reading ${pkgPath}: ${e.message}`);
    return {};
  }
}

/**
 * Collect all dependencies from all packages
 */
function collectDependencies() {
  const results = {};
  
  // Add root package
  const rootPkg = readPackageJson(path.join(ROOT_DIR, 'package.json'));
  results['root'] = { path: '.', deps: rootPkg };
  
  // Add all packages
  PACKAGES.forEach(pkg => {
    const pkgPath = path.join(ROOT_DIR, pkg, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const deps = readPackageJson(pkgPath);
      results[pkg] = { path: pkg, deps };
    }
  });
  
  return results;
}

/**
 * Check for version mismatches
 */
function checkMismatches(collected) {
  const mismatches = [];
  
  SHARED_FRAMEWORKS.forEach(framework => {
    const versions = {};
    const packages = [];
    
    Object.entries(collected).forEach(([pkgName, { deps }]) => {
      if (deps[framework]) {
        const version = deps[framework];
        const key = getVersionKey(version);
        
        if (!versions[key]) {
          versions[key] = [];
        }
        versions[key].push({ pkgName, version });
        packages.push(pkgName);
      }
    });
    
    // Check if this framework is in multiple packages
    if (Object.keys(versions).length > 1) {
      // Check if the mismatch is allowed
      const isAllowed = exceptions.allowed[framework];
      
      mismatches.push({
        framework,
        versions,
        packages,
        allowed: isAllowed || false,
      });
    }
  });
  
  return mismatches;
}

/**
 * Format version report for CI
 */
function formatReport(collected, mismatches) {
  let report = '\n';
  report += '═'.repeat(70) + '\n';
  report += 'DEPENDENCY VERSION REPORT\n';
  report += '═'.repeat(70) + '\n\n';
  
  // All dependencies table
  report += 'KEY DEPENDENCIES BY PACKAGE:\n';
  report += '─'.repeat(70) + '\n';
  
  const frameworks = new Set();
  Object.values(collected).forEach(({ deps }) => {
    Object.keys(deps).forEach(f => frameworks.add(f));
  });
  
  const sortedFrameworks = Array.from(frameworks).sort();
  
  report += 'Framework'.padEnd(30) + 'Package'.padEnd(15) + 'Version\n';
  report += '─'.repeat(70) + '\n';
  
  sortedFrameworks.forEach(framework => {
    let first = true;
    Object.entries(collected).forEach(([pkgName, { deps }]) => {
      if (deps[framework]) {
        const version = deps[framework];
        if (first) {
          report += framework.padEnd(30);
          first = false;
        } else {
          report += ''.padEnd(30);
        }
        report += pkgName.padEnd(15) + version.raw + '\n';
      }
    });
    if (!first) report += '\n';
  });
  
  report += '─'.repeat(70) + '\n\n';
  
  // Mismatches
  if (mismatches.length > 0) {
    report += 'VERSION MISMATCHES:\n';
    report += '─'.repeat(70) + '\n';
    
    mismatches.forEach(({ framework, versions, packages, allowed }) => {
      const status = allowed ? '[ALLOWED]' : '[MISMATCH]';
      report += `${status} ${framework}\n`;
      
      Object.entries(versions).forEach(([version, pkgs]) => {
        report += `  Version ${version}:\n`;
        pkgs.forEach(({ pkgName, version: v }) => {
          report += `    - ${pkgName}: ${v.raw}\n`;
        });
      });
      report += '\n';
    });
  } else {
    report += '✓ No major version mismatches detected\n\n';
  }
  
  report += '═'.repeat(70) + '\n';
  report += `Checked ${Object.keys(collected).length} packages\n`;
  report += `Found ${mismatches.length} mismatches (${mismatches.filter(m => !m.allowed).length} flagged)\n`;
  report += '═'.repeat(70) + '\n\n';
  
  return report;
}

/**
 * Main execution
 */
function main() {
  console.log('Checking dependency versions...\n');
  
  const collected = collectDependencies();
  const mismatches = checkMismatches(collected);
  const report = formatReport(collected, mismatches);
  
  console.log(report);
  
  // Exit with error if unflagged mismatches found
  const unflaggedMismatches = mismatches.filter(m => !m.allowed);
  if (unflaggedMismatches.length > 0) {
    console.error(`\n❌ Found ${unflaggedMismatches.length} unflagged version mismatch(es)!\n`);
    process.exit(1);
  } else {
    console.log('✓ All version checks passed!\n');
    process.exit(0);
  }
}

main();
