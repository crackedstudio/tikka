import fs from 'fs';
import os from 'os';
import path from 'path';
import { evaluateFeeAccuracy, toReportFile, type FeeObservation } from './compare';
import { writeFeeAccuracyReport } from './report';
import { evaluateGate, runCli, runGate } from './cli';

const OBSERVATION: FeeObservation = {
  label: 'sdk.buy_ticket',
  estimatedStroops: 50_100,
  actualStroops: 50_100,
};

const FAILING_OBSERVATION: FeeObservation = {
  label: 'sdk.buy_ticket',
  estimatedStroops: 50_100,
  actualStroops: 500_000,
};

function withTempDir<T>(run: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fee-accuracy-gate-'));
  try {
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('evaluateGate', () => {
  it('passes a report whose observations stayed inside tolerance', () => {
    const report = toReportFile(evaluateFeeAccuracy([OBSERVATION]));

    expect(evaluateGate(report).passed).toBe(true);
  });

  it('fails a report that drifted and names every failure', () => {
    const report = toReportFile(evaluateFeeAccuracy([OBSERVATION, FAILING_OBSERVATION]));

    const result = evaluateGate(report);

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('sdk.buy_ticket');
    expect(result.reason).toContain('1 fee observation(s) outside tolerance');
  });

  it('fails an empty report — no measurement is not a clean run', () => {
    const report = toReportFile(evaluateFeeAccuracy([]));

    const result = evaluateGate(report);

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('no fee observations');
  });

  it('fails when there is no report at all', () => {
    expect(evaluateGate(null).passed).toBe(false);
  });
});

describe('runGate', () => {
  it('reads a written report from disk', () => {
    withTempDir((dir) => {
      const jsonPath = path.join(dir, 'report.json');
      writeFeeAccuracyReport(evaluateFeeAccuracy([OBSERVATION]), { jsonPath });

      expect(runGate({ path: jsonPath }).passed).toBe(true);
    });
  });

  it('fails for a drifted report on disk', () => {
    withTempDir((dir) => {
      const jsonPath = path.join(dir, 'report.json');
      writeFeeAccuracyReport(evaluateFeeAccuracy([FAILING_OBSERVATION]), { jsonPath });

      expect(runGate({ path: jsonPath }).passed).toBe(false);
    });
  });

  it('fails when the report file is missing or unreadable', () => {
    withTempDir((dir) => {
      const missing = path.join(dir, 'nope.json');
      expect(runGate({ path: missing }).reason).toContain('Could not read');

      const garbage = path.join(dir, 'garbage.json');
      fs.writeFileSync(garbage, 'not json', 'utf8');
      expect(runGate({ path: garbage }).reason).toContain('Could not read');

      const notAnObject = path.join(dir, 'array.json');
      fs.writeFileSync(notAnObject, '[]', 'utf8');
      expect(runGate({ path: notAnObject }).reason).toContain('not an object');
    });
  });
});

describe('runCli', () => {
  let stdout: jest.SpyInstance;
  let stderr: jest.SpyInstance;

  beforeEach(() => {
    stdout = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it('exits 0 for a passing report selected with --path', () => {
    withTempDir((dir) => {
      const jsonPath = path.join(dir, 'report.json');
      writeFeeAccuracyReport(evaluateFeeAccuracy([OBSERVATION]), { jsonPath });

      expect(runCli(['--path', jsonPath])).toBe(0);
      expect(stdout).toHaveBeenCalledWith(expect.stringContaining('Fee accuracy passed'));
    });
  });

  it('exits 1 for a drifted report and explains why', () => {
    withTempDir((dir) => {
      const jsonPath = path.join(dir, 'report.json');
      writeFeeAccuracyReport(evaluateFeeAccuracy([FAILING_OBSERVATION]), { jsonPath });

      expect(runCli(['--path', jsonPath])).toBe(1);
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Fee accuracy FAILED'));
    });
  });

  it('exits 1 when no report path is given and none is configured', () => {
    withTempDir((dir) => {
      const previous = process.env.TIKKA_FEE_REPORT_PATH;
      const previousCwd = process.cwd();
      process.env.TIKKA_FEE_REPORT_PATH = path.join(dir, 'absent.json');
      try {
        expect(runCli([])).toBe(1);
        expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Could not read'));
      } finally {
        if (previous === undefined) {
          delete process.env.TIKKA_FEE_REPORT_PATH;
        } else {
          process.env.TIKKA_FEE_REPORT_PATH = previous;
        }
        process.chdir(previousCwd);
      }
    });
  });
});
