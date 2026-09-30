# Client Environment

Source: `client/src/config/env.ts` and direct Vite environment reads in
`client/src`. All client variables are public build-time values; never put
server secrets in `VITE_*` variables.

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | No | `http://localhost:3001` | Backend API URL. |
| `VITE_ADMIN_TOKEN` | No | Empty | Token for the oracle monitor dashboard. Public bundle; use only with the intended monitor deployment. |
| `VITE_STELLAR_NETWORK` | No | `testnet` | Target Stellar network (`testnet` or `mainnet`). |
| `VITE_STELLAR_HORIZON_URL` | No | Testnet Horizon | Horizon URL used by the env config. |
| `VITE_HORIZON_URL` | No | Testnet Horizon | Horizon URL used by the Stellar config module. |
| `VITE_STELLAR_NETWORK_PASSPHRASE` | No | Testnet passphrase | Stellar network passphrase. |
| `VITE_SOROBAN_RPC_URL` | No | Testnet Soroban RPC | Soroban RPC endpoint. |
| `VITE_RAFFLE_CONTRACT_ADDRESS` | No | Empty | Deployed raffle contract; contract interactions need this. |
| `VITE_CONTRACT_DEPLOYMENT_HASH` | No | Empty | Deployment transaction hash for reference. |
| `VITE_SUPABASE_URL` | Required by `validate-env.js` | None | Supabase URL; blank or placeholder values fail the validation script. |
| `VITE_SUPABASE_ANON_KEY` | Required by `validate-env.js` | None | Public Supabase anon key; blank or placeholder values fail the validation script. |
| `VITE_SUPABASE_TABLE` | No | `raffle_metadata` | Supabase metadata table. |
| `VITE_DEFAULT_WALLET` | No | `freighter` | Default wallet provider. |
| `VITE_WALLET_AUTO_CONNECT` | No | `false` | Auto-connect wallet at page load. |
| `VITE_APP_ENV` | No | `development` | Client environment label. |
| `VITE_DEBUG_MODE` | No | `true` | Enable config debug logging/devtools. |
| `VITE_DEBUG` | No | `false` | Enable logger debug output. |
| `VITE_API_TIMEOUT` | No | `30000` | API timeout in milliseconds. |
| `VITE_FEATURE_LEADERBOARD` | No | `true` | Enable leaderboard feature. |
| `VITE_FEATURE_SOCIAL_SHARE` | No | `true` | Enable social sharing. |
| `VITE_FEATURE_EMAIL_NOTIFICATIONS` | No | `false` | Enable email notification UI. |
| `VITE_USE_DEMO_DATA` | No | `true` | Use demo data instead of live data. |
| `VITE_SHOW_DEV_TOOLS` | No | `true` | Show development tools. |
| `VITE_TEST_MODE` | No | `false` | Enable test-mode behavior in wallet/auth/contract services. |