const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const baseConfig = path.join(root, 'tsconfig.base.json');
const workspaceConfig = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
const workspaceDirs = [...workspaceConfig.matchAll(/^\s*-\s*['"]?([^'"#\s]+)['"]?\s*$/gm)]
  .map((match) => path.resolve(root, match[1]));
const ignoredDirs = new Set(['.git', 'coverage', 'dist', 'node_modules']);
const failures = [];

function findConfigs(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirs.has(entry.name) ? [] : findConfigs(entryPath);
    }
    return /^tsconfig.*\.json$/.test(entry.name) ? [entryPath] : [];
  });
}

function extendsBase(configPath, visited = new Set()) {
  if (path.resolve(configPath) === baseConfig) return true;
  if (visited.has(configPath) || !fs.existsSync(configPath)) return false;
  visited.add(configPath);

  const source = fs.readFileSync(configPath, 'utf8');
  const match = source.match(/"extends"\s*:\s*"([^"]+)"/);
  if (!match) return false;

  const extendedPath = path.resolve(path.dirname(configPath), match[1]);
  const candidates = path.extname(extendedPath)
    ? [extendedPath]
    : [extendedPath, `${extendedPath}.json`, path.join(extendedPath, 'tsconfig.json')];
  const resolvedPath = candidates.find((candidate) => fs.existsSync(candidate));
  return resolvedPath ? extendsBase(resolvedPath, visited) : false;
}

for (const workspaceDir of workspaceDirs) {
  if (!fs.existsSync(workspaceDir)) {
    failures.push(`Workspace directory not found: ${path.relative(root, workspaceDir)}`);
    continue;
  }

  for (const configPath of findConfigs(workspaceDir)) {
    const source = fs.readFileSync(configPath, 'utf8');
    const isReferencesOnly = !/"extends"\s*:/.test(source)
      && !/"compilerOptions"\s*:/.test(source)
      && /"references"\s*:/.test(source);
    if (!isReferencesOnly && !extendsBase(configPath)) {
      failures.push(`${path.relative(root, configPath)} does not extend ${path.relative(root, baseConfig)}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('All workspace compiler tsconfigs extend tsconfig.base.json.');
}