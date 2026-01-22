# Development Guide

This document helps developers get the Tikka frontend running locally and properly configured for development.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Configuration](#environment-configuration)
- [Stellar Testnet Setup](#stellar-testnet-setup)
- [Supabase Setup](#supabase-setup)
- [Development Workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 18+** (recommended: v18.x or v20.x)
  - Download: https://nodejs.org/
  - Verify: `node --version`

- **npm** (comes with Node.js) or **pnpm** (recommended)
  - Install pnpm: `npm install -g pnpm`
  - Verify: `pnpm --version`

- **Git** for version control
  - Download: https://git-scm.com/
  - Verify: `git --version`

## Quick Start

1. **Clone the repository**

```bash
git clone https://github.com/your-username/tikka.git
cd tikka
```

2. **Install dependencies**

```bash
npm install
# or
pnpm install
```

3. **Configure environment variables** (see [Environment Configuration](#environment-configuration))

```bash
cp .env.example .env
# Edit .env with your actual values
```

4. **Start the development server**

```bash
npm run dev
# or
pnpm dev
```

5. **Open your browser**

Navigate to `http://localhost:5173` (or the port shown in your terminal)

## Environment Configuration

### Step 1: Create Your .env File

Copy the example environment file:

```bash
cp .env.example .env
```

### Step 2: Configure Required Variables

Open `.env` in your text editor and configure the following sections:

#### Stellar Network Configuration

```env
VITE_STELLAR_NETWORK=testnet
VITE_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
```

**For development, always use `testnet`!** Never use mainnet during development.

#### Soroban Contract Configuration

```env
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
VITE_RAFFLE_CONTRACT_ADDRESS=
```

**Note:** `VITE_RAFFLE_CONTRACT_ADDRESS` will be empty until you deploy your contract (see [Contract Deployment](#contract-deployment) below).

#### Supabase Configuration

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
VITE_SUPABASE_TABLE=raffle_metadata
```

See [Supabase Setup](#supabase-setup) for detailed instructions on obtaining these values.

#### Development Mode (Optional)

```env
VITE_USE_DEMO_DATA=true
VITE_DEBUG_MODE=true
VITE_SHOW_DEV_TOOLS=true
```

Set `VITE_USE_DEMO_DATA=true` to use mock data without blockchain integration.

### Step 3: Verify Configuration

The app includes automatic validation. When you start the dev server, you'll see:

```
🔧 Environment Configuration Loaded:
  network: testnet
  sorobanRpc: https://soroban-testnet.stellar.org
  contractConfigured: false
  supabaseConfigured: true
  useDemoData: true
```

If any required variables are missing, you'll see helpful error messages.

## Stellar Testnet Setup

### 1. Understanding Stellar Networks

Stellar has two main networks:
- **Testnet**: For development and testing (use this!)
- **Mainnet**: For production (real money!)

### 2. Get Testnet Credentials

You'll need a Stellar testnet account for testing:

**Option A: Use Stellar Laboratory (Recommended)**

1. Visit [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test)
2. Click "Generate keypair"
3. Save your **Secret Key** securely (never share this!)
4. Copy your **Public Key**
5. Click "Fund account with Friendbot" to get test XLM

**Option B: Use Stellar CLI**

```bash
# Install Stellar CLI
npm install -g @stellar/cli

# Generate a new keypair
stellar keys generate testaccount --network testnet

# Fund the account
stellar keys fund testaccount --network testnet
```

### 3. Useful Testnet Resources

- **Horizon API Explorer**: https://horizon-testnet.stellar.org/
- **Stellar Laboratory**: https://laboratory.stellar.org/
- **Friendbot (Testnet Faucet)**: https://friendbot.stellar.org/
- **Stellar Expert (Testnet Explorer)**: https://stellar.expert/explorer/testnet

## Supabase Setup

Supabase is used to store raffle metadata (images, descriptions, etc.) off-chain.

### 1. Create a Supabase Project

1. Go to [Supabase](https://supabase.com/)
2. Sign up or log in
3. Click "New Project"
4. Fill in project details:
   - **Name**: tikka-dev (or your preferred name)
   - **Database Password**: Choose a strong password
   - **Region**: Select closest to you
5. Wait for project to be created (~2 minutes)

### 2. Get Your Credentials

1. In your Supabase dashboard, go to **Project Settings** (gear icon)
2. Click **API** in the sidebar
3. Copy the following values:

```
Project URL → VITE_SUPABASE_URL
anon public key → VITE_SUPABASE_ANON_KEY
```

4. Add these to your `.env` file

### 3. Create Database Table

1. In Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Paste the following SQL:

```sql
-- Create raffle_metadata table
CREATE TABLE raffle_metadata (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  raffle_id INTEGER,
  metadata JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_raffle_id ON raffle_metadata(raffle_id);
CREATE INDEX idx_created_at ON raffle_metadata(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE raffle_metadata ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access
CREATE POLICY "Allow public read access"
  ON raffle_metadata
  FOR SELECT
  USING (true);

-- Create policy to allow authenticated insert
CREATE POLICY "Allow authenticated insert"
  ON raffle_metadata
  FOR INSERT
  WITH CHECK (true);
```

4. Click **Run** to execute

### 4. Set Up Storage (Optional - for image uploads)

1. Go to **Storage** in Supabase dashboard
2. Click **New Bucket**
3. Name it `raffle-images`
4. Set to **Public** bucket
5. Click **Create**

## Contract Deployment

### 1. Install Soroban CLI

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add wasm32 target
rustup target add wasm32-unknown-unknown

# Install Soroban CLI
cargo install --locked soroban-cli
```

### 2. Build the Contract

```bash
# Navigate to contract directory (when available)
cd contracts/raffle

# Build the contract
soroban contract build
```

### 3. Deploy to Testnet

```bash
# Deploy the contract
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/raffle.wasm \
  --source YOUR_SECRET_KEY \
  --network testnet

# Copy the returned contract address
# Add it to your .env as VITE_RAFFLE_CONTRACT_ADDRESS
```

### 4. Verify Deployment

```bash
# Check contract on Stellar Expert
# https://stellar.expert/explorer/testnet/contract/YOUR_CONTRACT_ADDRESS
```

## Development Workflow

### Available Scripts

```bash
# Start development server with hot reload
npm run dev

# Type-check and build for production
npm run build

# Preview production build locally
npm run preview

# Run ESLint
npm run lint

# Fix ESLint issues automatically
npm run lint --fix
```

### Development Tips

1. **Use Demo Mode**: Set `VITE_USE_DEMO_DATA=true` to develop UI without blockchain
2. **Enable Debug Mode**: Set `VITE_DEBUG_MODE=true` for detailed console logs
3. **Hot Reload**: Vite automatically reloads on file changes
4. **TypeScript**: The project uses strict TypeScript - fix type errors before committing

### Project Structure

```
tikka/
├── src/
│   ├── config/
│   │   ├── env.ts          # Environment validation
│   │   └── supabase.ts     # Supabase client
│   ├── pages/              # Route pages
│   ├── components/         # React components
│   ├── hooks/              # Custom hooks
│   ├── services/           # API services
│   └── types/              # TypeScript types
├── .env                    # Your local config (DO NOT COMMIT)
├── .env.example            # Example config (safe to commit)
└── package.json
```

## Troubleshooting

### Common Issues

#### "Missing required environment variable"

**Problem**: You see an error about missing environment variables.

**Solution**:
1. Ensure you've created a `.env` file from `.env.example`
2. Check that all required variables are set
3. Restart the dev server after changing `.env`

#### "Supabase connection failed"

**Problem**: Cannot connect to Supabase.

**Solution**:
1. Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are correct
2. Check that your Supabase project is active
3. Ensure you've created the `raffle_metadata` table
4. Check browser console for detailed error messages

#### "Contract not found"

**Problem**: Contract interactions fail.

**Solution**:
1. Ensure `VITE_RAFFLE_CONTRACT_ADDRESS` is set
2. Verify the contract is deployed on testnet
3. Check the contract address is correct
4. Set `VITE_USE_DEMO_DATA=true` to bypass contract for UI development

#### Port already in use

**Problem**: Vite can't start because port 5173 is in use.

**Solution**:
```bash
# Kill the process using the port (Linux/Mac)
lsof -ti:5173 | xargs kill -9

# Or use a different port
npm run dev -- --port 3000
```

#### TypeScript errors

**Problem**: Build fails with TypeScript errors.

**Solution**:
1. Run `npm install` to ensure all types are installed
2. Check `tsconfig.json` is not modified
3. Fix type errors shown in the output
4. Use `// @ts-ignore` only as last resort (not recommended)

### Getting Help

If you're stuck:

1. **Check the logs**: Look for error messages in terminal and browser console
2. **Review documentation**: See `README.md` for project overview
3. **Search issues**: Check GitHub issues for similar problems
4. **Ask for help**: Create a new issue with:
   - What you're trying to do
   - What error you're seeing
   - Your environment (OS, Node version, etc.)
   - Steps to reproduce

### Useful Resources

- **Stellar Documentation**: https://developers.stellar.org/
- **Soroban Documentation**: https://soroban.stellar.org/docs
- **Supabase Documentation**: https://supabase.com/docs
- **Vite Documentation**: https://vitejs.dev/
- **React Documentation**: https://react.dev/

## Next Steps

Once you have the development environment running:

1. **Explore the UI**: Browse the demo raffles and test the interface
2. **Read the code**: Start with `src/App.tsx` and follow the imports
3. **Make changes**: Try modifying components and see hot reload in action
4. **Deploy a contract**: Follow the contract deployment guide
5. **Integrate blockchain**: Connect the UI to your deployed contract

Happy coding! 🚀

