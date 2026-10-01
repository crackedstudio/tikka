#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

function main() {
  console.log('Checking Node version consistency across repository...\n');
  const errors = [];

  // 1. Read .nvmrc (Source of truth)
  const nvmrcPath = path.join(ROOT_DIR, '.nvmrc');
  if (!fs.existsSync(nvmrcPath)) {
    console.error('❌ .nvmrc file not found at repository root!');
    process.exit(1);
  }
  const nvmrcRaw = fs.readFileSync(nvmrcPath, 'utf-8');
  const expectedVersion = nvmrcRaw.trim();
  console.log(`Source of truth (.nvmrc): "${expectedVersion}"`);

  // Check trailing newline in .nvmrc
  if (!nvmrcRaw.endsWith('\n')) {
    errors.push(`.nvmrc does not end with a trailing newline.`);
  }

  // 2. Check .node-version
  const nodeVersionPath = path.join(ROOT_DIR, '.node-version');
  if (!fs.existsSync(nodeVersionPath)) {
    errors.push(`.node-version file/symlink not found at repository root.`);
  } else {
    const nodeVersionRaw = fs.readFileSync(nodeVersionPath, 'utf-8').trim();
    if (nodeVersionRaw !== expectedVersion && nodeVersionRaw !== '.nvmrc') {
      errors.push(`.node-version content ("${nodeVersionRaw}") does not match .nvmrc ("${expectedVersion}").`);
    }
  }

  // 3. Check package.json files for engines.node
  const packageJsonFiles = [
    'package.json',
    'client/package.json',
    'sdk/package.json',
    'backend/package.json',
    'indexer/package.json',
    'oracle/package.json',
  ];

  for (const relPath of packageJsonFiles) {
    const fullPath = path.join(ROOT_DIR, relPath);
    if (fs.existsSync(fullPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        if (pkg.engines && pkg.engines.node) {
          const nodeEngine = pkg.engines.node.trim();
          const match = nodeEngine.match(/\d+/);
          if (!match || match[0] !== expectedVersion) {
            errors.push(`${relPath} engines.node ("${nodeEngine}") does not match .nvmrc ("${expectedVersion}").`);
          }
        }
      } catch (e) {
        errors.push(`Failed to parse ${relPath}: ${e.message}`);
      }
    }
  }

  // 4. Check Dockerfiles
  const dockerfiles = [
    'client/Dockerfile',
    'backend/Dockerfile',
    'indexer/Dockerfile',
    'oracle/Dockerfile',
  ];

  for (const relPath of dockerfiles) {
    const fullPath = path.join(ROOT_DIR, relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      let foundNodeImage = false;
      for (const line of lines) {
        const fromMatch = line.match(/(?:FROM|ARG\s+\w+=)[\s'"]*node:(\d+)/i);
        if (fromMatch) {
          foundNodeImage = true;
          const dockerNodeMajor = fromMatch[1];
          if (dockerNodeMajor !== expectedVersion) {
            errors.push(`${relPath} base image node version ("${dockerNodeMajor}") does not match .nvmrc ("${expectedVersion}").`);
          }
        }
      }
    }
  }

  // 5. Check GitHub Workflows for setup-node step
  const workflowsDir = path.join(ROOT_DIR, '.github', 'workflows');
  if (fs.existsSync(workflowsDir)) {
    const workflowFiles = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
    for (const file of workflowFiles) {
      const fullPath = path.join(workflowsDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (content.includes('actions/setup-node')) {
        const literalMatch = content.match(/node-version:\s*['"]?(\d+)['"]?/);
        if (literalMatch) {
          errors.push(`.github/workflows/${file} uses literal node-version ("${literalMatch[1]}") instead of node-version-file: .nvmrc.`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`\n❌ Found ${errors.length} Node version consistency error(s):\n`);
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('\nPlease fix these declarations to match .nvmrc as the single source of truth.\n');
    process.exit(1);
  } else {
    console.log('✓ All Node version consistency checks passed!\n');
    process.exit(0);
  }
}

main();
