/**
 * Opt-in testnet smoke runner (#1107).
 * Sets TIKKA_TESTNET_TESTS=1 then runs the smoke Jest suite.
 */
const { spawnSync } = require('child_process');
const path = require('path');

process.env.TIKKA_TESTNET_TESTS = '1';

const jestBin = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'jest.cmd' : 'jest',
);

const result = spawnSync(
  jestBin,
  ['--config', 'jest.config.cjs', '--testPathPatterns=testnet-smoke', '--forceExit'],
  {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  },
);

process.exit(result.status ?? 1);
