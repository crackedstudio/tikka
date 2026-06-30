# Oracle Audit Logging

## Overview

The oracle audit logging system provides a tamper-evident, transparent record of every randomness submission to the Stellar blockchain.

## Features

- Complete Audit Trail: Every successful randomness submission is recorded with full details
- Tamper Detection: Chain hashing detects unauthorized modifications
- Public Transparency: Read-only API endpoint for transparency dashboards
- Resilient Recording: Audit logging failures don't break the main submission flow

## API Endpoints

GET /oracle/audit/:raffleId - Get audit record by raffle ID (path parameter)
GET /oracle/audit?raffleId=:id - Get audit record by raffle ID (query parameter)

Example:
```
curl http://localhost:3001/oracle/audit/123
curl http://localhost:3001/oracle/audit?raffleId=123
```

## Implementation

The RandomnessWorker automatically records audit logs after successful submissions:

1. Submit randomness to blockchain
2. If successful, call auditLogService.record() with:
   - raffleId
   - vrfProof (hex)
   - txHash
   - ledger
   - oracleAddress
   - timestamp
   - requestId

## Database Schema

vrf_audit_log table includes:
- tx_hash: Transaction hash of on-chain submission
- proof: VRF proof in hex format
- ledger_sequence: Stellar ledger number
- oracle_public_key: Oracle address
- request_id: Request identifier
- status: committed, revealed, or abandoned

## Testing

Run tests:
```
npm test audit.controller.spec.ts
npm test audit-log.service.spec.ts
npm test audit-integration.spec.ts
```
