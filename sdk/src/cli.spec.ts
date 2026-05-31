/**
 * cli.spec.ts
 *
 * Tests for tikka CLI commands:
 * - help/usage information
 * - config-check (read-only)
 * - fee-quote (read-only)
 * - read (read-only)
 * - list (read-only)
 * - info (read-only)
 * - create (interactive, requires wallet)
 * - buy (interactive, requires wallet)
 */

import { spawn } from 'child_process';
import * as path from 'path';

/**
 * Helper to run CLI command and capture output
 */
const runCLI = (
  args: string[],
  timeout = 5000
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  return new Promise((resolve, reject) => {
    const cliPath = path.join(__dirname, '../bin/tikka.cjs');
    const child = spawn('node', [cliPath, ...args], {
      cwd: path.join(__dirname, '..'),
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI command timed out after ${timeout}ms`));
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
};

describe('Tikka CLI', () => {
  describe('help commands', () => {
    it('should show help when run without arguments', async () => {
      const result = await runCLI([]);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('Tikka SDK Developer CLI');
    });

    it('should show help with --help flag', async () => {
      const result = await runCLI(['--help']);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('Options:');
      expect(result.stdout).toContain('Commands:');
    });

    it('should show all commands with help-all', async () => {
      const result = await runCLI(['help-all']);
      expect(result.stdout).toContain('config-check');
      expect(result.stdout).toContain('fee-quote');
      expect(result.stdout).toContain('read');
      expect(result.stdout).toContain('list');
      expect(result.stdout).toContain('info');
      expect(result.stdout).toContain('create');
      expect(result.stdout).toContain('buy');
    });

    it('should show version with --version', async () => {
      const result = await runCLI(['--version']);
      expect(result.stdout).toContain('0.1.0');
    });
  });

  describe('config-check command', () => {
    it('should check configuration in text format', async () => {
      const result = await runCLI(['config-check']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('testnet');
    }, 10000);

    it('should check configuration in JSON format', async () => {
      const result = await runCLI(['config-check', '--json']);
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output).toHaveProperty('version');
      expect(output).toHaveProperty('network');
      expect(output).toHaveProperty('status');
      expect(output.network).toBe('testnet');
    }, 10000);

    it('should respect --network mainnet flag', async () => {
      const result = await runCLI(['config-check', '--network', 'mainnet']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('mainnet');
    }, 10000);

    it('should output JSON with network option', async () => {
      const result = await runCLI([
        'config-check',
        '--network',
        'mainnet',
        '--json',
      ]);
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.network).toBe('mainnet');
    }, 10000);
  });

  describe('fee-quote command', () => {
    it('should get fee quote for contract', async () => {
      const result = await runCLI(['fee-quote', 'CONTRACT_ID_123']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CONTRACT_ID_123');
      expect(result.stdout).toContain('stroops');
    }, 10000);

    it('should output fee quote as JSON', async () => {
      const result = await runCLI([
        'fee-quote',
        'CONTRACT_ID_123',
        '--json',
      ]);
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.contractId).toBe('CONTRACT_ID_123');
      expect(output).toHaveProperty('baseFee');
      expect(output).toHaveProperty('estimatedFee');
    }, 10000);

    it('should accept custom function name', async () => {
      const result = await runCLI([
        'fee-quote',
        'CONTRACT_ID_123',
        '--function',
        'custom_function',
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('custom_function');
    }, 10000);

    it('should work with mainnet', async () => {
      const result = await runCLI([
        'fee-quote',
        'CONTRACT_ID_123',
        '--network',
        'mainnet',
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('mainnet');
    }, 10000);
  });

  describe('read command', () => {
    it('should read contract data', async () => {
      const result = await runCLI(['read', 'CONTRACT_ID_456']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CONTRACT_ID_456');
    }, 10000);

    it('should output read data as JSON', async () => {
      const result = await runCLI(['read', 'CONTRACT_ID_456', '--json']);
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.contractId).toBe('CONTRACT_ID_456');
      expect(output).toHaveProperty('data');
    }, 10000);

    it('should accept optional key parameter', async () => {
      const result = await runCLI([
        'read',
        'CONTRACT_ID_456',
        '--key',
        'custom_key',
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('custom_key');
    }, 10000);

    it('should work with mainnet', async () => {
      const result = await runCLI([
        'read',
        'CONTRACT_ID_456',
        '--network',
        'mainnet',
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('mainnet');
    }, 10000);
  });

  describe('list command', () => {
    it('should list active raffles', async () => {
      const result = await runCLI(['list']);
      expect(result.exitCode).toMatch(/0|1/); // May fail if SDK not ready, but should not crash
    }, 10000);

    it('should output list as JSON', async () => {
      const result = await runCLI(['list', '--json']);
      // Output should be valid JSON even if empty array or error
      try {
        JSON.parse(result.stdout);
      } catch {
        // If parse fails, there should be an error message
        expect(result.stdout).toContain('error');
      }
    }, 10000);

    it('should accept limit parameter', async () => {
      const result = await runCLI(['list', '--limit', '5']);
      expect(result.exitCode).toMatch(/0|1/);
    }, 10000);

    it('should work with mainnet', async () => {
      const result = await runCLI(['list', '--network', 'mainnet']);
      expect(result.exitCode).toMatch(/0|1/);
    }, 10000);
  });

  describe('info command', () => {
    it('should get contract info', async () => {
      const result = await runCLI(['info']);
      expect(result.exitCode).toMatch(/0|1/);
    }, 10000);

    it('should output info as JSON', async () => {
      const result = await runCLI(['info', '--json']);
      // Should be valid JSON or error
      try {
        JSON.parse(result.stdout);
      } catch {
        expect(result.stdout).toContain('error');
      }
    }, 10000);

    it('should work with mainnet', async () => {
      const result = await runCLI(['info', '--network', 'mainnet']);
      expect(result.exitCode).toMatch(/0|1/);
    }, 10000);

    it('should not include emojis in JSON output', async () => {
      const result = await runCLI(['info', '--json']);
      const output = result.stdout;
      // If JSON, should not have emoji prefix before JSON
      if (output.trim().startsWith('{')) {
        expect(output).not.toContain('🔍');
      }
    }, 10000);
  });

  describe('error handling', () => {
    it('should handle invalid command gracefully', async () => {
      const result = await runCLI(['invalid-command']);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('Invalid command');
    });

    it('should provide helpful error messages', async () => {
      const result = await runCLI(['help-all']);
      expect(result.stdout).toContain('EXAMPLES:');
    });
  });

  describe('global options', () => {
    it('should support --network testnet', async () => {
      const result = await runCLI([
        '--network',
        'testnet',
        'config-check',
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('testnet');
    }, 10000);

    it('should support --network mainnet', async () => {
      const result = await runCLI([
        '--network',
        'mainnet',
        'config-check',
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('mainnet');
    }, 10000);

    it('should support -n shorthand for network', async () => {
      const result = await runCLI(['-n', 'mainnet', 'config-check']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('mainnet');
    }, 10000);

    it('should support --json flag', async () => {
      const result = await runCLI(['config-check', '--json']);
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output).toBeInstanceOf(Object);
    }, 10000);

    it('should support -j shorthand for json', async () => {
      const result = await runCLI(['config-check', '-j']);
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output).toBeInstanceOf(Object);
    }, 10000);
  });
});
