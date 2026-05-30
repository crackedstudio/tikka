# Environment Variable Catalog

This document centralizes and catalogs all environment variables used across the Tikka workspace applications.
---
## 1. Backend Environment Variables
| Variable Name | Type | Required / Optional | Default Value | Secret? | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `PORT` | `number` | Optional | `3001` | 🟢 No | Port number the API server binds to. |
| `MAINTENANCE_MODE` | `boolean` | Optional | `false` | 🟢 No | Toggles maintenance mode. |
| `SUPABASE_URL` | `string` | **Required** | *None* | 🟢 No | Base project URL for Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | `string` | **Required** | *None* | 🔴 **Yes** | Super-admin bypass key. |
| `STELLAR_NETWORK` | `enum` | Optional | `'testnet'` | 🟢 No | Targeted network tier. |
| `STELLAR_CONTRACT_ID` | `string` | Optional | *None* | 🟢 No | Target deployed smart contract address. |
| `INDEXER_URL` | `string` | **Required** | *Derived* | 🟢 No | Endpoint for Tikka Indexer microservice. |
| `JWT_SECRET` | `string` | **Required** | *None* | 🔴 **Yes** | Secret signing string for JWT payloads. |
| `R2_SECRET_ACCESS_KEY` | `string` | Optional | *None* | 🔴 **Yes** | Cryptographic authorization token for R2 buckets. |
---
## 2. Client (Frontend) Environment Variables
| Variable Name | Type | Required / Optional | Default Value | Secret? | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `VITE_BACKEND_URL` | `string` | Optional | `'http://localhost:3001'` | 🟢 No | Core routing endpoint linking client to server API. |
| `VITE_STELLAR_NETWORK` | `enum` | Optional | `'testnet'` | 🟢 No | Network designation identifier string. |
| `VITE_SUPABASE_URL` | `string` | Optional | *None* | 🟢 No | Cloud database lookup base URL router endpoint. |
---
## 3. Indexer Environment Variables
| `DATABASE_URL` | `string` | **Required** | *See Note* | 🔴 **Yes** | Core connection URL string for Indexer. |
| `SOROBAN_RPC_URL` | `string` | **Required** | *None* | 🟢 No | Monitoring cluster stream for Soroban contract ops. |
---
## 4. Oracle Environment Variables
| `ORACLE_CB_FAILURE_THRESHOLD` | `number` | Optional | `5` | 🟢 No | Failures allowed before Horizon circuit opens. |
---
## 5. SDK Network Constants
* **testnet:** RPC: `https://soroban-testnet.stellar.org` | Horizon: `https://horizon-testnet.stellar.org`
