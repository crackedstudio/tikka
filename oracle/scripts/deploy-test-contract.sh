#!/bin/bash

# Deploy Test Contract to Standalone Node
# This script deploys a test raffle contract for E2E testing

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
RPC_URL="${STANDALONE_RPC_URL:-http://localhost:8000/soroban/rpc}"
NETWORK_PASSPHRASE="${STANDALONE_NETWORK_PASSPHRASE:-Standalone Network ; February 2017}"
CONTRACT_PATH="${CONTRACT_PATH:-../contracts/raffle/target/wasm32-unknown-unknown/release/raffle.wasm}"

echo -e "${GREEN}Deploying Test Contract${NC}"
echo "================================"

# Check if stellar CLI is installed
if ! command -v stellar &> /dev/null; then
    echo -e "${RED}Error: stellar CLI not found${NC}"
    echo "Install with: cargo install --locked stellar-cli"
    exit 1
fi

# Check if contract WASM exists
if [ ! -f "$CONTRACT_PATH" ]; then
    echo -e "${RED}Error: Contract WASM not found at $CONTRACT_PATH${NC}"
    echo "Build the contract first:"
    echo "  cd ../contracts/raffle"
    echo "  cargo build --target wasm32-unknown-unknown --release"
    exit 1
fi

# Generate test identity if not exists
if ! stellar keys show test-admin 2>/dev/null; then
    echo -e "${YELLOW}Generating test admin identity...${NC}"
    stellar keys generate test-admin --network standalone
fi

# Get admin address
ADMIN_ADDRESS=$(stellar keys address test-admin)
echo -e "${GREEN}Admin address: $ADMIN_ADDRESS${NC}"

# Fund admin account
echo -e "${YELLOW}Funding admin account...${NC}"
curl -s "http://localhost:8000/friendbot?addr=$ADMIN_ADDRESS" > /dev/null
sleep 2

# Deploy contract
echo -e "${YELLOW}Deploying contract...${NC}"
CONTRACT_ID=$(stellar contract deploy \
    --wasm "$CONTRACT_PATH" \
    --source test-admin \
    --rpc-url "$RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    2>&1 | tail -n 1)

if [ -z "$CONTRACT_ID" ]; then
    echo -e "${RED}Error: Failed to deploy contract${NC}"
    exit 1
fi

echo -e "${GREEN}Contract deployed successfully!${NC}"
echo -e "${GREEN}Contract ID: $CONTRACT_ID${NC}"

# Export for use in tests
export TEST_CONTRACT_ID="$CONTRACT_ID"
echo "TEST_CONTRACT_ID=$CONTRACT_ID" >> $GITHUB_ENV 2>/dev/null || true

# Initialize contract (if needed)
echo -e "${YELLOW}Initializing contract...${NC}"
stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source test-admin \
    --rpc-url "$RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    -- \
    initialize \
    --admin "$ADMIN_ADDRESS" \
    || echo -e "${YELLOW}Note: Contract may already be initialized${NC}"

echo -e "\n${GREEN}Setup complete!${NC}"
echo -e "Run tests with: TEST_CONTRACT_ID=$CONTRACT_ID npm run test:e2e:standalone"
