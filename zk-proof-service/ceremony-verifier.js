'use strict';

/**
 * ceremony-verifier.js
 *
 * Validates the integrity of Powers of Tau phase 1 & 2 trusted setup artifacts
 * before the ZK proof service is allowed to start.
 *
 * Verification steps
 * ------------------
 * 1. Assert every required artifact file exists on disk.
 * 2. Compute SHA-256 over each file and compare against the published
 *    ceremony checksum.  The expected hash is supplied via environment
 *    variable so operators can pin it to the exact ceremony contribution
 *    they audited.
 * 3. Optionally call snarkjs to structurally verify the .zkey file (phase 2
 *    contribution chain) when ZKEY_STRUCTURAL_VERIFY=true.
 *
 * Exit codes
 * ----------
 * 0  all checks passed
 * 1  a check failed — service must not start
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// snarkjs is loaded lazily so the module can be imported without it installed
// in environments that only need the hash-level check.
let snarkjs;
try {
  snarkjs = require('snarkjs');
} catch {
  snarkjs = null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute the SHA-256 hex digest of a file by streaming it in chunks.
 * Avoids loading large ceremony files fully into memory.
 *
 * @param {string} filePath  Absolute or relative path to the file.
 * @returns {Promise<string>}  Lower-case hex digest.
 */
async function fileChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Constant-time comparison of two hex strings to prevent timing attacks.
 * Falls back to a simple equality check when the lengths differ (which is
 * itself a safe early-out — a length mismatch always means failure).
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  // crypto.timingSafeEqual requires equal-length buffers.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Result shape returned by verifyCeremonyArtifacts().
 *
 * @typedef {Object} VerificationResult
 * @property {boolean} valid          - True only when every check passed.
 * @property {string[]} errors        - Human-readable failure messages.
 * @property {string[]} warnings      - Non-fatal observations (e.g. snarkjs unavailable).
 * @property {Object<string,string>}  checksums - Computed SHA-256 hex per artifact path.
 */

/**
 * Configuration accepted by verifyCeremonyArtifacts().
 *
 * @typedef {Object} CeremonyConfig
 * @property {string}  ptauPath              - Path to the Powers of Tau (.ptau) file.
 * @property {string}  zkeyPath              - Path to the proving key (.zkey) file.
 * @property {string}  vkeyPath              - Path to the verification key (vkey.json).
 * @property {string}  expectedPtauChecksum  - Published SHA-256 of the .ptau file.
 * @property {string}  expectedZkeyChecksum  - Published SHA-256 of the .zkey file.
 * @property {string}  expectedVkeyChecksum  - Published SHA-256 of vkey.json.
 * @property {boolean} [structuralVerify]    - Run snarkjs zkey verify (default: false).
 */

/**
 * Verify that all trusted setup ceremony artifacts are present and unmodified.
 *
 * @param {CeremonyConfig} config
 * @returns {Promise<VerificationResult>}
 */
async function verifyCeremonyArtifacts(config) {
  const {
    ptauPath,
    zkeyPath,
    vkeyPath,
    expectedPtauChecksum,
    expectedZkeyChecksum,
    expectedVkeyChecksum,
    structuralVerify = false,
  } = config;

  const errors = [];
  const warnings = [];
  const checksums = {};

  // -------------------------------------------------------------------------
  // Step 1 — Existence check
  // -------------------------------------------------------------------------
  const artifacts = [
    { label: 'Powers of Tau (.ptau)', path: ptauPath },
    { label: 'Proving key (.zkey)',   path: zkeyPath },
    { label: 'Verification key (vkey.json)', path: vkeyPath },
  ];

  for (const artifact of artifacts) {
    if (!artifact.path) {
      errors.push(`[CEREMONY] Artifact path not configured: ${artifact.label}`);
      continue;
    }
    const resolved = path.resolve(artifact.path);
    if (!fs.existsSync(resolved)) {
      errors.push(
        `[CEREMONY] Artifact not found: ${artifact.label} at "${resolved}". ` +
        'Run the trusted setup ceremony or download from the published ceremony transcript.'
      );
    }
  }

  // Abort early — no point computing checksums if files are missing.
  if (errors.length > 0) {
    return { valid: false, errors, warnings, checksums };
  }

  // -------------------------------------------------------------------------
  // Step 2 — SHA-256 checksum verification
  // -------------------------------------------------------------------------
  const checksumTargets = [
    { label: 'Powers of Tau (.ptau)', path: ptauPath, expected: expectedPtauChecksum },
    { label: 'Proving key (.zkey)',   path: zkeyPath, expected: expectedZkeyChecksum },
    { label: 'Verification key',      path: vkeyPath, expected: expectedVkeyChecksum },
  ];

  for (const target of checksumTargets) {
    if (!target.expected) {
      errors.push(
        `[CEREMONY] Expected checksum not configured for ${target.label}. ` +
        'Set the corresponding EXPECTED_*_CHECKSUM environment variable to the ' +
        'SHA-256 published in the ceremony transcript.'
      );
      continue;
    }

    let actual;
    try {
      actual = await fileChecksum(path.resolve(target.path));
    } catch (err) {
      errors.push(`[CEREMONY] Could not read ${target.label}: ${err.message}`);
      continue;
    }

    checksums[target.path] = actual;

    const normalizedExpected = target.expected.toLowerCase().trim();
    const normalizedActual   = actual.toLowerCase();

    if (!safeEqual(normalizedActual, normalizedExpected)) {
      errors.push(
        `[CEREMONY] Checksum MISMATCH for ${target.label}.\n` +
        `  expected : ${normalizedExpected}\n` +
        `  computed : ${normalizedActual}\n` +
        'The artifact may have been tampered with or corrupted. ' +
        'Verify against the published ceremony transcript before proceeding.'
      );
    }
  }

  // -------------------------------------------------------------------------
  // Step 3 — Optional structural verification via snarkjs
  // -------------------------------------------------------------------------
  if (structuralVerify) {
    if (!snarkjs) {
      warnings.push(
        '[CEREMONY] ZKEY_STRUCTURAL_VERIFY=true but snarkjs is not installed. ' +
        'Install snarkjs to enable full contribution-chain verification.'
      );
    } else {
      try {
        // snarkjs.zKey.verifyFromR1cs / verifyFromInit validates the phase-2
        // contribution chain without requiring the original r1cs at runtime.
        // We use verifyFromInit which only needs the .ptau and .zkey.
        const ptauResolved  = path.resolve(ptauPath);
        const zkeyResolved  = path.resolve(zkeyPath);

        // snarkjs writes progress to a logger; suppress it for clean output.
        const silentLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

        const structuralValid = await snarkjs.zKey.verifyFromInit(
          ptauResolved,
          zkeyResolved,
          silentLogger,
        );

        if (!structuralValid) {
          errors.push(
            '[CEREMONY] snarkjs structural verification FAILED: the .zkey contribution ' +
            'chain is invalid. The proving key was not derived from the supplied ' +
            'Powers of Tau file or contributions were tampered with.'
          );
        }
      } catch (err) {
        errors.push(`[CEREMONY] snarkjs structural verification threw an error: ${err.message}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checksums,
  };
}

/**
 * Build a CeremonyConfig from environment variables.
 * All paths default to the paths recommended in the README.
 *
 * @returns {CeremonyConfig}
 */
function ceremonyConfigFromEnv() {
  return {
    ptauPath:             process.env.PTAU_FILE_PATH              || './artifacts/pot18_final.ptau',
    zkeyPath:             process.env.ZKEY_FILE_PATH              || './artifacts/circuit_final.zkey',
    vkeyPath:             process.env.VKEY_FILE_PATH              || './artifacts/vkey.json',
    expectedPtauChecksum: process.env.EXPECTED_PTAU_CHECKSUM      || '',
    expectedZkeyChecksum: process.env.EXPECTED_ZKEY_CHECKSUM      || '',
    expectedVkeyChecksum: process.env.EXPECTED_VKEY_CHECKSUM      || '',
    structuralVerify:     process.env.ZKEY_STRUCTURAL_VERIFY === 'true',
  };
}

module.exports = {
  verifyCeremonyArtifacts,
  ceremonyConfigFromEnv,
  fileChecksum,       // exported for testing
  safeEqual,          // exported for testing
};

// ---------------------------------------------------------------------------
// CLI entry-point — run standalone: node ceremony-verifier.js
// ---------------------------------------------------------------------------
if (require.main === module) {
  require('dotenv').config();

  const config = ceremonyConfigFromEnv();

  console.log('[CEREMONY] Starting trusted setup artifact verification...');
  console.log(`[CEREMONY]   Powers of Tau : ${config.ptauPath}`);
  console.log(`[CEREMONY]   Proving key   : ${config.zkeyPath}`);
  console.log(`[CEREMONY]   Verification  : ${config.vkeyPath}`);
  console.log(`[CEREMONY]   Structural    : ${config.structuralVerify}`);
  console.log('');

  verifyCeremonyArtifacts(config).then((result) => {
    for (const w of result.warnings) console.warn(w);

    if (!result.valid) {
      for (const e of result.errors) console.error(e);
      console.error('\n[CEREMONY] ✗ Verification FAILED — service startup blocked.');
      process.exit(1);
    }

    console.log('[CEREMONY] Computed checksums:');
    for (const [file, hash] of Object.entries(result.checksums)) {
      console.log(`  ${hash}  ${file}`);
    }
    console.log('\n[CEREMONY] ✓ All artifacts verified successfully.');
    process.exit(0);
  }).catch((err) => {
    console.error(`[CEREMONY] Unexpected error: ${err.message}`);
    process.exit(1);
  });
}
