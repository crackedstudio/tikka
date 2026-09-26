import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { evaluateFeeAccuracy, type FeeAccuracyReport } from './compare';
import {
  renderFeeAccuracyMarkdown,
  resolveReportPath,
  writeFeeAccuracyReport,
  FEE_REPORT_PATH_ENV,
} from './report';

const passingReport: FeeAccuracyReport = evaluateFeeAccuracy([
  {
    label: 'sdk.buy_ticket',
    estimatedStroops: 50_100,
    actualStroops: 50_100,
    details: { txHash: 'abc123', ledger: 42 },
  },
]);

const failingReport: FeeAccuracyReport = evaluateFeeAccuracy([
  {
    label: 'sdk.buy_ticket',
    estimatedStroops: 50_100,
    actualStroops: 50_100,
  },
  { label: 'sdk.create_raffle', estimatedStroops: 50_100, actualStroops: 400_000, surge: true },
]);

describe('renderFeeAccuracyMarkdown', () => {
  it('renders a table row per observation with the tolerance in force', () => {
    const markdown = renderFeeAccuracyMarkdown(passingReport);
    expect(markdown).toContain('## 💸 Fee Estimate Accuracy');
    expect(markdown).toContain('**Result:** ✅ within tolerance');
    expect(markdown).toContain('Normal tolerance: ±15% (min 2,000 stroops)');
    expect(markdown).toContain('Surge tolerance: ±100% (min 10,000 stroops)');
    expect(markdown).toContain(
      '| `sdk.buy_ticket` | 50,100 | 50,100 | 0 | 0.0% | ±7,515 | — | ✅ accurate |',
    );
    expect(markdown).toContain('surge observed: no');
  });

  it('lists failures with the reason the run was failed', () => {
    const markdown = renderFeeAccuracyMarkdown(failingReport);
    expect(markdown).toContain('**Result:** ❌ outside tolerance');
    expect(markdown).toContain('### Failures');
    expect(markdown).toContain('`sdk.create_raffle`');
    expect(markdown).toContain('outside the surge band');
  });

  it('notes when a surge was observed', () => {
    const markdown = renderFeeAccuracyMarkdown(failingReport);
    expect(markdown).toContain('surge observed: yes');
    expect(markdown).toContain('| 🌊 |');
  });

  it('renders per-observation context inside a collapsed section', () => {
    const markdown = renderFeeAccuracyMarkdown(passingReport);
    expect(markdown).toContain('<details><summary>Observation context</summary>');
    expect(markdown).toContain('- `sdk.buy_ticket`: txHash=abc123, ledger=42');
  });

  it('degrades gracefully when nothing was observed', () => {
    const markdown = renderFeeAccuracyMarkdown(evaluateFeeAccuracy([]));
    expect(markdown).toContain('_No fee observations were recorded._');
  });
});

describe('resolveReportPath', () => {
  it('honours TIKKA_FEE_REPORT_PATH', () => {
    expect(resolveReportPath({ [FEE_REPORT_PATH_ENV]: 'artifacts/fee.json' })).toBe(
      path.resolve('artifacts/fee.json'),
    );
  });

  it('defaults to the working directory', () => {
    expect(resolveReportPath({})).toBe(path.resolve(process.cwd(), 'fee-accuracy-report.json'));
    expect(resolveReportPath({ [FEE_REPORT_PATH_ENV]: '  ' })).toBe(
      path.resolve(process.cwd(), 'fee-accuracy-report.json'),
    );
  });
});

describe('writeFeeAccuracyReport', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fee-accuracy-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes the JSON report and a markdown sibling', () => {
    const jsonPath = path.join(dir, 'nested', 'report.json');
    const written = writeFeeAccuracyReport(failingReport, { jsonPath });

    expect(written.markdownPath).toBe(path.join(dir, 'nested', 'report.md'));
    const json = JSON.parse(fs.readFileSync(written.jsonPath, 'utf8'));
    expect(json.passed).toBe(false);
    expect(json.failures).toHaveLength(1);
    expect(fs.readFileSync(written.markdownPath, 'utf8')).toContain('### Failures');
  });
});
