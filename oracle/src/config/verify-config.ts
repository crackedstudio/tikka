#!/usr/bin/env ts-node
/**
 * Configuration Verification Script
 *
 * Run this script to verify your environment configuration:
 *
 *   npm run config:verify
 *   ts-node src/config/verify-config.ts
 *
 * This will:
 * 1. Load environment variables from .env (if present)
 * 2. Validate configuration against schema
 * 3. Warn when the oracle key exceeds ORACLE_KEY_MAX_AGE_DAYS
 * 4. Display configuration summary (with secrets redacted)
 * 5. Report any validation errors (exit 1)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { verifyOracleConfig, reportConfigVerification } from './config.verify';
import { ConfigPresenter } from './config-presenter';

const envPath = path.join(process.cwd(), '.env');
dotenv.config({ path: envPath });

ConfigPresenter.printBanner();

const result = verifyOracleConfig();
const exitCode = reportConfigVerification(result);

if (exitCode !== 0) {
  process.exit(exitCode);
}

ConfigPresenter.printSummary(result.config!);
process.exit(0);
