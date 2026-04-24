#!/bin/bash

# End-to-End Test Runner with Standalone Node
# This script automates the complete E2E testing process:
# 1. Starts Stellar standalone node
# 2. Deploys test contract
# 3. Runs all E2E tests
# 4. Cleans up

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="stellar-standalone-test"
RPC_URL="http://localhost:8000/soroban/rpc"
HORIZON_URL="http://localhost:8000"
NETWORK_PASSPHRASE="Standalone Network ; February 2017"
MAX_WAIT=60 # Maximum seconds to wait for node to be ready

echo -e "${GREEN}Starting E2E Test Suite${NC}"
echo "================================"

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    docker stop $CONTAINER_NAME 2>/dev/null || true
    docker rm $CONTAINER_NAME 2>/dev/null || true
    echo -e "${GREEN}Cleanup complete${NC}"
}

# Register cleanup on script exit
trap cleanup EXIT

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running${NC}"
    exit 1
fi

# Stop any existing container
echo -e "${YELLOW}Stopping any existing standalone node...${NC}"
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# Start standalone node
echo -e "${YELLOW}Starting Stellar standalone node...${NC}"
docker run -d \
    --name $CONTAINER_NAME \
    -p 8000:8000 \
    stellar/quickstart:testing \
    --standalone \
    > /dev/null

# Wait for node to be ready
echo -e "${YELLOW}Waiting for node to be ready...${NC}"
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if curl -s -X POST $RPC_URL \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
        | grep -q "healthy"; then
        echo -e "${GREEN}Node is ready!${NC}"
        break
    fi
    
    WAIT_COUNT=$((WAIT_COUNT + 1))
    if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
        echo -e "${RED}Error: Node failed to start within ${MAX_WAIT} seconds${NC}"
        exit 1
    fi
    
    echo -n "."
    sleep 1
done

# Check if contract deployment is needed
if [ -z "$TEST_CONTRACT_ID" ]; then
    echo -e "${YELLOW}Note: TEST_CONTRACT_ID not set${NC}"
    echo -e "${YELLOW}Skipping contract deployment${NC}"
    echo -e "${YELLOW}Some tests may be skipped${NC}"
else
    echo -e "${GREEN}Using contract: $TEST_CONTRACT_ID${NC}"
fi

# Run mocked E2E tests
echo -e "\n${YELLOW}Running mocked E2E tests...${NC}"
echo "================================"
npm run test:e2e:mocked

# Run standalone node tests (if contract is deployed)
if [ -n "$TEST_CONTRACT_ID" ]; then
    echo -e "\n${YELLOW}Running standalone node E2E tests...${NC}"
    echo "================================"
    export STANDALONE_RPC_URL=$RPC_URL
    export STANDALONE_HORIZON_URL=$HORIZON_URL
    export STANDALONE_NETWORK_PASSPHRASE="$NETWORK_PASSPHRASE"
    npm run test:e2e:standalone
else
    echo -e "\n${YELLOW}Skipping standalone node tests (no contract deployed)${NC}"
fi

# Summary
echo -e "\n${GREEN}================================${NC}"
echo -e "${GREEN}E2E Test Suite Complete!${NC}"
echo -e "${GREEN}================================${NC}"

# Cleanup will happen automatically via trap
