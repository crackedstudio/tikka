# Environment Setup Guide

This guide provides step-by-step instructions for setting up your development environment for the Tikka raffle platform.

## Quick Reference

| Service | Purpose | Required? |
|---------|---------|-----------|
| Stellar Testnet | Blockchain network | Yes (for blockchain features) |
| Supabase | Metadata storage | Yes (for raffle data) |
| Soroban Contract | Smart contract | No (can use demo mode) |

## 1. Stellar Testnet Account Setup

### Using Stellar Laboratory (Recommended)

1. **Visit Stellar Laboratory**
   - Go to: https://laboratory.stellar.org/#account-creator?network=test

2. **Generate Keypair**
   - Click "Generate keypair"
   - **IMPORTANT**: Save your Secret Key securely
   - Copy your Public Key

3. **Fund Your Account**
   - Click "Fund account with Friendbot"
   - Wait for confirmation
   - You'll receive 10,000 test XLM

4. **Verify Your Account**
   - Visit: https://stellar.expert/explorer/testnet
   - Search for your public key
   - Confirm balance shows 10,000 XLM

### Using Stellar CLI (Alternative)

```bash
# Install Stellar CLI
npm install -g @stellar/cli

# Generate and fund account
stellar keys generate myaccount --network testnet
stellar keys fund myaccount --network testnet

# View your keys
stellar keys list
```

## 2. Supabase Project Setup

### Create Project

1. **Sign Up/Login**
   - Go to: https://supabase.com/
   - Create account or sign in

2. **Create New Project**
   - Click "New Project"
   - Organization: Select or create
   - Name: `tikka-dev`
   - Database Password: Generate strong password
   - Region: Choose nearest region
   - Click "Create new project"
   - Wait ~2 minutes for provisioning

### Get API Credentials

1. **Navigate to Settings**
   - Click gear icon (⚙️) in sidebar
   - Select "API"

2. **Copy Credentials**
   ```
   Project URL → Copy this
   anon public key → Copy this
   ```

3. **Add to .env**
   ```env
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

### Create Database Schema

1. **Open SQL Editor**
   - Click "SQL Editor" in sidebar
   - Click "New Query"

2. **Run This SQL**
   ```sql
   -- Create raffle_metadata table
   CREATE TABLE raffle_metadata (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     raffle_id INTEGER,
     metadata JSONB NOT NULL,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );

   -- Create indexes
   CREATE INDEX idx_raffle_id ON raffle_metadata(raffle_id);
   CREATE INDEX idx_created_at ON raffle_metadata(created_at DESC);

   -- Enable Row Level Security
   ALTER TABLE raffle_metadata ENABLE ROW LEVEL SECURITY;

   -- Allow public read
   CREATE POLICY "Allow public read access"
     ON raffle_metadata FOR SELECT
     USING (true);

   -- Allow authenticated insert
   CREATE POLICY "Allow authenticated insert"
     ON raffle_metadata FOR INSERT
     WITH CHECK (true);
   ```

3. **Click "Run"**
   - Verify: "Success. No rows returned"

4. **Verify Table Created**
   - Click "Table Editor" in sidebar
   - You should see `raffle_metadata` table

### Set Up Storage (Optional)

1. **Create Storage Bucket**
   - Click "Storage" in sidebar
   - Click "New Bucket"
   - Name: `raffle-images`
   - Public bucket: ✅ Yes
   - Click "Create bucket"

2. **Configure Bucket Policies**
   ```sql
   -- Allow public read access to images
   CREATE POLICY "Public Access"
   ON storage.objects FOR SELECT
   USING (bucket_id = 'raffle-images');

   -- Allow authenticated uploads
   CREATE POLICY "Authenticated Upload"
   ON storage.objects FOR INSERT
   WITH CHECK (bucket_id = 'raffle-images');
   ```

## 3. Environment Variables Checklist

Use this checklist to ensure all variables are configured:

### Required for Demo Mode
- [x] `VITE_USE_DEMO_DATA=true`
- [ ] `VITE_STELLAR_NETWORK=testnet`
- [ ] `VITE_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org`

### Required for Supabase
- [ ] `VITE_SUPABASE_URL` (from Supabase dashboard)
- [ ] `VITE_SUPABASE_ANON_KEY` (from Supabase dashboard)
- [ ] `VITE_SUPABASE_TABLE=raffle_metadata`

### Required for Blockchain Integration
- [ ] `VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org`
- [ ] `VITE_RAFFLE_CONTRACT_ADDRESS` (after contract deployment)
- [ ] `VITE_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015`

### Optional Development Settings
- [ ] `VITE_DEBUG_MODE=true`
- [ ] `VITE_SHOW_DEV_TOOLS=true`
- [ ] `VITE_DEFAULT_WALLET=freighter`

## 4. Verification Steps

### Test Stellar Connection

```bash
# In browser console after starting dev server
fetch('https://horizon-testnet.stellar.org/')
  .then(r => r.json())
  .then(d => console.log('Stellar Network:', d.network_passphrase))
```

Expected output: `Test SDF Network ; September 2015`

### Test Supabase Connection

```bash
# In browser console
console.log('Supabase configured:', 
  import.meta.env.VITE_SUPABASE_URL !== 'https://your-project.supabase.co'
)
```

Expected output: `true`

### Check Environment Validation

When you start the dev server, you should see:

```
🔧 Environment Configuration Loaded:
  network: testnet
  sorobanRpc: https://soroban-testnet.stellar.org
  contractConfigured: false
  supabaseConfigured: true
  useDemoData: true
```

## Troubleshooting

### "Cannot connect to Supabase"

**Symptoms:**
- Error in console about Supabase connection
- Metadata not loading

**Solutions:**
1. Verify URL format: `https://xxxxx.supabase.co` (no trailing slash)
2. Check anon key is complete (very long string starting with `eyJ`)
3. Ensure Supabase project is active (not paused)
4. Verify table `raffle_metadata` exists

### "Stellar network error"

**Symptoms:**
- Cannot connect to Stellar
- Horizon errors

**Solutions:**
1. Check internet connection
2. Verify Horizon URL: `https://horizon-testnet.stellar.org`
3. Test Horizon directly: https://horizon-testnet.stellar.org/
4. Check if testnet is operational: https://status.stellar.org/

### "Environment variable not found"

**Symptoms:**
- App shows warning about missing variables
- Features not working

**Solutions:**
1. Ensure `.env` file exists in project root
2. Verify variable names start with `VITE_`
3. Restart dev server after changing `.env`
4. Check for typos in variable names

## Next Steps

After completing setup:

1. ✅ Start dev server: `npm run dev`
2. ✅ Open browser: `http://localhost:5173`
3. ✅ Check console for environment validation
4. ✅ Browse demo raffles
5. ✅ Test creating a raffle (demo mode)

For contract deployment and blockchain integration, see [DEVELOPMENT.md](../DEVELOPMENT.md#contract-deployment).
