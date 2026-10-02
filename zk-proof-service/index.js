'use strict';

/**
 * zk-proof-service/index.js
 *
 * Zero-knowledge proof service entry-point.
 *
 * Startup sequence
 * ----------------
 * 1. Load environment variables from .env (if present).
 * 2. Run trusted setup ceremony verification via ceremony-verifier.js.
 *    - Checks file existence for ptau, zkey, and vkey artifacts.
 *    - Validates SHA-256 checksums against published ceremony values.
 *    - Optionally runs snarkjs structural verification of the zkey chain.
 * 3. ABORT with exit code 1 if any check fails — no proofs are generated
 *    with unverified or potentially compromised artifacts.
 * 4. Load snarkjs and expose the proof-generation / verification API.
 * 5. Start the HTTP service.
 *
 * Environment variables
 * ---------------------
 * See .env.example for the full list with descriptions.
 */

const path   = require('path');
const http   = require('http');
require('dotenv').config();

const {
  verifyCeremonyArtifacts,
  ceremonyConfigFromEnv,
} = require('./ceremony-verifier');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVICE_PORT    = parseInt(process.env.ZK_SERVICE_PORT || '3010', 10);
const SERVICE_HOST    = process.env.ZK_SERVICE_HOST || '127.0.0.1';
const LOG_PREFIX      = '[zk-proof-service]';

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function log(msg)   { console.log(`${LOG_PREFIX} ${msg}`); }
function warn(msg)  { console.warn(`${LOG_PREFIX} WARN  ${msg}`); }
function error(msg) { console.error(`${LOG_PREFIX} ERROR ${msg}`); }

// ---------------------------------------------------------------------------
// Ceremony verification guard
// ---------------------------------------------------------------------------

/**
 * Run the trusted setup ceremony verification.
 * Throws if any check fails so the caller can decide how to handle it.
 *
 * @returns {Promise<void>}
 * @throws  {Error} When artifact integrity checks fail.
 */
async function runCeremonyVerification() {
  log('Running trusted setup ceremony verification...');

  const config = ceremonyConfigFromEnv();

  log(`  Powers of Tau : ${path.resolve(config.ptauPath)}`);
  log(`  Proving key   : ${path.resolve(config.zkeyPath)}`);
  log(`  Verification  : ${path.resolve(config.vkeyPath)}`);
  log(`  Structural    : ${config.structuralVerify}`);

  const result = await verifyCeremonyArtifacts(config);

  // Surface non-fatal warnings.
  for (const w of result.warnings) warn(w);

  if (!result.valid) {
    error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    error('TRUSTED SETUP CEREMONY VERIFICATION FAILED');
    error('The ZK proof service will NOT start with unverified artifacts.');
    error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    for (const e of result.errors) error(e);
    error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    throw new Error(
      'Startup aborted: trusted setup ceremony artifact integrity check failed. ' +
      `${result.errors.length} error(s) found. ` +
      'Verify artifacts against the published ceremony transcript before restarting.'
    );
  }

  log('Computed checksums:');
  for (const [file, checksum] of Object.entries(result.checksums)) {
    log(`  ${checksum}  ${path.relative(process.cwd(), file) || file}`);
  }
  log('✓ All ceremony artifacts verified successfully.');
}

// ---------------------------------------------------------------------------
// ZK proof operations
// ---------------------------------------------------------------------------

/** Lazily loaded snarkjs reference — populated after ceremony verification. */
let _snarkjs = null;

/**
 * Load snarkjs once, after ceremony verification passes.
 * @returns {object} snarkjs module
 */
function getSnarkjs() {
  if (!_snarkjs) {
    try {
      _snarkjs = require('snarkjs');
    } catch (err) {
      throw new Error(
        'snarkjs is not installed. Run "npm install" in the zk-proof-service directory.'
      );
    }
  }
  return _snarkjs;
}

/**
 * Generate a Groth16 zero-knowledge proof for the given input signals.
 *
 * @param {Object} input   Circuit input signals (field elements as BigInt or number).
 * @returns {Promise<{proof: Object, publicSignals: string[]}>}
 */
async function generateProof(input) {
  const snarkjs  = getSnarkjs();
  const zkeyPath = path.resolve(process.env.ZKEY_FILE_PATH || './artifacts/circuit_final.zkey');

  log(`Generating Groth16 proof (zkey: ${zkeyPath})`);
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, zkeyPath, null);
  log('Proof generated successfully.');
  return { proof, publicSignals };
}

/**
 * Verify a Groth16 proof against the verification key.
 *
 * @param {Object}   proof          Proof object from generateProof().
 * @param {string[]} publicSignals  Public signals from generateProof().
 * @returns {Promise<boolean>}      True when the proof is valid.
 */
async function verifyProof(proof, publicSignals) {
  const snarkjs = getSnarkjs();
  const vkeyPath = path.resolve(process.env.VKEY_FILE_PATH || './artifacts/vkey.json');

  const vkey = JSON.parse(require('fs').readFileSync(vkeyPath, 'utf8'));
  const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  log(`Proof verification result: ${valid ? '✓ VALID' : '✗ INVALID'}`);
  return valid;
}

// ---------------------------------------------------------------------------
// HTTP service
// ---------------------------------------------------------------------------

/**
 * Minimal JSON HTTP handler.
 * Routes:
 *   GET  /health          liveness probe
 *   POST /prove           generate a Groth16 proof
 *   POST /verify          verify a Groth16 proof
 */
async function handleRequest(req, res) {
  const sendJson = (status, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
  };

  // Collect body for POST requests.
  let body = '';
  req.on('data', (chunk) => { body += chunk; });

  req.on('end', async () => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        return sendJson(200, { status: 'ok', service: 'zk-proof-service' });
      }

      if (req.method === 'POST' && req.url === '/prove') {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          return sendJson(400, { error: 'Invalid JSON body' });
        }

        if (!parsed.input || typeof parsed.input !== 'object') {
          return sendJson(400, { error: 'Missing or invalid "input" field' });
        }

        const { proof, publicSignals } = await generateProof(parsed.input);
        return sendJson(200, { proof, publicSignals });
      }

      if (req.method === 'POST' && req.url === '/verify') {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          return sendJson(400, { error: 'Invalid JSON body' });
        }

        const { proof, publicSignals } = parsed;
        if (!proof || !Array.isArray(publicSignals)) {
          return sendJson(400, { error: 'Missing "proof" or "publicSignals" field' });
        }

        const valid = await verifyProof(proof, publicSignals);
        return sendJson(200, { valid });
      }

      return sendJson(404, { error: 'Not found' });
    } catch (err) {
      error(`Request handler error: ${err.message}`);
      return sendJson(500, { error: 'Internal server error', detail: err.message });
    }
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

/**
 * Main entry-point.
 *
 * Enforces the ceremony verification gate before allowing the service to
 * start accepting proof requests.  Any verification failure terminates the
 * process with exit code 1 to prevent silent operation with compromised keys.
 */
async function bootstrap() {
  log('Starting ZK Proof Service...');

  // ── GATE: Trusted setup ceremony verification ───────────────────────────
  // This check MUST succeed before any proof operations are permitted.
  // Failure here indicates tampered, missing, or unverified ceremony
  // artifacts — operating with such artifacts would undermine ZK soundness.
  try {
    await runCeremonyVerification();
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
  // ── END GATE ─────────────────────────────────────────────────────────────

  // Start the HTTP server only after all checks pass.
  const server = http.createServer(handleRequest);

  server.listen(SERVICE_PORT, SERVICE_HOST, () => {
    log(`Service listening on http://${SERVICE_HOST}:${SERVICE_PORT}`);
    log('Endpoints:');
    log(`  GET  http://${SERVICE_HOST}:${SERVICE_PORT}/health`);
    log(`  POST http://${SERVICE_HOST}:${SERVICE_PORT}/prove`);
    log(`  POST http://${SERVICE_HOST}:${SERVICE_PORT}/verify`);
  });

  // Graceful shutdown on SIGTERM / SIGINT.
  const shutdown = (signal) => {
    log(`Received ${signal} — shutting down gracefully.`);
    server.close(() => {
      log('HTTP server closed.');
      process.exit(0);
    });
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT',  () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  error(`Fatal bootstrap error: ${err.message}`);
  process.exit(1);
});
